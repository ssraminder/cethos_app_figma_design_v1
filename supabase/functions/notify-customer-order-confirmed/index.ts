// ============================================================================
// notify-customer-order-confirmed
// ----------------------------------------------------------------------------
// AR / net-30 order confirmation. Sent when an order is CREATED from an
// accepted quote (or directly by staff) for a customer flagged
// `is_ar_customer = true`. NO upfront payment was charged — billing happens
// on delivery per the customer's payment_terms.
//
// This is the AR counterpart to the prepay path:
//   - PREPAY:  Customer pays via Stripe → stripe-webhook fires
//              orderConfirmationHtml ("Payment received & order confirmed").
//   - AR:      Order is created without a payment → this function fires
//              ("Order confirmed — invoice on delivery, Net 30").
//
// Triggers (caller responsibility — best-effort fire-and-forget):
//   - admin-create-order (when customer.is_ar_customer is true)
//   - crm-create-order   (same condition)
//   - quote-accept path  (AR-customer accepted quote without payment)
//
// DO NOT call this function for prepay customers — stripe-webhook already
// confirms their order. Double-sending would be confusing.
//
// Caller payload:  { order_id: string }
// All other context is fetched from the order row.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  brevoPayload,
  ctaButton,
  detailsTable,
  emailShell,
  esc,
  hint,
  lead,
  nextSteps,
  REPLY,
  statusBadge,
  strong,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";
import { formatMoney } from "../_shared/rush-pricing.ts";

