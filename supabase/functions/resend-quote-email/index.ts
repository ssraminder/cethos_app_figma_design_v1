import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ResendQuoteEmailRequest {
  quoteId: string;
  staffId: string;
  customMessage?: string;
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

    const body: ResendQuoteEmailRequest = await req.json();
    const { quoteId, staffId, customMessage } = body;

    console.log("Resending quote email:", { quoteId, staffId });

    // 1. Fetch quote with customer details
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
        JSON.stringify({ error: "Quote not found", details: quoteError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const customer = quote.customers as any;
    if (!customer || !customer.email) {
      return new Response(
        JSON.stringify({ error: "Customer email not found" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      "Quote found:",
      quote.quote_number,
      "Customer:",
      customer.email,
    );

    // 2. Invalidate old magic links for this customer
    const { error: invalidateError } = await supabase
      .from("customer_magic_links")
      .update({
        is_valid: false,
        invalidated_at: new Date().toISOString(),
        invalidated_by: staffId,
      })
      .eq("customer_id", customer.id)
      .eq("purpose", "quote_access")
      .eq("is_valid", true);

    if (invalidateError) {
      console.error("Error invalidating old links:", invalidateError);
      // Continue anyway - this is not critical
    } else {
      console.log("Old magic links invalidated for customer:", customer.id);
    }

    // 3. Generate new magic link token
    const token = crypto.randomUUID() + "-" + Date.now();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

    const { error: linkError } = await supabase
      .from("customer_magic_links")
      .insert({
        customer_id: customer.id,
        token,
        purpose: "quote_access",
        expires_at: expiresAt.toISOString(),
        is_valid: true,
        created_by_staff_id: staffId,
      });

    if (linkError) {
      console.error("Error creating magic link:", linkError);
      return new Response(
        JSON.stringify({
          error: "Failed to create magic link",
          details: linkError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const magicLink = `https://cethos.com/quote/${quote.quote_number}?step=5&token=${token}`;
    console.log("New magic link generated:", magicLink);

    // 4. Send email via Brevo
    let emailSent = false;
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");

    if (brevoApiKey) {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0ea5e9; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .quote-box { background-color: white; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; }
            .cta-button { display: inline-block; padding: 12px 30px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .custom-message { background-color: #fff8e1; border-left: 4px solid #ffa726; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Quote is Ready for Review</h1>
            </div>
            <div class="content">
              <p>Hello ${customer.full_name},</p>
              
              <p>We're resending your translation quote for your review and payment.</p>
              
              ${
                customMessage
                  ? `
              <div class="custom-message">
                <strong>Message from our team:</strong><br/>
                ${customMessage}
              </div>
              `
                  : ""
              }
              
              <div class="quote-box">
                <strong>Quote Number:</strong> ${quote.quote_number}<br/>
                <strong>Version:</strong> ${quote.version}<br/>
                <strong>Total Amount:</strong> $${quote.total?.toFixed(2) || "0.00"}
              </div>
              
              <p>Please click the button below to review your quote and proceed with payment:</p>
              
              <div style="text-align: center;">
                <a href="${magicLink}" class="cta-button">Review & Pay Quote</a>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                This link will expire on ${expiresAt.toLocaleDateString()} at ${expiresAt.toLocaleTimeString()}.
              </p>
              
              <p>If you have any questions or need assistance, please don't hesitate to contact us at <a href="mailto:support@cethos.com">support@cethos.com</a>.</p>
              
              <p>Best regards,<br/>The Cethos Team</p>
            </div>
            <div class="footer">
              <p>This is an automated email from Cethos Translation Services.</p>
              <p>© ${new Date().getFullYear()} Cethos. All rights reserved.</p>
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
                  name: customer.full_name,
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
          console.log("Email sent successfully via Brevo");
        }
      } catch (emailError) {
        console.error("Error sending email:", emailError);
      }
    } else {
      console.warn("BREVO_API_KEY not set - skipping email");
    }

    // 5. Log staff activity
    const { error: logError } = await supabase
      .from("staff_activity_log")
      .insert({
        staff_id: staffId,
        action: "resend_quote_email",
        resource_type: "quote",
        resource_id: quoteId,
        details: {
          quote_number: quote.quote_number,
          customer_email: customer.email,
          custom_message: customMessage || null,
          email_sent: emailSent,
        },
      });

    if (logError) {
      console.error("Error logging activity:", logError);
      // Continue anyway
    }

    // 6. Return success response
    return new Response(
      JSON.stringify({
        success: true,
        quoteNumber: quote.quote_number,
        magicLink,
        expiresAt: expiresAt.toISOString(),
        emailSent,
        customerEmail: customer.email,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
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
