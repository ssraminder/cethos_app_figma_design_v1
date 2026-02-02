// supabase/functions/record-ar-payment/index.ts
// Records a manual payment against an Accounts Receivable invoice

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RecordPaymentRequest {
  ar_id: string;
  amount: number;
  payment_method_id: string;
  payment_date: string;
  reference_number?: string;
  notes?: string;
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

    const payload: RecordPaymentRequest = await req.json();
    const {
      ar_id,
      amount,
      payment_method_id,
      payment_date,
      reference_number,
      notes,
      staff_id,
    } = payload;

    // Validate required fields
    if (!ar_id || !amount || !payment_method_id || !payment_date || !staff_id) {
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

    // 1. Fetch AR record
    const { data: arRecord, error: arError } = await supabase
      .from("accounts_receivable")
      .select(
        `
        *,
        order:orders(order_number),
        customer:customers(full_name, email)
      `
      )
      .eq("id", ar_id)
      .single();

    if (arError || !arRecord) {
      return new Response(
        JSON.stringify({ success: false, error: "AR record not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (arRecord.status === "paid") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "This AR invoice is already fully paid",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Get payment method details
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

    // 3. Calculate new totals
    // Use amount_due as original_amount if original_amount doesn't exist
    const originalAmount = arRecord.original_amount || arRecord.amount_due || 0;
    const currentAmountPaid = arRecord.amount_paid || 0;
    const newAmountPaid = currentAmountPaid + amount;
    const remainingBalance = originalAmount - newAmountPaid;

    // Determine new status
    let newStatus: string;
    if (remainingBalance <= 0) {
      newStatus = "paid";
    } else if (newAmountPaid > 0) {
      newStatus = "partial";
    } else {
      newStatus = "unpaid";
    }

    console.log(`Recording AR payment: ${ar_id}`);
    console.log(
      `Amount: $${amount}, Previous: $${currentAmountPaid}, New Total: $${newAmountPaid}`
    );
    console.log(`Remaining: $${remainingBalance}, New Status: ${newStatus}`);

    const now = new Date().toISOString();

    // 4. Create ar_payments record
    const { data: payment, error: paymentError } = await supabase
      .from("ar_payments")
      .insert({
        ar_id: ar_id,
        amount: amount,
        payment_method_id: payment_method_id,
        payment_method_code: paymentMethod.code,
        payment_method_name: paymentMethod.name,
        payment_date: payment_date,
        reference_number: reference_number || null,
        notes: notes || null,
        recorded_by: staff_id,
        recorded_at: now,
        created_at: now,
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Failed to create ar_payments record:", paymentError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to record payment: ${paymentError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Update accounts_receivable record
    const { error: updateError } = await supabase
      .from("accounts_receivable")
      .update({
        amount_paid: newAmountPaid,
        status: newStatus,
        updated_at: now,
      })
      .eq("id", ar_id);

    if (updateError) {
      console.error("Failed to update AR record:", updateError);
      // Try to rollback payment record
      await supabase.from("ar_payments").delete().eq("id", payment.id);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to update AR: ${updateError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 6. If fully paid, update order status if it was balance_due or pending_payment
    if (newStatus === "paid" && arRecord.order_id) {
      const { data: order } = await supabase
        .from("orders")
        .select("status, total_amount, amount_paid")
        .eq("id", arRecord.order_id)
        .single();

      if (
        order &&
        (order.status === "balance_due" || order.status === "pending_payment")
      ) {
        const orderAmountPaid = (order.amount_paid || 0) + amount;
        await supabase
          .from("orders")
          .update({
            status: "paid",
            balance_due: 0,
            amount_paid: orderAmountPaid,
            updated_at: now,
          })
          .eq("id", arRecord.order_id);

        console.log(`Updated order ${arRecord.order_id} status to paid`);
      }
    }

    // 7. Log staff activity
    await supabase.from("staff_activity_log").insert({
      staff_id: staff_id,
      action_type: "record_ar_payment",
      entity_type: "accounts_receivable",
      entity_id: ar_id,
      details: {
        ar_id: ar_id,
        order_id: arRecord.order_id,
        order_number: arRecord.order?.order_number,
        payment_id: payment.id,
        amount: amount,
        payment_method: paymentMethod.name,
        reference_number: reference_number,
        previous_amount_paid: currentAmountPaid,
        new_amount_paid: newAmountPaid,
        new_status: newStatus,
        remaining_balance: Math.max(0, remainingBalance),
      },
      created_at: now,
    });

    console.log(`AR payment recorded successfully: ${payment.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: payment.id,
        ar_id: ar_id,
        amount: amount,
        new_total_paid: newAmountPaid,
        remaining_balance: Math.max(0, remainingBalance),
        new_status: newStatus,
        is_overpayment: remainingBalance < 0,
        overpayment_amount: remainingBalance < 0 ? Math.abs(remainingBalance) : 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Record AR payment error:", error);
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
