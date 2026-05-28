import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";
import {
  brevoPayload,
  callout,
  detailsTable,
  emailShell,
  esc,
  hint,
  lead,
  REPLY,
  statusBadge,
  strong,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

// v2.0 (2026-05-28): email body migrated in-repo. Previously read template
// content from `public.email_templates` row template_code='order_cancellation';
// now renders inline HTML through the shared shell.
const TEMPLATE: TemplateMeta = {
  name: "Order Cancellation",
  version: "2.0",
  updatedAt: "2026-05-28",
};

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

// ────────────────────────────────────────────────────────────────────────────
// Cancellation email — inline HTML, shared shell.
// Refund block renders only when a refund exists; tone reflects status.
// ────────────────────────────────────────────────────────────────────────────
function buildCancellationEmailHtml(args: {
  customerName: string;
  orderNumber: string;
  orderTotalFormatted: string;
  reasonLabel: string;
  cancellationNotes?: string | null;
  hasRefund: boolean;
  refundAmountFormatted?: string;
  refundMethodLabel?: string;
  refundStatus?: "completed" | "pending" | "processing" | "none";
}): string {
  const firstName =
    (args.customerName || "").trim().split(/\s+/)[0] || "there";

  const detailRows: Array<[string, string]> = [
    ["Order #", args.orderNumber],
    ["Original total", args.orderTotalFormatted],
    ["Reason", args.reasonLabel],
    ["Cancelled", new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })],
  ];

  // Refund callout. Three branches based on refund status — kept distinct
  // because the customer reads "issued vs. pending vs. processing" very
  // differently when their money is involved.
  let refundCallout = "";
  if (args.hasRefund && args.refundAmountFormatted) {
    if (args.refundStatus === "completed") {
      const method = args.refundMethodLabel?.toLowerCase().includes("stripe")
        ? "to your card; allow 5–10 business days for it to appear on your statement"
        : `via ${esc(args.refundMethodLabel ?? "your original payment method")}`;
      refundCallout = callout({
        tone: "success",
        title: "Refund issued",
        body: `A refund of ${strong(esc(args.refundAmountFormatted))} has been issued ${method}.`,
      });
    } else if (args.refundStatus === "pending") {
      refundCallout = callout({
        tone: "info",
        title: "Refund in progress",
        body: `A refund of ${strong(esc(args.refundAmountFormatted))} will be processed via ${esc(args.refundMethodLabel ?? "your original payment method")}. We'll email again once it's complete.`,
      });
    } else if (args.refundStatus === "processing") {
      refundCallout = callout({
        tone: "info",
        title: "Refund being processed",
        body: `Your refund of ${strong(esc(args.refundAmountFormatted))} is in the queue and will be completed shortly.`,
      });
    }
  }

  const notesBlock = args.cancellationNotes?.trim()
    ? callout({
        tone: "info",
        title: "Note from our team",
        body: esc(args.cancellationNotes.trim()),
      })
    : "";

  const body = [
    statusBadge("warn", "Order cancelled"),
    title(`Your order ${esc(args.orderNumber)} has been cancelled`),
    lead(
      `Hi ${esc(firstName)}, we've cancelled order ${strong(esc(args.orderNumber))} as requested. A summary is below for your records.`,
    ),
    detailsTable(detailRows),
    refundCallout,
    notesBlock,
    hint(
      `Reach out any time if you'd like to restart this project or have questions — reply to this email and our team will pick it up within 2 business hours.`,
    ),
  ].join("");

  return emailShell(body, {
    replyTo: REPLY.customer,
    template: TEMPLATE,
    preheader: `Order ${args.orderNumber} cancelled${args.hasRefund ? ` — refund ${args.refundAmountFormatted}` : ""}.`,
  });
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
        const html = buildCancellationEmailHtml({
          customerName: order.customer.full_name || "Valued Customer",
          orderNumber: order.order_number,
          orderTotalFormatted: `$${(order.total_amount || 0).toFixed(2)} CAD`,
          reasonLabel: REASON_LABELS[reasonCode] || reasonCode,
          cancellationNotes: additionalNotes,
          hasRefund: finalRefundAmount > 0,
          refundAmountFormatted:
            finalRefundAmount > 0
              ? `$${finalRefundAmount.toFixed(2)} CAD`
              : undefined,
          refundMethodLabel:
            REFUND_METHOD_LABELS[refundMethod] || refundMethod || undefined,
          refundStatus: (refundStatus as
            | "completed"
            | "pending"
            | "processing"
            | "none") ?? "none",
        });

        const subject = `Your order ${order.order_number} has been cancelled`;

        const emailResponse = await fetch(
          "https://api.brevo.com/v3/smtp/email",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": brevoApiKey,
            },
            body: JSON.stringify(
              brevoPayload({
                to: [
                  {
                    email: order.customer.email,
                    name: order.customer.full_name || "Customer",
                  },
                ],
                subject,
                html,
                replyTo: REPLY.customer,
                senderName: "Cethos Translation Services",
                senderEmail: "donotreply@cethos.com",
                tags: ["order-cancellation"],
              }),
            ),
          },
        );

        if (emailResponse.ok) {
          emailSent = true;
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
