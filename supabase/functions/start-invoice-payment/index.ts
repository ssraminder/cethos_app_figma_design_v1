// ============================================================================
// start-invoice-payment
//
// Public redirect endpoint linked from invoice emails. Each customer click
// creates a *fresh* Stripe Checkout Session and 302-redirects the browser
// to it, so the URL embedded in the email never expires — unlike the
// previous pattern that baked a one-shot cs_live_... URL into the email
// that died after Stripe's 24h session cap.
//
// Usage:  GET /functions/v1/start-invoice-payment?req=<payment_request_id>
//
// Short-circuits if the invoice is already paid or voided — redirects the
// customer to a friendly status page on the portal rather than opening a
// redundant Stripe session.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const PORTAL_URL = "https://portal.cethos.com";

function redirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
}

function htmlError(message: string, status = 400): Response {
  const safe = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;text-align:center;color:#1e293b;">
      <h2>Payment link issue</h2>
      <p style="color:#64748b">${safe}</p>
      <p style="margin-top:24px;font-size:13px;color:#94a3b8">Please contact <a href="mailto:support@cethos.com" style="color:#2563eb">support@cethos.com</a> for a fresh link.</p>
    </body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const reqId = url.searchParams.get("req");
    if (!reqId) return htmlError("Missing payment request id.", 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pr, error: prErr } = await sb
      .from("payment_requests")
      .select("id, customer_id, invoice_id, amount, reason, status, click_count")
      .eq("id", reqId)
      .maybeSingle();
    if (prErr || !pr) return htmlError("Payment request not found.", 404);
    if (!pr.invoice_id) return htmlError("Payment request is not linked to an invoice.", 400);

    const { data: invoice } = await sb
      .from("customer_invoices")
      .select("id, invoice_number, customer_id, balance_due, status, currency")
      .eq("id", pr.invoice_id)
      .single();
    if (!invoice) return htmlError("Invoice not found.", 404);

    if (invoice.status === "paid") {
      return redirect(
        `${PORTAL_URL}/customer/invoices?payment=already_paid&invoice=${encodeURIComponent(invoice.invoice_number)}`,
      );
    }
    if (invoice.status === "void") {
      return redirect(
        `${PORTAL_URL}/customer/invoices?payment=voided&invoice=${encodeURIComponent(invoice.invoice_number)}`,
      );
    }
    if (pr.status === "paid" || pr.status === "cancelled") {
      return redirect(
        `${PORTAL_URL}/customer/invoices?payment=${encodeURIComponent(pr.status)}&invoice=${encodeURIComponent(invoice.invoice_number)}`,
      );
    }

    const balanceDue = parseFloat(String(invoice.balance_due || pr.amount || 0));
    if (!(balanceDue > 0)) {
      return redirect(
        `${PORTAL_URL}/customer/invoices?payment=zero_balance&invoice=${encodeURIComponent(invoice.invoice_number)}`,
      );
    }

    const { data: customer } = await sb
      .from("customers")
      .select("id, full_name, company_name, email")
      .eq("id", invoice.customer_id)
      .single();

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return htmlError("Payment gateway not configured.", 500);

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const currency = (invoice.currency || "CAD").toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customer?.email || undefined,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              description: `Payment for ${customer?.company_name || customer?.full_name || "customer"}`,
            },
            unit_amount: Math.round(balanceDue * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${PORTAL_URL}/customer/invoices?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PORTAL_URL}/customer/invoices?payment=cancelled`,
      metadata: {
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        invoice_number: invoice.invoice_number,
        payment_request_id: pr.id,
      },
    });

    if (!session.url) return htmlError("Failed to create checkout session.", 500);

    // Update payment_request with the latest session so the admin audit trail
    // reflects which session the customer actually landed on.
    await sb
      .from("payment_requests")
      .update({
        stripe_payment_link_id: session.id,
        stripe_payment_link_url: session.url,
        last_clicked_at: new Date().toISOString(),
        click_count: (pr.click_count || 0) + 1,
      })
      .eq("id", pr.id);

    return redirect(session.url);
  } catch (err: any) {
    console.error("start-invoice-payment error:", err);
    return htmlError(err?.message || "Unexpected error.", 500);
  }
});
