// =============================================================================
// create-deposit-payment-link/index.ts
// VERSION: v6
// DATE: March 3, 2026
// CHANGES FROM v5:
//   - Updated deno.land/std import from @0.168.0 to @0.208.0
//     (fixes Deno v2.x runtime crash — same fix applied to send-deposit-reminder)
//   - Pinned @supabase/supabase-js to @2.39.3 (matches other edge functions)
//   - Stripe Payment Links → no expiry, same logic as v5
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@13.3.0?target=deno";

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
    const {
      email,
      full_name,
      phone,
      amount,
      notes,
      staff_id,
      source_language_id,
      target_language_id,
      document_type,
    } = await req.json();

    console.log("💳 create-deposit-payment-link request:", { email, full_name, amount, staff_id });

    if (!email || !full_name || !amount || !staff_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: email, full_name, amount, staff_id" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    if (amount <= 0 || amount > 100000) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid amount" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── Resolve staff ──────────────────────────────────────────────────
    const { data: staff, error: staffError } = await supabase
      .from("staff_users")
      .select("id, full_name, email")
      .eq("id", staff_id)
      .single();

    if (staffError || !staff) {
      return new Response(
        JSON.stringify({ success: false, error: "Staff user not found" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // ── Resolve language names ─────────────────────────────────────────
    let sourceLanguageName: string | null = null;
    let targetLanguageName: string | null = null;

    if (source_language_id) {
      const { data: lang } = await supabase.from("languages").select("name").eq("id", source_language_id).single();
      sourceLanguageName = lang?.name || null;
    }
    if (target_language_id) {
      const { data: lang } = await supabase.from("languages").select("name").eq("id", target_language_id).single();
      targetLanguageName = lang?.name || null;
    }

    const hasTranslationDetails = sourceLanguageName || targetLanguageName || document_type?.trim();

    // ── Resolve or create customer ─────────────────────────────────────
    let customer: { id: string; email: string; full_name: string; phone: string | null };
    let customerCreated = false;

    const { data: existing } = await supabase
      .from("customers")
      .select("id, email, full_name, phone")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      customer = existing;
    } else {
      const { data: newCustomer, error: createError } = await supabase
        .from("customers")
        .insert({
          email: normalizedEmail,
          full_name: full_name.trim(),
          phone: phone?.trim() || null,
          customer_type: "individual",
        })
        .select("id, email, full_name, phone")
        .single();

      if (createError || !newCustomer) throw new Error("Failed to create customer record");
      customer = newCustomer;
      customerCreated = true;
    }

    // ── Create Stripe Payment Link (no expiry) ─────────────────────────
    // stripe.paymentLinks.create → link stays active indefinitely.
    // To cancel: stripe.paymentLinks.update(id, { active: false })
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://portal.cethos.com";
    const productDescription = notes?.trim() || "Deposit for translation services";

    // Step 1: Create a Price object for this specific amount
    const price = await stripe.prices.create({
      currency: "cad",
      unit_amount: Math.round(amount * 100), // cents
      product_data: {
        name: "Translation Services Deposit",
        description: productDescription,
      },
    });

    // Step 2: Create the Payment Link using that price
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      after_completion: {
        type: "redirect",
        redirect: {
          url: `${frontendUrl}/deposit-success?payment_link={PAYMENT_LINK}`,
        },
      },
      metadata: {
        type: "deposit",
        customer_id: customer.id,
        customer_email: customer.email,
        staff_id: staff.id,
        notes: notes?.trim() || "",
        source_language: sourceLanguageName || "",
        target_language: targetLanguageName || "",
        document_type: document_type?.trim() || "",
      },
    });

    console.log("✅ Stripe Payment Link created:", paymentLink.id, paymentLink.url);

    // ── Insert into payment_requests ───────────────────────────────────
    // expires_at is NULL — payment link never expires unless staff cancels it.
    // stripe_payment_link_id stores the Payment Link ID (starts with "plink_")
    const { error: prError } = await supabase.from("payment_requests").insert({
      customer_id: customer.id,
      order_id: null,
      amount,
      reason: "deposit",
      stripe_payment_link_id: paymentLink.id,
      stripe_payment_link_url: paymentLink.url,
      expires_at: null, // No expiry — Payment Links stay active until deactivated
      status: "pending",
      email_sent_to: customer.email,
      created_by_staff_id: staff_id,
      source_language_id: source_language_id || null,
      target_language_id: target_language_id || null,
      document_type: document_type?.trim() || null,
      notes: notes?.trim() || null,
    });

    if (prError) console.error("❌ Failed to insert payment_request:", prError);
    else console.log("✅ payment_request inserted");

    // ── Build and send email ───────────────────────────────────────────
    const brevoKey = Deno.env.get("BREVO_API_KEY");

    if (!brevoKey) {
      console.warn("⚠️ BREVO_API_KEY not configured — skipping email");
    } else {
      try {
        const staffName = staff.full_name || "CETHOS Team";
        const formattedAmount = new Intl.NumberFormat("en-CA", {
          style: "currency",
          currency: "CAD",
        }).format(amount);

        const translationDetailsBlock = hasTranslationDetails ? `
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin: 0 0 28px;">
            <p style="color: #64748b; font-size: 11px; margin: 0 0 14px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700;">Translation Details</p>
            <table style="width: 100%; border-collapse: collapse;">
              ${sourceLanguageName || targetLanguageName ? `
              <tr>
                <td style="color: #94a3b8; font-size: 13px; padding: 5px 0; width: 40%;">Language Pair</td>
                <td style="color: #0f172a; font-size: 13px; font-weight: 600; padding: 5px 0;">
                  ${sourceLanguageName ?? "—"} → ${targetLanguageName ?? "—"}
                </td>
              </tr>` : ""}
              ${document_type?.trim() ? `
              <tr>
                <td style="color: #94a3b8; font-size: 13px; padding: 5px 0; width: 40%;">Document Type</td>
                <td style="color: #0f172a; font-size: 13px; font-weight: 600; padding: 5px 0;">${document_type.trim()}</td>
              </tr>` : ""}
            </table>
          </div>` : "";

        const descriptionText = notes?.trim() || "General translation deposit";
        const descriptionBlock = `
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 0 0 28px; border-radius: 0 10px 10px 0;">
            <p style="color: #92400e; font-size: 11px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700;">Note from CETHOS</p>
            <p style="color: #451a03; font-size: 14px; margin: 0; line-height: 1.6;">${descriptionText}</p>
          </div>`;

        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff;">

            <!-- Header: white + teal accent -->
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
                ${staffName} has sent you a deposit payment link for your upcoming translation.
                Please use the button below to complete your payment securely.
              </p>

              <!-- Amount block -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: 4px solid #0891b2; border-radius: 10px; padding: 28px 24px; margin: 0 0 28px; text-align: center;">
                <p style="color: #64748b; font-size: 11px; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Amount Due</p>
                <p style="color: #0f172a; font-size: 40px; font-weight: 800; margin: 0; letter-spacing: -1px; line-height: 1.1;">${formattedAmount}</p>
                <p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0;">Canadian Dollars (CAD)</p>
              </div>

              ${descriptionBlock}
              ${translationDetailsBlock}

              <!-- CTA Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${paymentLink.url}"
                   style="display: inline-block; padding: 16px 52px; background-color: #0f172a; color: #ffffff;
                          text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px;
                          letter-spacing: 0.3px;">
                  Pay ${formattedAmount} Securely
                </a>
              </div>

              <!-- Security note -->
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin: 0 0 28px;">
                <p style="color: #166534; font-size: 12px; margin: 0; line-height: 1.6;">
                  🔒 <strong>Secure payment powered by Stripe.</strong> Your payment information is encrypted and never stored on our servers.
                </p>
              </div>

              <p style="color: #cbd5e1; font-size: 12px; margin: 0; text-align: center; line-height: 1.6;">
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
          sender: { name: "CETHOS Translation Services", email: "donotreply@cethos.com" },
          to: [{ email: customer.email, name: customer.full_name }],
          replyTo: { email: "support@cethos.com", name: "CETHOS Support" },
          subject: `Your deposit payment link — CETHOS Translation Services`,
          htmlContent: emailHtml,
        };

        const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": brevoKey },
          body: JSON.stringify(emailPayload),
        });

        if (emailResponse.ok) {
          console.log("✅ Email sent to:", customer.email);
          await supabase
            .from("payment_requests")
            .update({ email_sent_at: new Date().toISOString() })
            .eq("stripe_payment_link_id", paymentLink.id);
        } else {
          const errText = await emailResponse.text();
          console.error(`❌ Brevo email failed (${emailResponse.status}):`, errText);
        }
      } catch (emailError: any) {
        console.error("❌ Email error (non-blocking):", emailError?.message || emailError);
      }
    }

    // ── Activity log ───────────────────────────────────────────────────
    try {
      await supabase.from("staff_activity_log").insert({
        staff_id,
        action_type: "create_deposit_link",
        entity_type: "customer",
        entity_id: customer.id,
        details: {
          customer_email: customer.email,
          customer_id: customer.id,
          customer_created: customerCreated,
          amount,
          payment_link_id: paymentLink.id,
          notes: notes || null,
          source_language: sourceLanguageName,
          target_language: targetLanguageName,
          document_type: document_type || null,
        },
      });
    } catch (logError) {
      console.error("⚠️ Activity log failed (non-blocking):", logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        customer_id: customer.id,
        customer_name: customer.full_name,
        customer_email: customer.email,
        customer_created: customerCreated,
        payment_url: paymentLink.url,
        payment_link_id: paymentLink.id,
        amount,
        expires_at: null, // No expiry
      }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (error: any) {
    console.error("❌ create-deposit-payment-link error:", error?.message || error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Internal server error" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
