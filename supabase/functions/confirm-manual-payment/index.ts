import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const {
      queue_item_id,
      payment_intent_id,
      customer_id,
      amount,
      payment_method,
      allocations,
      confirmed_by_staff_id,
    } = await req.json();

    // Get AI info from queue
    const { data: queueItem } = await supabaseClient
      .from("payment_confirmation_queue")
      .select("ai_confidence, ai_reasoning")
      .eq("id", queue_item_id)
      .single();

    // Create payment record
    const { data: payment, error: paymentError } = await supabaseClient
      .from("customer_payments")
      .insert({
        customer_id,
        payment_intent_id,
        amount,
        payment_method,
        confirmed_by_staff_id,
        confirmed_at: new Date().toISOString(),
        ai_allocated: queueItem?.ai_confidence !== null,
        ai_confidence: queueItem?.ai_confidence,
        ai_reasoning: queueItem?.ai_reasoning,
        status: "completed",
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    // Create allocations and update invoices
    for (const alloc of allocations) {
      // Create allocation record
      await supabaseClient.from("customer_payment_allocations").insert({
        payment_id: payment.id,
        invoice_id: alloc.invoice_id,
        allocated_amount: alloc.allocated_amount,
      });

      // Update invoice
      const { data: invoice } = await supabaseClient
        .from("customer_invoices")
        .select("amount_paid, total_amount")
        .eq("id", alloc.invoice_id)
        .single();

      const newAmountPaid = (invoice?.amount_paid || 0) + alloc.allocated_amount;
      const newBalanceDue = (invoice?.total_amount || 0) - newAmountPaid;

      await supabaseClient
        .from("customer_invoices")
        .update({
          amount_paid: newAmountPaid,
          balance_due: Math.max(0, newBalanceDue),
          status: newBalanceDue <= 0.01 ? "paid" : "partial",
          paid_at: newBalanceDue <= 0.01 ? new Date().toISOString() : null,
        })
        .eq("id", alloc.invoice_id);
    }

    // Update payment intent
    await supabaseClient
      .from("customer_payment_intents")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", payment_intent_id);

    // Update queue
    await supabaseClient
      .from("payment_confirmation_queue")
      .update({
        status: "confirmed",
        processed_by_staff_id: confirmed_by_staff_id,
        processed_at: new Date().toISOString(),
      })
      .eq("id", queue_item_id);

    // Log staff activity
    await supabaseClient.from("staff_activity_log").insert({
      staff_id: confirmed_by_staff_id,
      action_type: "confirm_payment",
      entity_type: "customer_payments",
      entity_id: payment.id,
      details: {
        customer_id,
        amount,
        payment_method,
        allocations,
        ai_assisted: queueItem?.ai_confidence !== null,
        ai_confidence: queueItem?.ai_confidence,
      },
    });

    return new Response(
      JSON.stringify({ success: true, payment_id: payment.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
