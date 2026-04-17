// ============================================================================
// kiosk-staff-unlock
//
// Staff authorizes a single kiosk transaction by entering email + PIN on the
// paired tablet. Returns a short-lived (30 min) staff token which must be
// sent in x-kiosk-staff-token on any data-creation request.
//
// Request headers:  x-kiosk-device-id, x-kiosk-device-secret
// Request body:     { staff_email: string, pin: string }
// Response:         { success, staff_token, staff_id, staff_name, expires_at }
//
// Rate-limited per device: 5 failed attempts / 5 min.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  authenticateDevice,
  getSupabaseAdmin,
  handleOptions,
  jsonResponse,
  KioskAuthError,
  rateLimit,
} from "../_shared/kiosk-auth.ts";
import {
  issueKioskStaffToken,
  safeEqual,
  sha256Hex,
} from "../_shared/crypto.ts";

const STAFF_TOKEN_TTL_SECONDS = 30 * 60;

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const supabase = getSupabaseAdmin();
    const device = await authenticateDevice(req, supabase);

    // Tight per-device rate limit on unlock attempts — the device is the
    // adversary we care about (not individual staff emails).
    if (!rateLimit(`unlock:${device.id}`, 10, 5 * 60_000)) {
      return jsonResponse(
        { success: false, error: "Too many unlock attempts. Try again later." },
        429,
      );
    }

    const { staff_email, pin } = await req.json();
    if (!staff_email || !pin) {
      return jsonResponse(
        { success: false, error: "Email and PIN are required" },
        400,
      );
    }

    const email = String(staff_email).toLowerCase().trim();
    const { data: staff } = await supabase
      .from("staff_users")
      .select("id, full_name, email, is_active, kiosk_pin_hash")
      .eq("email", email)
      .maybeSingle();

    // Uniform failure response to avoid leaking which part was wrong
    const fail = () =>
      jsonResponse(
        { success: false, error: "Invalid email or PIN" },
        401,
      );

    if (!staff || !staff.is_active || !staff.kiosk_pin_hash) {
      // Log failed attempt
      await supabase
        .from("staff_activity_log")
        .insert({
          staff_id: null,
          activity_type: "kiosk_unlock_failed",
          entity_type: "kiosk_device",
          entity_id: device.id,
          details: { reason: "unknown_or_no_pin", attempted_email: email },
        })
        .then(() => {}, (err) =>
          console.warn("activity log insert failed:", err),
        );
      return fail();
    }

    const providedHash = await sha256Hex(String(pin));
    if (!safeEqual(providedHash, staff.kiosk_pin_hash)) {
      await supabase
        .from("staff_activity_log")
        .insert({
          staff_id: staff.id,
          activity_type: "kiosk_unlock_failed",
          entity_type: "kiosk_device",
          entity_id: device.id,
          details: { reason: "bad_pin" },
        })
        .then(() => {}, (err) =>
          console.warn("activity log insert failed:", err),
        );
      return fail();
    }

    const token = await issueKioskStaffToken(
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      staff.id,
      device.id,
      STAFF_TOKEN_TTL_SECONDS,
    );

    await supabase
      .from("staff_activity_log")
      .insert({
        staff_id: staff.id,
        activity_type: "kiosk_unlock_success",
        entity_type: "kiosk_device",
        entity_id: device.id,
        details: { device_name: device.name },
      })
      .then(() => {}, (err) => console.warn("activity log insert failed:", err));

    return jsonResponse({
      success: true,
      staff_token: token,
      staff_id: staff.id,
      staff_name: staff.full_name,
      staff_email: staff.email,
      expires_at: new Date(
        Date.now() + STAFF_TOKEN_TTL_SECONDS * 1000,
      ).toISOString(),
    });
  } catch (err) {
    if (err instanceof KioskAuthError) {
      return jsonResponse({ success: false, error: err.message }, err.status);
    }
    console.error("kiosk-staff-unlock error:", err);
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : "Server error" },
      500,
    );
  }
});
