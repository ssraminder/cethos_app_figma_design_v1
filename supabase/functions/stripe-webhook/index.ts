// =============================================================================
// stripe-webhook/index.ts
//
// Handles Stripe webhook events for the customer quote payment flow.
// Primary event: checkout.session.completed — creates an order from the
// quote, records the payment, and expires the checkout session so it cannot
// be reused (prevents duplicate charges).
//
// Deployed with --no-verify-jwt (Stripe sends raw POST, no Supabase auth).
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@13.3.0?target=deno";
import {
  ctaButton,
  detailsTable,
  emailShell,
  esc,
  lead,
  nextSteps,
  REPLY,
  statusBadge,
  strong,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TPL_CUSTOMER: TemplateMeta = {
  name: "Customer — Order Confirmation (Prepay)",
  version: "2.0",
  updatedAt: "2026-05-28",
};
const TPL_ADMIN: TemplateMeta = {
  name: "Admin — New Paid Order",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Staff recipients for "new paid order" notifications. Same recipient list
// pattern used by analyse-ocr-batch, analyse-ocr-next, ocr-process-next.
const ADMIN_NOTIFICATION_EMAILS = [
  "info@cethos.com",
  "pm@cethoscorp.com",
  "raminder@cethos.com",
];

// Direct Brevo call — avoid hopping through the send-email or
// send-staff-notification edge functions (both currently zombie bundles
// returning 404, see feedback_supabase_bundle_loss_pattern.md).
async function sendBrevo(args: {
  to: { email: string; name?: string }[];
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY not configured");
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
      to: args.to,
      subject: args.subject,
      htmlContent: args.html,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${body.slice(0, 200)}`);
  }
}

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
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return jsonResp({ error: "Not configured" }, 500);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  // ── Verify Stripe signature ───────────────────────────────────────────────
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return jsonResp({ error: "Missing stripe-signature header" }, 400);
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return jsonResp({ error: "Invalid signature" }, 400);
  }

  // Only handle checkout.session.completed for quote payments
  if (event.type !== "checkout.session.completed") {
    return jsonResp({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const quoteId = session.metadata?.quote_id;
  if (!quoteId) {
    console.log("No quote_id in session metadata — not a quote payment, skipping");
    return jsonResp({ received: true });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    await processQuotePayment(sb, stripe, session, quoteId);
    return jsonResp({ received: true });
  } catch (err: any) {
    console.error("stripe-webhook processing error:", err.message);
    return jsonResp({ error: err.message }, 500);
  }
});

// ── Core: convert quote → order + record payment ────────────────────────────
async function processQuotePayment(
  sb: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  quoteId: string,
) {
  // Fetch quote
  const { data: quote, error: qErr } = await sb
    .from("quotes")
    .select(
      `id, quote_number, status, customer_id, converted_to_order_id,
       subtotal, certification_total, rush_fee, delivery_fee,
       tax_rate, tax_amount, total,
       estimated_delivery_date,
       turnaround_type, currency`,
    )
    .eq("id", quoteId)
    .single();

  if (qErr || !quote) {
    throw new Error(`Quote not found: ${quoteId}`);
  }

  // ── Idempotency: already converted ────────────────────────────────────────
  if (quote.converted_to_order_id) {
    console.log(
      `Quote ${quote.quote_number} already converted → ${quote.converted_to_order_id}`,
    );
    return;
  }

  // ── Create order (order_number auto-generated by DB trigger) ──────────────
  const totalAmount = Number(quote.total || 0);
  const currency = (quote.currency || session.currency || "CAD").toUpperCase();

  const { data: order, error: orderErr } = await sb
    .from("orders")
    .insert({
      quote_id: quote.id,
      customer_id: quote.customer_id,
      status: "paid",
      work_status: "pending",
      subtotal: quote.subtotal || 0,
      certification_total: quote.certification_total || 0,
      rush_fee: quote.rush_fee || 0,
      delivery_fee: quote.delivery_fee || 0,
      tax_rate: quote.tax_rate || 0,
      tax_amount: quote.tax_amount || 0,
      total_amount: totalAmount,
      amount_paid: totalAmount,
      balance_due: 0,
      currency,
      estimated_delivery_date: quote.estimated_delivery_date || null,
      is_rush: quote.turnaround_type === "rush",
      paid_at: new Date().toISOString(),
    })
    .select("id, order_number")
    .single();

  if (orderErr || !order) {
    throw new Error(`Failed to create order: ${orderErr?.message}`);
  }

  console.log(
    `Order created: ${order.order_number} from quote ${quote.quote_number}`,
  );

  // ── Record payment ────────────────────────────────────────────────────────
  const amountPaid = (session.amount_total || 0) / 100;
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as any)?.id;

  // CHECK constraints on payments table:
  //   payment_type ∈ ('initial', 'balance', 'refund')
  //   status       ∈ ('pending','processing','succeeded','failed','refunded','cancelled')
  // payment_method has no CHECK but the existing 213 rows all use 'stripe'.
  const { error: payErr } = await sb.from("payments").insert({
    order_id: order.id,
    amount: amountPaid,
    currency,
    payment_type: "initial",
    payment_method: "stripe",
    status: "succeeded",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntent || null,
  });

  if (payErr) {
    console.error("Failed to create payment record:", payErr.message);
  }

  // ── Update quote: mark paid, link to order ────────────────────────────────
  const { error: quoteUpdateErr } = await sb
    .from("quotes")
    .update({
      status: "paid",
      converted_to_order_id: order.id,
      stripe_checkout_session_id: session.id,
      paid_at: new Date().toISOString(),
    })
    .eq("id", quoteId);

  if (quoteUpdateErr) {
    console.error("Failed to update quote:", quoteUpdateErr.message);
  }

  // ── Expire the checkout session to prevent reuse ──────────────────────────
  try {
    await stripe.checkout.sessions.expire(session.id);
    console.log("Expired checkout session:", session.id);
  } catch (expireErr: any) {
    // Already completed sessions can't be expired — that's fine
    console.log("Session expire skipped (likely already completed):", expireErr.message);
  }

  // ── Enrich payment with card details (non-blocking) ───────────────────────
  try {
    if (paymentIntent) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntent);
      const chargeId =
        typeof pi.latest_charge === "string"
          ? pi.latest_charge
          : (pi.latest_charge as any)?.id;

      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId);
        const card = charge.payment_method_details?.card;
        if (card) {
          await sb
            .from("payments")
            .update({
              stripe_charge_id: chargeId,
              card_brand: card.brand,
              card_last4: card.last4,
              card_exp_month: card.exp_month,
              card_exp_year: card.exp_year,
              card_country: card.country,
              receipt_url: charge.receipt_url,
              stripe_enriched_at: new Date().toISOString(),
            })
            .eq("stripe_checkout_session_id", session.id);
        }
      }
    }
  } catch (enrichErr: any) {
    console.warn("Card enrichment failed (non-blocking):", enrichErr.message);
  }

  // ── Customer confirmation + admin notification emails (non-blocking) ─────
  // Both sends go DIRECTLY to Brevo — we don't hop through send-email or
  // send-staff-notification edge functions because those are zombie bundles
  // (deployed but source missing → 404 NOT_FOUND on call). Failures here
  // MUST NOT roll back the order.
  let customerEmailSent = false;
  let customerEmailError: string | null = null;
  let adminEmailSent = false;
  let adminEmailError: string | null = null;

  const portalUrl = "https://portal.cethos.com";
  const eta = quote.estimated_delivery_date
    ? new Date(quote.estimated_delivery_date).toLocaleDateString("en-CA", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // ── 1. Customer confirmation ──
  try {
    if (quote.customer_id) {
      const { data: customer } = await sb
        .from("customers")
        .select("email, full_name")
        .eq("id", quote.customer_id)
        .single();

      if (customer?.email) {
        const firstName = (customer.full_name || "").trim().split(" ")[0] || "there";
        const html = orderConfirmationHtml({
          firstName,
          orderNumber: order.order_number,
          quoteNumber: quote.quote_number,
          amountPaid,
          currency,
          eta,
          portalUrl,
        });
        await sendBrevo({
          to: [{ email: customer.email, name: customer.full_name || customer.email }],
          subject: `Order Confirmation — ${order.order_number}`,
          html,
        });
        customerEmailSent = true;
        console.log(`Confirmation email sent to ${customer.email} for ${order.order_number}`);
      } else {
        console.warn(`No customer email for order ${order.order_number}; skipping`);
      }
    }
  } catch (mailErr: any) {
    customerEmailError = mailErr.message || String(mailErr);
    console.error("Customer confirmation email failed (non-blocking):", customerEmailError);
  }

  // ── 2. Admin / staff notification ──
  try {
    const { data: customer } = quote.customer_id
      ? await sb
          .from("customers")
          .select("email, full_name")
          .eq("id", quote.customer_id)
          .single()
      : { data: null as any };
    const adminHtml = adminPaymentNotificationHtml({
      orderNumber: order.order_number,
      quoteNumber: quote.quote_number,
      amountPaid,
      currency,
      customerName: customer?.full_name || "(unknown)",
      customerEmail: customer?.email || "(unknown)",
      eta,
      portalUrl,
      orderId: order.id,
    });
    await sendBrevo({
      to: ADMIN_NOTIFICATION_EMAILS.map((email) => ({ email })),
      subject: `💰 New paid order: ${order.order_number} ($${amountPaid.toFixed(2)} ${currency})`,
      html: adminHtml,
    });
    adminEmailSent = true;
    console.log(`Admin notification sent for ${order.order_number}`);
  } catch (mailErr: any) {
    adminEmailError = mailErr.message || String(mailErr);
    console.error("Admin notification email failed (non-blocking):", adminEmailError);
  }

  // ── Activity log ──────────────────────────────────────────────────────────
  try {
    await sb.from("staff_activity_log").insert({
      action_type: "quote_paid_stripe",
      entity_type: "order",
      entity_id: order.id,
      details: {
        quote_id: quote.id,
        quote_number: quote.quote_number,
        order_number: order.order_number,
        amount_paid: amountPaid,
        stripe_session_id: session.id,
        stripe_payment_intent: paymentIntent,
        customer_email_sent: customerEmailSent,
        customer_email_error: customerEmailError,
        admin_email_sent: adminEmailSent,
        admin_email_error: adminEmailError,
      },
    });
  } catch {
    // non-blocking
  }

  console.log(
    `Quote ${quote.quote_number} → Order ${order.order_number}, $${amountPaid} ${currency}`,
  );
}

// ── Order confirmation email HTML ───────────────────────────────────────────
// Inline HTML (no external Brevo template required). Mirrors the visual
// language of the /order/success page so the customer recognizes it.
function orderConfirmationHtml(args: {
  firstName: string;
  orderNumber: string;
  quoteNumber: string;
  amountPaid: number;
  currency: string;
  eta: string | null;
  portalUrl: string;
}): string {
  const { firstName, orderNumber, quoteNumber, amountPaid, currency, eta, portalUrl } = args;
  const amountStr = `$${amountPaid.toFixed(2)} ${currency}`;

  const rows: Array<[string, string]> = [
    ["Order #", orderNumber],
    ["Quote #", quoteNumber],
    ["Amount paid", amountStr],
  ];
  if (eta) rows.push(["Estimated delivery", eta]);

  const body = [
    statusBadge("success", "Payment received"),
    title(`Thanks, ${esc(firstName)} — payment received & order confirmed`),
    lead(
      `We've received your payment of ${strong(esc(amountStr))} for order ${strong(esc(orderNumber))}, and your order is now confirmed. Our linguists are starting work — your receipt is below.`,
    ),
    detailsTable(rows),
    nextSteps("What happens next", [
      "Our linguists begin work on your documents within 2 business hours.",
      "You'll receive a draft to review before final delivery.",
      "Download final files from your dashboard, or by tracked courier if selected.",
    ]),
    ctaButton({ label: "View my order", url: `${portalUrl}/dashboard` }),
  ].join("");

  return emailShell(body, {
    replyTo: REPLY.customer,
    template: TPL_CUSTOMER,
    preheader: `Payment received for ${orderNumber} (${amountStr}) — order confirmed.`,
  });
}

// ── Admin "new paid order" notification HTML ────────────────────────────────
function adminPaymentNotificationHtml(args: {
  orderNumber: string;
  quoteNumber: string;
  amountPaid: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  eta: string | null;
  portalUrl: string;
  orderId: string;
}): string {
  const {
    orderNumber,
    quoteNumber,
    amountPaid,
    currency,
    customerName,
    customerEmail,
    eta,
    portalUrl,
    orderId,
  } = args;
  const amountStr = `$${amountPaid.toFixed(2)} ${currency}`;

  const rows: Array<[string, string]> = [
    ["Customer", customerName],
    ["Email", customerEmail],
    ["Quote #", quoteNumber],
    ["Amount paid", amountStr],
  ];
  if (eta) rows.push(["Estimated delivery", eta]);

  const body = [
    statusBadge("info", "New paid order"),
    title(`${esc(orderNumber)} — ${esc(amountStr)}`),
    lead(
      `A new prepay order has just been confirmed. Open it in the admin portal to start workflow setup or hand it to a project manager.`,
    ),
    detailsTable(rows),
    ctaButton({ label: "Open in admin portal", url: `${portalUrl}/admin/orders/${orderId}` }),
  ].join("");

  return emailShell(body, {
    replyTo: REPLY.ops,
    template: TPL_ADMIN,
    preheader: `New paid order ${orderNumber} (${amountStr}) — ready for project setup.`,
  });
}
