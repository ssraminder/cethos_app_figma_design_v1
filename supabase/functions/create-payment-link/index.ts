import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreatePaymentLinkRequest {
  quote_id: string;
  amount: number;
  customer_email: string;
  customer_name: string;
  quote_number: string;
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

    const body: CreatePaymentLinkRequest = await req.json();
    const { quote_id, amount, customer_email, customer_name, quote_number } = body;

    console.log("Creating payment link for quote:", quote_number, "Amount:", amount);

    if (!quote_id || !amount || !quote_number) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: quote_id, amount, quote_number" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Guard: child quote — never independently payable ────────────────────
    // Multi-pair fan-out: only the PARENT quote carries the full payable total.
    // Children have parent_quote_id IS NOT NULL and must reject here, matching
    // the same guard in create-checkout-session and customer-approve-quote-ar.
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: quoteRow, error: quoteErr } = await sb
      .from("quotes")
      .select("id, parent_quote_id")
      .eq("id", quote_id)
      .single();

    if (quoteErr || !quoteRow) {
      return new Response(
        JSON.stringify({ error: "Quote not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (quoteRow.parent_quote_id) {
      return new Response(
        JSON.stringify({
          error:
            "This is a sub-quote of a multi-language order; pay the parent quote instead.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create a payment link via Stripe
    const publicUrl = Deno.env.get("PUBLIC_URL") || "https://portal.cethos.com";

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: "cad",
            product_data: {
              name: `Translation Quote ${quote_number}`,
              description: `Professional translation services for quote ${quote_number}`,
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        quote_id,
        quote_number,
        customer_email: customer_email || "",
        customer_name: customer_name || "",
      },
      after_completion: {
        type: "redirect",
        redirect: {
          url: `${publicUrl}/order/confirmation/${quote_id}`,
        },
      },
      customer_creation: "always",
      allow_promotion_codes: true,
    });

    console.log("Payment link created successfully:", paymentLink.url);

    return new Response(
      JSON.stringify({
        success: true,
        url: paymentLink.url,
        payment_link_id: paymentLink.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error creating payment link:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to create payment link",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
