import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REASON_LABELS: Record<string, string> = {
  customer_request: "Customer requested cancellation",
  payment_failed: "Payment could not be processed",
  document_issue: "Document quality/authenticity issue",
  service_unavailable: "Translation service unavailable for this language",
  duplicate_order: "Duplicate order detected",
  fraud_suspected: "Suspected fraudulent activity",
  other: "Other",
};

const REFUND_METHOD_LABELS: Record<string, string> = {
  stripe: "Stripe (Card)",
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  e_transfer: "E-Transfer (Interac)",
  store_credit: "Store Credit",
  original_method: "Original Payment Method",
  other: "Other",
};

// Helper function to replace template variables
function replaceTemplateVariables(
  template: string,
  variables: Record<string, string | boolean | number | null>
): string {
  let result = template;

  // Handle conditional blocks: {{#if variable}}...{{/if}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (match, varName, content) => {
    const value = variables[varName];
    if (value && value !== "false" && value !== "0") {
      return content;
    }
    return "";
  });

  // Replace simple variables: {{variable}}
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value?.toString() || "");
  }

  return result;
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      orderId,
      staffId,
      reasonCode,
      additionalNotes,
      refundType,
      refundAmount,
      refundMethod,
      refundReference,
      refundNotes,
      refundAlreadyCompleted,
      sendEmail,
    } = await req.json();

    // Validate required fields
    if (!orderId || !staffId || !reasonCode || !refundType) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate reason code
    if (!REASON_LABELS[reasonCode]) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid reason code" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Require additional notes for "other" reason
    if (reasonCode === "other" && !additionalNotes?.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Additional notes required for 'Other' reason",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch order with customer info
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        `
        *,
        customer:customers(id, email, full_name),
        quote:quotes(quote_number)
      `
      )
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: "Order not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if already cancelled
    if (order.status === "cancelled") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Order is already cancelled",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch payment info
    const { data: payment } = await supabase
      .from("payments")
      .select("id, payment_method, stripe_payment_intent_id, amount")
      .eq("order_id", orderId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const amountPaid = payment?.amount || order.amount_paid || 0;
    const originalPaymentMethod = payment?.payment_method || "unknown";

    // Calculate refund amount
    let finalRefundAmount = 0;
    if (refundType === "full") {
      finalRefundAmount = amountPaid;
    } else if (refundType === "partial") {
      finalRefundAmount = Math.min(refundAmount || 0, amountPaid);
    }

    // Determine refund status
    let refundStatus = "not_applicable";
    if (refundType !== "none" && finalRefundAmount > 0) {
      if (refundAlreadyCompleted) {
        refundStatus = "completed";
      } else if (refundMethod === "stripe") {
        refundStatus = "processing";
      } else {
        refundStatus = "pending";
      }
    }

    // Process Stripe refund if applicable
    let stripeRefundId = null;
    let stripeError = null;

    if (
      refundMethod === "stripe" &&
      finalRefundAmount > 0 &&
      payment?.stripe_payment_intent_id &&
      stripeSecretKey
    ) {
      try {
        const stripe = new Stripe(stripeSecretKey, {
          apiVersion: "2023-10-16",
        });

        const refund = await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
          amount: Math.round(finalRefundAmount * 100),
          reason: "requested_by_customer",
          metadata: {
            order_id: orderId,
            order_number: order.order_number,
            cancelled_by: staffId,
            reason_code: reasonCode,
          },
        });

        stripeRefundId = refund.id;
        refundStatus = "completed";
      } catch (err: unknown) {
        console.error("Stripe refund error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to process Stripe refund";
        stripeError = errorMessage;
        refundStatus = "failed";
      }
    }

    // Create cancellation record
    const { data: cancellation, error: cancellationError } = await supabase
      .from("order_cancellations")
      .insert({
        order_id: orderId,
        cancelled_by: staffId,
        reason_code: reasonCode,
        reason_text: REASON_LABELS[reasonCode],
        additional_notes: additionalNotes || null,
        refund_type: refundType,
        refund_amount: finalRefundAmount,
        refund_method: refundType !== "none" ? refundMethod : null,
        refund_status: refundStatus,
        refund_reference: refundReference || null,
        refund_notes: refundNotes || null,
        refund_completed_at:
          refundStatus === "completed" ? new Date().toISOString() : null,
        refund_completed_by: refundStatus === "completed" ? staffId : null,
        stripe_refund_id: stripeRefundId,
        stripe_error: stripeError,
        original_payment_method: originalPaymentMethod,
        original_payment_id: payment?.id || null,
      })
      .select()
      .single();

    if (cancellationError) {
      console.error("Cancellation insert error:", cancellationError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create cancellation record",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update order status
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        work_status: "cancelled",
      })
      .eq("id", orderId);

    if (updateError) {
      console.error("Order update error:", updateError);
    }

    // Send cancellation email using template from database
    let emailSent = false;
    let emailError = null;

    if (sendEmail && order.customer?.email && brevoApiKey) {
      try {
        // Fetch email template from database
        const { data: template, error: templateError } = await supabase
          .from("email_templates")
          .select("*")
          .eq("template_code", "order_cancellation")
          .eq("is_active", true)
          .single();

        if (templateError || !template) {
          console.error("Email template not found:", templateError);
          emailError = "Email template not found";
        } else {
          // Build refund message
          let refundMessage = "";
          if (refundStatus === "completed") {
            if (refundMethod === "stripe") {
              refundMessage =
                "Your refund has been processed and should appear on your card within 5-10 business days.";
            } else {
              refundMessage = `Your refund has been processed via ${
                REFUND_METHOD_LABELS[refundMethod] || refundMethod
              }.`;
            }
          } else if (refundStatus === "pending") {
            refundMessage = `Your refund will be processed via ${
              REFUND_METHOD_LABELS[refundMethod] || refundMethod
            }. We will notify you once it's complete.`;
          } else if (refundStatus === "processing") {
            refundMessage = "Your refund is being processed.";
          }

          // Prepare template variables
          const templateVariables: Record<
            string,
            string | boolean | number | null
          > = {
            customer_name: order.customer?.full_name || "Valued Customer",
            customer_email: order.customer?.email || "",
            order_number: order.order_number,
            order_total: `$${(order.total_amount || 0).toFixed(2)} CAD`,
            cancellation_reason: REASON_LABELS[reasonCode],
            cancellation_notes: additionalNotes || "",
            has_refund: finalRefundAmount > 0,
            refund_amount: `$${finalRefundAmount.toFixed(2)} CAD`,
            refund_method:
              REFUND_METHOD_LABELS[refundMethod] || refundMethod || "",
            refund_message: refundMessage,
            company_name: template.sender_name || "CETHOS Translations",
            company_address: "Calgary, Alberta, Canada",
            support_email: template.reply_to_email || "support@cethos.com",
          };

          // Replace variables in template
          const htmlContent = replaceTemplateVariables(
            template.html_content,
            templateVariables
          );
          const subject = replaceTemplateVariables(
            template.subject,
            templateVariables
          );

          // Send email via Brevo
          const emailResponse = await fetch(
            "https://api.brevo.com/v3/smtp/email",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "api-key": brevoApiKey,
              },
              body: JSON.stringify({
                sender: {
                  name: template.sender_name,
                  email: template.sender_email,
                },
                replyTo: template.reply_to_email
                  ? { email: template.reply_to_email }
                  : undefined,
                to: [
                  {
                    email: order.customer.email,
                    name: order.customer.full_name || "Customer",
                  },
                ],
                subject: subject,
                htmlContent: htmlContent,
              }),
            }
          );

          if (emailResponse.ok) {
            emailSent = true;

            // Update cancellation record with email status
            await supabase
              .from("order_cancellations")
              .update({
                email_sent: true,
                email_sent_at: new Date().toISOString(),
              })
              .eq("id", cancellation.id);
          } else {
            const errorData = await emailResponse.text();
            console.error("Brevo email error:", errorData);
            emailError = "Failed to send email";

            await supabase
              .from("order_cancellations")
              .update({
                email_error: errorData.substring(0, 500),
              })
              .eq("id", cancellation.id);
          }
        }
      } catch (err: unknown) {
        console.error("Email send error:", err);
        emailError =
          err instanceof Error ? err.message : "Email send failed";
      }
    }

    // Log staff activity
    await supabase.from("staff_activity_log").insert({
      staff_id: staffId,
      action_type: "cancel_order",
      entity_type: "order",
      entity_id: orderId,
      details: {
        order_number: order.order_number,
        reason_code: reasonCode,
        reason_text: REASON_LABELS[reasonCode],
        refund_type: refundType,
        refund_amount: finalRefundAmount,
        refund_method: refundMethod,
        refund_status: refundStatus,
        stripe_refund_id: stripeRefundId,
        email_sent: emailSent,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        cancellationId: cancellation.id,
        refundStatus,
        refundAmount: finalRefundAmount,
        refundMethod,
        stripeRefundId,
        stripeError,
        emailSent,
        emailError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Cancel order error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
