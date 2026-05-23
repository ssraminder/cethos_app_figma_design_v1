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

      // Batch the customers lookup — PostgREST URL truncates silently past
      // ~200 UUIDs. See feedback_postgrest_url_length_dedup.
      let customers: Record<string, CustomerLite> = {};
      const CHUNK = 200;
      for (let i = 0; i < customerIds.length; i += CHUNK) {
        const slice = customerIds.slice(i, i + CHUNK);
        const { data } = await sb
          .from("customers")
          .select("id, full_name, company_name, is_tax_exempt, billing_country")
          .in("id", slice);
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

    if (action === "vendor_summary" || action === "vendor_detail") {
      if (!dateFrom || !dateTo) {
        return jr({ error: "date_from and date_to are required" }, 400);
      }

      // Pull from v_vendor_invoices_tax view (combines XTRF cache + portal payables
      // with proper CAD tax computation). Page through since view rows can exceed 1000.
      const PAGE = 1000;
      type VendorRow = {
        source_id: string;
        source: string;
        invoice_number: string | null;
        vendor_name: string | null;
        invoice_date: string | null;
        paid_at: string | null;
        status: string | null;
        payment_status: string | null;
        branch_id: number | null;
        branch_text: string | null;
        subtotal_native: number | null;
        tax_native: number | null;
        gross_native: number | null;
        subtotal_cad: number | null;
        tax_cad: number | null;
      };
      const all: VendorRow[] = [];
      let off = 0;
      while (true) {
        let q = sb
          .from("v_vendor_invoices_tax")
          .select(
            "source_id, source, invoice_number, vendor_name, invoice_date, paid_at, status, payment_status, branch_id, branch_text, subtotal_native, tax_native, gross_native, subtotal_cad, tax_cad",
          );
        if (basis === "cash") {
          q = q.gte("paid_at", dateFrom).lte("paid_at", dateTo);
        } else {
          q = q.gte("invoice_date", dateFrom).lte("invoice_date", dateTo);
        }
        if (branchIds && branchIds.length > 0) {
          q = q.in("branch_id", branchIds);
        }
        q = q.order("invoice_date", { ascending: true }).range(off, off + PAGE - 1);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []) as VendorRow[];
        all.push(...rows);
        if (rows.length < PAGE) break;
        off += PAGE;
      }

      // Exclude cancelled invoices
      const live = all.filter((r) => {
        const s = (r.status || "").toUpperCase();
        return s !== "CANCELLED" && s !== "CANCELED";
      });

      // Resolve branch names in one batched lookup
      const branchIdSet = Array.from(
        new Set(live.map((r) => r.branch_id).filter((x): x is number => x != null)),
      );
      let branches: Record<number, BranchLite> = {};
      if (branchIdSet.length) {
        const { data } = await sb
          .from("branches")
          .select("id, code, legal_name")
          .in("id", branchIdSet);
        for (const b of (data as BranchLite[] | null) || []) branches[b.id] = b;
      }
      const branchName = (id: number | null, fallback: string | null): string =>
        (id != null && branches[id]?.legal_name) || fallback || "(unassigned)";

      // Optional vendor-name search
      const filtered = live.filter((r) => {
        if (search) {
          const name = (r.vendor_name || "").toLowerCase();
          if (!name.includes(search)) return false;
        }
        return true;
      });

      if (action === "vendor_detail") {
        const rows = filtered.map((r) => ({
          source: r.source,
          invoice_number: r.invoice_number,
          invoice_date: r.invoice_date,
          paid_at: r.paid_at,
          status: r.status,
          payment_status: r.payment_status,
          branch_id: r.branch_id,
          branch_name: branchName(r.branch_id, r.branch_text),
          vendor_name: r.vendor_name || "(unknown)",
          subtotal_native: num(r.subtotal_native),
          tax_native: num(r.tax_native),
          gross_native: num(r.gross_native),
          subtotal_cad: num(r.subtotal_cad),
          tax_cad: num(r.tax_cad),
          gross_cad: num(r.subtotal_cad) + num(r.tax_cad),
        }));
        return jr({
          rows,
          total_count: rows.length,
          filter_snapshot: { branch_ids: branchIds, date_from: dateFrom, date_to: dateTo, basis, search },
        });
      }

      // vendor_summary — group by vendor (XTRF has no real per-vendor-per-branch
      // attribution, so vendor is the primary axis). branch_breakdown carried as a
      // nested object on each vendor for drill-down purposes only.
      type VBucket = {
        vendor_name: string;
        invoices: number;
        subtotal_cad: number;
        itc_cad: number;
        gross_cad: number;
        branches: Record<string, { branch_name: string; itc_cad: number; subtotal_cad: number; invoices: number }>;
      };
      const vbuckets = new Map<string, VBucket>();
      for (const r of filtered) {
        const vname = r.vendor_name || "(unknown)";
        const bname = branchName(r.branch_id, r.branch_text);
        let b = vbuckets.get(vname);
        if (!b) {
          b = {
            vendor_name: vname,
            invoices: 0,
            subtotal_cad: 0,
            itc_cad: 0,
            gross_cad: 0,
            branches: {},
          };
          vbuckets.set(vname, b);
        }
        b.invoices += 1;
        b.subtotal_cad += num(r.subtotal_cad);
        b.itc_cad += num(r.tax_cad);
        b.gross_cad += num(r.subtotal_cad) + num(r.tax_cad);
        const bb = b.branches[bname] || { branch_name: bname, itc_cad: 0, subtotal_cad: 0, invoices: 0 };
        bb.itc_cad += num(r.tax_cad);
        bb.subtotal_cad += num(r.subtotal_cad);
        bb.invoices += 1;
        b.branches[bname] = bb;
      }
      const vrows = Array.from(vbuckets.values()).map((b) => ({
        vendor_name: b.vendor_name,
        invoices: b.invoices,
        subtotal_cad: rnd2(b.subtotal_cad),
        itc_cad: rnd2(b.itc_cad),
        gross_cad: rnd2(b.gross_cad),
        branches: Object.values(b.branches).map((x) => ({
          branch_name: x.branch_name,
          invoices: x.invoices,
          subtotal_cad: rnd2(x.subtotal_cad),
          itc_cad: rnd2(x.itc_cad),
        })).sort((a, b) => b.itc_cad - a.itc_cad),
      }));
      // Sort: ITC-paying vendors first (descending ITC), then zero-GST vendors
      // (descending subtotal). Frontend uses itc_cad === 0 to bucket into the
      // collapsed accordion.
      vrows.sort((a, b) => {
        if ((a.itc_cad > 0) !== (b.itc_cad > 0)) return a.itc_cad > 0 ? -1 : 1;
        if (a.itc_cad !== b.itc_cad) return b.itc_cad - a.itc_cad;
        return b.subtotal_cad - a.subtotal_cad;
      });

      // Also include a per-branch totals view for the rollup card.
      const vBranchTotals = new Map<number | string, { branch_name: string; invoices: number; subtotal_cad: number; itc_cad: number; gross_cad: number }>();
      for (const r of filtered) {
        const bname = branchName(r.branch_id, r.branch_text);
        const key = r.branch_id ?? `__${bname}`;
        let t = vBranchTotals.get(key);
        if (!t) t = { branch_name: bname, invoices: 0, subtotal_cad: 0, itc_cad: 0, gross_cad: 0 };
        t.invoices += 1;
        t.subtotal_cad += num(r.subtotal_cad);
        t.itc_cad += num(r.tax_cad);
        t.gross_cad += num(r.subtotal_cad) + num(r.tax_cad);
        vBranchTotals.set(key, t);
      }
      const vTotalsByBranch = Array.from(vBranchTotals.values()).map((t) => ({
        branch_name: t.branch_name,
        invoices: t.invoices,
        subtotal_cad: rnd2(t.subtotal_cad),
        itc_cad: rnd2(t.itc_cad),
        gross_cad: rnd2(t.gross_cad),
      })).sort((a, b) => b.itc_cad - a.itc_cad);

      const vGrand = vrows.reduce(
        (acc, r) => ({
          invoices: acc.invoices + r.invoices,
          subtotal_cad: acc.subtotal_cad + r.subtotal_cad,
          itc_cad: acc.itc_cad + r.itc_cad,
          gross_cad: acc.gross_cad + r.gross_cad,
          itc_vendors: acc.itc_vendors + (r.itc_cad > 0 ? 1 : 0),
          zero_vendors: acc.zero_vendors + (r.itc_cad <= 0 ? 1 : 0),
        }),
        { invoices: 0, subtotal_cad: 0, itc_cad: 0, gross_cad: 0, itc_vendors: 0, zero_vendors: 0 },
      );
      return jr({
        rows: vrows,
        totals_by_branch: vTotalsByBranch,
        grand_total: {
          invoices: vGrand.invoices,
          subtotal_cad: rnd2(vGrand.subtotal_cad),
          itc_cad: rnd2(vGrand.itc_cad),
          gross_cad: rnd2(vGrand.gross_cad),
          itc_vendor_count: vGrand.itc_vendors,
          zero_vendor_count: vGrand.zero_vendors,
        },
        filter_snapshot: { branch_ids: branchIds, date_from: dateFrom, date_to: dateTo, basis, search },
      });
    }

    if (action === "get_adjustments") {
      const bid =
        body.branch_id === null || body.branch_id === undefined
          ? null
          : Number(body.branch_id);
      if (!dateFrom || !dateTo) {
        return jr({ error: "date_from, date_to required" }, 400);
      }
      let q = sb
        .from("tax_return_adjustments")
        .select("*")
        .eq("period_start", dateFrom)
        .eq("period_end", dateTo);
      q = bid === null ? q.is("branch_id", null) : q.eq("branch_id", bid);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return jr({ adjustments: data });
    }

    if (action === "save_adjustments") {
      // branch_id is optional — when omitted, this is a consolidated-return row
      // stored with branch_id IS NULL (see migration tax_return_adjustments
      // _nullable_branch).
      const bid =
        body.branch_id === null || body.branch_id === undefined
          ? null
          : Number(body.branch_id);
      if (bid !== null && !bid) {
        return jr({ error: "invalid branch_id" }, 400);
      }
      if (!dateFrom || !dateTo) {
        return jr({ error: "date_from, date_to required" }, 400);
      }
      const editable = [
        "line_104", "line_104_notes",
        "line_107", "line_107_notes",
        "line_110", "line_110_notes",
        "line_111", "line_111_notes",
        "line_205", "line_205_notes",
        "line_405", "line_405_notes",
        "additional_itc_amount", "additional_itc_notes",
      ];
      const fields: Record<string, unknown> = {};
      for (const k of editable) {
        if (Object.prototype.hasOwnProperty.call(body, k)) {
          fields[k] = (body as Record<string, unknown>)[k];
        }
      }
      const payload = {
        branch_id: bid,
        period_start: dateFrom,
        period_end: dateTo,
        ...fields,
        updated_at: new Date().toISOString(),
        updated_by: body.staff_id ?? null,
      };
      // Upsert manually since the partial-unique indexes don't work with
      // onConflict (PostgREST limitation). Look up existing row first.
      let existing: { id: string } | null = null;
      {
        let q = sb
          .from("tax_return_adjustments")
          .select("id")
          .eq("period_start", dateFrom)
          .eq("period_end", dateTo);
        q = bid === null ? q.is("branch_id", null) : q.eq("branch_id", bid);
        const { data } = await q.maybeSingle();
        existing = (data as { id: string } | null) ?? null;
      }
      let result;
      if (existing) {
        const { data, error } = await sb
          .from("tax_return_adjustments")
          .update(payload)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await sb
          .from("tax_return_adjustments")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        result = data;
      }
      return jr({ adjustments: result });
    }

    if (action === "gst_return") {
      if (!dateFrom || !dateTo) {
        return jr({ error: "date_from and date_to are required" }, 400);
      }

      // Selected branches (default to all active branches)
      let targetBranchIds: number[] = branchIds && branchIds.length > 0 ? branchIds : [];
      if (targetBranchIds.length === 0) {
        const { data } = await sb
          .from("branches")
          .select("id")
          .eq("is_active", true);
        targetBranchIds = ((data as { id: number }[] | null) || []).map((b) => b.id);
      }

      // Branch metadata
      const { data: branchRows } = await sb
        .from("branches")
        .select("id, code, legal_name, division")
        .in("id", targetBranchIds);
      const branchById: Record<number, BranchLite & { division?: string | null }> = {};
      for (const b of (branchRows as (BranchLite & { division?: string | null })[] | null) || []) {
        branchById[b.id] = b;
      }

      // Customer-side aggregates (Lines 101, 103) — issued/paid/sent/overdue in period.
      const custInvoices = await fetchAllInvoices(sb, targetBranchIds, dateFrom, dateTo, basis, DEFAULT_STATUSES);
      const custByBranch = new Map<number, { line_101: number; line_103: number }>();
      for (const r of custInvoices) {
        if (r.invoicing_branch_id == null) continue;
        const cur = custByBranch.get(r.invoicing_branch_id) || { line_101: 0, line_103: 0 };
        cur.line_101 += num(r.subtotal_cad);
        cur.line_103 += num(r.tax_amount_cad);
        custByBranch.set(r.invoicing_branch_id, cur);
      }

      // Vendor-side aggregates (Line 106 computed) — page through view.
      const PAGE = 1000;
      const vendorByBranch = new Map<number, { line_106_computed: number; vendor_invoice_count: number }>();
      let off = 0;
      while (true) {
        let q = sb
          .from("v_vendor_invoices_tax")
          .select("branch_id, tax_cad, status");
        if (basis === "cash") {
          q = q.gte("paid_at", dateFrom).lte("paid_at", dateTo);
        } else {
          q = q.gte("invoice_date", dateFrom).lte("invoice_date", dateTo);
        }
        if (targetBranchIds.length > 0) {
          q = q.in("branch_id", targetBranchIds);
        }
        q = q.range(off, off + PAGE - 1);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data as { branch_id: number | null; tax_cad: number | null; status: string | null }[] | null) || [];
        for (const r of rows) {
          const s = (r.status || "").toUpperCase();
          if (s === "CANCELLED" || s === "CANCELED") continue;
          if (r.branch_id == null) continue;
          const cur = vendorByBranch.get(r.branch_id) || { line_106_computed: 0, vendor_invoice_count: 0 };
          cur.line_106_computed += num(r.tax_cad);
          cur.vendor_invoice_count += 1;
          vendorByBranch.set(r.branch_id, cur);
        }
        if (rows.length < PAGE) break;
        off += PAGE;
      }

      // Adjustment rows
      const { data: adjRows } = await sb
        .from("tax_return_adjustments")
        .select("*")
        .in("branch_id", targetBranchIds)
        .eq("period_start", dateFrom)
        .eq("period_end", dateTo);
      const adjByBranch: Record<number, Record<string, unknown>> = {};
      for (const a of (adjRows as Record<string, unknown>[] | null) || []) {
        adjByBranch[Number((a as { branch_id: number }).branch_id)] = a;
      }

      // Build per-branch return rows
      const returns = targetBranchIds.map((bid) => {
        const b = branchById[bid];
        const cust = custByBranch.get(bid) || { line_101: 0, line_103: 0 };
        const vend = vendorByBranch.get(bid) || { line_106_computed: 0, vendor_invoice_count: 0 };
        const adj = adjByBranch[bid] || {};
        const line_104 = num(adj.line_104);
        const line_105 = cust.line_103 + line_104;
        const line_106_additional = num(adj.additional_itc_amount);
        const line_106 = vend.line_106_computed + line_106_additional;
        const line_107 = num(adj.line_107);
        const line_108 = line_106 + line_107;
        const line_109 = line_105 - line_108;
        const line_110 = num(adj.line_110);
        const line_111 = num(adj.line_111);
        const line_112 = line_110 + line_111;
        const line_113A = line_109 - line_112;
        const line_205 = num(adj.line_205);
        const line_405 = num(adj.line_405);
        const line_113B = line_205 + line_405;
        const line_113C = line_113A + line_113B;
        return {
          branch_id: bid,
          branch_name: b?.legal_name ?? `Branch ${bid}`,
          branch_code: b?.code ?? null,
          period_start: dateFrom,
          period_end: dateTo,
          line_101: rnd2(cust.line_101),
          line_103: rnd2(cust.line_103),
          line_104: rnd2(line_104),
          line_104_notes: (adj.line_104_notes as string | null) ?? null,
          line_105: rnd2(line_105),
          line_106_computed: rnd2(vend.line_106_computed),
          line_106_additional: rnd2(line_106_additional),
          line_106: rnd2(line_106),
          additional_itc_notes: (adj.additional_itc_notes as string | null) ?? null,
          line_107: rnd2(line_107),
          line_107_notes: (adj.line_107_notes as string | null) ?? null,
          line_108: rnd2(line_108),
          line_109: rnd2(line_109),
          line_110: rnd2(line_110),
          line_110_notes: (adj.line_110_notes as string | null) ?? null,
          line_111: rnd2(line_111),
          line_111_notes: (adj.line_111_notes as string | null) ?? null,
          line_112: rnd2(line_112),
          line_113A: rnd2(line_113A),
          line_205: rnd2(line_205),
          line_205_notes: (adj.line_205_notes as string | null) ?? null,
          line_405: rnd2(line_405),
          line_405_notes: (adj.line_405_notes as string | null) ?? null,
          line_113B: rnd2(line_113B),
          line_113C: rnd2(line_113C),
          refund_or_payment: line_113C < 0
            ? { kind: "refund", line: 114, amount: rnd2(-line_113C) }
            : { kind: "payment", line: 115, amount: rnd2(line_113C) },
          vendor_invoice_count: vend.vendor_invoice_count,
          customer_invoice_count: custInvoices.filter((r) => r.invoicing_branch_id === bid).length,
          filed_at: (adj.filed_at as string | null) ?? null,
        };
      });

      // Consolidated row — sum across all targetBranchIds + read adjustments
      // saved with branch_id IS NULL for this period.
      let consolidatedAdj: Record<string, unknown> = {};
      {
        const { data } = await sb
          .from("tax_return_adjustments")
          .select("*")
          .is("branch_id", null)
          .eq("period_start", dateFrom)
          .eq("period_end", dateTo)
          .maybeSingle();
        consolidatedAdj = (data as Record<string, unknown> | null) || {};
      }
      const sumLine101 = returns.reduce((a, r) => a + r.line_101, 0);
      const sumLine103 = returns.reduce((a, r) => a + r.line_103, 0);
      const sumLine106Computed = returns.reduce((a, r) => a + r.line_106_computed, 0);
      const c_104 = num(consolidatedAdj.line_104);
      const c_107 = num(consolidatedAdj.line_107);
      const c_110 = num(consolidatedAdj.line_110);
      const c_111 = num(consolidatedAdj.line_111);
      const c_205 = num(consolidatedAdj.line_205);
      const c_405 = num(consolidatedAdj.line_405);
      const c_106_additional = num(consolidatedAdj.additional_itc_amount);
      const c_106 = sumLine106Computed + c_106_additional;
      const c_105 = sumLine103 + c_104;
      const c_108 = c_106 + c_107;
      const c_109 = c_105 - c_108;
      const c_112 = c_110 + c_111;
      const c_113A = c_109 - c_112;
      const c_113B = c_205 + c_405;
      const c_113C = c_113A + c_113B;
      const consolidated = {
        branch_id: null as number | null,
        branch_name: returns.length === 1
          ? returns[0].branch_name
          : `Consolidated (${returns.length} branches)`,
        included_branches: returns.map((r) => ({ id: r.branch_id, name: r.branch_name })),
        period_start: dateFrom,
        period_end: dateTo,
        line_101: rnd2(sumLine101),
        line_103: rnd2(sumLine103),
        line_104: rnd2(c_104),
        line_104_notes: (consolidatedAdj.line_104_notes as string | null) ?? null,
        line_105: rnd2(c_105),
        line_106_computed: rnd2(sumLine106Computed),
        line_106_additional: rnd2(c_106_additional),
        line_106: rnd2(c_106),
        additional_itc_notes: (consolidatedAdj.additional_itc_notes as string | null) ?? null,
        line_107: rnd2(c_107),
        line_107_notes: (consolidatedAdj.line_107_notes as string | null) ?? null,
        line_108: rnd2(c_108),
        line_109: rnd2(c_109),
        line_110: rnd2(c_110),
        line_110_notes: (consolidatedAdj.line_110_notes as string | null) ?? null,
        line_111: rnd2(c_111),
        line_111_notes: (consolidatedAdj.line_111_notes as string | null) ?? null,
        line_112: rnd2(c_112),
        line_113A: rnd2(c_113A),
        line_205: rnd2(c_205),
        line_205_notes: (consolidatedAdj.line_205_notes as string | null) ?? null,
        line_405: rnd2(c_405),
        line_405_notes: (consolidatedAdj.line_405_notes as string | null) ?? null,
        line_113B: rnd2(c_113B),
        line_113C: rnd2(c_113C),
        refund_or_payment: c_113C < 0
          ? { kind: "refund", line: 114, amount: rnd2(-c_113C) }
          : { kind: "payment", line: 115, amount: rnd2(c_113C) },
        vendor_invoice_count: returns.reduce((a, r) => a + r.vendor_invoice_count, 0),
        customer_invoice_count: returns.reduce((a, r) => a + r.customer_invoice_count, 0),
        filed_at: (consolidatedAdj.filed_at as string | null) ?? null,
      };

      return jr({
        returns,
        consolidated,
        filter_snapshot: { branch_ids: targetBranchIds, date_from: dateFrom, date_to: dateTo, basis },
      });
    }

    return jr({ error: `Unknown action: ${action || "(none)"}` }, 400);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-tax-report error:", msg);
    return jr({ error: msg }, 500);
  }
});
