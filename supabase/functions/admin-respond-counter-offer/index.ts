// ============================================================================
// admin-respond-counter-offer
// Allows admin staff to accept or reject vendor counter-proposals on pricing.
// On accept: assigns the vendor to the step at their counter-offered terms.
// On reject: records the rejection reason and updates counter status.
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
    const { offer_id, action, staff_id, rejection_reason } = await req.json();

    if (!offer_id || !action) {
      return json({ success: false, error: "Missing offer_id or action" }, 400);
    }

    if (!["accept", "reject"].includes(action)) {
      return json({ success: false, error: "Action must be 'accept' or 'reject'" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the offer with step details
    const { data: offer, error: offerErr } = await supabase
      .from("vendor_offers")
      .select(`
        id, step_id, vendor_id, vendor_name, workflow_id, order_id,
        counter_rate, counter_rate_unit, counter_total, counter_currency,
        counter_deadline, counter_note, counter_status,
        vendor_rate, vendor_rate_unit, vendor_total, vendor_currency
      `)
      .eq("id", offer_id)
      .single();

    if (offerErr || !offer) {
      return json({ success: false, error: "Offer not found" }, 404);
    }

    if (offer.counter_status !== "pending") {
      return json({ success: false, error: "Counter-proposal is not pending" }, 400);
    }

    // Get step info for response
    const { data: step } = await supabase
      .from("workflow_steps")
      .select("step_name, step_number")
      .eq("id", offer.step_id)
      .single();

    const now = new Date().toISOString();

    if (action === "accept") {
      // Use counter terms (fallback to original offer terms)
      const finalRate = offer.counter_rate ?? offer.vendor_rate;
      const finalRateUnit = offer.counter_rate_unit ?? offer.vendor_rate_unit;
      const finalTotal = offer.counter_total ?? offer.vendor_total;
      const finalCurrency = offer.counter_currency ?? offer.vendor_currency;
      const finalDeadline = offer.counter_deadline;

      // Update offer counter status
      await supabase
        .from("vendor_offers")
        .update({
          counter_status: "accepted",
          counter_responded_at: now,
          status: "accepted",
          responded_at: now,
        })
        .eq("id", offer_id);

      // Retract all other pending offers for this step
      await supabase
        .from("vendor_offers")
        .update({
          status: "retracted",
          responded_at: now,
        })
        .eq("step_id", offer.step_id)
        .neq("id", offer_id)
        .in("status", ["pending", "offered"]);

      // Assign vendor to step
      await supabase
        .from("workflow_steps")
        .update({
          assigned_vendor_id: offer.vendor_id,
          vendor_name: offer.vendor_name,
          status: "accepted",
          rate: finalRate,
          rate_unit: finalRateUnit,
          vendor_total: finalTotal,
          currency: finalCurrency || "CAD",
          deadline: finalDeadline || null,
          accepted_at: now,
          assigned_by: staff_id || null,
        })
        .eq("id", offer.step_id);

      // Cancel existing pending payables for this step, then create new one
      await supabase
        .from("vendor_payables")
        .update({ status: "cancelled" })
        .eq("step_id", offer.step_id)
        .eq("status", "pending");

      if (finalRate && finalTotal) {
        const units = finalRate > 0 ? finalTotal / finalRate : 1;
        await supabase.from("vendor_payables").insert({
          workflow_id: offer.workflow_id,
          step_id: offer.step_id,
          vendor_id: offer.vendor_id,
          vendor_name: offer.vendor_name,
          order_id: offer.order_id,
          rate: finalRate,
          rate_unit: finalRateUnit || "flat",
          units,
          subtotal: finalTotal,
          total: finalTotal,
          currency: finalCurrency || "CAD",
          status: "pending",
          description: `Step ${step?.step_number}: ${step?.step_name}`,
        });
      }

      return json({
        success: true,
        vendor_name: offer.vendor_name,
        step_name: step?.step_name,
      });
    } else {
      // Reject counter-proposal
      await supabase
        .from("vendor_offers")
        .update({
          counter_status: "rejected",
          counter_responded_at: now,
          counter_rejection_reason: rejection_reason || null,
        })
        .eq("id", offer_id);

      return json({
        success: true,
        vendor_name: offer.vendor_name,
        step_name: step?.step_name,
      });
    }
  } catch (err) {
    console.error("admin-respond-counter-offer error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
