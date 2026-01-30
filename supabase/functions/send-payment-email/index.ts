import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { quoteId, customerEmail, customerName, quoteNumber, total, paymentUrl } = body;

    console.log("Sending payment email for quote:", quoteNumber, "to:", customerEmail);

    if (!customerEmail || !quoteNumber || !paymentUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: customerEmail, quoteNumber, paymentUrl" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Calculate expiry date (30 days from now)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    const formattedExpiryDate = expiryDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Format total
    const formattedTotal = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(total || 0);

    // Send email via Brevo
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
            .header { background-color: #16a34a; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; background-color: #f9fafb; }
            .quote-box { background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .quote-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
            .quote-row:last-child { border-bottom: none; font-weight: bold; font-size: 18px; color: #16a34a; }
            .cta-button { display: inline-block; padding: 14px 40px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; font-size: 16px; }
            .cta-button:hover { background-color: #15803d; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .expiry-notice { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 15px; margin: 20px 0; font-size: 14px; }
            .secure-notice { background-color: #ecfdf5; border-left: 4px solid #16a34a; padding: 12px 15px; margin: 20px 0; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Pay for Your Translation</h1>
            </div>
            <div class="content">
              <p>Hello ${customerName || "Valued Customer"},</p>

              <p>Your translation quote is ready for payment. Complete your payment to start your translation project.</p>

              <div class="quote-box">
                <div class="quote-row">
                  <span>Quote Number:</span>
                  <span><strong>${quoteNumber}</strong></span>
                </div>
                <div class="quote-row">
                  <span>Total Amount:</span>
                  <span>${formattedTotal}</span>
                </div>
              </div>

              <p>Click the button below to complete your secure payment:</p>

              <div style="text-align: center;">
                <a href="${paymentUrl}" class="cta-button">Pay Now</a>
              </div>

              <div class="secure-notice">
                <strong>Secure Payment:</strong> Your payment is processed securely through Stripe. We never store your card details.
              </div>

              <div class="expiry-notice">
                <strong>Note:</strong> This quote expires on ${formattedExpiryDate}. Please complete your payment before this date.
              </div>

              <p>If you have any questions or need assistance, please contact us at <a href="mailto:support@cethos.com">support@cethos.com</a>.</p>

              <p>Thank you for choosing Cethos Translation Services!</p>

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
          console.log("Payment email sent successfully via Brevo");
        }
      } catch (emailError) {
        console.error("Error sending email:", emailError);
      }
    } else {
      console.warn("BREVO_API_KEY not set - skipping email");
    }

    // Log the email send activity
    if (quoteId) {
      await supabase.from("staff_activity_log").insert({
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
