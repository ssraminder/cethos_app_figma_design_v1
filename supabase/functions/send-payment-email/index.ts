// send-payment-email
//
// Pure email sender — takes the Stripe payment URL as input and emails it
// to the customer via Brevo. The Stripe Payment Link itself is created by
// create-payment-link, called separately. This function is invoked by the
// admin "Send Payment Link" button after the link has already been
// generated and stored on the quote.
//
// Reconstructed 2026-05-27 from commit 011df95 (the only historical
// version on disk). Source had been lost; only the deployed bundle
// existed.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  amountCard,
  callout,
  ctaButton,
  deliveryOptions,
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
import {
  computeRushTotal,
  formatMoney,
  getRushConfig,
} from "../_shared/rush-pricing.ts";

const TEMPLATE: TemplateMeta = {
  name: "Customer — Pay Link",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendPaymentEmailRequest {
  quoteId: string;
  customerEmail: string;
  customerName: string;
  quoteNumber: string;
  total: number;
  paymentUrl: string;
  staffId?: string;
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

    const body: SendPaymentEmailRequest = await req.json();
    const { quoteId, customerEmail, customerName, quoteNumber, total, paymentUrl, staffId } = body;

    if (!customerEmail || !quoteNumber || !paymentUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: customerEmail, quoteNumber, paymentUrl",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    const formattedExpiryDate = expiryDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const formattedTotal = formatMoney(total || 0);

    let emailSent = false;
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");

    if (brevoApiKey) {
      // Fetch the quote so we can advertise both delivery dates + spell out
      // the rush dollars. Quote is created admin-side with both dates set.
      const { data: quote } = await supabase
        .from("quotes")
        .select(
          "subtotal, tax_amount, tax_rate, total, promised_delivery_date, promised_delivery_date_rush, source_language_id, target_language_id, target_language_other, service_id",
        )
        .eq("id", quoteId)
        .maybeSingle();

      const subtotal = Number(quote?.subtotal ?? 0);
      const taxRate = Number(quote?.tax_rate ?? 0);

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
      const sourceLangName = quote?.source_language_id
        ? langMap.get(quote.source_language_id) ?? null
        : null;
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

      // Rush config from settings — never hardcode the percentage.
      const rushCfg = await getRushConfig(supabase);
      const rush = computeRushTotal({ subtotal, taxRate, surcharge: rushCfg.surcharge });

      const standardDate = fmtDate(quote?.promised_delivery_date ?? null);
      const rushDate = fmtDate(quote?.promised_delivery_date_rush ?? null);
      const showDelivery = !!(quote?.promised_delivery_date && quote?.promised_delivery_date_rush);

      const customerFirstName =
        (customerName || "").trim().split(/\s+/)[0] || "Valued Customer";

      const detailRows: Array<[string, string]> = [["Quote #", quoteNumber]];
      if (langLabel) detailRows.push(["Project", langLabel]);
      if (serviceName) detailRows.push(["Service", serviceName]);
      detailRows.push(["Subtotal", formatMoney(subtotal)]);
      detailRows.push([
        `GST (${Math.round(taxRate * 1000) / 10}%)`,
        formatMoney(Number(quote?.tax_amount ?? 0)),
      ]);
      detailRows.push(["Quote expires", formattedExpiryDate]);

      const deliveryBlock = showDelivery
        ? deliveryOptions({
            standardDate,
            rushDate,
            rushLabel: rushCfg.label,
            selected: null,
          })
        : "";

      // Rush-dollars callout — pay link is a fixed amount, so rush requires
      // a new link. Spell out the math so the customer can decide.
      const rushCallout = showDelivery
        ? callout({
            tone: "info",
            title: "Choosing rush delivery?",
            body: `Rush delivery brings your translation forward to ${strong(rushDate)} for a ${strong(rushCfg.label)} surcharge (${strong(formatMoney(rush.rushFee))}), bringing your total to ${strong(formatMoney(rush.rushedTotal))}. Let your project manager know and we'll send an updated pay link.`,
          })
        : "";

      const body = [
        eyebrow("Ready for payment"),
        title(`Pay for translation ${esc(quoteNumber)}`),
        lead(
          `Hi ${esc(customerFirstName)}, your translation quote is ready for payment. Complete payment to start your translation project — we'll begin work within 2 business hours of confirmation.`,
        ),
        amountCard({
          amount: formattedTotal,
          currency: "Canadian Dollars (CAD)",
          label: "Amount due",
        }),
        detailsTable(detailRows),
        deliveryBlock,
        rushCallout,
        ctaButton({
          label: `Pay ${formattedTotal} securely`,
          url: paymentUrl,
          variant: "navy",
          align: "full",
        }),
        callout({
          tone: "success",
          title: "🔒 Secure payment",
          body: "Payments are processed via Stripe. Card details are never stored on our servers.",
        }),
        hint(
          `This quote expires on ${strong(formattedExpiryDate)}. Questions? Reply to this email or contact <a href="mailto:support@cethos.com" style="color:#0E7490;">support@cethos.com</a>.`,
        ),
      ].join("");

      const emailHtml = emailShell(body, {
        replyTo: REPLY.customer,
        template: TEMPLATE,
        preheader: `Pay ${formattedTotal} for ${quoteNumber} securely via Stripe.`,
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
                  email: customerEmail,
                  name: customerName || customerEmail,
                },
              ],
              subject: `Pay for Your Translation - ${quoteNumber}`,
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

    if (quoteId) {
      await supabase.from("staff_activity_log").insert({
        staff_id: staffId || null,
        action: "send_payment_email",
        resource_type: "quote",
        resource_id: quoteId,
        details: {
          quote_number: quoteNumber,
          customer_email: customerEmail,
          payment_url: paymentUrl,
          email_sent: emailSent,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: emailSent,
        emailSent,
        message: emailSent ? "Payment email sent successfully" : "Failed to send email",
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
