// Shared kiosk authentication helpers for edge functions.
//
// Two layers of auth:
//   1. Device secret   — header pair  x-kiosk-device-id + x-kiosk-device-secret
//      → validates the tablet itself is a paired device.
//   2. Staff token     — header       x-kiosk-staff-token
//      → short-lived (30min) JWT-ish token issued by kiosk-staff-unlock,
//        binding one unlock session to one staff member and one device.
//
// Endpoints that create data require BOTH. Pairing/redeem endpoints require
// neither (they're how a device earns its secret in the first place).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sha256Hex, verifyKioskStaffToken, safeEqual } from "./crypto.ts";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kiosk-device-id, x-kiosk-device-secret, x-kiosk-staff-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PATCH",
};

export function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  return null;
}

export function getEnv(name: string, required = true): string {
  const v = Deno.env.get(name);
  if (!v && required) throw new Error(`Missing environment variable: ${name}`);
  return v || "";
}

export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

// ─── Very lightweight in-memory rate limiter (per edge-function instance) ───
// Good-enough for "stop a misbehaving tablet", not a security boundary.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count++;
  return true;
}

// ─── Device authentication ──────────────────────────────────────────────────

export interface KioskDevice {
  id: string;
  name: string;
  default_staff_id: string | null;
  is_active: boolean;
}

export async function authenticateDevice(
  req: Request,
  supabase: SupabaseClient,
): Promise<KioskDevice> {
  const deviceId = req.headers.get("x-kiosk-device-id");
  const deviceSecret = req.headers.get("x-kiosk-device-secret");
  if (!deviceId || !deviceSecret) {
    throw new KioskAuthError("Missing device credentials", 401);
  }

  const { data: device, error } = await supabase
    .from("kiosk_devices")
    .select("id, name, device_secret_hash, default_staff_id, is_active")
    .eq("id", deviceId)
    .maybeSingle();

  if (error || !device) {
    throw new KioskAuthError("Unknown device", 401);
  }
  if (!device.is_active) {
    throw new KioskAuthError("Device is not active", 401);
  }

  const providedHash = await sha256Hex(deviceSecret);
  if (!safeEqual(providedHash, device.device_secret_hash)) {
    throw new KioskAuthError("Invalid device secret", 401);
  }

  // Per-device rate limit: 120 requests/minute
  if (!rateLimit(`device:${device.id}`, 120, 60_000)) {
    throw new KioskAuthError("Rate limit exceeded", 429);
  }

  // Fire-and-forget touch
  supabase
    .from("kiosk_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id)
    .then(() => {}, (err) => console.warn("last_seen_at update failed:", err));

  return {
    id: device.id,
    name: device.name,
    default_staff_id: device.default_staff_id,
    is_active: device.is_active,
  };
}

// ─── Staff token authentication (on top of device auth) ─────────────────────

export async function authenticateStaffToken(
  req: Request,
  device: KioskDevice,
): Promise<{ staff_id: string; device_id: string; exp: number }> {
  const token = req.headers.get("x-kiosk-staff-token");
  if (!token) throw new KioskAuthError("Missing staff token", 401);

  const payload = await verifyKioskStaffToken(
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    token,
  );
  if (!payload) throw new KioskAuthError("Invalid or expired staff token", 401);

  if (payload.device_id !== device.id) {
    throw new KioskAuthError("Staff token does not match this device", 401);
  }

  return payload;
}

/**
 * Resolve which staff_id to attribute a kiosk action to.
 *
 * If the tablet sent a staff token (kiosk-staff-unlock was used), we trust
 * that — it means a specific staff member typed their PIN. Otherwise we fall
 * back to the device's `default_staff_id` set at pairing time.
 *
 * Either way, the device must be a valid paired device.
 */
export async function resolveActingStaffId(
  req: Request,
  device: KioskDevice,
): Promise<string> {
  const token = req.headers.get("x-kiosk-staff-token");
  if (token) {
    const payload = await verifyKioskStaffToken(
      getEnv("SUPABASE_SERVICE_ROLE_KEY"),
      token,
    );
    if (payload && payload.device_id === device.id) {
      return payload.staff_id;
    }
  }
  if (!device.default_staff_id) {
    throw new KioskAuthError(
      "Device has no default staff assigned — re-pair the device",
      401,
    );
  }
  return device.default_staff_id;
}

export class KioskAuthError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
    this.name = "KioskAuthError";
  }
}
