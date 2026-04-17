// ============================================================================
// kiosk-pair-redeem
//
// Tablet-invoked when the user types the 6-char pairing code on /kiosk/pair.
// On success, issues a fresh long-lived device_secret. The tablet stores this
// in localStorage and includes it in x-kiosk-device-secret on every future
// request.
//
// Request body:  { code: string }
// Response:      { success, device_id, device_name, device_secret }
//
// Rate-limited by IP: 10 attempts / 5 min. No staff auth (this IS the grant).
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  getSupabaseAdmin,
  handleOptions,
  jsonResponse,
  rateLimit,
} from "../_shared/kiosk-auth.ts";
import { generateToken, sha256Hex } from "../_shared/crypto.ts";

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    if (!rateLimit(`pair-redeem:${ip}`, 10, 5 * 60_000)) {
      return jsonResponse(
        { success: false, error: "Too many attempts. Try again in a few minutes." },
        429,
      );
    }

    const body = await req.json();
    const rawCode = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!rawCode || rawCode.length < 4) {
      return jsonResponse({ success: false, error: "Invalid code" }, 400);
    }

    const supabase = getSupabaseAdmin();
    const codeHash = await sha256Hex(rawCode);

    const { data: codeRow, error: codeError } = await supabase
      .from("kiosk_pairing_codes")
      .select("id, device_id, expires_at, redeemed_at")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (codeError || !codeRow) {
      return jsonResponse({ success: false, error: "Invalid or expired code" }, 400);
    }
    if (codeRow.redeemed_at) {
      return jsonResponse({ success: false, error: "Code already used" }, 400);
    }
    if (new Date(codeRow.expires_at).getTime() < Date.now()) {
      return jsonResponse({ success: false, error: "Code expired" }, 400);
    }

    // Issue device secret
    const deviceSecret = generateToken(32);
    const deviceSecretHash = await sha256Hex(deviceSecret);

    // Update device with the real secret hash, then mark code redeemed
    const { data: device, error: devError } = await supabase
      .from("kiosk_devices")
      .update({ device_secret_hash: deviceSecretHash })
      .eq("id", codeRow.device_id)
      .eq("is_active", true)
      .select("id, name")
      .maybeSingle();

    if (devError || !device) {
      return jsonResponse(
        { success: false, error: "Device is inactive or has been revoked" },
        400,
      );
    }

    await supabase
      .from("kiosk_pairing_codes")
      .update({ redeemed_at: new Date().toISOString() })
      .eq("id", codeRow.id);

    return jsonResponse({
      success: true,
      device_id: device.id,
      device_name: device.name,
      device_secret: deviceSecret,
    });
  } catch (err) {
    console.error("kiosk-pair-redeem error:", err);
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : "Server error" },
      500,
    );
  }
});
