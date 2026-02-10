// supabase/functions/update-order-totals/index.ts
// Updates order documents and recalculates totals after staff editing

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderDocument {
  id: string;
  detected_document_type: string;
  word_count: number;
  page_count: number;
  billable_pages: number;
  assessed_complexity: string;
  complexity_multiplier: number;
  line_total: number;
  certification_type_id: string;
  certification_price: number;
}

interface CalculatedTotals {
  translationSubtotal: number;
  certificationTotal: number;
  subtotal: number;
  rushFee: number;
  deliveryFee: number;
  taxAmount: number;
  total: number;
}

interface UpdateOrderRequest {
  order_id: string;
  documents: OrderDocument[];
  is_rush: boolean;
  delivery_option: string;
  delivery_fee: number;
  edit_reason: string;
  staff_id: string;
  calculated_totals: CalculatedTotals;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload: UpdateOrderRequest = await req.json();
    const {
      order_id,
      documents,
      is_rush,
      delivery_option,
      delivery_fee,
      edit_reason,
      staff_id,
      calculated_totals,
    } = payload;

    // Validate required fields
    if (!order_id || !staff_id || !edit_reason) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch current order
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

    // Check if order can be edited
    if (order.status === "cancelled" || order.status === "refunded") {
      return new Response(
        JSON.stringify({ success: false, error: "Cannot edit cancelled or refunded orders" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const originalTotal = order.total_amount;
    const newTotal = calculated_totals.total;
    const balanceChange = newTotal - originalTotal;

    console.log(`Updating order ${order_id}: $${originalTotal} -> $${newTotal} (change: $${balanceChange})`);

    const now = new Date().toISOString();

    // 2. Update each document in ai_analysis_results
    for (const doc of documents) {
      const { error: docError } = await supabase
        .from("ai_analysis_results")
        .update({
          detected_document_type: doc.detected_document_type,
          word_count: doc.word_count,
          page_count: doc.page_count,
          billable_pages: doc.billable_pages,
          assessed_complexity: doc.assessed_complexity,
          complexity_multiplier: doc.complexity_multiplier,
          line_total: doc.line_total,
          certification_type_id: doc.certification_type_id,
          certification_price: doc.certification_price,
          updated_at: now,
        })
        .eq("id", doc.id);

      if (docError) {
        console.error(`Error updating document ${doc.id}:`, docError);
      }
    }

    // 3. Calculate new balance due
    const newBalanceDue = Math.max(0, newTotal - (order.amount_paid || 0));

    // Determine new status based on balance
    let newStatus = order.status;
    if (newBalanceDue > 0 && order.status === "paid") {
      newStatus = "balance_due";
    } else if (newBalanceDue <= 0 && order.status === "balance_due") {
      newStatus = "paid";
    }

    // 4. Update order totals
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        subtotal: calculated_totals.subtotal,
        certification_total: calculated_totals.certificationTotal,
        rush_fee: calculated_totals.rushFee,
        delivery_fee: calculated_totals.deliveryFee,
        tax_amount: calculated_totals.taxAmount,
        total_amount: newTotal,
        balance_due: newBalanceDue,
        is_rush: is_rush,
        delivery_option: delivery_option,
        status: newStatus,
        updated_at: now,
      })
      .eq("id", order_id);

    if (updateError) {
      console.error("Error updating order:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to update order: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Create adjustment record if total changed
    if (Math.abs(balanceChange) > 0.01) {
      const { error: adjustmentError } = await supabase.from("adjustments").insert({
        order_id: order_id,
        adjustment_type: balanceChange > 0 ? "correction_increase" : "correction_decrease",
        amount: Math.abs(balanceChange),
        reason: edit_reason,
        internal_notes: `Order edited by staff. Original: $${originalTotal.toFixed(2)}, New: $${newTotal.toFixed(2)}`,
        status: "applied",
        created_by: staff_id,
        created_at: now,
      });

      if (adjustmentError) {
        console.error("Error creating adjustment record:", adjustmentError);
        // Non-fatal error, continue
      }
    }

    // 6. Log staff activity
    const { error: activityError } = await supabase.from("staff_activity_log").insert({
      staff_id: staff_id,
      action_type: "edit_order",
      entity_type: "order",
      entity_id: order_id,
      details: {
        order_number: order.order_number,
        original_total: originalTotal,
        new_total: newTotal,
        balance_change: balanceChange,
        is_rush: is_rush,
        delivery_option: delivery_option,
        edit_reason: edit_reason,
        documents_updated: documents.length,
        previous_status: order.status,
        new_status: newStatus,
      },
      created_at: now,
    });

    if (activityError) {
      console.error("Error logging staff activity:", activityError);
      // Non-fatal error, continue
    }

    console.log(`Order ${order_id} updated successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order_id,
        original_total: originalTotal,
        new_total: newTotal,
        balance_change: balanceChange,
        new_balance_due: newBalanceDue,
        new_status: newStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Update order error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
