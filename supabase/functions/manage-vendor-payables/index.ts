// ============================================================================
// manage-vendor-payables
// Manages vendor payable status transitions and amount adjustments.
// Actions: update_status (invoiced/paid), adjust_payable (rate/total changes)
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return json({ success: false, error: "Missing action" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    switch (action) {
      // ── Update Status ──────────────────────────────────────────────
      case "update_status": {
        const {
          payable_id,
          status,
          vendor_invoice_number,
          vendor_invoice_date,
          payment_method,
          payment_reference,
          payment_notes,
        } = body;

        if (!payable_id || !status) {
          return json({ success: false, error: "Missing payable_id or status" }, 400);
        }

        // Fetch current payable
        const { data: payable, error: fetchErr } = await supabase
          .from("vendor_payables")
          .select("id, status")
          .eq("id", payable_id)
          .single();

        if (fetchErr || !payable) {
          return json({ success: false, error: "Payable not found" }, 404);
        }

        // Validate status transitions
        const validTransitions: Record<string, string[]> = {
          pending: ["approved", "cancelled"],
          approved: ["invoiced", "paid", "cancelled"],
          invoiced: ["paid", "cancelled"],
          paid: [],
          cancelled: [],
        };

        const allowed = validTransitions[payable.status] || [];
        if (!allowed.includes(status)) {
          return json({
            success: false,
            error: `Cannot transition from '${payable.status}' to '${status}'`,
          }, 400);
        }

        const now = new Date().toISOString();
        const updateData: Record<string, unknown> = {
          status,
          updated_at: now,
        };

        if (status === "invoiced") {
          updateData.invoiced_at = now;
          if (vendor_invoice_number) {
            updateData.vendor_invoice_number = vendor_invoice_number;
          }
          if (vendor_invoice_date) {
            updateData.vendor_invoice_date = vendor_invoice_date;
          }
        }

        if (status === "paid") {
          updateData.paid_at = now;
          if (payment_method) updateData.payment_method = payment_method;
          if (payment_reference) updateData.payment_reference = payment_reference;
          if (payment_notes) updateData.payment_notes = payment_notes;
        }

        if (status === "approved") {
          updateData.approved_at = now;
        }

        if (status === "cancelled") {
          updateData.cancelled_at = now;
        }

        const { error: updateErr } = await supabase
          .from("vendor_payables")
          .update(updateData)
          .eq("id", payable_id);

        if (updateErr) {
          return json({ success: false, error: updateErr.message }, 500);
        }

        console.log(`Payable ${payable_id}: ${payable.status} → ${status}`);
        return json({ success: true });
      }

      // ── Adjust Payable ─────────────────────────────────────────────
      case "adjust_payable": {
        const {
          payable_id,
          new_rate,
          new_subtotal,
          adjustment_reason,
          staff_id,
        } = body;

        if (!payable_id) {
          return json({ success: false, error: "Missing payable_id" }, 400);
        }

        if (new_rate == null && new_subtotal == null) {
          return json({ success: false, error: "Provide new_rate or new_subtotal" }, 400);
        }

        // Fetch current payable
        const { data: payable, error: fetchErr } = await supabase
          .from("vendor_payables")
          .select("id, rate, rate_unit, units, subtotal, total, status")
          .eq("id", payable_id)
          .single();

        if (fetchErr || !payable) {
          return json({ success: false, error: "Payable not found" }, 404);
        }

        if (payable.status === "paid" || payable.status === "cancelled") {
          return json({
            success: false,
            error: `Cannot adjust a ${payable.status} payable`,
          }, 400);
        }

        const now = new Date().toISOString();
        const updateData: Record<string, unknown> = {
          original_subtotal: payable.original_subtotal ?? payable.subtotal,
          original_total: payable.original_total ?? payable.total,
          adjustment_reason: adjustment_reason || null,
          adjusted_by: staff_id || null,
          adjusted_at: now,
          updated_at: now,
        };

        if (new_rate != null) {
          updateData.rate = new_rate;
          const newSubtotal = new_rate * payable.units;
          updateData.subtotal = newSubtotal;
          updateData.total = newSubtotal;
        }

        if (new_subtotal != null) {
          updateData.subtotal = new_subtotal;
          updateData.total = new_subtotal;
          if (payable.units > 0) {
            updateData.rate = new_subtotal / payable.units;
          }
        }

        const { error: updateErr } = await supabase
          .from("vendor_payables")
          .update(updateData)
          .eq("id", payable_id);

        if (updateErr) {
          return json({ success: false, error: updateErr.message }, 500);
        }

        console.log(`Payable ${payable_id} adjusted: reason=${adjustment_reason}`);
        return json({ success: true });
      }

      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("manage-vendor-payables error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
