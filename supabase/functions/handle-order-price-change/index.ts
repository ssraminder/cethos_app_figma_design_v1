// supabase/functions/handle-order-price-change/index.ts
// Handles order price changes (shortfall or refund) after order edits

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface HandlePriceChangeRequest {
  order_id: string;
  customer_id: string;
  original_total: number;
  new_total: number;
  difference: number; // positive = increase, negative = decrease
  handling_method: string; // 'stripe', 'ar', 'waive', 'refund'
  waive_reason?: string;
  stripe_expiry_days?: number;
  refund_method?: string; // 'stripe', 'credit', 'manual'
  staff_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: HandlePriceChangeRequest = await req.json();
    const {
      order_id,
      customer_id,
      original_total,
      new_total,
      difference,
      handling_method,
      waive_reason,
      stripe_expiry_days,
      refund_method,
      staff_id,
    } = payload;

    // Validation
    if (!order_id || !customer_id || !staff_id || !handling_method) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const now = new Date().toISOString();
    const absoluteDifference = Math.abs(difference);
    const isIncrease = difference > 0;

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*, customers(full_name, email, credit_balance)")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: "Order not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let stripePaymentLink: string | null = null;
    let refundId: string | null = null;
    let paymentRequestId: string | null = null;

    console.log(`Handling price change for order ${order_id}: ${handling_method}`);
    console.log(`Difference: $${difference} (${isIncrease ? 'increase' : 'decrease'})`);

    // ============================================
    // HANDLE PRICE INCREASE
    // ============================================
    if (isIncrease) {
      if (handling_method === "stripe") {
        // Generate Stripe payment link
        const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

        if (stripeSecretKey) {
          try {
            const stripe = new Stripe(stripeSecretKey, {
              apiVersion: "2023-10-16",
              httpClient: Stripe.createFetchHttpClient(),
            });

            const publicUrl =
              Deno.env.get("PUBLIC_URL") || "https://portal.cethos.com";
            const expiryDays = stripe_expiry_days || 7;
            const expiresAt =
              Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60;

            const paymentLinkResult = await stripe.paymentLinks.create({
              line_items: [
                {
                  price_data: {
                    currency: "cad",
                    product_data: {
                      name: `Order ${order.order_number} - Additional Payment`,
                      description: `Additional payment required due to order modification`,
                    },
                    unit_amount: Math.round(absoluteDifference * 100),
                  },
                  quantity: 1,
                },
              ],
              metadata: {
                order_id,
                customer_id,
                type: "order_edit_shortfall",
              },
              after_completion: {
                type: "redirect",
                redirect: {
                  url: `${publicUrl}/payment/success`,
                },
              },
            });

            stripePaymentLink = paymentLinkResult.url;

            // Record payment request
            const { data: paymentRequest } = await supabase
              .from("payment_requests")
              .insert({
                customer_id,
                order_id,
                amount: absoluteDifference,
                reason: "order_edit",
                stripe_payment_link_id: paymentLinkResult.id,
                stripe_payment_link_url: paymentLinkResult.url,
                expires_at: new Date(expiresAt * 1000).toISOString(),
                status: "pending",
                created_by_staff_id: staff_id,
                created_at: now,
              })
              .select()
              .single();

            paymentRequestId = paymentRequest?.id;

            // Update order status
            await supabase
              .from("orders")
              .update({
                balance_due: (order.balance_due || 0) + absoluteDifference,
                status: "awaiting_additional_payment",
                updated_at: now,
              })
              .eq("id", order_id);

            console.log(`Created Stripe payment link: ${stripePaymentLink}`);
          } catch (stripeError: unknown) {
            console.error("Stripe error:", stripeError);
            return new Response(
              JSON.stringify({
                success: false,
                error: "Failed to create payment link",
              }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
        }
      } else if (handling_method === "ar") {
        // Add to Accounts Receivable
        // First check if AR record already exists for this order
        const { data: existingAR } = await supabase
          .from("accounts_receivable")
          .select("id, amount_due, original_amount")
          .eq("order_id", order_id)
          .single();

        if (existingAR) {
          // Update existing AR record
          await supabase
            .from("accounts_receivable")
            .update({
              amount_due: (existingAR.amount_due || 0) + absoluteDifference,
              original_amount:
                (existingAR.original_amount || 0) + absoluteDifference,
              updated_at: now,
            })
            .eq("id", existingAR.id);
        } else {
          // Create new AR record
          await supabase.from("accounts_receivable").insert({
            order_id,
            customer_id,
            amount_due: absoluteDifference,
            original_amount: absoluteDifference,
            status: "unpaid",
            due_date: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000
            ).toISOString(), // Net 30
            created_at: now,
          });
        }

        // Update order balance
        await supabase
          .from("orders")
          .update({
            balance_due: (order.balance_due || 0) + absoluteDifference,
            updated_at: now,
          })
          .eq("id", order_id);

        console.log(`Added $${absoluteDifference} to AR`);
      } else if (handling_method === "waive") {
        // Record as discount/waiver
        await supabase.from("order_adjustments").insert({
          order_id,
          adjustment_type: "waive",
          amount: -absoluteDifference,
          original_total,
          new_total,
          reason: waive_reason || "Goodwill discount - order edit",
          handling_method: "waive",
          created_by_staff_id: staff_id,
          created_at: now,
        });

        // Order total already updated - no balance change
        console.log(`Waived $${absoluteDifference}: ${waive_reason}`);
      }
    }

    // ============================================
    // HANDLE PRICE DECREASE (REFUND)
    // ============================================
    if (!isIncrease && handling_method === "refund") {
      if (refund_method === "stripe") {
        // Try to process Stripe refund if original payment was via Stripe
        const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
        const stripePaymentIntentId = order.stripe_payment_intent_id;

        if (stripeSecretKey && stripePaymentIntentId) {
          try {
            const stripe = new Stripe(stripeSecretKey, {
              apiVersion: "2023-10-16",
              httpClient: Stripe.createFetchHttpClient(),
            });

            const refund = await stripe.refunds.create({
              payment_intent: stripePaymentIntentId,
              amount: Math.round(absoluteDifference * 100),
              reason: "requested_by_customer",
              metadata: {
                order_id,
                order_number: order.order_number,
                type: "order_edit_refund",
              },
            });

            // Record refund
            const { data: refundRecord } = await supabase
              .from("refunds")
              .insert({
                order_id,
                customer_id,
                amount: absoluteDifference,
                stripe_refund_id: refund.id,
                refund_method: "stripe",
                status: refund.status === "succeeded" ? "completed" : "pending",
                reason: "Order edit - price decrease",
                processed_at: now,
                created_by_staff_id: staff_id,
                created_at: now,
              })
              .select()
              .single();

            refundId = refundRecord?.id;
            console.log(`Processed Stripe refund: ${refund.id}`);
          } catch (stripeError: unknown) {
            console.error("Stripe refund error:", stripeError);
            // Fall through to create manual refund record
          }
        }

        // If Stripe refund failed or wasn't possible, create manual refund record
        if (!refundId) {
          const { data: refundRecord } = await supabase
            .from("refunds")
            .insert({
              order_id,
              customer_id,
              amount: absoluteDifference,
              refund_method: "manual",
              status: "pending",
              reason: "Order edit - price decrease (manual processing required)",
              created_by_staff_id: staff_id,
              created_at: now,
            })
            .select()
            .single();

          refundId = refundRecord?.id;
        }
      } else if (refund_method === "credit") {
        // Add to customer credit balance
        const currentCredit = order.customers?.credit_balance || 0;
        await supabase
          .from("customers")
          .update({
            credit_balance: currentCredit + absoluteDifference,
            updated_at: now,
          })
          .eq("id", customer_id);

        // Log credit
        await supabase.from("customer_credit_log").insert({
          customer_id,
          amount: absoluteDifference,
          type: "credit_added",
          source: "order_edit_refund",
          order_id,
          notes: `Credit from order ${order.order_number} price decrease`,
          created_by_staff_id: staff_id,
          created_at: now,
        });

        console.log(`Added $${absoluteDifference} credit to customer`);
      } else if (refund_method === "manual") {
        // Create manual refund record
        const { data: refundRecord } = await supabase
          .from("refunds")
          .insert({
            order_id,
            customer_id,
            amount: absoluteDifference,
            refund_method: "manual",
            status: "pending",
            reason: "Order edit - price decrease",
            created_by_staff_id: staff_id,
            created_at: now,
          })
          .select()
          .single();

        refundId = refundRecord?.id;
      }

      // Update order paid amount and balance
      await supabase
        .from("orders")
        .update({
          refund_amount: (order.refund_amount || 0) + absoluteDifference,
          updated_at: now,
        })
        .eq("id", order_id);
    }

    // ============================================
    // RECORD ORDER ADJUSTMENT
    // ============================================
    await supabase.from("order_adjustments").insert({
      order_id,
      adjustment_type: "price_change",
      amount: difference,
      original_total,
      new_total,
      reason: isIncrease
        ? `Price increase - handled via ${handling_method}`
        : `Price decrease - handled via ${refund_method || handling_method}`,
      handling_method: isIncrease ? handling_method : refund_method,
      payment_request_id: paymentRequestId,
      refund_id: refundId,
      created_by_staff_id: staff_id,
      created_at: now,
    });

    // ============================================
    // LOG ACTIVITY
    // ============================================
    await supabase.from("staff_activity_log").insert({
      staff_id,
      action_type: "handle_order_price_change",
      entity_type: "orders",
      entity_id: order_id,
      details: {
        order_number: order.order_number,
        original_total,
        new_total,
        difference,
        handling_method: isIncrease ? handling_method : refund_method,
        stripe_payment_link: stripePaymentLink,
        refund_id: refundId,
        payment_request_id: paymentRequestId,
      },
      created_at: now,
    });

    return new Response(
      JSON.stringify({
        success: true,
        handling_method: isIncrease ? handling_method : refund_method,
        stripe_payment_link: stripePaymentLink,
        refund_id: refundId,
        payment_request_id: paymentRequestId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Handle order price change error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
