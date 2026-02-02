import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvoiceItem {
  id: string;
  invoice_number: string;
  amount: number;
}

interface CreateInvoiceCheckoutRequest {
  payment_intent_id: string;
  customer_id: string;
  invoices: InvoiceItem[];
  total_amount: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Payment service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: CreateInvoiceCheckoutRequest = await req.json();
    const { payment_intent_id, customer_id, invoices, total_amount } = body;

    console.log("Creating checkout session for payment intent:", payment_intent_id);
    console.log("Invoices:", invoices.map(i => i.invoice_number).join(", "));
    console.log("Total amount:", total_amount);

    if (!payment_intent_id || !customer_id || !invoices || invoices.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get customer email
    const { data: customer, error: customerError } = await supabaseClient
      .from("customers")
      .select("email, full_name")
      .eq("id", customer_id)
      .single();

    if (customerError) {
      console.error("Error fetching customer:", customerError);
    }

    // Build line items
    const lineItems = invoices.map((inv: InvoiceItem) => ({
      price_data: {
        currency: "cad",
        product_data: {
          name: `Invoice ${inv.invoice_number}`,
          description: `Payment for invoice ${inv.invoice_number}`,
        },
        unit_amount: Math.round(inv.amount * 100), // Convert to cents
      },
      quantity: 1,
    }));

    const publicUrl = Deno.env.get("SITE_URL") || Deno.env.get("PUBLIC_URL") || "https://portal.cethos.com";

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customer?.email,
      line_items: lineItems,
      success_url: `${publicUrl}/customer/invoices?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicUrl}/customer/invoices?payment=cancelled`,
      metadata: {
        payment_intent_id,
        customer_id,
        invoice_ids: invoices.map((i: InvoiceItem) => i.id).join(","),
      },
    });

    console.log("Checkout session created:", session.id);

    // Update payment intent with Stripe session ID
    const { error: updateError } = await supabaseClient
      .from("customer_payment_intents")
      .update({
        stripe_session_id: session.id,
        status: "processing",
      })
      .eq("id", payment_intent_id);

    if (updateError) {
      console.error("Error updating payment intent:", updateError);
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to create checkout session",
        message: error.message || String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
