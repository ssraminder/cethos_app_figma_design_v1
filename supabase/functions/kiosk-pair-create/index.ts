// ============================================================================
// kiosk-pair-create
//
// Admin-invoked from the portal. Creates a new kiosk_devices row and a
// short-lived pairing code. The plaintext code is returned ONCE so it can be
// shown to the admin, who then types it on the tablet's /kiosk/pair screen.
//
// Request body:
//   { name: string, default_staff_id: string, created_by_staff_id: string }
//
// Response:
//   { success: true, device_id, name, pairing_code, expires_at }
//
// Auth: matches the existing staff service-role pattern (UI-gated via
//   ProtectedAdminRoute; anon-key bearer passthrough). Revisit when admin
//   functions get proper JWT verification.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  CORS_HEADERS,
  getSupabaseAdmin,
  handleOptions,
  jsonResponse,
} from "../_shared/kiosk-auth.ts";
import { generatePairingCode, sha256Hex } from "../_shared/crypto.ts";

const PAIRING_TTL_MINUTES = 15;

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { name, default_staff_id, created_by_staff_id } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return jsonResponse({ success: false, error: "Device name is required" }, 400);
    }
    if (!default_staff_id) {
      return jsonResponse(
        { success: false, error: "default_staff_id is required" },
        400,
      );
    }

    // Validate staff exists and is active
    const { data: staff } = await supabase
      .from("staff_users")
      .select("id, is_active")
      .eq("id", default_staff_id)
      .maybeSingle();

    if (!staff || !staff.is_active) {
      return jsonResponse(
        { success: false, error: "Default staff user not found or inactive" },
        400,
      );
    }

    // 1. Generate device secret (long-lived, stored hashed)
    const { generateToken } = await import("../_shared/crypto.ts");
    const deviceSecret = generateToken(32);
    const deviceSecretHash = await sha256Hex(deviceSecret);

    // 2. Create device row (starts active; becomes usable once pairing code
    //    is redeemed). We actually ignore deviceSecret here — the one that
    //    ships to the tablet is issued by kiosk-pair-redeem.
    const { data: device, error: deviceError } = await supabase
      .from("kiosk_devices")
      .insert({
        name: name.trim(),
        device_secret_hash: deviceSecretHash, // placeholder; replaced on redeem
        default_staff_id,
        created_by_staff_id: created_by_staff_id || null,
        is_active: true,
      })
      .select("id, name, created_at")
      .single();

    if (deviceError || !device) {
      console.error("Device insert failed:", deviceError);
      return jsonResponse(
        { success: false, error: deviceError?.message || "Insert failed" },
        500,
      );
    }

    // 3. Generate and store pairing code
    const pairingCode = generatePairingCode();
    const pairingCodeHash = await sha256Hex(pairingCode);
    const expiresAt = new Date(
      Date.now() + PAIRING_TTL_MINUTES * 60 * 1000,
    ).toISOString();

    const { error: codeError } = await supabase
      .from("kiosk_pairing_codes")
      .insert({
        code_hash: pairingCodeHash,
        device_id: device.id,
        expires_at: expiresAt,
      });

    if (codeError) {
      // Clean up the half-created device row
      await supabase.from("kiosk_devices").delete().eq("id", device.id);
      console.error("Pairing code insert failed:", codeError);
      return jsonResponse(
        { success: false, error: "Failed to create pairing code" },
        500,
      );
    }

    return jsonResponse({
      success: true,
      device_id: device.id,
      name: device.name,
      pairing_code: pairingCode,
      expires_at: expiresAt,
      ttl_minutes: PAIRING_TTL_MINUTES,
    });
  } catch (err) {
    console.error("kiosk-pair-create error:", err);
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : "Server error" },
      500,
    );
  }
});
