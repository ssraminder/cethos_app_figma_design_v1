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
  name: "Customer — Deposit Link",
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
        const formattedAmount = formatMoney(amount);
        const customerFirstName =
          (customer.full_name || "").trim().split(/\s+/)[0] || "there";

        const detailRows: Array<[string, string]> = [];
        if (sourceLanguageName || targetLanguageName) {
          detailRows.push([
            "Project",
            `${sourceLanguageName ?? "—"} → ${targetLanguageName ?? "—"}`,
          ]);
        }
        if (document_type?.trim()) {
          detailRows.push(["Document type", document_type.trim()]);
        }
        // No delivery options on deposit emails per design spec — delivery
        // dates are confirmed AFTER the deposit clears.

        const noteCallout = notes?.trim()
          ? callout({
              tone: "warn",
              title: "Note from CETHOS",
              body: esc(notes.trim()),
            })
          : "";

        const body = [
          eyebrow("Deposit requested"),
          title("Your deposit payment link is ready"),
          lead(
            `Hi ${esc(customerFirstName)}, ${esc(staffName)} has sent you a deposit payment link for your upcoming translation. Use the button below to complete your payment securely.`,
          ),
          amountCard({
            amount: formattedAmount,
            currency: "Canadian Dollars (CAD)",
            label: "Deposit due",
          }),
          noteCallout,
          detailRows.length > 0 ? detailsTable(detailRows) : "",
          ctaButton({
            label: "Pay deposit securely",
            url: paymentLink.url,
            variant: "navy",
            align: "full",
          }),
          callout({
            tone: "success",
            title: "🔒 Secure payment",
            body: "Payments are processed via Stripe. Card details are never stored on our servers.",
          }),
          hint(
            `Once your deposit is received we'll confirm your delivery date and assign your linguist. ${strong("Delivery dates start counting from the day the deposit clears.")} Questions? Reply to this email or contact <a href="mailto:support@cethos.com" style="color:#0E7490;">support@cethos.com</a>.`,
          ),
        ].join("");

        const emailHtml = emailShell(body, {
          replyTo: REPLY.customer,
          template: TEMPLATE,
          preheader: `Your deposit ${formattedAmount} for your upcoming translation.`,
        });

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
