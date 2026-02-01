import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ManualPaymentRequest {
  quote_id: string;
  payment_method_id: string;
  payment_method_code: string;
  amount_paid: number;
  total_amount: number;
  remarks?: string;
  staff_id: string;
  quote_data: {
    customer_id: string;
    subtotal: number;
    certification_total: number;
    rush_fee: number;
    delivery_fee: number;
    tax_rate: number;
    tax_amount: number;
    is_rush: boolean;
    service_province?: string;
  };
}

// Generate order number in format ORD-YYYY-XXXXX
function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(10000 + Math.random() * 90000);
  return `ORD-${year}-${random}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ManualPaymentRequest = await req.json();
    const {
      quote_id,
      payment_method_id,
      payment_method_code,
      amount_paid,
      total_amount,
      remarks,
      staff_id,
      quote_data,
    } = body;

    console.log("Processing manual payment for quote:", quote_id);
    console.log("Payment method:", payment_method_code, "Amount:", amount_paid);

    // Validate required fields
    if (!quote_id || !payment_method_id || !staff_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: quote_id, payment_method_id, staff_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const now = new Date().toISOString();
    const isAccountPayment = payment_method_code === "account";
    const balanceDue = Math.max(0, total_amount - amount_paid);

    // 1. Fetch quote to get quote_number and verify it exists
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("*, customer:customers(id, email, full_name)")
      .eq("id", quote_id)
      .single();

    if (quoteError || !quote) {
      console.error("Quote not found:", quoteError);
      return new Response(
        JSON.stringify({ success: false, error: "Quote not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Update quote with payment info and mark as paid
    const { error: quoteUpdateError } = await supabase
      .from("quotes")
      .update({
        payment_method_id,
        payment_confirmed_at: now,
        payment_confirmed_by_staff_id: staff_id,
        status: "paid",
        updated_at: now,
      })
      .eq("id", quote_id);

    if (quoteUpdateError) {
      console.error("Error updating quote:", quoteUpdateError);
      throw new Error("Failed to update quote: " + quoteUpdateError.message);
    }

    // 3. Generate order number
    const orderNumber = generateOrderNumber();

    // 4. Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        quote_id,
        customer_id: quote_data.customer_id,
        order_number: orderNumber,
        status: balanceDue > 0 ? "pending_payment" : "confirmed",
        work_status: "pending",
        total_amount: total_amount,
        amount_paid: amount_paid,
        balance_due: balanceDue,
        payment_method_id,
        is_rush: quote_data.is_rush,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      throw new Error("Failed to create order: " + orderError.message);
    }

    console.log("Order created:", orderNumber);

    // 5. Create payment record
    const { error: paymentError } = await supabase.from("payments").insert({
      order_id: order.id,
      quote_id,
      amount: amount_paid,
      status: "succeeded",
      payment_method: payment_method_code,
      payment_date: now,
      confirmed_by_staff_id: staff_id,
      notes: remarks || null,
      created_at: now,
    });

    if (paymentError) {
      console.error("Error creating payment record:", paymentError);
      // Don't throw - order is already created
    }

    // 6. If account payment with balance due, create accounts receivable record
    if (isAccountPayment && balanceDue > 0) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // Net 30

      const { error: arError } = await supabase
        .from("accounts_receivable")
        .insert({
          order_id: order.id,
          customer_id: quote_data.customer_id,
          amount_due: balanceDue,
          due_date: dueDate.toISOString(),
          status: "pending",
          created_at: now,
        });

      if (arError) {
        console.error("Error creating AR record:", arError);
        // Don't throw - order is already created
      }
    }

    // 7. Close HITL review if exists
    const { data: hitlReview } = await supabase
      .from("hitl_reviews")
      .select("id")
      .eq("quote_id", quote_id)
      .in("status", ["pending", "in_review"])
      .single();

    if (hitlReview) {
      const { error: hitlError } = await supabase
        .from("hitl_reviews")
        .update({
          status: "approved",
          resolved_at: now,
          resolved_by: staff_id,
          resolution_notes: remarks || "Manual payment processed",
          updated_at: now,
        })
        .eq("id", hitlReview.id);

      if (hitlError) {
        console.error("Error closing HITL review:", hitlError);
      }
    }

    // 8. Log staff activity
    await supabase.from("staff_activity_log").insert({
      staff_id,
      action_type: "process_manual_payment",
      entity_type: "order",
      entity_id: order.id,
      details: {
        quote_id,
        quote_number: quote.quote_number,
        order_number: orderNumber,
        payment_method: payment_method_code,
        total_amount,
        amount_paid,
        balance_due: balanceDue,
        is_account_payment: isAccountPayment,
        remarks,
      },
      created_at: now,
    });

    console.log(`Manual payment processed successfully. Order: ${orderNumber}`);

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        order_number: orderNumber,
        is_account_payment: isAccountPayment,
        balance_due: balanceDue,
        amount_paid,
        total_amount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in process-manual-payment:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
