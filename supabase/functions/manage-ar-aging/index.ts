// supabase/functions/manage-ar-aging/index.ts
//
// Rebuilt 2026-05-21 — deployed bundle was lost (404 from gateway). Actions:
//
//   get_dashboard_stats   — top stats card on /admin/payments
//   get_aging_summary     — per-customer aging buckets for /admin/reports/aging
//   get_customer_aging    — invoice-level detail for a single customer
//
// Sources from customer_invoices (which now includes XTRF-imported AR via the
// xtrf_invoice_id column).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UNPAID_STATUSES = ["issued", "sent", "overdue", "partially_paid"];

function jr(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface InvoiceRow {
  id: string;
  customer_id: string;
  invoice_number: string | null;
  total_amount: number | null;
  balance_due: number | null;
  due_date: string | null;
  invoice_date: string | null;
  status: string | null;
  currency: string | null;
}

interface CustomerLite {
  id: string;
  full_name: string | null;
  company_name: string | null;
  customer_type: string | null;
  payment_terms: string | null;
}

function bucketDays(dueDate: string | null, today: Date): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jr({ error: "Missing Supabase configuration" }, 500);
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jr({ error: "Invalid JSON" }, 400); }
  const action = String(body.action || "");

  try {
    switch (action) {
      case "get_dashboard_stats": {
        const today = new Date();
        const todayIso = today.toISOString().split("T")[0];
        const thirtyAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

        let totalOutstanding = 0;
        let outstandingCount = 0;
        let totalOverdue = 0;
        let overdueCount = 0;
        const outByCcy: Record<string, number> = {};
        const ovByCcy: Record<string, number> = {};
        let from = 0; const PAGE = 1000;
        while (true) {
          const { data, error } = await sb
            .from("customer_invoices")
            .select("balance_due, due_date, currency, status, voided_at")
            .is("voided_at", null)
            .in("status", UNPAID_STATUSES)
            .gt("balance_due", 0)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const r of data) {
            const bal = Number(r.balance_due || 0);
            const ccy = (r.currency || "CAD") as string;
            totalOutstanding += bal;
            outstandingCount += 1;
            outByCcy[ccy] = (outByCcy[ccy] || 0) + bal;
            if (r.due_date && r.due_date < todayIso) {
              totalOverdue += bal;
              overdueCount += 1;
              ovByCcy[ccy] = (ovByCcy[ccy] || 0) + bal;
            }
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }

        let unallocated = 0;
        let unallocatedCount = 0;
        const uaByCcy: Record<string, number> = {};
        from = 0;
        while (true) {
          const { data, error } = await sb
            .from("customer_payments")
            .select("unallocated_amount, currency")
            .gt("unallocated_amount", 0)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const r of data) {
            const amt = Number(r.unallocated_amount || 0);
            const ccy = (r.currency || "CAD") as string;
            unallocated += amt;
            unallocatedCount += 1;
            uaByCcy[ccy] = (uaByCcy[ccy] || 0) + amt;
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }

        let pay30 = 0;
        let pay30Count = 0;
        from = 0;
        while (true) {
          const { data, error } = await sb
            .from("customer_payments")
            .select("amount_cad, amount, created_at")
            .gte("created_at", thirtyAgo)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const r of data) {
            pay30 += Number(r.amount_cad ?? r.amount ?? 0);
            pay30Count += 1;
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }

        const stats = {
          total_outstanding: totalOutstanding,
          outstanding_count: outstandingCount,
          total_overdue: totalOverdue,
          overdue_count: overdueCount,
          unallocated_credits: unallocated,
          unallocated_count: unallocatedCount,
          payments_last_30_days: pay30,
          payments_last_30_count: pay30Count,
          outstanding_by_currency: outByCcy,
          overdue_by_currency: ovByCcy,
          unallocated_by_currency: uaByCcy,
        };
        return jr({ stats, ...stats });
      }

      case "get_aging_summary": {
        const today = new Date();
        const todayIso = today.toISOString().split("T")[0];

        const invs: InvoiceRow[] = [];
        let from = 0; const PAGE = 1000;
        while (true) {
          const { data, error } = await sb
            .from("customer_invoices")
            .select("id, customer_id, invoice_number, total_amount, balance_due, due_date, invoice_date, status, currency, voided_at")
            .is("voided_at", null)
            .in("status", UNPAID_STATUSES)
            .gt("balance_due", 0)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          invs.push(...(data as any));
          if (data.length < PAGE) break;
          from += PAGE;
        }

        const customerIds = Array.from(new Set(invs.map(i => i.customer_id).filter(Boolean)));
        const customerById = new Map<string, CustomerLite>();
        for (let i = 0; i < customerIds.length; i += 300) {
          const slice = customerIds.slice(i, i + 300);
          const { data, error } = await sb
            .from("customers")
            .select("id, full_name, company_name, customer_type, payment_terms")
            .in("id", slice);
          if (error) throw error;
          for (const c of (data ?? []) as any[]) customerById.set(c.id, c);
        }

        type Agg = {
          customer_id: string;
          full_name: string;
          company_name: string | null;
          customer_type: string | null;
          payment_terms: string | null;
          total_invoices: number;
          total_outstanding: number;
          current_amount: number;
          days_1_30: number;
          days_31_60: number;
          days_61_90: number;
          days_90_plus: number;
        };
        const agg = new Map<string, Agg>();
        for (const inv of invs) {
          const cid = inv.customer_id;
          let row = agg.get(cid);
          if (!row) {
            const c = customerById.get(cid);
            row = {
              customer_id: cid,
              full_name: c?.full_name || "(unknown)",
              company_name: c?.company_name ?? null,
              customer_type: c?.customer_type ?? null,
              payment_terms: c?.payment_terms ?? null,
              total_invoices: 0,
              total_outstanding: 0,
              current_amount: 0,
              days_1_30: 0,
              days_31_60: 0,
              days_61_90: 0,
              days_90_plus: 0,
            };
            agg.set(cid, row);
          }
          const bal = Number(inv.balance_due || 0);
          row.total_invoices += 1;
          row.total_outstanding += bal;
          const d = inv.due_date && inv.due_date < todayIso ? bucketDays(inv.due_date, today) : 0;
          if (d <= 0) row.current_amount += bal;
          else if (d <= 30) row.days_1_30 += bal;
          else if (d <= 60) row.days_31_60 += bal;
          else if (d <= 90) row.days_61_90 += bal;
          else row.days_90_plus += bal;
        }

        const rows = Array.from(agg.values()).sort((a, b) => b.total_outstanding - a.total_outstanding);
        return jr({ rows, aging: rows });
      }

      case "get_customer_aging": {
        const customerId = body.customer_id as string;
        if (!customerId) return jr({ error: "customer_id required" }, 400);
        const today = new Date();
        const todayIso = today.toISOString().split("T")[0];

        const rows: any[] = [];
        let from = 0; const PAGE = 1000;
        while (true) {
          const { data, error } = await sb
            .from("customer_invoices")
            .select("id, invoice_number, total_amount, amount_paid, balance_due, status, invoice_date, due_date, currency, last_reminder_sent_at, reminder_count")
            .eq("customer_id", customerId)
            .is("voided_at", null)
            .in("status", UNPAID_STATUSES)
            .gt("balance_due", 0)
            .order("due_date", { ascending: true, nullsFirst: false })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const r of data as any[]) {
            const d = r.due_date && r.due_date < todayIso ? bucketDays(r.due_date, today) : 0;
            rows.push({ ...r, days_overdue: d });
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return jr({ invoices: rows });
      }

      default:
        return jr({ error: `Unknown action: ${action || "(none)"}` }, 400);
    }
  } catch (err: any) {
    console.error("manage-ar-aging error:", err?.message || err);
    return jr({ error: err?.message || "Internal error" }, 500);
  }
});
