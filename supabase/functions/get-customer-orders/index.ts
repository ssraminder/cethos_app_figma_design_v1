// ============================================================================
// get-customer-orders — customer-facing Orders list (CustomerOrders.tsx).
//
// RECONSTRUCTION NOTE (2026-05-30): the originally deployed source was never
// committed to the repo and its bundle is an unretrievable "zombie" deploy
// (Supabase: "Failed to retrieve function bundle" via CLI, MCP, and the
// dashboard code viewer). This is a clean replacement matching the captured
// live response contract, with field sources reverse-engineered from the live
// schema/data. The ONE behavioural fix vs. the original: the main orders query
// now filters `parent_order_id IS NULL` so multi-language child orders (the
// $0 vendor-only work units that a fast quote fans out to) no longer leak onto
// the customer's Orders list. See get-customer-dashboard for the same filter.
//
// Response contract (data[] item):
//   id, order_number, status, work_status, total_amount, amount_paid,
//   balance_due, is_rush, estimated_delivery_date, actual_delivery_date,
//   created_at, updated_at, quote_id, quote_number, source_language,
//   target_language, document_count, pending_review_count, has_invoice,
//   invoice_number
// Query params: customer_id (required), status (optional, "all"/"" = no
//   filter), search (optional, case-insensitive order_number substring).
//
// Field derivation (validated against prod schema/data 2026-05-30):
//   source_language / target_language : languages.name via the order's quote
//     source_language_id / target_language_id
//   document_count        : count(quote_files) for the order's quote_id
//                           (quote_files is the populated upload table;
//                           quote_documents / quote_document_groups are unused)
//   pending_review_count  : count(quote_files with review_status='pending_review')
//   has_invoice / invoice_number : latest non-voided customer_invoices row of
//                           type 'invoice' for the order
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

const num = (v: unknown) => Number(v ?? 0);

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
    let status = url.searchParams.get("status");
    let search = url.searchParams.get("search");
    if (req.method === "POST") {
      try {
        const body = await req.json();
        customerId = customerId ?? body?.customer_id ?? null;
        status = status ?? body?.status ?? null;
        search = search ?? body?.search ?? null;
      } catch { /* no body */ }
    }
    if (!customerId) return json({ success: false, error: "customer_id required" }, 400);

    // ----- main orders query (parent-only; this is the leak fix) -----
    let q = sb
      .from("orders")
      .select(`
        id, order_number, status, work_status, total_amount, amount_paid,
        balance_due, is_rush, estimated_delivery_date, actual_delivery_date,
        created_at, updated_at, quote_id,
        quotes ( quote_number, source_language_id, target_language_id )
      `)
      .eq("customer_id", customerId)
      .is("parent_order_id", null)
      .order("created_at", { ascending: false });

    if (status && status !== "all") q = q.eq("status", status);
    if (search && search !== "undefined" && search.trim() !== "") {
      q = q.ilike("order_number", `%${search.trim()}%`);
    }

    const { data: orders, error } = await q;
    if (error) return json({ success: false, error: error.message }, 500);
    const rows = orders ?? [];

    if (rows.length === 0) return json({ success: true, data: [] });

    // ----- batch lookups (avoid N+1) -----
    const orderIds = rows.map((o: any) => o.id);
    const quoteIds = [...new Set(rows.map((o: any) => o.quote_id).filter(Boolean))];
    const langIds = [
      ...new Set(
        rows.flatMap((o: any) => [o.quotes?.source_language_id, o.quotes?.target_language_id]).filter(Boolean),
      ),
    ];

    const [langRes, filesRes, invRes] = await Promise.all([
      langIds.length
        ? sb.from("languages").select("id, name").in("id", langIds)
        : Promise.resolve({ data: [], error: null }),
      quoteIds.length
        ? sb.from("quote_files").select("quote_id, review_status").in("quote_id", quoteIds)
        : Promise.resolve({ data: [], error: null }),
      sb.from("customer_invoices")
        .select("order_id, invoice_number, created_at")
        .in("order_id", orderIds)
        .eq("type", "invoice")
        .is("voided_at", null)
        .order("created_at", { ascending: false }),
    ]);

    const langName = new Map<string, string>((langRes.data ?? []).map((l: any) => [l.id, l.name]));

    const docCount = new Map<string, number>();
    const pendingCount = new Map<string, number>();
    for (const f of filesRes.data ?? []) {
      docCount.set(f.quote_id, (docCount.get(f.quote_id) ?? 0) + 1);
      if (f.review_status === "pending_review") {
        pendingCount.set(f.quote_id, (pendingCount.get(f.quote_id) ?? 0) + 1);
      }
    }

    // first row per order_id wins (already sorted newest-first)
    const invByOrder = new Map<string, string>();
    for (const inv of invRes.data ?? []) {
      if (!invByOrder.has(inv.order_id)) invByOrder.set(inv.order_id, inv.invoice_number);
    }

    const data = rows.map((o: any) => {
      const quote = o.quotes ?? null;
      const invoiceNumber = invByOrder.get(o.id) ?? null;
      return {
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        work_status: o.work_status,
        total_amount: num(o.total_amount),
        amount_paid: num(o.amount_paid),
        balance_due: num(o.balance_due),
        is_rush: o.is_rush ?? false,
        estimated_delivery_date: o.estimated_delivery_date,
        actual_delivery_date: o.actual_delivery_date,
        created_at: o.created_at,
        updated_at: o.updated_at,
        quote_id: o.quote_id,
        quote_number: quote?.quote_number ?? null,
        source_language: quote?.source_language_id ? langName.get(quote.source_language_id) ?? null : null,
        target_language: quote?.target_language_id ? langName.get(quote.target_language_id) ?? null : null,
        document_count: docCount.get(o.quote_id) ?? 0,
        pending_review_count: pendingCount.get(o.quote_id) ?? 0,
        has_invoice: invoiceNumber !== null,
        invoice_number: invoiceNumber,
      };
    });

    return json({ success: true, data });
  } catch (err: any) {
    console.error("get-customer-orders error:", err?.message || err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});
