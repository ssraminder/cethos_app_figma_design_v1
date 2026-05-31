// send-quote-link-email
//
// Two modes:
//   mode: "create" → invalidate any existing valid quote_access magic link
//     for this customer, create a new one, return the customer-facing URL.
//     Does NOT send an email. Used by the admin "Create Quote Link" button
//     to preview the URL before deciding to send.
//
//   mode: "send" (default) → find the latest valid quote_access magic link
//     for this customer and email it. If none exists, create one first.
//     Used by the "Send Quote Link" button.
//
// Reconstructed 2026-05-27 from commit 0279914 (the only historical
// version on disk). Source had been lost; only the deployed bundle
// existed. URL format updated to /quote?quote_id=…&token=… to match
// the current customer router (the old /quote/Step5/{id}?token= path
// no longer resolves).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ctaButton,
  deliveryOptions,
  detailsTable,
  emailShell,
  esc,
  eyebrow,
  hint,
  lead,
  lineItemsTable,
  REPLY,
  strong,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";
import { formatMoney, getRushConfig } from "../_shared/rush-pricing.ts";

const TEMPLATE: TemplateMeta = {
  name: "Customer — Quote Ready",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendQuoteLinkEmailRequest {
  quoteId: string;
  staffId?: string;
  mode?: "create" | "send";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body: SendQuoteLinkEmailRequest = await req.json();
    const { quoteId, staffId } = body;
    const mode: "create" | "send" = body.mode === "create" ? "create" : "send";

    if (!quoteId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: quoteId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(
        `
        id,
        quote_number,
        total,
        subtotal,
        tax_amount,
        tax_rate,
        rush_fee,
        is_rush,
        promised_delivery_date,
        promised_delivery_date_rush,
        estimated_delivery_date,
        version,
        expires_at,
        source_language_id,
        target_language_id,
        target_language_other,
        service_id,
        customer_id,
        customers!quotes_customer_id_fkey (
          id,
          full_name,
          email
        )
      `,
      )
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      console.error("Quote fetch error:", quoteError);
      return new Response(
        JSON.stringify({ success: false, error: "Quote not found", details: quoteError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const customer = quote.customers as any;
    if (!customer || !customer.email) {
      return new Response(
        JSON.stringify({ success: false, error: "Customer email not found" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const publicUrl = Deno.env.get("PUBLIC_URL") || "https://portal.cethos.com";

    let token: string | null = null;
    let expiresAt: Date | null = null;

    if (mode === "create") {
      // Invalidate any prior valid quote_access tokens for this customer,
      // then create a fresh one. Email is NOT sent.
      const { error: invalidateError } = await supabase
        .from("customer_magic_links")
        .update({
          is_valid: false,
          invalidated_at: new Date().toISOString(),
          invalidated_by: staffId || null,
        })
        .eq("customer_id", customer.id)
        .eq("quote_id", quoteId)
        .eq("purpose", "quote_access")
        .eq("is_valid", true);

      if (invalidateError) {
        console.error("Error invalidating old links:", invalidateError);
      }

      token = crypto.randomUUID() + "-" + Date.now();
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error: linkError } = await supabase
        .from("customer_magic_links")
        .insert({
          customer_id: customer.id,
          quote_id: quoteId,
          token,
          purpose: "quote_access",
          expires_at: expiresAt.toISOString(),
          is_valid: true,
          created_by_staff_id: staffId || null,
        });

      if (linkError) {
        console.error("Error creating magic link:", linkError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to create magic link",
            details: linkError,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const quoteReviewLink = `${publicUrl}/quote?quote_id=${quoteId}&token=${token}`;

      if (staffId) {
        await supabase.from("staff_activity_log").insert({
          staff_id: staffId,
          action: "create_quote_link",
          resource_type: "quote",
          resource_id: quoteId,
          details: {
            quote_number: quote.quote_number,
            customer_email: customer.email,
          },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: "create",
          token,
          expiresAt: expiresAt.toISOString(),
          quoteReviewLink,
          emailSent: false,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // mode === "send": reuse the latest valid token; create one only if
    // none exists. Then email it.
    const { data: existing } = await supabase
      .from("customer_magic_links")
      .select("token, expires_at")
      .eq("customer_id", customer.id)
      .eq("quote_id", quoteId)
      .eq("purpose", "quote_access")
      .eq("is_valid", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.token) {
      token = existing.token;
      expiresAt = existing.expires_at ? new Date(existing.expires_at) : null;
    } else {
      token = crypto.randomUUID() + "-" + Date.now();
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error: linkError } = await supabase
        .from("customer_magic_links")
        .insert({
          customer_id: customer.id,
          quote_id: quoteId,
          token,
          purpose: "quote_access",
          expires_at: expiresAt.toISOString(),
          is_valid: true,
          created_by_staff_id: staffId || null,
        });

      if (linkError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to create magic link",
            details: linkError,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    const quoteReviewLink = `${publicUrl}/quote?quote_id=${quoteId}&token=${token}`;

    let emailSent = false;
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");

    if (brevoApiKey) {
      const expiryString = (expiresAt ?? new Date()).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Resolve language pair display.
      const langIds = [quote.source_language_id, quote.target_language_id]
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
      const sourceLangName = quote.source_language_id ? langMap.get(quote.source_language_id) ?? null : null;
      const targetLangName = quote.target_language_id
        ? langMap.get(quote.target_language_id) ?? null
        : (quote.target_language_other ?? null);

      let serviceName: string | null = null;
      if (quote.service_id) {
        const { data: svc } = await supabase
          .from("services")
          .select("name")
          .eq("id", quote.service_id)
          .maybeSingle();
        serviceName = svc?.name ?? null;
      }

      // Rush config from settings — never hardcode the surcharge label.
      const rushCfg = await getRushConfig(supabase);

      const subtotal = Number(quote.subtotal ?? 0);
      const taxAmount = Number(quote.tax_amount ?? 0);
      const taxRate = Number(quote.tax_rate ?? 0);
      const total = Number(quote.total ?? 0);
      const taxRatePct = Math.round(taxRate * 1000) / 10;

      const fmtDate = (iso: string | null | undefined): string => {
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
      };

      const standardDate = fmtDate(
        quote.promised_delivery_date ?? quote.estimated_delivery_date ?? null,
      );
      const rushDate = fmtDate(quote.promised_delivery_date_rush ?? null);
      // Only show DeliveryOptions when BOTH dates exist — otherwise the rush
      // card shows "—" and gives the customer nothing to compare against.
      const showDeliveryOptions =
        quote.promised_delivery_date && quote.promised_delivery_date_rush;

      const langLabel =
        sourceLangName && targetLangName
          ? `${sourceLangName} → ${targetLangName}`
          : sourceLangName || targetLangName || null;

      const items = [
        {
          label: serviceName ?? "Translation services",
          sub: langLabel ?? undefined,
          amount: formatMoney(subtotal),
        },
      ];
      const totals = [
        { label: "Subtotal", amount: formatMoney(subtotal) },
        { label: `GST (${taxRatePct}%)`, amount: formatMoney(taxAmount) },
        { label: "Total due", amount: formatMoney(total), emphasis: "grand" as const },
      ];

      const detailRows: Array<[string, string]> = [["Quote #", quote.quote_number]];
      if (langLabel) detailRows.push(["Project", langLabel]);
      if (serviceName) detailRows.push(["Service", serviceName]);
      detailRows.push(["Valid until", expiryString]);

      const customerFirstName =
        (customer.full_name || "").trim().split(/\s+/)[0] || "Valued Customer";

      const deliveryBlock = showDeliveryOptions
        ? deliveryOptions({
            standardDate,
            rushDate,
            rushLabel: rushCfg.label,
            selected: null,
          })
        : "";

      const rushHint = showDeliveryOptions
        ? hint(
            `Standard delivery is ${strong(standardDate)} at the price shown. Need it sooner? Select ${strong(`Rush delivery (${rushCfg.label})`)} when you review the quote and the total will update automatically.`,
          )
        : "";

      const body = [
        eyebrow("Your quote is ready"),
        title(`Quote ${esc(quote.quote_number)} is ready for review`),
        lead(
          `Hi ${esc(customerFirstName)}, your translation quote is ready. Take a look at the breakdown below, then accept the quote when you're ready and we'll start work right away.`,
        ),
        detailsTable(detailRows),
        lineItemsTable({ items, totals }),
        deliveryBlock,
        ctaButton({ label: "Review & accept quote", url: quoteReviewLink }),
        rushHint,
        hint(
          `Questions? Reply to this email or contact <a href="mailto:support@cethos.com" style="color:#0E7490;">support@cethos.com</a>.`,
        ),
      ].join("");

      const emailHtml = emailShell(body, {
        replyTo: REPLY.customer,
        template: TEMPLATE,
        preheader: `Your translation quote ${quote.quote_number} for ${formatMoney(total)} — review & accept.`,
      });

      try {
        const brevoResponse = await fetch(
          "https://api.brevo.com/v3/smtp/email",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": brevoApiKey,
            },
            body: JSON.stringify({
              sender: {
                name: "Cethos Translation Services",
                email: "donotreply@cethos.com",
              },
              replyTo: { email: REPLY.customer },
              to: [
                {
                  email: customer.email,
                  name: customer.full_name || customer.email,
                },
              ],
              subject: `Your Cethos Quote ${quote.quote_number} - Ready for Review`,
              htmlContent: emailHtml,
            }),
          },
        );

        if (!brevoResponse.ok) {
          const errorText = await brevoResponse.text();
          console.error("Brevo API error:", brevoResponse.status, errorText);
        } else {
          emailSent = true;
        }
      } catch (emailError) {
        console.error("Error sending email:", emailError);
      }
    } else {
      console.warn("BREVO_API_KEY not set - skipping email");
    }

    if (staffId) {
      await supabase.from("staff_activity_log").insert({
        staff_id: staffId,
        action: "send_quote_link_email",
        resource_type: "quote",
        resource_id: quoteId,
        details: {
          quote_number: quote.quote_number,
          customer_email: customer.email,
          email_sent: emailSent,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: emailSent,
        mode: "send",
        token,
        expiresAt: expiresAt?.toISOString() ?? null,
        quoteReviewLink,
        emailSent,
      }),
      {
        status: emailSent ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
