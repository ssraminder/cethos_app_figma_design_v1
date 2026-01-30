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

    console.log("Sending quote link email for quote:", quoteId);

    if (!quoteId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: quoteId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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
        invalidated_by: staffId || null,
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
        created_by_staff_id: staffId || null,
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

    // Use the quote review page URL (Step 5)
    const publicUrl = Deno.env.get("PUBLIC_URL") || "https://portal.cethos.com";
    const quoteReviewLink = `${publicUrl}/quote/Step5/${quoteId}?token=${token}`;
    console.log("Quote review link generated:", quoteReviewLink);

    // 4. Format total
    const formattedTotal = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(quote.total || 0);

    // 5. Send email via Brevo
    let emailSent = false;
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");

    if (brevoApiKey) {
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
            .cta-button:hover { background-color: #6d28d9; }
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
                  <span>Version:</span>
                  <span>${quote.version || 1}</span>
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
                <strong>Note:</strong> This link will expire on ${expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
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
          console.log("Quote link email sent successfully via Brevo");
        }
      } catch (emailError) {
        console.error("Error sending email:", emailError);
      }
    } else {
      console.warn("BREVO_API_KEY not set - skipping email");
    }

    // 6. Log staff activity if staffId provided
    if (staffId) {
      const { error: logError } = await supabase
        .from("staff_activity_log")
        .insert({
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

      if (logError) {
        console.error("Error logging activity:", logError);
        // Continue anyway
      }
    }

    // 7. Return success response
    return new Response(
      JSON.stringify({
        success: true,
        quoteNumber: quote.quote_number,
        quoteReviewLink,
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
