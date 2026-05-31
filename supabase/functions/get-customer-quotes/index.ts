// ============================================================================
// get-customer-quotes — customer-facing Quotes list (CustomerQuotes.tsx).
//
// RECONSTRUCTION NOTE (2026-05-30): the originally deployed source was never
// committed to the repo and its bundle is an unretrievable "zombie" deploy
// (Supabase: "Failed to retrieve function bundle" via CLI, MCP, and the
// dashboard code viewer). This is a clean replacement matching the captured
// live response contract, with field sources reverse-engineered from the live
// schema/data. The ONE behavioural fix vs. the original: the main quotes query
// now filters `parent_quote_id IS NULL` so multi-language child quotes (not
// customer-facing) no longer leak onto the customer's Quotes list. See
// get-customer-dashboard for the same filter.
//
// Response contract (data[] item):
//   id, quote_number, status, total_amount, created_at, valid_until,
//   source_language, target_language, document_count
// Query params: customer_id (required), status (optional, "all"/"" = no
//   filter), search (optional, case-insensitive quote_number substring).
//
// Field derivation (validated against prod schema/data 2026-05-30):
//   total_amount   : quotes.total
//   valid_until    : quotes.expires_at
//   source_language / target_language : languages.name via source_language_id /
//                    target_language_id
//   document_count : count(quote_files) for the quote
//                    (quote_files is the populated upload table; quote_documents
//                    / quote_document_groups are unused)
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

    // ----- main quotes query (parent-only; this is the leak fix) -----
    let q = sb
      .from("quotes")
      .select(`
        id, quote_number, status, total, created_at, expires_at,
        source_language_id, target_language_id
      `)
      .eq("customer_id", customerId)
      .is("parent_quote_id", null)
      .order("created_at", { ascending: false });

    if (status && status !== "all") q = q.eq("status", status);
    if (search && search !== "undefined" && search.trim() !== "") {
      q = q.ilike("quote_number", `%${search.trim()}%`);
    }

    const { data: quotes, error } = await q;
    if (error) return json({ success: false, error: error.message }, 500);
    const rows = quotes ?? [];

    if (rows.length === 0) return json({ success: true, data: [] });

    // ----- batch lookups (avoid N+1) -----
    const quoteIds = rows.map((qr: any) => qr.id);
    const langIds = [
      ...new Set(
        rows.flatMap((qr: any) => [qr.source_language_id, qr.target_language_id]).filter(Boolean),
      ),
    ];

    const [langRes, filesRes] = await Promise.all([
      langIds.length
        ? sb.from("languages").select("id, name").in("id", langIds)
        : Promise.resolve({ data: [], error: null }),
      sb.from("quote_files").select("quote_id").in("quote_id", quoteIds),
    ]);

    const langName = new Map<string, string>((langRes.data ?? []).map((l: any) => [l.id, l.name]));

    const docCount = new Map<string, number>();
    for (const f of filesRes.data ?? []) {
      docCount.set(f.quote_id, (docCount.get(f.quote_id) ?? 0) + 1);
    }

    const data = rows.map((qr: any) => ({
      id: qr.id,
      quote_number: qr.quote_number,
      status: qr.status,
      total_amount: num(qr.total),
      created_at: qr.created_at,
      valid_until: qr.expires_at,
      source_language: qr.source_language_id ? langName.get(qr.source_language_id) ?? null : null,
      target_language: qr.target_language_id ? langName.get(qr.target_language_id) ?? null : null,
      document_count: docCount.get(qr.id) ?? 0,
    }));

    return json({ success: true, data });
  } catch (err: any) {
    console.error("get-customer-quotes error:", err?.message || err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});
