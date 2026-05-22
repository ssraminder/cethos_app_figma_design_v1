// supabase/functions/generate-tax-report/index.ts
//
// Backend for /admin/reports/tax. One dispatcher with the actions:
//
//   list_branches          — branch list for the multi-select filter
//   customer_summary       — branch × customer × currency rollup of invoices
//                            issued in the period (revenue + tax collected)
//   customer_detail        — per-invoice list, optionally filtered to one
//                            customer_id, for drill-down or export
//   vendor_summary         — placeholder; implemented in PR for Tab 2
//   vendor_detail          — placeholder; implemented in PR for Tab 2
//   gst_return             — placeholder; implemented in PR for Tab 3
//
// Common request shape:
//   {
//     action,
//     branch_ids?:   number[],          // empty / undefined = all branches
//     date_from:     'YYYY-MM-DD',
//     date_to:       'YYYY-MM-DD',
//     basis?:        'accrual' | 'cash',   // accrual = invoice_date,
//                                           // cash    = paid_at
//     statuses?:     string[],          // defaults to non-void
//     customer_id?:  string,            // customer_detail only
//     search?:       string,            // customer name typeahead
//   }
//
// Auth: verify_jwt = true. Staff session attached via portal client.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jr(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  paid_at: string | null;
  customer_id: string;
  invoicing_branch_id: number | null;
  currency: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  subtotal_cad: number | null;
  tax_amount_cad: number | null;
  total_amount_cad: number | null;
  amount_paid_cad: number | null;
  exchange_rate_to_cad: number | null;
  status: string | null;
}

interface CustomerLite {
  id: string;
  full_name: string | null;
  company_name: string | null;
  is_tax_exempt: boolean | null;
  billing_country: string | null;
}

interface BranchLite {
  id: number;
  legal_name: string | null;
  code: string | null;
}

const DEFAULT_STATUSES = ["issued", "sent", "paid", "overdue"];

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function rnd2(v: number): number {
  return Math.round(v * 100) / 100;
}

