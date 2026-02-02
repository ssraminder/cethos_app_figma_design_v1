// supabase/functions/process-order-refund/index.ts
// Processes refunds via Stripe or records manual refunds for overpayments

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MANUAL_METHOD_LABELS: Record<string, string> = {
  e_transfer: "E-Transfer (Interac)",
  cheque: "Cheque",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
};

interface ProcessRefundPayload {
  order_id: string;
  staff_id: string;
  amount: number;
  method: "stripe" | string;
  stripe_payment_intent_id?: string;
  reference?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: ProcessRefundPayload = await req.json();
    const { order_id, staff_id, amount, method, stripe_payment_intent_id, reference } = payload;

    // Validate required fields
    if (!order_id || !staff_id || !amount || !method) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate amount is positive
    if (amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Refund amount must be greater than zero" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if order can be refunded
    if (order.status === "cancelled") {
      return new Response(
        JSON.stringify({ success: false, error: "Cannot process refund for cancelled order" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toISOString();
    let stripeRefundId: string | null = null;
    let refundStatus = "completed";

    // Process Stripe refund
    if (method === "stripe" && stripe_payment_intent_id && stripeSecretKey) {
      try {
        const stripe = new Stripe(stripeSecretKey, {
          apiVersion: "2023-10-16",
        });

        const refund = await stripe.refunds.create({
          payment_intent: stripe_payment_intent_id,
          amount: Math.round(amount * 100), // Convert to cents
          reason: "requested_by_customer",
          metadata: {
            order_id: order_id,
            order_number: order.order_number,
            refund_type: "overpayment",
            processed_by: staff_id,
          },
        });

        stripeRefundId = refund.id;
        refundStatus = refund.status === "succeeded" ? "completed" : "pending";
      } catch (stripeError: unknown) {
        console.error("Stripe refund error:", stripeError);
        const errorMessage = stripeError instanceof Error ? stripeError.message : "Unknown Stripe error";
        return new Response(
          JSON.stringify({ success: false, error: `Stripe refund failed: ${errorMessage}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create adjustment record for the refund
    const methodLabel = method === "stripe"
      ? "Stripe"
      : MANUAL_METHOD_LABELS[method] || method;

    const { error: adjustmentError } = await supabase.from("adjustments").insert({
      order_id: order_id,
      adjustment_type: "refund",
      amount: amount, // Store as positive, the type indicates it's a refund
      reason: `Overpayment refund - ${methodLabel}${reference ? ` (Ref: ${reference})` : ""}`,
      internal_notes: stripeRefundId
        ? `Stripe Refund ID: ${stripeRefundId}`
        : reference
        ? `Reference: ${reference}`
        : null,
      status: refundStatus,
      created_by: staff_id,
      created_at: now,
    });

    if (adjustmentError) {
      console.error("Error creating adjustment:", adjustmentError);
      // Non-fatal error, continue
    }

    // Calculate new amounts
    const newAmountPaid = Math.max(0, (order.amount_paid || 0) - amount);
    const newRefundAmount = (order.refund_amount || 0) + amount;
    const newBalanceDue = Math.max(0, order.total_amount - newAmountPaid);

    // Determine new status
    let newStatus = order.status;
    if (newBalanceDue > 0) {
      newStatus = "balance_due";
    } else if (newBalanceDue === 0 && newAmountPaid >= order.total_amount) {
      newStatus = "paid";
    }

    // Update order
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        amount_paid: newAmountPaid,
        balance_due: newBalanceDue,
        refund_amount: newRefundAmount,
        refund_status: refundStatus,
        status: newStatus,
        updated_at: now,
      })
      .eq("id", order_id);

    if (updateError) {
      console.error("Error updating order:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to update order: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log staff activity
    await supabase.from("staff_activity_log").insert({
      staff_id: staff_id,
      action_type: "process_refund",
      entity_type: "order",
      entity_id: order_id,
      details: {
        order_number: order.order_number,
        amount: amount,
        method: method,
        stripe_refund_id: stripeRefundId,
        reference: reference,
        status: refundStatus,
        previous_amount_paid: order.amount_paid,
        new_amount_paid: newAmountPaid,
        new_balance_due: newBalanceDue,
      },
      created_at: now,
    });

    console.log(`Refund processed for order ${order_id}: $${amount} via ${method}`);

    return new Response(
      JSON.stringify({
        success: true,
        refund_amount: amount,
        stripe_refund_id: stripeRefundId,
        status: refundStatus,
        new_amount_paid: newAmountPaid,
        new_balance_due: newBalanceDue,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Process refund error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
