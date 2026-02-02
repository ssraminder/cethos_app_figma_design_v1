// supabase/functions/record-bulk-payment/index.ts
// Records bulk payments allocated across multiple invoices with over/under payment handling

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Allocation {
  invoice_id: string;
  allocated_amount: number;
  is_ai_matched?: boolean;
}

interface RecordBulkPaymentRequest {
  customer_id: string;
  amount: number;
  payment_method_id: string;
  payment_date: string;
  reference_number?: string;
  notes?: string;
  allocations: Allocation[];
  difference_handling?: string;
  difference_amount?: number;
  // Overpayment options
  surcharge_invoice_id?: string;
  surcharge_reason?: string;
  refund_method?: string;
  // Underpayment options
  discount_reason?: string;
  stripe_request_expiry_days?: number;
  // AI data
  ai_extracted?: boolean;
  ai_confidence?: number;
  paystub_filename?: string;
  // Staff
  staff_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: RecordBulkPaymentRequest = await req.json();
    const {
      customer_id,
      amount,
      payment_method_id,
      payment_date,
      reference_number,
      notes,
      allocations,
      difference_handling,
      difference_amount,
      surcharge_invoice_id,
      surcharge_reason,
      refund_method,
      discount_reason,
      stripe_request_expiry_days,
      ai_extracted,
      ai_confidence,
      paystub_filename,
      staff_id,
    } = payload;

