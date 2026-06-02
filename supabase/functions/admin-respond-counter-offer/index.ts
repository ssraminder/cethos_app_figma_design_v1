// admin-respond-counter-offer v30 — adds counter_back action (R9).
// On counter-offer accept, re-checks vendor eligibility (qualification + NDA) before
// finalizing the assignment. Qualification status can change between offer creation
// and acceptance (vendor suspended, NDA expired, etc.) — audit defensibility wants
// the re-check at the decision moment.
// counter_back overwrites the offer's vendor_* terms with admin's new proposal,
// clears the counter_* fields, bumps counter_round, and emails the vendor so the
// negotiation continues with the existing accept/decline/negotiate buttons.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  notifyVendorCounterAccepted,
  notifyVendorCounterBack,
  notifyVendorCounterRejected,
} from "../_shared/notify-counter.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const {
      offer_id,
      action,
      staff_id,
      rejection_reason,
      // counter_back inputs (all optional individually; need at least one to be useful)
      new_rate,
      new_rate_unit,
      new_total,
      new_currency,
      new_deadline,
      new_note,
    } = await req.json();

    if (!offer_id || !action) {
      return json({ success: false, error: "Missing offer_id or action" }, 400);
    }
    if (!["accept", "reject", "counter_back"].includes(action)) {
      return json({ success: false, error: "Action must be 'accept', 'reject', or 'counter_back'" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: offer, error: offerErr } = await supabase
      .from("vendor_step_offers")
      .select(`
        id, step_id, vendor_id,
        counter_rate, counter_rate_unit, counter_total, counter_currency,
        counter_deadline, counter_note, counter_status, counter_round,
        vendor_rate, vendor_rate_unit, vendor_total, vendor_currency, deadline
      `)
      .eq("id", offer_id)
      .single();

    if (offerErr || !offer) {
      return json({ success: false, error: "Offer not found" }, 404);
    }
    // vendor-counter-offer writes counter_status='proposed'; older code
    // checked 'pending' but the DB has never carried that value.
    if (offer.counter_status !== "proposed") {
      return json({ success: false, error: "Counter-proposal is not pending review" }, 400);
    }

    const { data: step } = await supabase
      .from("order_workflow_steps")
      .select("id, name, step_number, order_id, workflow_id, service_id, source_language, target_language")
      .eq("id", offer.step_id)
      .single();

    const { data: vendor } = await supabase
      .from("vendors")
      .select("id, full_name, email, additional_emails")
      .eq("id", offer.vendor_id)
      .single();
    const vendorName = vendor?.full_name || "Unknown";

    const { data: orderRow } = step?.order_id
      ? await supabase.from("orders").select("id, order_number").eq("id", step.order_id).maybeSingle()
      : { data: null };

    const now = new Date().toISOString();

    if (action === "accept") {
      // QMS gating — re-verify on accept.
      const { data: gate } = await supabase.rpc("qms_check_assignment", {
        p_vendor_id: offer.vendor_id,
        p_service_id: step?.service_id ?? null,
        p_source_language_code: step?.source_language ?? null,
        p_target_language_code: step?.target_language ?? null,
        p_call_site: "counter_offer_accept",
        p_order_id: step?.order_id ?? null,
        p_workflow_step_id: offer.step_id,
        p_vendor_step_offer_id: offer.id,
      });
      if (gate?.should_block) {
        return json({ success: false, error: `QMS gating: ${gate.reason}`, qms_gating: gate }, 403);
      }

      const finalRate = offer.counter_rate ?? offer.vendor_rate;
      const finalRateUnit = offer.counter_rate_unit ?? offer.vendor_rate_unit;
      const finalTotal = offer.counter_total ?? offer.vendor_total;
      const finalCurrency = offer.counter_currency ?? offer.vendor_currency;
      const finalDeadline = offer.counter_deadline;

      await supabase.from("vendor_step_offers").update({
        counter_status: "accepted", counter_responded_at: now,
        status: "accepted", responded_at: now,
      }).eq("id", offer_id);

      await supabase.from("vendor_step_offers").update({
        status: "retracted", responded_at: now,
      }).eq("step_id", offer.step_id).neq("id", offer_id).in("status", ["pending", "offered"]);

      await supabase.from("order_workflow_steps").update({
        vendor_id: offer.vendor_id,
        status: "accepted",
        vendor_rate: finalRate,
        vendor_rate_unit: finalRateUnit,
        vendor_total: finalTotal,
        vendor_currency: finalCurrency || "CAD",
        deadline: finalDeadline || null,
        accepted_at: now,
        assigned_by: staff_id || null,
      }).eq("id", offer.step_id);

      await supabase.from("vendor_payables").update({ status: "cancelled" })
        .eq("workflow_step_id", offer.step_id).eq("status", "pending");

      if (finalRate && finalTotal) {
        const units = finalRate > 0 ? finalTotal / finalRate : 1;
        // Counter-accept produces an `approved` payable, matching the
        // direct-accept path in vendor-accept-step. Previously inserted as
        // `pending`, which trapped counter-accepted payables in a state the
        // `approved → invoiced → paid` transition table couldn't escape
        // without manual intervention.
        await supabase.from("vendor_payables").insert({
          workflow_step_id: offer.step_id,
          offer_id: offer.id,
          vendor_id: offer.vendor_id,
          order_id: step?.order_id,
          step_name: step?.name || null,
          rate: finalRate,
          rate_unit: finalRateUnit || "flat",
          units,
          subtotal: finalTotal,
          total: finalTotal,
          currency: finalCurrency || "CAD",
          status: "approved",
          approved_at: now,
          description: `Step ${step?.step_number}: ${step?.name}`,
        });
      }

      // Fire-and-forget vendor email.
      if (vendor?.email && orderRow) {
        try {
          await notifyVendorCounterAccepted({
            supabase,
            offerId: offer_id,
            stepId: offer.step_id,
            vendor: {
              id: vendor.id,
              full_name: vendor.full_name,
              email: vendor.email,
              additional_emails: Array.isArray(vendor.additional_emails) ? vendor.additional_emails : [],
            },
            order: { id: orderRow.id, order_number: orderRow.order_number },
            step: { id: offer.step_id, name: step?.name ?? null },
            applied: {
              rate: finalRate == null ? null : Number(finalRate),
              rate_unit: finalRateUnit ?? null,
              total: finalTotal == null ? null : Number(finalTotal),
              currency: finalCurrency || "CAD",
              deadline: finalDeadline ?? null,
            },
          });
        } catch (e: any) {
          console.error("counter_accepted email fan-out failed:", e?.message || e);
        }
      }

      return json({ success: true, vendor_name: vendorName, step_name: step?.name });
    } else if (action === "counter_back") {
      // R9 — admin counters the vendor's counter. Promote admin's new terms
      // into the offer's vendor_* fields so the vendor's Accept button uses
      // them with no extra branching; clear the counter_* fields so the
      // vendor's Negotiate button is re-enabled (Negotiate is gated on
      // counter_status === 'proposed'). counter_round is bumped so the round
      // trail is preserved.
      const appliedRate = new_rate != null ? Number(new_rate) : offer.vendor_rate;
      const appliedRateUnit = new_rate_unit || offer.vendor_rate_unit;
      const appliedTotal = new_total != null ? Number(new_total) : offer.vendor_total;
      const appliedCurrency = new_currency || offer.vendor_currency || "CAD";
      const appliedDeadline = new_deadline || offer.deadline;

      if (appliedRate == null && appliedTotal == null && !new_deadline && !new_note) {
        return json({ success: false, error: "Counter-back needs at least one of: new_rate, new_total, new_deadline, new_note" }, 400);
      }

      const nextRound = (Number(offer.counter_round) || 0) + 1;

      await supabase.from("vendor_step_offers").update({
        vendor_rate: appliedRate,
        vendor_rate_unit: appliedRateUnit,
        vendor_total: appliedTotal,
        vendor_currency: appliedCurrency,
        deadline: appliedDeadline,
        instructions: new_note || undefined,
        counter_status: null,
        counter_rate: null,
        counter_rate_unit: null,
        counter_total: null,
        counter_currency: null,
        counter_deadline: null,
        counter_note: null,
        counter_at: null,
        counter_responded_at: now,
        counter_responded_by: staff_id || null,
        counter_round: nextRound,
      }).eq("id", offer_id);

      if (vendor?.email && orderRow) {
        try {
          await notifyVendorCounterBack({
            supabase,
            offerId: offer_id,
            stepId: offer.step_id,
            vendor: {
              id: vendor.id,
              full_name: vendor.full_name,
              email: vendor.email,
              additional_emails: Array.isArray(vendor.additional_emails) ? vendor.additional_emails : [],
            },
            order: { id: orderRow.id, order_number: orderRow.order_number },
            step: { id: offer.step_id, name: step?.name ?? null },
            applied: {
              rate: appliedRate == null ? null : Number(appliedRate),
              rate_unit: appliedRateUnit ?? null,
              total: appliedTotal == null ? null : Number(appliedTotal),
              currency: appliedCurrency,
              deadline: appliedDeadline ?? null,
            },
            note: new_note ?? null,
          });
        } catch (e: any) {
          console.error("counter_back email fan-out failed:", e?.message || e);
        }
      }

      return json({ success: true, vendor_name: vendorName, step_name: step?.name, counter_round: nextRound });
    } else {
      await supabase.from("vendor_step_offers").update({
        counter_status: "rejected",
        counter_responded_at: now,
        counter_rejection_reason: rejection_reason || null,
      }).eq("id", offer_id);

      if (vendor?.email && orderRow) {
        try {
          await notifyVendorCounterRejected({
            supabase,
            offerId: offer_id,
            stepId: offer.step_id,
            vendor: {
              id: vendor.id,
              full_name: vendor.full_name,
              email: vendor.email,
              additional_emails: Array.isArray(vendor.additional_emails) ? vendor.additional_emails : [],
            },
            order: { id: orderRow.id, order_number: orderRow.order_number },
            step: { id: offer.step_id, name: step?.name ?? null },
            applied: {
              rate: offer.counter_rate == null ? null : Number(offer.counter_rate),
              rate_unit: offer.counter_rate_unit ?? null,
              total: offer.counter_total == null ? null : Number(offer.counter_total),
              currency: offer.counter_currency || "CAD",
              deadline: offer.counter_deadline ?? null,
            },
            rejectionReason: rejection_reason ?? null,
          });
        } catch (e: any) {
          console.error("counter_rejected email fan-out failed:", e?.message || e);
        }
      }

      return json({ success: true, vendor_name: vendorName, step_name: step?.name });
    }
  } catch (err) {
    console.error("admin-respond-counter-offer error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
