import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

serve(async (req) => {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    console.error("STRIPE_SECRET_KEY not configured");
    return new Response("Server configuration error", { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;

  try {
    const webhookSecret = Deno.env.get("STRIPE_INVOICE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("STRIPE_INVOICE_WEBHOOK_SECRET not configured");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      webhookSecret
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  console.log("Received webhook event:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { payment_intent_id, customer_id, invoice_ids } = session.metadata || {};

    console.log("Processing checkout.session.completed for payment_intent:", payment_intent_id);

    if (!payment_intent_id) {
      console.error("No payment_intent_id in metadata");
      return new Response("OK", { status: 200 });
    }

    try {
      // Update payment intent to completed
      const { error: intentUpdateError } = await supabaseClient
        .from("customer_payment_intents")
        .update({
          stripe_payment_intent_id: session.payment_intent as string,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", payment_intent_id);

      if (intentUpdateError) {
        console.error("Error updating payment intent:", intentUpdateError);
      }

      // Get invoice allocations from the payment intent
      const { data: allocations, error: allocError } = await supabaseClient
        .from("customer_payment_intent_invoices")
        .select("*")
        .eq("payment_intent_id", payment_intent_id);

      if (allocError) {
        console.error("Error fetching allocations:", allocError);
      }

      // Create confirmed payment record
      const { data: payment, error: paymentError } = await supabaseClient
        .from("customer_payments")
        .insert({
          customer_id,
          payment_intent_id,
          amount: (session.amount_total || 0) / 100,
          currency: session.currency?.toUpperCase() || "CAD",
          payment_method: "stripe",
          stripe_payment_intent_id: session.payment_intent as string,
          stripe_charge_id: null, // Could be fetched from payment intent if needed
          status: "completed",
        })
        .select()
        .single();

      if (paymentError) {
        console.error("Error creating payment record:", paymentError);
        return new Response("Error creating payment", { status: 500 });
      }

      console.log("Created payment record:", payment.id);

      // Create payment allocations and update invoices
      for (const alloc of allocations || []) {
        // Create allocation linking payment to invoice
        const { error: allocCreateError } = await supabaseClient
          .from("customer_payment_allocations")
          .insert({
            payment_id: payment.id,
            invoice_id: alloc.invoice_id,
            allocated_amount: alloc.allocated_amount,
          });

        if (allocCreateError) {
          console.error("Error creating allocation:", allocCreateError);
          continue;
        }

        // Get current invoice state
        const { data: invoice, error: invError } = await supabaseClient
          .from("customer_invoices")
          .select("amount_paid, total_amount")
          .eq("id", alloc.invoice_id)
          .single();

        if (invError) {
          console.error("Error fetching invoice:", invError);
          continue;
        }

        // Calculate new amounts
        const newAmountPaid = (invoice?.amount_paid || 0) + alloc.allocated_amount;
        const newBalanceDue = (invoice?.total_amount || 0) - newAmountPaid;
        const isPaid = newBalanceDue <= 0;

        // Update invoice with new payment amounts
        const { error: invoiceUpdateError } = await supabaseClient
          .from("customer_invoices")
          .update({
            amount_paid: newAmountPaid,
            balance_due: Math.max(0, newBalanceDue),
            status: isPaid ? "paid" : "partial",
            paid_at: isPaid ? new Date().toISOString() : null,
          })
          .eq("id", alloc.invoice_id);

        if (invoiceUpdateError) {
          console.error("Error updating invoice:", invoiceUpdateError);
        } else {
          console.log(`Updated invoice ${alloc.invoice_id}: paid=${isPaid}, balance=${newBalanceDue}`);
        }
      }

      console.log(`Payment processed successfully for intent ${payment_intent_id}`);
    } catch (error: any) {
      console.error("Error processing payment:", error);
      return new Response("Error processing payment", { status: 500 });
    }
  }

  return new Response("OK", { status: 200 });
});
