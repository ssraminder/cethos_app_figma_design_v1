// ============================================================================
// set-staff-kiosk-pin
//
// Called from the admin portal (staff profile / settings) when a staff member
// sets or changes their kiosk PIN. The PIN is a 4-6 digit numeric code used
// only on paired kiosk tablets — it is NOT a replacement for their admin
// password.
//
// Request body:  { staff_id: string, pin: string }
// Response:      { success: true }
// Auth: UI-gated — matches create-fast-quote's pattern (anon key bearer).
//       A future hardening pass should validate the admin JWT here.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  getSupabaseAdmin,
  handleOptions,
  jsonResponse,
} from "../_shared/kiosk-auth.ts";
import { sha256Hex } from "../_shared/crypto.ts";

const PIN_MIN = 4;
const PIN_MAX = 6;

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { staff_id, pin } = await req.json();

    if (!staff_id) {
      return jsonResponse({ success: false, error: "staff_id required" }, 400);
    }
    if (typeof pin !== "string" || !/^\d+$/.test(pin)) {
      return jsonResponse(
        { success: false, error: "PIN must be numeric" },
        400,
      );
    }
    if (pin.length < PIN_MIN || pin.length > PIN_MAX) {
      return jsonResponse(
        {
          success: false,
          error: `PIN must be ${PIN_MIN}-${PIN_MAX} digits`,
        },
        400,
      );
    }
    // Reject the obvious weak ones
    const bad = new Set([
      "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
      "1234", "0123", "4321", "000000", "123456", "111111", "654321",
    ]);
    if (bad.has(pin)) {
      return jsonResponse(
        { success: false, error: "Please choose a less obvious PIN" },
        400,
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: staff } = await supabase
      .from("staff_users")
      .select("id, is_active")
      .eq("id", staff_id)
      .maybeSingle();

    if (!staff || !staff.is_active) {
      return jsonResponse({ success: false, error: "Staff not found" }, 404);
    }

    const pinHash = await sha256Hex(pin);
    const { error } = await supabase
      .from("staff_users")
      .update({
        kiosk_pin_hash: pinHash,
        kiosk_pin_set_at: new Date().toISOString(),
      })
      .eq("id", staff_id);

    if (error) {
      console.error("PIN update failed:", error);
      return jsonResponse({ success: false, error: error.message }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("set-staff-kiosk-pin error:", err);
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : "Server error" },
      500,
    );
  }
});
