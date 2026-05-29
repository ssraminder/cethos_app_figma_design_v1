// =============================================================================
// send-deposit-reminder/index.ts
// VERSION: v3
// DATE: February 24, 2026
// CHANGES FROM v2:
//   - Updated deno.land/std import to @0.208.0 (fixes Deno v2.x runtime crash)
//   - Updated supabase-js import to @2.39.3 (matches other edge functions)
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  amountCard,
  callout,
  ctaButton,
  detailsTable,
  emailShell,
  esc,
  eyebrow,
  hint,
  lead,
  REPLY,
  strong,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";
import { formatMoney } from "../_shared/rush-pricing.ts";

const TEMPLATE: TemplateMeta = {
  name: "Customer — Deposit Reminder",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { payment_request_id, staff_id } = await req.json();

    if (!payment_request_id || !staff_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing required fields: payment_request_id, staff_id",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Fetch payment_request ──────────────────────────────────────────
    const { data: pr, error: prError } = await supabase
      .from("payment_requests")
      .select(
        `
        id, amount, status, reason, notes,
        stripe_payment_link_url, email_sent_to,
        document_type, source_language_id, target_language_id,
        customer_id,
        customers ( id, email, full_name )
      `,
      )
      .eq("id", payment_request_id)
      .single();

    if (prError || !pr) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment request not found",
        }),
        { status: 404, headers: jsonHeaders },
      );
    }

    if (pr.reason !== "deposit") {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "This reminder is only for deposit payment requests",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    if (pr.status !== "pending") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Cannot send reminder — payment request is already ${pr.status}`,
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    if (!pr.stripe_payment_link_url) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No payment link URL found on this request",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const customer = pr.customers as any;
    if (!customer?.email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Customer email not found",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // ── Resolve language names ─────────────────────────────────────────
    let sourceLanguageName: string | null = null;
    let targetLanguageName: string | null = null;

    if (pr.source_language_id) {
      const { data: lang } = await supabase
        .from("languages")
        .select("name")
        .eq("id", pr.source_language_id)
        .single();
      sourceLanguageName = lang?.name || null;
    }
    if (pr.target_language_id) {
      const { data: lang } = await supabase
        .from("languages")
        .select("name")
        .eq("id", pr.target_language_id)
        .single();
      targetLanguageName = lang?.name || null;
    }

    // ── Resolve staff name ─────────────────────────────────────────────
    const { data: staff } = await supabase
      .from("staff_users")
      .select("full_name")
      .eq("id", staff_id)
      .single();
    const staffName = staff?.full_name || "CETHOS Team";

    // ── Build email ────────────────────────────────────────────────────
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoKey) throw new Error("BREVO_API_KEY not configured");

    const formattedAmount = formatMoney(Number(pr.amount));
    const customerFirstName =
      (customer.full_name || "").trim().split(/\s+/)[0] || "there";

    const detailRows: Array<[string, string]> = [];
    if (sourceLanguageName || targetLanguageName) {
      detailRows.push([
        "Project",
        `${sourceLanguageName ?? "—"} → ${targetLanguageName ?? "—"}`,
      ]);
    }
    if (pr.document_type) {
      detailRows.push(["Document type", String(pr.document_type)]);
    }

    const noteCallout = pr.notes
      ? callout({
          tone: "warn",
          title: "Note from CETHOS",
          body: esc(String(pr.notes)),
        })
      : "";

    // No delivery options block — delivery dates confirm AFTER the deposit clears.
    const body = [
      eyebrow("Deposit still pending"),
      title("Friendly reminder: your deposit is still pending"),
      lead(
        `Hi ${esc(customerFirstName)}, this is a friendly reminder that your deposit payment is still pending. ${esc(staffName)} wanted to follow up and make sure you received your payment link.`,
      ),
      amountCard({
        amount: formattedAmount,
        currency: "Canadian Dollars (CAD)",
        label: "Deposit due",
      }),
      noteCallout,
      detailRows.length > 0 ? detailsTable(detailRows) : "",
      ctaButton({
        label: `Complete payment — ${formattedAmount}`,
        url: String(pr.stripe_payment_link_url),
        variant: "navy",
        align: "full",
      }),
      callout({
        tone: "success",
        title: "🔒 Secure payment",
        body: "Payments are processed via Stripe. Card details are never stored on our servers.",
      }),
      hint(
        `If you've already completed this payment, please disregard this email. Once your deposit is received we'll confirm your delivery date and assign your linguist. ${strong("Delivery dates start counting from the day the deposit clears.")} Questions? Reply to this email or contact <a href="mailto:support@cethos.com" style="color:#0E7490;">support@cethos.com</a>.`,
      ),
    ].join("");

    const emailHtml = emailShell(body, {
      replyTo: REPLY.customer,
      template: TEMPLATE,
      preheader: `Reminder — ${formattedAmount} deposit still pending.`,
    });

    const emailPayload = {
      sender: {
        name: "CETHOS Translation Services",
        email: "donotreply@cethos.com",
      },
      to: [{ email: customer.email, name: customer.full_name }],
      replyTo: { email: "support@cethos.com", name: "CETHOS Support" },
      subject: `Reminder: Your deposit payment is still pending — CETHOS`,
      htmlContent: emailHtml,
    };

    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": brevoKey },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      throw new Error(
        `Brevo email failed (${emailResponse.status}): ${errText}`,
      );
    }

    console.log("✅ Reminder sent to:", customer.email);

    // ── Update reminder_sent_at ────────────────────────────────────────
    const { error: updateError } = await supabase
      .from("payment_requests")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", payment_request_id);

    if (updateError)
      console.error("⚠️ Failed to update reminder_sent_at:", updateError);

    // ── Activity log ───────────────────────────────────────────────────
    try {
      await supabase.from("staff_activity_log").insert({
        staff_id,
        action_type: "send_deposit_reminder",
        entity_type: "customer",
        entity_id: customer.id,
        details: {
          payment_request_id,
          customer_email: customer.email,
          amount: pr.amount,
        },
      });
    } catch (logErr) {
      console.error("⚠️ Activity log failed (non-blocking):", logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reminder sent to ${customer.email}`,
        reminder_sent_at: new Date().toISOString(),
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (error: any) {
    console.error(
      "❌ send-deposit-reminder error:",
      error?.message || error,
    );
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Internal server error",
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
