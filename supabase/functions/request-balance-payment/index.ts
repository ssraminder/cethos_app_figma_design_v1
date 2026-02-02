// supabase/functions/request-balance-payment/index.ts
// Creates a Stripe payment link or sends manual payment request email

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MANUAL_METHOD_LABELS: Record<string, string> = {
  e_transfer: "E-Transfer (Interac)",
  cheque: "Cheque",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
};

interface RequestPaymentPayload {
  order_id: string;
  staff_id: string;
  amount: number;
  method: "stripe" | string; // 'stripe' or manual method code
  customer_email: string;
  customer_name: string;
  customer_note?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://app.cethos.ca";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: RequestPaymentPayload = await req.json();
    const { order_id, staff_id, amount, method, customer_email, customer_name, customer_note } = payload;

    // Validate required fields
    if (!order_id || !staff_id || !amount || !method || !customer_email) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if order can accept payment requests
    if (order.status === "cancelled" || order.status === "refunded") {
      return new Response(
        JSON.stringify({ success: false, error: "Cannot request payment for cancelled or refunded orders" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let paymentLinkUrl: string | null = null;
    let paymentSessionId: string | null = null;

    // Create Stripe Checkout Session if method is stripe
    if (method === "stripe" && stripeSecretKey) {
      try {
        const stripe = new Stripe(stripeSecretKey, {
          apiVersion: "2023-10-16",
        });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "cad",
                product_data: {
                  name: `Balance Payment - Order ${order.order_number}`,
                  description: `Additional payment for order ${order.order_number}`,
                },
                unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${frontendUrl}/order-confirmation?order_id=${order_id}&balance_paid=true`,
          cancel_url: `${frontendUrl}/pay-balance?order_id=${order_id}`,
          customer_email: customer_email,
          metadata: {
            order_id: order_id,
            order_number: order.order_number,
            payment_type: "balance",
          },
          expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
        });

        paymentLinkUrl = session.url;
        paymentSessionId = session.id;

        // Update order with pending balance payment info
        await supabase
          .from("orders")
          .update({
            balance_payment_link: paymentLinkUrl,
            balance_payment_session_id: paymentSessionId,
            balance_payment_requested_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", order_id);
      } catch (stripeError: unknown) {
        console.error("Stripe session creation error:", stripeError);
        const errorMessage = stripeError instanceof Error ? stripeError.message : "Failed to create payment link";
        return new Response(
          JSON.stringify({ success: false, error: `Stripe error: ${errorMessage}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Send email via Brevo
    let emailSent = false;
    let emailError: string | null = null;

    if (brevoApiKey) {
      try {
        const methodLabel = method === "stripe"
          ? "Credit/Debit Card (Online)"
          : MANUAL_METHOD_LABELS[method] || method;

        const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": brevoApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: {
              name: "Cethos Translation Services",
              email: "noreply@cethos.ca",
            },
            to: [{ email: customer_email, name: customer_name }],
            subject: `Payment Required - Order ${order.order_number}`,
            htmlContent: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #0d9488; margin: 0;">CETHOS</h1>
                  <p style="color: #666; margin: 5px 0 0 0;">Translation Services</p>
                </div>

                <h2 style="color: #333; border-bottom: 2px solid #0d9488; padding-bottom: 10px;">Payment Required</h2>

                <p>Dear ${customer_name},</p>

                <p>A balance payment is required for your order <strong>${order.order_number}</strong>.</p>

                ${customer_note ? `
                  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0; color: #92400e;"><strong>Note from our team:</strong></p>
                    <p style="margin: 10px 0 0 0; color: #78350f;">${customer_note}</p>
                  </div>
                ` : ""}

                <div style="background: #f0fdfa; border: 1px solid #99f6e4; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center;">
                  <p style="margin: 0; font-size: 14px; color: #666;">Amount Due</p>
                  <p style="margin: 10px 0 0 0; font-size: 28px; font-weight: bold; color: #0d9488;">$${amount.toFixed(2)} CAD</p>
                </div>

                ${method === "stripe" && paymentLinkUrl ? `
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${paymentLinkUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Pay Now Securely
                    </a>
                  </div>
                  <p style="text-align: center; font-size: 12px; color: #666;">This payment link expires in 7 days.</p>
                ` : `
                  <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px;">
                    <p style="margin: 0;"><strong>Payment Method:</strong> ${methodLabel}</p>
                    <p style="margin: 10px 0 0 0;">Please contact us to complete your payment using this method.</p>
                  </div>
                `}

                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

                <p style="color: #666; font-size: 14px;">Thank you for choosing CETHOS Translation Services!</p>

                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #999; font-size: 12px;">
                  <p style="margin: 0;">CETHOS Translation Services</p>
                  <p style="margin: 5px 0;">Calgary, Alberta, Canada</p>
                  <p style="margin: 5px 0;">support@cethos.ca</p>
                </div>
              </div>
            `,
          }),
        });

        if (emailResponse.ok) {
          emailSent = true;
        } else {
          const errorData = await emailResponse.text();
          console.error("Brevo email error:", errorData);
          emailError = "Failed to send email";
        }
      } catch (err: unknown) {
        console.error("Email send error:", err);
        emailError = err instanceof Error ? err.message : "Email send failed";
      }
    } else {
      emailError = "Email service not configured";
    }

    // Log staff activity
    await supabase.from("staff_activity_log").insert({
      staff_id: staff_id,
      action_type: "request_balance_payment",
      entity_type: "order",
      entity_id: order_id,
      details: {
        order_number: order.order_number,
        amount: amount,
        method: method,
        customer_email: customer_email,
        payment_link: paymentLinkUrl,
        payment_session_id: paymentSessionId,
        customer_note: customer_note,
        email_sent: emailSent,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        payment_link: paymentLinkUrl,
        payment_session_id: paymentSessionId,
        email_sent: emailSent,
        email_error: emailError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Request balance payment error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
