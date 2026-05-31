// customer-approve-quote-ar
//
// POST { quote_id, token } -> { success, order_id, order_number }
//
// Customer-facing "Approve & bill on AR (Net 30)" action on the quote-review
// page. Only AR-approved customers (customers.is_ar_customer = true) are
// permitted — non-AR customers receive an error and must use the Stripe
// path instead.
//
// On success:
//   - Validates the magic-link token via the customer_magic_links table
//   - Refuses if the quote has been paid/converted/cancelled, or if an
//     advance_percentage > 0 is set (advance requires upfront payment)
//   - Creates an order row (status='balance_due', invoice_status='unbilled',
//     balance_due = total)
//   - Updates the quote (status='ar_approved', billing_mode='ar_invoice',
//     approved_at, approved_by_customer_id, converted_to_order_id)
//   - Sends Brevo notifications: customer confirmation + staff alert to
//     pm@cethoscorp.com.
//
// Deployed with --no-verify-jwt (customer flow, token-gated).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const PORTAL_URL = "https://portal.cethos.com";
const STAFF_ALERT_EMAIL =
  Deno.env.get("AR_APPROVE_STAFF_EMAIL") || "pm@cethoscorp.com";

async function sendBrevoEmail(opts: {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  tag?: string;
}) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) {
    console.warn("BREVO_API_KEY not set — skipping email");
    return;
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Cethos Translation Services", email: "noreply@cethos.com" },
      to: opts.to,
      subject: opts.subject,
      htmlContent: opts.htmlContent,
      tags: opts.tag ? [opts.tag] : undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn("Brevo send failed:", res.status, body.slice(0, 200));
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return jsonResp({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const quoteId = body?.quote_id ?? body?.quoteId;
    const token = body?.token;
    if (!quoteId || !token) {
      return jsonResp({ success: false, error: "quote_id and token are required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Validate the magic-link token ─────────────────────────────────────
    const { data: link } = await sb
      .from("customer_magic_links")
      .select("id, customer_id, quote_id, expires_at, used_at, is_valid")
      .eq("token", token)
      .eq("quote_id", quoteId)
      .maybeSingle();

    if (!link) {
      return jsonResp({ success: false, error: "Invalid or expired link" }, 401);
    }
    if (link.is_valid === false || link.used_at) {
      return jsonResp({ success: false, error: "Link has already been used or revoked" }, 401);
    }
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return jsonResp({ success: false, error: "Link has expired" }, 401);
    }

    // ── Fetch the quote + customer ────────────────────────────────────────
    const { data: quote, error: qErr } = await sb
      .from("quotes")
      .select(
        `id, quote_number, status, customer_id, total, subtotal,
         certification_total, rush_fee, delivery_fee, tax_rate, tax_amount,
         currency, turnaround_type, estimated_delivery_date,
         converted_to_order_id, advance_percentage, parent_quote_id,
         customer:customers!quotes_customer_id_fkey(id, full_name, company_name, email, is_ar_customer, payment_terms)`,
      )
      .eq("id", quoteId)
      .maybeSingle();

    if (qErr || !quote) {
      return jsonResp({ success: false, error: "Quote not found" }, 404);
    }

    const customer = (quote as any).customer || {};

    // ── Guards ─────────────────────────────────────────────────────────────
    if (!customer.is_ar_customer) {
      return jsonResp(
        { success: false, error: "AR approval is only available for AR-billed customers" },
        403,
      );
    }
    if (quote.status === "paid" || quote.status === "ar_approved") {
      return jsonResp(
        { success: false, error: "This quote has already been approved" },
        400,
      );
    }
    if (quote.converted_to_order_id) {
      return jsonResp(
        { success: false, error: "This quote has already been converted to an order" },
        400,
      );
    }
    if (quote.parent_quote_id) {
      return jsonResp(
        {
          success: false,
          error:
            "This is a sub-quote of a multi-language order; approve the parent quote instead.",
        },
        400,
      );
    }
    if (Number(quote.advance_percentage ?? 0) > 0) {
      return jsonResp(
        {
          success: false,
          error:
            "This quote requires an advance payment; please use the Pay-advance button.",
        },
        400,
      );
    }
    if (Number(quote.total ?? 0) <= 0) {
      return jsonResp({ success: false, error: "Quote total is invalid" }, 400);
    }

    // ── Create the order ─────────────────────────────────────────────────
    const totalAmount = Number(quote.total);
    const currency = (quote.currency || "CAD").toUpperCase();

    const nowIso = new Date().toISOString();

    // ── Multi-pair fan-out: does this quote have single-pair child quotes? ───
    const { count: childCount } = await sb
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("parent_quote_id", quote.id);

    let order: { id: string; order_number: string };

    if (childCount && childCount > 0) {
      // PARENT quote with children → atomic fan-out RPC builds the parent order
      // (full AR balance) + N child work-unit orders ($0), and flips all quotes.
      const { data: rpcResult, error: rpcErr } = await sb.rpc(
        "convert_quote_to_orders",
        {
          p_quote_id: quote.id,
          p_payment: { method: "ar", currency, amount_paid: 0 },
        },
      );
      if (rpcErr || !rpcResult?.parent_order_id) {
        console.error("AR fan-out failed:", rpcErr);
        return jsonResp(
          { success: false, error: `Fan-out conversion failed: ${rpcErr?.message}` },
          500,
        );
      }
      order = {
        id: rpcResult.parent_order_id,
        order_number: rpcResult.parent_order_number,
      };
    } else {
      // ── Childless single-pair path — UNCHANGED from today ─────────────────
      const { data: insertedOrder, error: orderErr } = await sb
        .from("orders")
        .insert({
          quote_id: quote.id,
          customer_id: quote.customer_id,
          status: "balance_due",
          work_status: "pending",
          invoice_status: "unbilled",
          subtotal: quote.subtotal || 0,
          certification_total: quote.certification_total || 0,
          rush_fee: quote.rush_fee || 0,
          delivery_fee: quote.delivery_fee || 0,
          tax_rate: quote.tax_rate || 0,
          tax_amount: quote.tax_amount || 0,
          total_amount: totalAmount,
          amount_paid: 0,
          balance_due: totalAmount,
          currency,
          estimated_delivery_date: quote.estimated_delivery_date || null,
          is_rush: quote.turnaround_type === "rush",
        })
        .select("id, order_number")
        .single();

      if (orderErr || !insertedOrder) {
        console.error("Order create failed:", orderErr);
        return jsonResp(
          { success: false, error: `Failed to create order: ${orderErr?.message}` },
          500,
        );
      }
      order = insertedOrder as { id: string; order_number: string };

      // ── Flip the quote ──────────────────────────────────────────────────
      const { error: quoteErr } = await sb
        .from("quotes")
        .update({
          status: "ar_approved",
          billing_mode: "ar_invoice",
          approved_at: nowIso,
          approved_by_customer_id: quote.customer_id,
          converted_to_order_id: order.id,
        })
        .eq("id", quoteId);

      if (quoteErr) {
        console.error("Quote update failed:", quoteErr.message);
        // Order is already inserted — don't roll back; staff can reconcile.
      }
    }

    // ── Mark the magic-link token as used so it can't approve twice ───────
    await sb
      .from("customer_magic_links")
      .update({ used_at: nowIso, is_valid: false })
      .eq("id", link.id);

    // ── Notify ───────────────────────────────────────────────────────────
    const customerName = customer.company_name || customer.full_name || "there";
    const moneyStr = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
    }).format(totalAmount);
    const paymentTerms = customer.payment_terms || "net_30";
    const termsLabel = /net[_\s-]?(\d{1,3})/i.exec(paymentTerms)?.[0]?.replace("_", " ") || "Net 30";

    if (customer.email) {
      await sendBrevoEmail({
        to: [{ email: customer.email, name: customer.full_name || customer.email }],
        subject: `Quote ${quote.quote_number} approved — work has started`,
        tag: "ar-approve-customer",
        htmlContent: `
          <p>Hi ${customerName},</p>
          <p>Thank you for approving <strong>${quote.quote_number}</strong>. Your order is now in production.</p>
          <p>An invoice for <strong>${moneyStr} ${currency}</strong> on <strong>${termsLabel}</strong> terms will be sent upon delivery. No action is required from you in the meantime.</p>
          <p>You can track this order from your account at <a href="${PORTAL_URL}">portal.cethos.com</a>.</p>
          <p>— Cethos Translation Services</p>
        `,
      });
    }

    await sendBrevoEmail({
      to: [{ email: STAFF_ALERT_EMAIL }],
      subject: `AR-approved (no payment): ${quote.quote_number} -> ${order.order_number}`,
      tag: "ar-approve-staff",
      htmlContent: `
        <p>${customerName} approved quote <strong>${quote.quote_number}</strong> on AR Net 30 terms.</p>
        <p>Order <strong>${order.order_number}</strong> created. Status: <code>balance_due</code> / invoice <code>unbilled</code>. No payment captured.</p>
        <p>Total: <strong>${moneyStr} ${currency}</strong>.</p>
        <p>Invoice goes out on delivery.</p>
      `,
    });

    return jsonResp({
      success: true,
      order_id: order.id,
      order_number: order.order_number,
      quote_status: "ar_approved",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("customer-approve-quote-ar error:", msg);
    return jsonResp({ success: false, error: msg }, 500);
  }
});
