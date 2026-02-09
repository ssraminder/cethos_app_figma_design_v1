import { supabase } from "@/lib/supabase";

interface SyncResult {
  success: boolean;
  previousTotal: number;
  newTotal: number;
  delta: number; // positive = customer owes more, negative = refund needed
  newBalanceDue: number;
  error?: string;
}

export async function syncOrderFromQuote(
  orderId: string,
  quoteId: string,
  staffId?: string
): Promise<SyncResult> {
  try {
    // 1. Fetch recalculated quote totals
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(
        "subtotal, certification_total, rush_fee, delivery_fee, tax_amount, tax_rate, total, turnaround_type, is_rush"
      )
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      return { success: false, previousTotal: 0, newTotal: 0, delta: 0, newBalanceDue: 0, error: "Failed to fetch quote" };
    }

    // 2. Fetch current order to get amount_paid and previous total
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("total_amount, amount_paid")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return { success: false, previousTotal: 0, newTotal: 0, delta: 0, newBalanceDue: 0, error: "Failed to fetch order" };
    }

    const previousTotal = order.total_amount || 0;
    const newTotal = quote.total || 0;
    const amountPaid = order.amount_paid || 0;
    const newBalanceDue = newTotal - amountPaid;
    const delta = newTotal - previousTotal;

    // 3. Update order with new totals
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        subtotal: quote.subtotal || 0,
        certification_total: quote.certification_total || 0,
        rush_fee: quote.rush_fee || 0,
        delivery_fee: quote.delivery_fee || 0,
        tax_rate: quote.tax_rate || 0.05,
        tax_amount: quote.tax_amount || 0,
        total_amount: newTotal,
        balance_due: newBalanceDue,
        turnaround_type: quote.turnaround_type,
        is_rush: quote.is_rush,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updateError) {
      return { success: false, previousTotal, newTotal, delta, newBalanceDue, error: updateError.message };
    }

    // 4. Log activity if staffId provided
    if (staffId && delta !== 0) {
      await supabase.from("staff_activity_log").insert({
        staff_id: staffId,
        activity_type: "order_pricing_synced",
        entity_type: "order",
        entity_id: orderId,
        details: {
          order_id: orderId,
          quote_id: quoteId,
          previous_total: previousTotal,
          new_total: newTotal,
          delta,
          new_balance_due: newBalanceDue,
        },
      });
    }

    return { success: true, previousTotal, newTotal, delta, newBalanceDue };
  } catch (err: any) {
    return {
      success: false,
      previousTotal: 0,
      newTotal: 0,
      delta: 0,
      newBalanceDue: 0,
      error: err.message || "Unknown error",
    };
  }
}
