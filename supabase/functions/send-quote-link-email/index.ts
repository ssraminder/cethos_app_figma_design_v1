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
        version,
        expires_at,
        customer_id,
        customers (
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

    const formattedTotal = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(quote.total || 0);

    let emailSent = false;
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");

    if (brevoApiKey) {
      const expiryString = (expiresAt ?? new Date()).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #7c3aed; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; background-color: #f9fafb; }
            .quote-box { background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .quote-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
            .quote-row:last-child { border-bottom: none; font-weight: bold; font-size: 18px; color: #7c3aed; }
            .cta-button { display: inline-block; padding: 14px 40px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; font-size: 16px; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .expiry-notice { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 15px; margin: 20px 0; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Translation Quote is Ready</h1>
            </div>
            <div class="content">
              <p>Hello ${customer.full_name || "Valued Customer"},</p>
              <p>Your translation quote is ready for review. Please click the button below to review your quote details and proceed with payment when you're ready.</p>
              <div class="quote-box">
                <div class="quote-row">
                  <span>Quote Number:</span>
                  <span><strong>${quote.quote_number}</strong></span>
                </div>
                <div class="quote-row">
                  <span>Total Amount:</span>
                  <span>${formattedTotal}</span>
                </div>
              </div>
              <p>Click the button below to review your quote:</p>
              <div style="text-align: center;">
                <a href="${quoteReviewLink}" class="cta-button">Review and Pay</a>
              </div>
              <div class="expiry-notice">
                <strong>Note:</strong> This link will expire on ${expiryString}.
              </div>
              <p>If you have any questions or need assistance, please contact us at <a href="mailto:support@cethos.com">support@cethos.com</a>.</p>
              <p>Best regards,<br/>The Cethos Team</p>
            </div>
            <div class="footer">
              <p>This is an automated email from Cethos Translation Services.</p>
              <p>&copy; ${new Date().getFullYear()} Cethos. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

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
                email: "noreply@cethos.com",
              },
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
