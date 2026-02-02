// supabase/functions/offset-order-balance/index.ts
// Applies discount or credit offset to resolve small balance differences

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Role-based offset limits
const OFFSET_LIMITS: Record<string, number> = {
  reviewer: 10,
  senior_reviewer: 25,
  super_admin: Infinity,
};

interface OffsetPayload {
  order_id: string;
  staff_id: string;
  amount: number;
  offset_type: "discount" | "credit";
  reason: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: OffsetPayload = await req.json();
    const { order_id, staff_id, amount, offset_type, reason } = payload;

    // Validate required fields
    if (!order_id || !staff_id || !amount || !offset_type || !reason) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate offset type
    if (offset_type !== "discount" && offset_type !== "credit") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid offset type. Must be 'discount' or 'credit'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate amount is positive
    if (amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Offset amount must be greater than zero" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get staff role to check limits
    const { data: staff, error: staffError } = await supabase
      .from("staff_users")
      .select("id, role, full_name")
      .eq("id", staff_id)
      .single();

    if (staffError || !staff) {
      return new Response(
        JSON.stringify({ success: false, error: "Staff not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check role-based offset limit
    const maxOffset = OFFSET_LIMITS[staff.role] || 10;
    if (amount > maxOffset && staff.role !== "super_admin") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Amount exceeds your offset limit of $${maxOffset.toFixed(2)}. Contact a manager.`,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get order
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

    // Check if order can be modified
    if (order.status === "cancelled" || order.status === "refunded") {
      return new Response(
        JSON.stringify({ success: false, error: "Cannot offset cancelled or refunded orders" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toISOString();

    // Determine adjustment type based on offset type
    const adjustmentType = offset_type === "discount" ? "offset_discount" : "offset_credit";

    // Create adjustment record
    const { error: adjustmentError } = await supabase.from("adjustments").insert({
      order_id: order_id,
      adjustment_type: adjustmentType,
      amount: amount, // Store as positive, type indicates direction
      reason: reason,
      internal_notes: `Staff offset (${staff.role}: ${staff.full_name}) - ${offset_type}`,
      status: "applied",
      created_by: staff_id,
      created_at: now,
    });

    if (adjustmentError) {
      console.error("Error creating adjustment:", adjustmentError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to create adjustment: ${adjustmentError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate updates based on offset type
    let updateData: Record<string, unknown> = {
      updated_at: now,
    };

    let newBalanceDue: number;
    let newStatus = order.status;

    if (offset_type === "discount") {
      // Discount: reduces the total amount and balance due
      const newTotal = Math.max(0, order.total_amount - amount);
      newBalanceDue = Math.max(0, newTotal - (order.amount_paid || 0));

      updateData.total_amount = newTotal;
      updateData.balance_due = newBalanceDue;

      // Update status based on new balance
      if (newBalanceDue <= 0) {
        newStatus = "paid";
      } else if (order.status === "paid") {
        // This shouldn't happen with a discount, but just in case
        newStatus = "balance_due";
      }
    } else {
      // Credit: record the overpayment as credit, set balance to 0
      // The order total stays the same, but we mark the overpayment
      newBalanceDue = 0;
      updateData.balance_due = 0;
      updateData.overpayment_credit = (order.overpayment_credit || 0) + amount;
      newStatus = "paid";
    }

    updateData.status = newStatus;

    // Update order
    const { error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", order_id);

    if (updateError) {
      console.error("Error updating order:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to update order: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log staff activity
    await supabase.from("staff_activity_log").insert({
      staff_id: staff_id,
      action_type: `offset_${offset_type}`,
      entity_type: "order",
      entity_id: order_id,
      details: {
        order_number: order.order_number,
        amount: amount,
        offset_type: offset_type,
        reason: reason,
        staff_role: staff.role,
        previous_total: order.total_amount,
        previous_balance: order.balance_due,
        new_balance_due: newBalanceDue,
        new_status: newStatus,
      },
      created_at: now,
    });

    console.log(`Offset applied to order ${order_id}: $${amount} ${offset_type} by ${staff.full_name}`);

    return new Response(
      JSON.stringify({
        success: true,
        offset_type: offset_type,
        amount: amount,
        new_balance_due: newBalanceDue,
        new_status: newStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Offset balance error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
