// ============================================================================
// get-customer-dashboard — counters + recent activity for the customer
// dashboard tiles (CustomerDashboard.tsx).
//
// The previously deployed version returned all zeros for Laila despite a
// paid $57.75 order in draft_review status. The original source was not
// committed to the repo; this is a clean replacement matching the client
// contract.
//
// Output: { success: true, data: { stats: { activeQuotes, actionNeeded,
//   inProgressOrders, completedOrders, totalSpent, recentActivity[],
//   unreadMessages } } }
//
// Status bucketing (per current order/quote enums):
//   activeQuotes      : quote_ready, awaiting_payment, in_review, details_pending
//   actionNeeded      : draft_review, balance_due (customer must act)
//   inProgressOrders  : paid, in_production
//   completedOrders   : completed, delivered
//   totalSpent        : SUM(amount_paid) on non-cancelled orders
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ACTIVE_QUOTE_STATUSES = ["quote_ready", "awaiting_payment", "in_review", "details_pending"];
const ACTION_NEEDED_ORDER = ["draft_review", "balance_due"];
const IN_PROGRESS_ORDER = ["paid", "in_production"];
const COMPLETED_ORDER = ["completed", "delivered"];
const NON_CANCELLED_FOR_TOTAL = ["paid", "in_production", "draft_review", "balance_due", "completed", "delivered"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const url = new URL(req.url);
    let customerId = url.searchParams.get("customer_id");
    if (!customerId && req.method === "POST") {
      try {
        const body = await req.json();
        customerId = body?.customer_id ?? null;
      } catch { /* no body */ }
    }
    if (!customerId) return json({ success: false, error: "customer_id required" }, 400);

    // Fetch orders + quotes + recent status transitions in parallel.
    // History tables use `created_at` (not `changed_at`).
    // NB: order_status_history is sparsely populated — no trigger writes to it
    // on every status change (only `fn_auto_complete_on_invoiced` does, for
    // the invoiced→completed transition). We synthesise events from
    // orders.paid_at / actual_delivery_date / completed_at / created_at below
    // so the dashboard surfaces activity even when history is missing.
    const [ordersRes, quotesRes, orderHistRes, quoteHistRes] = await Promise.all([
      sb.from("orders")
        .select("id, order_number, status, total_amount, amount_paid, created_at, updated_at, paid_at, actual_delivery_date, completed_at")
        .eq("customer_id", customerId)
        // Exclude multi-language work-unit child orders ($0, vendor-only)
        .is("parent_order_id", null),
      sb.from("quotes")
        .select("id, quote_number, status, created_at, updated_at")
        .eq("customer_id", customerId)
        // Exclude multi-language child quotes (not customer-facing)
        .is("parent_quote_id", null),
      sb.from("order_status_history")
        .select("order_id, new_status, created_at, orders!inner(order_number, customer_id, parent_order_id)")
        .eq("orders.customer_id", customerId)
        .is("orders.parent_order_id", null)
        .order("created_at", { ascending: false })
        .limit(10),
      sb.from("quote_status_history")
        .select("quote_id, new_status, created_at, quotes!inner(quote_number, customer_id, parent_quote_id)")
        .eq("quotes.customer_id", customerId)
        .is("quotes.parent_quote_id", null)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (ordersRes.error) return json({ success: false, error: ordersRes.error.message }, 500);
    if (quotesRes.error) return json({ success: false, error: quotesRes.error.message }, 500);

    const orders = ordersRes.data ?? [];
    const quotes = quotesRes.data ?? [];

    const activeQuotes = quotes.filter((q: any) => ACTIVE_QUOTE_STATUSES.includes(q.status)).length;
    const actionNeeded = orders.filter((o: any) => ACTION_NEEDED_ORDER.includes(o.status)).length;
    const inProgressOrders = orders.filter((o: any) => IN_PROGRESS_ORDER.includes(o.status)).length;
    const completedOrders = orders.filter((o: any) => COMPLETED_ORDER.includes(o.status)).length;
    const totalSpent = orders
      .filter((o: any) => NON_CANCELLED_FOR_TOTAL.includes(o.status))
      .reduce((sum: number, o: any) => sum + Number(o.amount_paid ?? 0), 0);

    // Recent activity: merge order + quote status transitions, sort by time.
    // History tables are the primary source when populated.
    const orderHistEvents = (orderHistRes.data ?? []).map((row: any) => ({
      id: `oh-${row.order_id}-${row.created_at}`,
      orderId: row.order_id,
      type: "order" as const,
      number: row.orders?.order_number ?? "",
      action: humanizeStatus(row.new_status),
      timestamp: row.created_at,
    }));
    const quoteHistEvents = (quoteHistRes.data ?? []).map((row: any) => ({
      id: `qh-${row.quote_id}-${row.created_at}`,
      type: "quote" as const,
      number: row.quotes?.quote_number ?? "",
      action: humanizeStatus(row.new_status),
      timestamp: row.created_at,
    }));

    // Synthesise events from orders fields for any order with no history row
    // — this covers the common case where order_status_history is sparse
    // because no trigger writes to it on every transition.
    const ordersWithHistory = new Set(orderHistEvents.map((e) => e.orderId));
    const synthesisedOrderEvents: any[] = [];
    for (const o of orders as any[]) {
      if (ordersWithHistory.has(o.id)) continue; // already covered by history
      // Emit the most informative event we have for this order. Prefer the
      // most-recent terminal-ish event so the dashboard shows the latest
      // status, not the first one.
      if (o.completed_at && (o.status === "completed" || o.status === "invoiced")) {
        synthesisedOrderEvents.push({
          id: `os-${o.id}-completed`,
          type: "order",
          number: o.order_number,
          action: humanizeStatus("completed"),
          timestamp: o.completed_at,
        });
      } else if (o.actual_delivery_date && (o.status === "delivered" || o.status === "completed" || o.status === "invoiced")) {
        synthesisedOrderEvents.push({
          id: `os-${o.id}-delivered`,
          type: "order",
          number: o.order_number,
          action: humanizeStatus("delivered"),
          timestamp: `${o.actual_delivery_date}T12:00:00Z`,
        });
      } else if (o.paid_at && (o.status === "paid" || o.status === "in_production" || o.status === "draft_review" || o.status === "balance_due")) {
        synthesisedOrderEvents.push({
          id: `os-${o.id}-paid`,
          type: "order",
          number: o.order_number,
          action: humanizeStatus(o.status === "paid" ? "paid" : o.status),
          timestamp: o.paid_at,
        });
      } else if (o.status) {
        synthesisedOrderEvents.push({
          id: `os-${o.id}-${o.status}`,
          type: "order",
          number: o.order_number,
          action: humanizeStatus(o.status),
          timestamp: o.updated_at || o.created_at,
        });
      }
    }

    const recentActivity = [
      ...orderHistEvents.map(({ orderId: _o, ...rest }) => rest),
      ...synthesisedOrderEvents,
      ...quoteHistEvents,
    ]
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
      .slice(0, 5);

    return json({
      success: true,
      data: {
        stats: {
          activeQuotes,
          actionNeeded,
          inProgressOrders,
          completedOrders,
          totalSpent,
          recentActivity,
          unreadMessages: 0,
        },
      },
    });
  } catch (err: any) {
    console.error("get-customer-dashboard error:", err?.message || err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});

function humanizeStatus(status: string | null): string {
  if (!status) return "Updated";
  const map: Record<string, string> = {
    // order statuses
    pending: "Pending review",
    paid: "Payment received",
    in_production: "In production",
    draft_review: "Draft ready for review",
    balance_due: "Balance due",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled",
    // quote statuses
    quote_ready: "Quote ready",
    awaiting_payment: "Awaiting payment",
    in_review: "Under review",
    converted: "Converted to order",
    expired: "Expired",
    checkout_started: "Checkout started",
    details_pending: "Details requested",
  };
  return map[status] ?? status.replace(/_/g, " ");
}