async function fetchAllInvoices(
  sb: ReturnType<typeof createClient>,
  branchIds: number[] | null,
  dateFrom: string,
  dateTo: string,
  basis: "accrual" | "cash",
  statuses: string[],
): Promise<InvoiceRow[]> {
  // Page through customer_invoices since result can exceed default 1000.
  const PAGE = 1000;
  const all: InvoiceRow[] = [];
  let offset = 0;
  while (true) {
    let q = sb
      .from("customer_invoices")
      .select(
        "id, invoice_number, invoice_date, paid_at, customer_id, invoicing_branch_id, currency, subtotal, tax_amount, total_amount, amount_paid, balance_due, subtotal_cad, tax_amount_cad, total_amount_cad, amount_paid_cad, exchange_rate_to_cad, status",
      )
      .eq("type", "invoice")
      .in("status", statuses.length ? statuses : DEFAULT_STATUSES);

    if (basis === "cash") {
      q = q.gte("paid_at", `${dateFrom}T00:00:00Z`).lte("paid_at", `${dateTo}T23:59:59Z`);
    } else {
      q = q.gte("invoice_date", dateFrom).lte("invoice_date", dateTo);
    }
    if (branchIds && branchIds.length > 0) {
      q = q.in("invoicing_branch_id", branchIds);
    }
    q = q.order("invoice_date", { ascending: true }).range(offset, offset + PAGE - 1);

    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []) as InvoiceRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jr({ error: "Missing Supabase configuration" }, 500);
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return jr({ error: "Invalid JSON" }, 400);
  }
  const action = String(body.action || "");
  const branchIds = Array.isArray(body.branch_ids)
    ? (body.branch_ids as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n))
    : null;
  const dateFrom = String(body.date_from || "");
  const dateTo = String(body.date_to || "");
  const basis = body.basis === "cash" ? "cash" : "accrual";
  const statuses = Array.isArray(body.statuses)
    ? (body.statuses as unknown[]).map((s) => String(s))
    : DEFAULT_STATUSES;
  const customerId = body.customer_id ? String(body.customer_id) : null;
  const search = body.search ? String(body.search).trim().toLowerCase() : "";

  try {
    if (action === "list_branches") {
      const { data, error } = await sb
        .from("branches")
        .select("id, code, legal_name, division, is_default, is_active")
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("legal_name");
      if (error) throw error;
      return jr({ branches: data || [] });
    }

    if (action === "customer_summary" || action === "customer_detail") {
      if (!dateFrom || !dateTo) {
        return jr({ error: "date_from and date_to are required" }, 400);
      }

      const invoices = await fetchAllInvoices(sb, branchIds, dateFrom, dateTo, basis, statuses);

      // Resolve customer + branch metadata in two batched lookups.
      const customerIds = Array.from(new Set(invoices.map((r) => r.customer_id)));
      const branchIdSet = Array.from(
        new Set(invoices.map((r) => r.invoicing_branch_id).filter((x): x is number => x != null)),
      );

      let customers: Record<string, CustomerLite> = {};
      if (customerIds.length) {
        const { data } = await sb
          .from("customers")
          .select("id, full_name, company_name, is_tax_exempt, billing_country")
          .in("id", customerIds);
        for (const c of (data as CustomerLite[] | null) || []) customers[c.id] = c;
      }

      let branches: Record<number, BranchLite> = {};
      if (branchIdSet.length) {
        const { data } = await sb
          .from("branches")
          .select("id, code, legal_name")
          .in("id", branchIdSet);
        for (const b of (data as BranchLite[] | null) || []) branches[b.id] = b;
      }

      const customerName = (c?: CustomerLite | null): string =>
        (c?.company_name || c?.full_name || "Unknown").trim();

      // Filter by search + customer_id at this layer (post-load) so the count
      // is consistent with what the UI shows.
      const filtered = invoices.filter((r) => {
        if (customerId && r.customer_id !== customerId) return false;
        if (search) {
          const name = customerName(customers[r.customer_id]).toLowerCase();
          if (!name.includes(search)) return false;
        }
        return true;
      });

      if (action === "customer_detail") {
        const rows = filtered.map((r) => {
          const c = customers[r.customer_id];
          const b = r.invoicing_branch_id != null ? branches[r.invoicing_branch_id] : null;
          return {
            invoice_id: r.id,
            invoice_number: r.invoice_number,
            invoice_date: r.invoice_date,
            paid_at: r.paid_at,
            status: r.status,
            branch_id: r.invoicing_branch_id,
            branch_name: b?.legal_name ?? null,
            customer_id: r.customer_id,
            customer_name: customerName(c),
            is_tax_exempt: !!c?.is_tax_exempt,
            currency: r.currency,
            subtotal_native: num(r.subtotal),
            tax_native: num(r.tax_amount),
            gross_native: num(r.total_amount),
            paid_native: num(r.amount_paid),
            balance_due_native: num(r.balance_due),
            subtotal_cad: num(r.subtotal_cad),
            tax_cad: num(r.tax_amount_cad),
            gross_cad: num(r.total_amount_cad),
            paid_cad: num(r.amount_paid_cad),
            exchange_rate_to_cad: r.exchange_rate_to_cad,
          };
        });
        return jr({
          rows,
          total_count: rows.length,
          filter_snapshot: { branch_ids: branchIds, date_from: dateFrom, date_to: dateTo, basis, statuses, customer_id: customerId, search },
        });
      }

      // customer_summary — group by branch × customer × currency
      type Key = string;
      type Bucket = {
        branch_id: number | null;
        branch_name: string | null;
        customer_id: string;
        customer_name: string;
        is_tax_exempt: boolean;
        currency: string;
        invoices: number;
        subtotal_native: number;
        tax_native: number;
        gross_native: number;
        subtotal_cad: number;
        tax_cad: number;
        gross_cad: number;
      };
      const buckets = new Map<Key, Bucket>();
      for (const r of filtered) {
        const ccy = (r.currency || "CAD").toUpperCase();
        const c = customers[r.customer_id];
        const key: Key = `${r.invoicing_branch_id ?? "x"}::${r.customer_id}::${ccy}`;
        let b = buckets.get(key);
        if (!b) {
          const br = r.invoicing_branch_id != null ? branches[r.invoicing_branch_id] : null;
          b = {
            branch_id: r.invoicing_branch_id,
            branch_name: br?.legal_name ?? null,
            customer_id: r.customer_id,
            customer_name: customerName(c),
            is_tax_exempt: !!c?.is_tax_exempt,
            currency: ccy,
            invoices: 0,
            subtotal_native: 0,
            tax_native: 0,
            gross_native: 0,
            subtotal_cad: 0,
            tax_cad: 0,
            gross_cad: 0,
          };
          buckets.set(key, b);
        }
        b.invoices += 1;
        b.subtotal_native += num(r.subtotal);
        b.tax_native += num(r.tax_amount);
        b.gross_native += num(r.total_amount);
        b.subtotal_cad += num(r.subtotal_cad);
        b.tax_cad += num(r.tax_amount_cad);
        b.gross_cad += num(r.total_amount_cad);
      }
      const rows = Array.from(buckets.values()).map((b) => ({
        ...b,
        subtotal_native: rnd2(b.subtotal_native),
        tax_native: rnd2(b.tax_native),
        gross_native: rnd2(b.gross_native),
        subtotal_cad: rnd2(b.subtotal_cad),
        tax_cad: rnd2(b.tax_cad),
        gross_cad: rnd2(b.gross_cad),
      }));
      rows.sort((a, b) => {
        const bn = (a.branch_name || "").localeCompare(b.branch_name || "");
        if (bn !== 0) return bn;
        return b.gross_cad - a.gross_cad;
      });

      // Branch totals
      const branchTotals = new Map<number | string, { branch_name: string | null; invoices: number; subtotal_cad: number; tax_cad: number; gross_cad: number }>();
      for (const r of rows) {
        const key = r.branch_id ?? "unassigned";
        let t = branchTotals.get(key);
        if (!t) t = { branch_name: r.branch_name, invoices: 0, subtotal_cad: 0, tax_cad: 0, gross_cad: 0 };
        t.invoices += r.invoices;
        t.subtotal_cad += r.subtotal_cad;
        t.tax_cad += r.tax_cad;
        t.gross_cad += r.gross_cad;
        branchTotals.set(key, t);
      }
      const totals_by_branch = Array.from(branchTotals.values()).map((t) => ({
        branch_name: t.branch_name,
        invoices: t.invoices,
        subtotal_cad: rnd2(t.subtotal_cad),
        tax_cad: rnd2(t.tax_cad),
        gross_cad: rnd2(t.gross_cad),
      }));
      const grand = rows.reduce(
        (acc, r) => ({
          invoices: acc.invoices + r.invoices,
          subtotal_cad: acc.subtotal_cad + r.subtotal_cad,
          tax_cad: acc.tax_cad + r.tax_cad,
          gross_cad: acc.gross_cad + r.gross_cad,
        }),
        { invoices: 0, subtotal_cad: 0, tax_cad: 0, gross_cad: 0 },
      );
      return jr({
        rows,
        totals_by_branch,
        grand_total: {
          invoices: grand.invoices,
          subtotal_cad: rnd2(grand.subtotal_cad),
          tax_cad: rnd2(grand.tax_cad),
          gross_cad: rnd2(grand.gross_cad),
        },
        filter_snapshot: { branch_ids: branchIds, date_from: dateFrom, date_to: dateTo, basis, statuses, search },
      });
    }

    if (action === "vendor_summary" || action === "vendor_detail" || action === "gst_return") {
      return jr({ error: `${action} not yet implemented — coming in next PR` }, 501);
    }

    return jr({ error: `Unknown action: ${action || "(none)"}` }, 400);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-tax-report error:", msg);
    return jr({ error: msg }, 500);
  }
});
