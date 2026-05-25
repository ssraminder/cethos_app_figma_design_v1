// =============================================================================
// create-checkout-session/index.ts
//
// Creates a Stripe Checkout Session for a customer quote payment.
// Called from the frontend via supabase.functions.invoke("create-checkout-session").
//
// Guards:
//   - Already-paid quotes are rejected
//   - Already-converted quotes (with an order) are rejected
//   - Zero or negative totals are rejected
//   - Previous active sessions are expired before creating a new one
//
// Deployed with --no-verify-jwt (customer flow is unauthenticated).
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@13.3.0?target=deno";

const PORTAL_URL = "https://portal.cethos.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "Method not allowed" }, 405);
  }

  try {
    const { quoteId } = await req.json().catch(() => ({} as any));
    if (!quoteId) {
      return jsonResp({ error: "quoteId is required" }, 400);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return jsonResp({ error: "Stripe not configured" }, 500);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Fetch quote ─────────────────────────────────────────────────────────
    const { data: quote, error: qErr } = await sb
      .from("quotes")
      .select(
        `id, quote_number, status, customer_id,
         converted_to_order_id, total, currency,
         stripe_checkout_session_id`,
      )
      .eq("id", quoteId)
      .single();

    if (qErr || !quote) {
      return jsonResp({ error: "Quote not found" }, 404);
    }

    // ── Guard: already paid ─────────────────────────────────────────────────
    if (quote.status === "paid") {
      return jsonResp({ error: "This quote has already been paid" }, 400);
    }

    // ── Guard: already converted to order ───────────────────────────────────
    if (quote.converted_to_order_id) {
      return jsonResp(
        { error: "This quote has already been converted to an order" },
        400,
      );
    }

    // ── Guard: valid total ──────────────────────────────────────────────────
    const totalCents = Math.round((Number(quote.total) || 0) * 100);
    if (totalCents <= 0) {
      return jsonResp({ error: "Quote total must be greater than zero" }, 400);
    }

    // ── Expire any previous checkout session ────────────────────────────────
    if (quote.stripe_checkout_session_id) {
      try {
        await stripe.checkout.sessions.expire(quote.stripe_checkout_session_id);
      } catch {
        // May already be expired/completed — fine
      }
    }

    // ── Fetch customer email for Stripe prefill ─────────────────────────────
    let customerEmail: string | undefined;
    if (quote.customer_id) {
      const { data: customer } = await sb
        .from("customers")
        .select("email")
        .eq("id", quote.customer_id)
        .single();
      customerEmail = customer?.email || undefined;
    }

    // ── Create Stripe Checkout Session ───────────────────────────────────────
    const currency = (quote.currency || "CAD").toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `Translation Order — ${quote.quote_number}`,
              description: "Certified translation services by Cethos",
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${PORTAL_URL}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PORTAL_URL}/quote/${quoteId}/review`,
      metadata: {
        quote_id: quote.id,
        customer_id: quote.customer_id || "",
        quote_number: quote.quote_number || "",
      },
    });

    if (!session.url) {
      return jsonResp({ error: "Failed to create checkout session" }, 500);
    }

    // ── Store session ID on quote ───────────────────────────────────────────
    await sb
      .from("quotes")
      .update({
        stripe_checkout_session_id: session.id,
        status: "checkout_started",
      })
      .eq("id", quoteId);

    return jsonResp({ success: true, checkoutUrl: session.url });
  } catch (err: any) {
    console.error("create-checkout-session error:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
