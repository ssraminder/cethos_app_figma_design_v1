// supabase/functions/void-vendor-payable/index.ts
//
// Vendor-side mirror of void-customer-invoice. Voids a vendor_payables
// row (the vendor invoice) so its associated workflow step / order line
// can be financially edited again. After voiding, a fresh payable can
// be issued whose reference_payable_id points back to the voided one,
// and the void's replaced_by_payable_id forward-links to the new row.
//
// Guardrails:
//   - Refuse if the payable already has paid_at set (vendor was paid).
//   - Refuse if the payable is already voided / cancelled.
//   - Reason code must be in the constrained set; reason_notes required
//     when reason_code = 'other'.
//
// Body: { payable_id, staff_id, reason_code, reason_notes? }
// Returns: { success, payable }
//
// Auth: verify_jwt = true. Staff must be logged in via the portal client.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_REASON_CODES = new Set([
  "pricing_correction",
  "cancelled_step",
  "vendor_request",
  "billing_error",
  "duplicate",
  "other",
]);

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { success: false, error: "Missing Supabase configuration" },
      500,
    );
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      payable_id,
      staff_id,
      reason_code,
      reason_notes,
    }: {
      payable_id?: string;
      staff_id?: string;
      reason_code?: string;
      reason_notes?: string;
    } = body || {};

    if (!payable_id) throw new Error("Missing required field: payable_id");
    if (!staff_id) throw new Error("Missing required field: staff_id");
    if (!reason_code || !ALLOWED_REASON_CODES.has(reason_code)) {
      throw new Error(
        `reason_code must be one of: ${[...ALLOWED_REASON_CODES].join(", ")}`,
      );
    }
    if (reason_code === "other" && !(reason_notes || "").trim()) {
      throw new Error("reason_notes required when reason_code = 'other'");
    }

    // Validate staff
    const { data: staff } = await sb
      .from("staff_users")
      .select("id, full_name, is_active")
      .eq("id", staff_id)
      .maybeSingle();
    if (!staff || staff.is_active === false) {
      return jsonResponse(
        { success: false, error: "Invalid or inactive staff user" },
        403,
      );
    }

    // Load payable
    const { data: payable, error: payableErr } = await sb
      .from("vendor_payables")
      .select(
        "id, vendor_id, order_id, vendor_invoice_number, status, voided_at, paid_at, cancelled_at, total, total_cad, currency",
      )
      .eq("id", payable_id)
      .maybeSingle();
    if (payableErr) throw new Error(`Failed to load payable: ${payableErr.message}`);
    if (!payable) throw new Error(`Vendor payable not found: ${payable_id}`);
    if (payable.voided_at) {
      throw new Error("Vendor payable is already voided");
    }

    // Block voiding if vendor has been paid for this payable.
    if (payable.paid_at) {
      return jsonResponse(
        {
          success: false,
          error:
            "Vendor payable is already paid. Reverse the payment before voiding.",
          paid_at: payable.paid_at,
        },
        409,
      );
    }

    const nowIso = new Date().toISOString();

    const { data: voided, error: updateErr } = await sb
      .from("vendor_payables")
      .update({
        status: "void",
        voided_at: nowIso,
        voided_by_staff_id: staff_id,
        void_reason_code: reason_code,
        void_reason_notes: (reason_notes || "").trim() || null,
        updated_at: nowIso,
      })
      .eq("id", payable_id)
      .select(
        "id, vendor_invoice_number, order_id, vendor_id, status, voided_at, voided_by_staff_id, void_reason_code, void_reason_notes, replaced_by_payable_id, reference_payable_id",
      )
      .single();

    if (updateErr || !voided) {
      throw new Error(
        `Failed to void vendor payable: ${updateErr?.message || "no row"}`,
      );
    }

    // Activity log — best-effort.
    try {
      await sb.from("staff_activity_log").insert({
        staff_id,
        action_type: "vendor_payable_voided",
        entity_type: "vendor_payable",
        entity_id: payable_id,
        details: {
          vendor_invoice_number: payable.vendor_invoice_number,
          order_id: payable.order_id,
          vendor_id: payable.vendor_id,
          reason_code,
          reason_notes: (reason_notes || "").trim() || null,
          total: payable.total,
          total_cad: payable.total_cad,
          currency: payable.currency,
        },
      });
    } catch (logErr) {
      console.warn("Non-fatal: failed to write activity log", logErr);
    }

    return jsonResponse({ success: true, payable: voided });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("void-vendor-payable error:", err);
    return jsonResponse({ success: false, error: message }, 400);
  }
});
