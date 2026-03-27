// =============================================================================
// handle-stripe-invoice-payment/index.ts
// v1 — March 2026
//
// Called by the customer-facing /customer/invoices?payment=success page.
// Verifies a Stripe checkout session is paid, then marks the invoice as paid
// in customer_invoices and updates the matching payment_requests record.
//
// Also handles Stripe webhook events (checkout.session.completed) for
// server-side payment confirmation.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@13.3.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
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

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return jsonResp({ success: false, error: "STRIPE_SECRET_KEY not configured" }, 500);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Stripe Webhook path ────────────────────────────────────────────────────
  const stripeSignature = req.headers.get("stripe-signature");
  if (stripeSignature) {
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("❌ STRIPE_WEBHOOK_SECRET not configured");
      return jsonResp({ error: "Webhook secret not configured" }, 500);
    }

    const body = await req.text();
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, stripeSignature, webhookSecret);
    } catch (err: any) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return jsonResp({ error: "Invalid signature" }, 400);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await markInvoicePaid(sb, session);
    }

    return jsonResp({ received: true });
  }

  // ── Client-side session verification path ─────────────────────────────────
  let session_id: string;
  try {
    const body = await req.json();
    session_id = body.session_id;
  } catch {
    return jsonResp({ success: false, error: "Invalid request body" }, 400);
  }

  if (!session_id) {
    return jsonResp({ success: false, error: "session_id required" }, 400);
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id);
  } catch (err: any) {
    console.error("❌ Failed to retrieve Stripe session:", err.message);
    return jsonResp({ success: false, error: "Session not found" }, 404);
  }

  if (session.payment_status !== "paid") {
    return jsonResp({ success: false, error: "Payment not completed" }, 400);
  }

  const result = await markInvoicePaid(sb, session);
  return jsonResp(result);
});

// ── Shared: mark invoice as paid ─────────────────────────────────────────────
async function markInvoicePaid(
  sb: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session
): Promise<{ success: boolean; invoice_number?: string; error?: string }> {
  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId) {
    console.warn("⚠️ No invoice_id in session metadata:", session.id);
    return { success: false, error: "No invoice_id in metadata" };
  }

  // Fetch the invoice to check current state
  const { data: invoice, error: fetchErr } = await sb
    .from("customer_invoices")
    .select("id, invoice_number, status, total_amount, balance_due")
    .eq("id", invoiceId)
    .single();

  if (fetchErr || !invoice) {
    console.error("❌ Invoice not found:", invoiceId, fetchErr?.message);
    return { success: false, error: "Invoice not found" };
  }

  if (invoice.status === "paid") {
    console.log("ℹ️ Invoice already marked paid:", invoice.invoice_number);
    return { success: true, invoice_number: invoice.invoice_number };
  }

  const amountPaid = (session.amount_total ?? 0) / 100;
  const now = new Date().toISOString();

  // Update the invoice
  const { error: updateErr } = await sb
    .from("customer_invoices")
    .update({
      status: "paid",
      amount_paid: amountPaid,
      balance_due: 0,
      paid_at: now,
    })
    .eq("id", invoiceId);

  if (updateErr) {
    console.error("❌ Failed to update invoice:", updateErr.message);
    return { success: false, error: updateErr.message };
  }

  console.log("✅ Invoice marked paid:", invoice.invoice_number, "amount:", amountPaid);

  // Update the matching payment_request (only status — safest for schema compat)
  const { error: prErr } = await sb
    .from("payment_requests")
    .update({ status: "completed" })
    .eq("invoice_id", invoiceId)
    .eq("status", "pending");

  if (prErr) {
    console.warn("⚠️ payment_requests update failed (non-blocking):", prErr.message);
  }

  // Log the payment
  try {
    await sb.from("staff_activity_log").insert({
      action_type: "invoice_paid_stripe",
      entity_type: "customer_invoice",
      entity_id: invoiceId,
      details: {
        invoice_number: invoice.invoice_number,
        amount_paid: amountPaid,
        stripe_session_id: session.id,
        stripe_payment_intent: typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id,
      },
    });
  } catch (logErr) {
    console.warn("⚠️ Activity log failed (non-blocking):", logErr);
  }

  return { success: true, invoice_number: invoice.invoice_number };
}