const TEMPLATE: TemplateMeta = {
  name: "Customer — Order Confirmation (AR / Net 30)",
  version: "1.0",
  updatedAt: "2026-05-28",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL =
  Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com";

interface RequestBody {
  order_id?: string;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(iso);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  const orderId = body.order_id;
  if (!orderId) return json({ success: false, error: "order_id required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Load order + customer + quote envelope
  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select(
      `id, order_number, total_amount, currency, estimated_delivery_date, amount_paid,
       customer_id, quote_id,
       customers (id, full_name, email, is_ar_customer, payment_terms, ar_contact_email),
       quotes (id, quote_number, source_language_id, target_language_id, target_language_other, service_id)`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (oErr || !order) {
    console.error("notify-customer-order-confirmed: order fetch failed", oErr);
    return json({ success: false, error: "order_not_found" }, 404);
  }

  const customer = (Array.isArray((order as any).customers)
    ? (order as any).customers[0]
    : (order as any).customers) as
    | {
        id: string;
        full_name: string | null;
        email: string | null;
        is_ar_customer: boolean | null;
        payment_terms: string | null;
        ar_contact_email: string | null;
      }
    | null;

  if (!customer) {
    return json({ success: false, error: "customer_missing" }, 400);
  }

  // Guardrails — refuse to send to a non-AR customer (prepay path handles that)
  // or if a payment has already been recorded (avoids double-send).
  if (!customer.is_ar_customer) {
    return json({
      success: false,
      skipped: true,
      reason: "not_ar_customer",
      hint: "Prepay path is handled by stripe-webhook orderConfirmationHtml.",
    });
  }
  if (Number(order.amount_paid ?? 0) > 0) {
    return json({
      success: false,
      skipped: true,
      reason: "order_already_paid",
      hint: "Prepay path will send (or has sent) the receipt + confirmation.",
    });
  }

  const recipientEmail = customer.email || customer.ar_contact_email;
  const recipientName = customer.full_name;
  if (!recipientEmail) {
    return json({ success: false, error: "no_recipient_email" }, 400);
  }

  // Dedup — one confirmation per order.
  const { data: existing } = await supabase
    .from("notification_log")
    .select("id")
    .eq("event_type", "order_confirmation_ar")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return json({
      success: true,
      skipped: true,
      reason: "already_confirmed",
      log_id: existing.id,
    });
  }

  // Resolve language pair + service for the project line.
  const quote = (Array.isArray((order as any).quotes)
    ? (order as any).quotes[0]
    : (order as any).quotes) as
    | {
        id: string;
        quote_number: string;
        source_language_id: string | null;
        target_language_id: string | null;
        target_language_other: string | null;
        service_id: string | null;
      }
    | null;

  const langIds = [quote?.source_language_id, quote?.target_language_id]
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const langMap = new Map<string, string>();
  if (langIds.length > 0) {
    const { data: langs } = await supabase
      .from("languages")
      .select("id, name")
      .in("id", langIds);
    for (const r of (langs ?? []) as Array<{ id: string; name: string }>) {
      langMap.set(r.id, r.name);
    }
  }
  const sourceLangName = quote?.source_language_id ? langMap.get(quote.source_language_id) ?? null : null;
  const targetLangName = quote?.target_language_id
    ? langMap.get(quote.target_language_id) ?? null
    : quote?.target_language_other ?? null;
  const langLabel =
    sourceLangName && targetLangName
      ? `${sourceLangName} → ${targetLangName}`
      : sourceLangName || targetLangName || null;

  let serviceName: string | null = null;
  if (quote?.service_id) {
    const { data: svc } = await supabase
      .from("services")
      .select("name")
      .eq("id", quote.service_id)
      .maybeSingle();
    serviceName = svc?.name ?? null;
  }

  const customerFirstName =
    (recipientName || "").trim().split(/\s+/)[0] || "there";

  // payment_terms is free-text on the customer ("Net 30", "Net 60", etc).
  // Fall back to "Net 30" if unset since that's the most common.
  const termsLabel = (customer.payment_terms || "Net 30").trim();
  const totalFormatted = formatMoney(
    Number(order.total_amount ?? 0),
    (order.currency as string) || "CAD",
  );

  const projectLabel =
    serviceName && langLabel
      ? `${serviceName} · ${langLabel}`
      : serviceName || langLabel || "Translation services";

  const rows: Array<[string, string]> = [
    ["Order #", order.order_number],
  ];
  if (quote?.quote_number) rows.push(["Quote #", quote.quote_number]);
  rows.push(["Project", projectLabel]);
  rows.push(["Order total", totalFormatted]);
  rows.push(["Billing", `AR approved · ${termsLabel} — invoice on delivery`]);
  if (order.estimated_delivery_date) {
    rows.push(["Estimated delivery", fmtDate(order.estimated_delivery_date)]);
  }

  const html = emailShell(
    [
      statusBadge("success", "Order confirmed"),
      title(`Your order is confirmed — ${esc(order.order_number)}`),
      lead(
        `Hi ${esc(customerFirstName)}, thanks for your order. We've accepted your quote and your translation is now in our queue. Our linguists are starting work — here's everything you need for your records.`,
      ),
      detailsTable(rows),
      nextSteps("What happens next", [
        "Our linguists begin work on your documents within 2 business hours.",
        "You'll receive a draft to review before final delivery.",
        `We invoice on delivery, payable within your ${esc(termsLabel)} terms.`,
      ]),
      ctaButton({
        label: "Track my order",
        url: `${PORTAL_URL}/dashboard/orders/${order.id}`,
      }),
      hint(
        `${strong("No payment is due now")} — your account is on AR billing. We'll send the invoice once your translation is delivered.`,
      ),
    ].join(""),
    {
      replyTo: REPLY.customer,
      template: TEMPLATE,
      preheader: `Order ${order.order_number} confirmed · invoice on delivery, ${termsLabel}.`,
    },
  );

  // Send through Brevo.
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  let status: "sent" | "failed" | "skipped" = "skipped";
  let brevoMessageId: string | null = null;
  let errorMessage: string | null = null;

  if (!BREVO_API_KEY) {
    errorMessage = "BREVO_API_KEY not configured";
  } else {
    const payload = brevoPayload({
      to: [{ email: recipientEmail, name: recipientName || recipientEmail }],
      subject: `Your order is confirmed — ${order.order_number}`,
      html,
      replyTo: REPLY.customer,
      tags: ["order-confirmation-ar", `order-${order.order_number}`],
    });
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        status = "failed";
        errorMessage = `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}`;
      } else {
        status = "sent";
        brevoMessageId = (result as any)?.messageId ?? null;
      }
    } catch (e: any) {
      status = "failed";
      errorMessage = e?.message || String(e);
    }
  }

  try {
    await supabase.from("notification_log").insert({
      event_type: "order_confirmation_ar",
      recipient_type: "customer",
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      recipient_id: customer.id,
      order_id: orderId,
      step_id: null,
      subject: `Your order is confirmed — ${order.order_number}`,
      status,
      error_message: errorMessage,
      metadata: {
        order_number: order.order_number,
        quote_number: quote?.quote_number ?? null,
        total: order.total_amount,
        currency: order.currency,
        payment_terms: termsLabel,
        brevo_message_id: brevoMessageId,
      },
    });
  } catch (e: any) {
    console.error("notify-customer-order-confirmed log insert failed:", e?.message || e);
  }

  return json({
    success: status === "sent",
    status,
    brevo_message_id: brevoMessageId,
    error: errorMessage,
  });
});
