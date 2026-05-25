// ============================================================================
// manage-vendor-payables
// Manages vendor payable status transitions and amount adjustments.
// Actions: update_status (invoiced/paid), adjust_payable (rate/total changes)
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  notifyVendorPayableInvoiced,
  notifyVendorPayablePaid,
  notifyVendorPayableAdjusted,
} from "../_shared/notify-step-lifecycle.ts";

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

// Loads everything notify-step-lifecycle helpers need to render an email
// from just the payable id. Returns null (and logs) on lookup failure so a
// missing related row can never fail the underlying status write.
async function loadPayableLifecycleContext(supabase: any, payable_id: string): Promise<any | null> {
  try {
    const { data: payable } = await supabase
      .from("vendor_payables")
      .select(
        "id, workflow_step_id, vendor_id, order_id, total, currency, payment_method, payment_reference, vendor_invoice_number, vendor_invoice_date",
      )
      .eq("id", payable_id)
      .maybeSingle();
    if (!payable) return null;
    const [{ data: vendor }, { data: orderRow }, { data: step }] = await Promise.all([
      supabase.from("vendors").select("id, full_name, email, additional_emails").eq("id", payable.vendor_id).maybeSingle(),
      payable.order_id
        ? supabase.from("orders").select("id, order_number").eq("id", payable.order_id).maybeSingle()
        : Promise.resolve({ data: null }),
      payable.workflow_step_id
        ? supabase.from("order_workflow_steps").select("id, name, step_number").eq("id", payable.workflow_step_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!vendor?.email || !orderRow) return null;
    return {
      supabase,
      vendor: {
        id: vendor.id,
        full_name: vendor.full_name,
        email: vendor.email,
        additional_emails: Array.isArray(vendor.additional_emails) ? vendor.additional_emails : [],
      },
      order: { id: orderRow.id, order_number: orderRow.order_number },
      step: {
        id: step?.id ?? payable.workflow_step_id ?? null,
        name: step?.name ?? null,
        step_number: step?.step_number ?? null,
      },
      payable: {
        id: payable.id,
        total: payable.total == null ? null : Number(payable.total),
        currency: payable.currency || "CAD",
        payment_method: payable.payment_method ?? null,
        payment_reference: payable.payment_reference ?? null,
        vendor_invoice_number: payable.vendor_invoice_number ?? null,
        vendor_invoice_date: payable.vendor_invoice_date ?? null,
      },
    };
  } catch (e: any) {
    console.error("loadPayableLifecycleContext failed:", e?.message || e);
    return null;
  }
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

        // Fire vendor email on invoiced + paid transitions. Wrapped so
        // a Brevo or DB hiccup never fails the status write.
        if (status === "invoiced" || status === "paid") {
          try {
            const ctx = await loadPayableLifecycleContext(supabase, payable_id);
            if (ctx) {
              if (status === "invoiced") await notifyVendorPayableInvoiced(ctx);
              if (status === "paid") await notifyVendorPayablePaid(ctx);
            }
          } catch (e: any) {
            console.error(`${status} email fan-out failed:`, e?.message || e);
          }
        }

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

        // Fetch current payable — pull currency too so the email can format
        // amounts in the vendor's currency. original_subtotal/original_total
        // are read so we don't clobber a prior adjustment baseline.
        const { data: payable, error: fetchErr } = await supabase
          .from("vendor_payables")
          .select("id, rate, rate_unit, units, subtotal, total, status, currency, original_subtotal, original_total")
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

        // Snapshot the pre-adjustment values so the vendor email can show
        // the diff (old → new) rather than just the new amount.
        const oldRate = payable.rate == null ? null : Number(payable.rate);
        const oldSubtotal = payable.subtotal == null ? null : Number(payable.subtotal);

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
          const newSubtotalCalc = new_rate * payable.units;
          updateData.subtotal = newSubtotalCalc;
          updateData.total = newSubtotalCalc;
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

        // Vendor email — fire-and-forget. The adjustment write is already
        // committed; a Brevo / lookup failure must never surface to admin UI.
        try {
          const ctx = await loadPayableLifecycleContext(supabase, payable_id);
          if (ctx) {
            const finalRate = updateData.rate as number | undefined;
            const finalSubtotal = updateData.subtotal as number | undefined;
            await notifyVendorPayableAdjusted({
              ...ctx,
              old_rate: oldRate,
              new_rate: finalRate == null ? null : Number(finalRate),
              old_subtotal: oldSubtotal,
              new_subtotal: finalSubtotal == null ? null : Number(finalSubtotal),
              currency: payable.currency || "CAD",
              reason: adjustment_reason ?? null,
            });
          }
        } catch (e: any) {
          console.error("vendor_payable_adjusted email fan-out failed:", e?.message || e);
        }

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