    // Validation
    if (
      !customer_id ||
      !amount ||
      !payment_method_id ||
      !allocations?.length ||
      !staff_id
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (amount <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Amount must be greater than 0",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const now = new Date().toISOString();

    // Get payment method details
    const { data: paymentMethod, error: pmError } = await supabase
      .from("payment_methods")
      .select("id, code, name")
      .eq("id", payment_method_id)
      .single();

    if (pmError || !paymentMethod) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid payment method" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get customer details
    const { data: customer, error: custError } = await supabase
      .from("customers")
      .select("id, full_name, email, credit_balance")
      .eq("id", customer_id)
      .single();

    if (custError || !customer) {
      return new Response(
        JSON.stringify({ success: false, error: "Customer not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Recording bulk payment for customer ${customer_id}`);
    console.log(`Amount: $${amount}, Allocations: ${allocations.length}`);

    // ============================================
    // 1. CREATE PAYMENT RECORD
    // ============================================
    const { data: payment, error: paymentError } = await supabase
      .from("customer_payments")
      .insert({
        customer_id,
        amount,
        payment_method_id,
        payment_method_code: paymentMethod.code,
        payment_method_name: paymentMethod.name,
        payment_date,
        reference_number: reference_number || null,
        notes: notes || null,
        confirmed_by_staff_id: staff_id,
        confirmed_at: now,
        ai_allocated: ai_extracted || false,
        ai_confidence: ai_confidence || null,
        paystub_filename: paystub_filename || null,
        status: "completed",
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Failed to create payment:", paymentError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to create payment: ${paymentError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Created payment record: ${payment.id}`);

    // ============================================
    // 2. CREATE ALLOCATIONS & UPDATE INVOICES
    // ============================================
    const allocationResults: { invoice_id: string; status: string }[] = [];

    for (const alloc of allocations) {
      // Create allocation record
      const { error: allocError } = await supabase
        .from("customer_payment_allocations")
        .insert({
          payment_id: payment.id,
          invoice_id: alloc.invoice_id,
          allocated_amount: alloc.allocated_amount,
          is_ai_matched: alloc.is_ai_matched || false,
          created_at: now,
        });

      if (allocError) {
        console.error(
          `Failed to create allocation for invoice ${alloc.invoice_id}:`,
          allocError
        );
        continue;
      }

      // Get current invoice state
      const { data: invoice, error: invError } = await supabase
        .from("customer_invoices")
        .select("id, invoice_number, amount_paid, total_amount, balance_due")
        .eq("id", alloc.invoice_id)
        .single();

      if (invError || !invoice) {
        console.error(`Invoice ${alloc.invoice_id} not found`);
        continue;
      }

      const newAmountPaid = (invoice.amount_paid || 0) + alloc.allocated_amount;
      const newBalanceDue = invoice.total_amount - newAmountPaid;
      const isPaidInFull = newBalanceDue <= 0.01;

      // Update invoice
      const { error: updateError } = await supabase
        .from("customer_invoices")
        .update({
          amount_paid: newAmountPaid,
          balance_due: Math.max(0, newBalanceDue),
          status: isPaidInFull ? "paid" : "partial",
          paid_at: isPaidInFull ? now : null,
          updated_at: now,
        })
        .eq("id", alloc.invoice_id);

      if (updateError) {
        console.error(`Failed to update invoice ${alloc.invoice_id}:`, updateError);
      }

      allocationResults.push({
        invoice_id: alloc.invoice_id,
        status: isPaidInFull ? "paid" : "partial",
      });

      console.log(
        `Updated invoice ${invoice.invoice_number}: $${alloc.allocated_amount} applied, new balance: $${Math.max(0, newBalanceDue)}`
      );
    }

    // ============================================
    // 3. HANDLE OVERPAYMENT
    // ============================================
    let stripePaymentLink: string | null = null;
    let refundId: string | null = null;

    if (difference_handling === "credit" && difference_amount && difference_amount > 0) {
      // Add to customer credit balance
      const newCreditBalance = (customer.credit_balance || 0) + difference_amount;
      await supabase
        .from("customers")
        .update({ credit_balance: newCreditBalance, updated_at: now })
        .eq("id", customer_id);

      // Log credit addition
      await supabase.from("customer_credit_log").insert({
        customer_id,
        amount: difference_amount,
        type: "credit_added",
        source: "overpayment",
        payment_id: payment.id,
        notes: `Overpayment from bulk payment ${payment.id}`,
        created_by_staff_id: staff_id,
        created_at: now,
      });

      console.log(`Added $${difference_amount} credit to customer account`);
    }

    if (
      difference_handling === "surcharge" &&
      surcharge_invoice_id &&
      difference_amount
    ) {
      // Add surcharge to invoice
      await supabase.from("invoice_adjustments").insert({
        invoice_id: surcharge_invoice_id,
        adjustment_type: "surcharge",
        amount: difference_amount,
        reason: surcharge_reason || "Overpayment applied as surcharge",
        payment_id: payment.id,
        created_by_staff_id: staff_id,
        created_at: now,
      });

      // Update invoice total
      const { data: targetInvoice } = await supabase
        .from("customer_invoices")
        .select("total_amount, balance_due")
        .eq("id", surcharge_invoice_id)
        .single();

      if (targetInvoice) {
        await supabase
          .from("customer_invoices")
          .update({
            total_amount: targetInvoice.total_amount + difference_amount,
            balance_due: targetInvoice.balance_due + difference_amount,
            updated_at: now,
          })
          .eq("id", surcharge_invoice_id);
      }

      console.log(
        `Applied $${difference_amount} surcharge to invoice ${surcharge_invoice_id}`
      );
    }

    if (
      difference_handling === "refund" &&
      difference_amount &&
      difference_amount > 0
    ) {
      // Create refund record
      const { data: refund, error: refundError } = await supabase
        .from("refunds")
        .insert({
          customer_id,
          payment_id: payment.id,
          amount: difference_amount,
          refund_method: refund_method === "original" ? "stripe" : "manual",
          status: "pending",
          reason: "Overpayment refund",
          created_by_staff_id: staff_id,
          created_at: now,
        })
        .select()
        .single();

      if (!refundError && refund) {
        refundId = refund.id;
        console.log(`Created refund record: ${refund.id}`);
      }
    }

    // ============================================
    // 4. HANDLE UNDERPAYMENT
    // ============================================
    if (
      difference_handling === "discount" &&
      discount_reason &&
      difference_amount
    ) {
      // Apply discount to last allocated invoice
      const lastAllocation = allocations[allocations.length - 1];

      await supabase.from("invoice_adjustments").insert({
        invoice_id: lastAllocation.invoice_id,
        adjustment_type: "discount",
        amount: -Math.abs(difference_amount),
        reason: discount_reason,
        payment_id: payment.id,
        created_by_staff_id: staff_id,
        created_at: now,
      });

      // Update invoice balance
      const { data: discountInvoice } = await supabase
        .from("customer_invoices")
        .select("balance_due, total_amount")
        .eq("id", lastAllocation.invoice_id)
        .single();

      if (discountInvoice) {
        const newBalance = Math.max(
          0,
          discountInvoice.balance_due - Math.abs(difference_amount)
        );
        await supabase
          .from("customer_invoices")
          .update({
            balance_due: newBalance,
            status: newBalance <= 0.01 ? "paid" : "partial",
            paid_at: newBalance <= 0.01 ? now : null,
            updated_at: now,
          })
          .eq("id", lastAllocation.invoice_id);
      }

      console.log(
        `Applied $${Math.abs(difference_amount)} discount: ${discount_reason}`
      );
    }

    if (
      difference_handling === "stripe_request" &&
      difference_amount &&
      difference_amount > 0
    ) {
      // Generate Stripe payment link for remaining amount
      const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

      if (stripeSecretKey) {
        try {
          const stripe = new Stripe(stripeSecretKey, {
            apiVersion: "2023-10-16",
            httpClient: Stripe.createFetchHttpClient(),
          });

          const publicUrl =
            Deno.env.get("PUBLIC_URL") || "https://portal.cethos.com";
          const expiryDays = stripe_request_expiry_days || 7;
          const expiresAt =
            Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60;

          const paymentLinkResult = await stripe.paymentLinks.create({
            line_items: [
              {
                price_data: {
                  currency: "cad",
                  product_data: {
                    name: "Outstanding Balance Payment",
                    description: `Payment for outstanding balance - CETHOS Translation Services`,
                  },
                  unit_amount: Math.round(difference_amount * 100),
                },
                quantity: 1,
              },
            ],
            metadata: {
              customer_id,
              payment_id: payment.id,
              type: "shortfall_request",
            },
            after_completion: {
              type: "redirect",
              redirect: {
                url: `${publicUrl}/payment/success`,
              },
            },
          });

          stripePaymentLink = paymentLinkResult.url;

          // Record the payment request
          await supabase.from("payment_requests").insert({
            customer_id,
            original_payment_id: payment.id,
            amount: difference_amount,
            reason: "shortfall",
            stripe_payment_link_id: paymentLinkResult.id,
            stripe_payment_link_url: paymentLinkResult.url,
            expires_at: new Date(expiresAt * 1000).toISOString(),
            status: "pending",
            created_by_staff_id: staff_id,
            created_at: now,
          });

          console.log(`Created Stripe payment link: ${paymentLinkResult.url}`);
        } catch (stripeError: unknown) {
          console.error("Stripe payment link error:", stripeError);
          // Continue without Stripe link - don't fail the whole operation
        }
      }
    }

    // ============================================
    // 5. LOG ACTIVITY
    // ============================================
    await supabase.from("staff_activity_log").insert({
      staff_id,
      action_type: "record_bulk_payment",
      entity_type: "customer_payments",
      entity_id: payment.id,
      details: {
        customer_id,
        customer_name: customer.full_name,
        amount,
        payment_method: paymentMethod.name,
        allocations_count: allocations.length,
        total_allocated: allocations.reduce((sum, a) => sum + a.allocated_amount, 0),
        difference_handling,
        difference_amount,
        ai_assisted: ai_extracted,
        ai_confidence,
        paystub_filename,
        allocation_results: allocationResults,
      },
      created_at: now,
    });

    console.log(`Bulk payment recorded successfully: ${payment.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: payment.id,
        allocations_count: allocations.length,
        allocation_results: allocationResults,
        difference_handling,
        stripe_payment_link: stripePaymentLink,
        refund_id: refundId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Record bulk payment error:", error);
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
