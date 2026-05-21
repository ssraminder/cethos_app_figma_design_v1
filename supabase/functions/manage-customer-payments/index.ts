// supabase/functions/manage-customer-payments/index.ts
//
// Rebuilt 2026-05-21 — the deployed bundle was lost server-side (404 from
// gateway). Restores all 11 actions the admin UI calls:
//
//   list_payment_methods     — usePaymentMethods hook
//   get_dashboard_stats      — PaymentsList top cards
//   list_payments            — PaymentsList table
//   get_payment              — PaymentDetail page
//   get_unpaid_invoices      — RecordPaymentModal / PaymentDetail allocation
//                              *** Does NOT filter on order_id, so XTRF-imported
//                              *** customer_invoices are surfaced too.
//   record_payment           — RecordPaymentModal step 1
//   allocate_payment         — RecordPaymentModal step 2 / PaymentDetail
//   remove_allocation        — PaymentDetail
//   delete_payment           — PaymentDetail
//   get_customer_balance     — CustomerARSummary card
//   get_boc_rate             — RecordPaymentModal FX helper

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
  try { body = await req.json(); } catch { return jr({ error: "Invalid JSON" }, 400); }
  const action = String(body.action || "");

  try {
    switch (action) {
      // ─────────────────────────────────────────────────────────────────
      case "list_payment_methods": {
        const { data, error } = await sb
          .from("payment_methods")
          .select("id, code, name, is_online, is_active, requires_staff_confirmation, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name");
        if (error) throw error;
        const list = data || [];
        return jr({ payment_methods: list, methods: list });
      }

      // ─────────────────────────────────────────────────────────────────
      case "get_unpaid_invoices": {
        const customerId = body.customer_id as string;
        if (!customerId) return jr({ error: "customer_id required" }, 400);

        // No order_id filter — XTRF imports (order_id NULL) are valid AR too.
        // Paginate so high-volume customers (TRSB has 2,000+) don't truncate.
        const rows: any[] = [];
        const PAGE = 1000;
        let from = 0;
        while (true) {
          const { data, error } = await sb
            .from("customer_invoices")
            .select(
              "id, invoice_number, total_amount, amount_paid, balance_due, status, due_date, invoice_date, po_number, currency, voided_at"
            )
            .eq("customer_id", customerId)
            .is("voided_at", null)
            .in("status", UNPAID_STATUSES)
            .gt("balance_due", 0)
            .order("invoice_date", { ascending: true, nullsFirst: false })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          rows.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return jr({ invoices: rows });
      }

      // ─────────────────────────────────────────────────────────────────
      case "get_customer_balance": {
        const customerId = body.customer_id as string;
        if (!customerId) return jr({ error: "customer_id required" }, 400);
        const { data: invs } = await sb
          .from("customer_invoices")
          .select("balance_due, status, due_date")
          .eq("customer_id", customerId)
          .is("voided_at", null)
          .in("status", UNPAID_STATUSES);
        const today = new Date().toISOString().split("T")[0];
        let outstanding = 0, outstandingCount = 0, overdue = 0, overdueCount = 0;
        for (const r of invs ?? []) {
          const bal = Number(r.balance_due || 0);
          if (bal <= 0) continue;
          outstanding += bal;
          outstandingCount += 1;
          if (r.due_date && r.due_date < today) {
            overdue += bal;
            overdueCount += 1;
          }
        }
        // Unallocated credits
        const { data: creds } = await sb
          .from("customer_payments")
          .select("unallocated_amount")
          .eq("customer_id", customerId)
          .gt("unallocated_amount", 0);
        const unallocatedCredits = (creds ?? []).reduce(
          (s: number, r: any) => s + Number(r.unallocated_amount || 0),
          0,
        );
        return jr({
          outstanding,
          outstanding_count: outstandingCount,
          overdue,
          overdue_count: overdueCount,
          unallocated_credits: unallocatedCredits,
        });
      }

      // ─────────────────────────────────────────────────────────────────
      case "get_dashboard_stats": {
        const today = new Date().toISOString().split("T")[0];
        const thirtyAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

        // Outstanding from invoices (all customers)
        let totalOutstanding = 0;
        let outstandingCount = 0;
        let totalOverdue = 0;
        let overdueCount = 0;
        const outstandingByCurrency: Record<string, number> = {};
        const overdueByCurrency: Record<string, number> = {};

        let from = 0;
        const PAGE = 1000;
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
            outstandingByCurrency[ccy] = (outstandingByCurrency[ccy] || 0) + bal;
            if (r.due_date && r.due_date < today) {
              totalOverdue += bal;
              overdueCount += 1;
              overdueByCurrency[ccy] = (overdueByCurrency[ccy] || 0) + bal;
            }
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }

        // Unallocated credits
        let unallocated = 0, unallocatedCount = 0;
        const unallocatedByCurrency: Record<string, number> = {};
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
            unallocatedByCurrency[ccy] = (unallocatedByCurrency[ccy] || 0) + amt;
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }

        // Payments last 30 days
        let pay30 = 0, pay30Count = 0;
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

        return jr({
          total_outstanding: totalOutstanding,
          outstanding_count: outstandingCount,
          total_overdue: totalOverdue,
          overdue_count: overdueCount,
          unallocated_credits: unallocated,
          unallocated_count: unallocatedCount,
          payments_last_30_days: pay30,
          payments_last_30_count: pay30Count,
          outstanding_by_currency: outstandingByCurrency,
          overdue_by_currency: overdueByCurrency,
          unallocated_by_currency: unallocatedByCurrency,
        });
      }

      // ─────────────────────────────────────────────────────────────────
      case "list_payments": {
        const page = Number(body.page || 1);
        const pageSize = Number(body.page_size || 25);
        const offset = (page - 1) * pageSize;
        const search = (body.search as string) || "";
        const status = (body.status as string) || "";
        const dateFrom = (body.date_from as string) || "";
        const dateTo = (body.date_to as string) || "";
        const customerId = body.customer_id as string | undefined;

        let q = sb
          .from("customer_payments")
          .select(
            `id, customer_id, amount, currency, payment_date, payment_method,
             payment_method_id, payment_method_code, payment_method_name,
             reference_number, notes, source, stripe_payment_intent_id,
             unallocated_amount, status, confirmed_by_staff_id, created_at,
             allocated_amount,
             customer:customer_id(id, full_name, company_name, email)`,
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (customerId) q = q.eq("customer_id", customerId);
        if (status) q = q.eq("status", status);
        if (dateFrom) q = q.gte("payment_date", dateFrom);
        if (dateTo) q = q.lte("payment_date", dateTo);
        if (search) {
          const esc = search.replace(/[%_,]/g, (m: string) => `\\${m}`);
          q = q.or(`reference_number.ilike.%${esc}%,notes.ilike.%${esc}%`);
        }

        const { data, count, error } = await q;
        if (error) throw error;
        return jr({ payments: data || [], total_count: count || 0 });
      }

      // ─────────────────────────────────────────────────────────────────
      case "get_payment": {
        const paymentId = body.payment_id as string;
        if (!paymentId) return jr({ error: "payment_id required" }, 400);
        const { data: pay, error } = await sb
          .from("customer_payments")
          .select(
            `*, customer:customer_id(id, full_name, company_name, email)`,
          )
          .eq("id", paymentId)
          .maybeSingle();
        if (error) throw error;
        if (!pay) return jr({ error: "Payment not found" }, 404);
        const { data: allocs } = await sb
          .from("customer_payment_allocations")
          .select(
            `id, payment_id, invoice_id, allocated_amount, created_at,
             invoice:invoice_id(id, invoice_number, total_amount, balance_due, status, due_date)`,
          )
          .eq("payment_id", paymentId);
        return jr({ payment: pay, allocations: allocs || [] });
      }

      // ─────────────────────────────────────────────────────────────────
      case "record_payment": {
        const {
          customer_id, amount, currency = "CAD", payment_date,
          payment_method_id, reference_number, notes, source = "manual",
          payment_method_name, payment_method_code, payment_method,
          amount_cad, exchange_rate_to_cad, exchange_rate_date,
        } = body as Record<string, any>;
        if (!customer_id || !amount || !payment_date) {
          return jr({ error: "customer_id, amount, payment_date required" }, 400);
        }
        // payment_method is NOT NULL on customer_payments — derive from code / name / id lookup.
        let pmCode = payment_method_code || payment_method || null;
        let pmName = payment_method_name || null;
        if (payment_method_id && (!pmCode || !pmName)) {
          const { data: pm } = await sb
            .from("payment_methods")
            .select("code, name")
            .eq("id", payment_method_id)
            .maybeSingle();
          if (pm) { pmCode = pmCode || pm.code; pmName = pmName || pm.name; }
        }
        const pmLegacy = pmCode || pmName || "manual";

        const insert: Record<string, unknown> = {
          customer_id, amount, currency, payment_date,
          payment_method_id: payment_method_id || null,
          payment_method: pmLegacy,
          payment_method_name: pmName,
          payment_method_code: pmCode,
          reference_number: reference_number || null,
          notes: notes || null,
          source,
          status: "unallocated",
        };
        if (amount_cad != null) insert.amount_cad = amount_cad;
        if (exchange_rate_to_cad != null) insert.exchange_rate_to_cad = exchange_rate_to_cad;
        if (exchange_rate_date != null) insert.exchange_rate_date = exchange_rate_date;

        const { data, error } = await sb
          .from("customer_payments")
          .insert(insert)
          .select("*")
          .single();
        if (error) throw error;
        return jr({ payment: data });
      }

      // ─────────────────────────────────────────────────────────────────
      case "allocate_payment": {
        const { payment_id, allocations } = body as {
          payment_id: string;
          allocations: { invoice_id: string; amount: number }[];
        };
        if (!payment_id || !Array.isArray(allocations) || allocations.length === 0) {
          return jr({ error: "payment_id + allocations[] required" }, 400);
        }
        const rows = allocations
          .filter((a) => a.invoice_id && Number(a.amount) > 0)
          .map((a) => ({
            payment_id,
            invoice_id: a.invoice_id,
            allocated_amount: Number(a.amount),
          }));
        if (rows.length === 0) return jr({ error: "No valid allocations" }, 400);
        const { data, error } = await sb
          .from("customer_payment_allocations")
          .insert(rows)
          .select("id");
        if (error) throw error;
        return jr({ inserted: data?.length ?? 0 });
      }

      // ─────────────────────────────────────────────────────────────────
      case "remove_allocation": {
        const allocationId = body.allocation_id as string;
        if (!allocationId) return jr({ error: "allocation_id required" }, 400);
        const { error } = await sb
          .from("customer_payment_allocations")
          .delete()
          .eq("id", allocationId);
        if (error) throw error;
        return jr({ removed: 1 });
      }

      // ─────────────────────────────────────────────────────────────────
      case "delete_payment": {
        const paymentId = body.payment_id as string;
        if (!paymentId) return jr({ error: "payment_id required" }, 400);
        // Allocations cascade via the recalc trigger on DELETE.
        await sb.from("customer_payment_allocations").delete().eq("payment_id", paymentId);
        const { error } = await sb.from("customer_payments").delete().eq("id", paymentId);
        if (error) throw error;
        return jr({ deleted: 1 });
      }

      // ─────────────────────────────────────────────────────────────────
      case "get_boc_rate": {
        // Bank of Canada noon FX rate. Public endpoint, no auth.
        const from = (body.from as string) || "USD";
        const to = (body.to as string) || "CAD";
        if (from === to) return jr({ rate: 1, rate_date: null, source: "identity" });
        // BoC publishes CAD/X rates only. We compute the cross via CAD.
        const series = `FX${from.toUpperCase()}CAD`;
        const url = `https://www.bankofcanada.ca/valet/observations/${series}/json?recent=10`;
        try {
          const r = await fetch(url, { headers: { Accept: "application/json" } });
          if (!r.ok) return jr({ rate: null, error: `BoC ${r.status}` });
          const j = await r.json();
          const obs = (j.observations ?? []).filter((o: any) => o[series]?.v);
          if (obs.length === 0) return jr({ rate: null, error: "No BoC observations" });
          const last = obs[obs.length - 1];
          const fromToCad = Number(last[series].v);
          let rate = fromToCad;
          if (to !== "CAD") {
            const series2 = `FX${to.toUpperCase()}CAD`;
            const url2 = `https://www.bankofcanada.ca/valet/observations/${series2}/json?recent=10`;
            const r2 = await fetch(url2, { headers: { Accept: "application/json" } });
            if (!r2.ok) return jr({ rate: null, error: `BoC ${r2.status}` });
            const j2 = await r2.json();
            const obs2 = (j2.observations ?? []).filter((o: any) => o[series2]?.v);
            if (obs2.length === 0) return jr({ rate: null, error: "No BoC observations (to)" });
            const toToCad = Number(obs2[obs2.length - 1][series2].v);
            if (!toToCad) return jr({ rate: null, error: "zero rate" });
            rate = fromToCad / toToCad;
          }
          return jr({ rate, rate_date: last.d, source: "bank_of_canada" });
        } catch (err) {
          return jr({ rate: null, error: String(err) });
        }
      }

      default:
        return jr({ error: `Unknown action: ${action || "(none)"}` }, 400);
    }
  } catch (err: any) {
    console.error("manage-customer-payments error:", err?.message || err);
    return jr({ error: err?.message || "Internal error" }, 500);
  }
});
