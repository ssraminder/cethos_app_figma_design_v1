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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const LOGO_URL =
  "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png";

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

    const formattedAmount = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(Number(pr.amount));

    const hasTranslationDetails =
      sourceLanguageName || targetLanguageName || pr.document_type;

    // Translation details block
    const translationDetailsBlock = hasTranslationDetails
      ? `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin: 0 0 28px;">
        <p style="color: #64748b; font-size: 11px; margin: 0 0 14px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700;">Translation Details</p>
        <table style="width: 100%; border-collapse: collapse;">
${
  sourceLanguageName || targetLanguageName
    ? `
          <tr>
            <td style="color: #94a3b8; font-size: 13px; padding: 5px 0; width: 40%;">Language Pair</td>
            <td style="color: #0f172a; font-size: 13px; font-weight: 600; padding: 5px 0;">
${sourceLanguageName ?? "—"} → ${targetLanguageName ?? "—"}
            </td>
          </tr>`
    : ""
}
${
  pr.document_type
    ? `
          <tr>
            <td style="color: #94a3b8; font-size: 13px; padding: 5px 0; width: 40%;">Document Type</td>
            <td style="color: #0f172a; font-size: 13px; font-weight: 600; padding: 5px 0;">${pr.document_type}</td>
          </tr>`
    : ""
}
        </table>
      </div>`
      : "";

    // Notes block
    const descriptionText = pr.notes || "General translation deposit";
    const descriptionBlock = `
      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 0 0 28px; border-radius: 0 10px 10px 0;">
        <p style="color: #92400e; font-size: 11px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700;">Note from CETHOS</p>
        <p style="color: #451a03; font-size: 14px; margin: 0; line-height: 1.6;">${descriptionText}</p>
      </div>`;

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header: white background, teal bottom accent -->
        <div style="background-color: #ffffff; padding: 36px 32px 28px; text-align: center; border-bottom: 3px solid #0891b2;">
          <img
            src="${LOGO_URL}"
            alt="CETHOS Translation Services"
            style="height: 52px; width: auto; display: block; margin: 0 auto;"
          />
        </div>
        <!-- Body -->
        <div style="padding: 40px 36px;">
          <p style="color: #0f172a; font-size: 16px; font-weight: 600; margin: 0 0 8px;">
            Hi ${customer.full_name || "there"},
          </p>
          <p style="color: #475569; font-size: 14px; margin: 0 0 32px; line-height: 1.7;">
            This is a friendly reminder that your deposit payment for CETHOS Translation Services
            is still pending. ${staffName} wanted to follow up and make sure you received your payment link.
          </p>
          <!-- Amount block: slate palette -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: 4px solid #0891b2; border-radius: 10px; padding: 28px 24px; margin: 0 0 28px; text-align: center;">
            <p style="color: #64748b; font-size: 11px; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Amount Due</p>
            <p style="color: #0f172a; font-size: 40px; font-weight: 800; margin: 0; letter-spacing: -1px; line-height: 1.1;">${formattedAmount}</p>
            <p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0;">Canadian Dollars (CAD)</p>
          </div>
${descriptionBlock}
${translationDetailsBlock}
          <!-- CTA Button: dark -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${pr.stripe_payment_link_url}"
               style="display: inline-block; padding: 16px 52px; background-color: #0f172a; color: #ffffff;
                      text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px;
                      letter-spacing: 0.3px;">
              Complete Payment — ${formattedAmount}
            </a>
          </div>
          <!-- Security note -->
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin: 0 0 28px;">
            <p style="color: #166534; font-size: 12px; margin: 0; line-height: 1.6;">
              🔒 <strong>Secure payment powered by Stripe.</strong> Your payment information is encrypted and never stored on our servers.
            </p>
          </div>
          <p style="color: #cbd5e1; font-size: 12px; margin: 0; text-align: center; line-height: 1.6;">
            If you've already completed this payment, please disregard this email.<br>
            Questions? <a href="mailto:support@cethos.com" style="color: #0891b2; text-decoration: none;">support@cethos.com</a>
          </p>
        </div>
        <!-- Footer -->
        <div style="padding: 20px 36px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">
            CETHOS Translation Services ·
            <a href="https://cethos.com" style="color: #0891b2; text-decoration: none;">cethos.com</a>
          </p>
        </div>
      </div>`;

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
