// supabase/functions/manage-vendor-payments/index.ts
//
// Vendor-side mirror of manage-customer-payments. Actions:
//
//   list_payment_methods
//   get_unpaid_invoices    — merges vendor_payables + xtrf_vendor_invoice_cache
//   get_vendor_balance
//   get_dashboard_stats
//   list_payments
//   get_payment            — enriches each allocation with target invoice info
//   record_payment
//   allocate_payment       — polymorphic target via { kind, target_id, amount }
//   remove_allocation
//   delete_payment

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
      case "list_payment_methods": {
        const { data, error } = await sb.from("payment_methods")
          .select("id, code, name, is_online, is_active, requires_staff_confirmation, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name");
        if (error) throw error;
        return jr({ payment_methods: data || [] });
      }

      case "get_unpaid_invoices": {
        const vendorId = body.vendor_id as string;
        if (!vendorId) return jr({ error: "vendor_id required" }, 400);
        const { data: vendor } = await sb.from("vendors")
          .select("xtrf_vendor_id").eq("id", vendorId).maybeSingle();
        const xtrfVendorId = vendor?.xtrf_vendor_id ?? null;

        const { data: payables } = await sb.from("vendor_payables")
          .select("id, order_id, step_name, total, total_cad, currency, vendor_invoice_number, vendor_invoice_date, invoiced_at, paid_at, voided_at, status")
          .eq("vendor_id", vendorId).is("voided_at", null).is("paid_at", null)
          .not("status", "in", "(cancelled,voided)")
          .order("vendor_invoice_date", { ascending: true, nullsFirst: false });

        const payableIds = (payables ?? []).map((p: any) => p.id);
        const allocByPayable = new Map<string, number>();
        if (payableIds.length > 0) {
          const { data: allocs } = await sb.from("vendor_payment_allocations")
            .select("payable_id, allocated_amount").in("payable_id", payableIds);
          for (const a of (allocs ?? []) as any[]) {
            allocByPayable.set(a.payable_id, (allocByPayable.get(a.payable_id) || 0) + Number(a.allocated_amount || 0));
          }
        }
        const portalInvoices = (payables ?? []).map((p: any) => {
          const allocated = allocByPayable.get(p.id) || 0;
          const total = Number(p.total || 0);
          const balance = Math.max(total - allocated, 0);
          return {
            id: p.id, kind: 'payable' as const,
            invoice_number: p.vendor_invoice_number || p.step_name || p.id.slice(0, 8),
            total_amount: total, amount_paid: allocated, balance_due: balance,
            status: p.status, invoice_date: p.vendor_invoice_date,
            due_date: null as string | null, currency: p.currency || 'CAD',
            order_id: p.order_id,
          };
        }).filter(i => i.balance_due > 0);

        let xtrfInvoices: any[] = [];
        if (xtrfVendorId != null) {
          const PAGE = 1000; let from = 0;
          const cacheRows: any[] = [];
          while (true) {
            const { data, error } = await sb.from("xtrf_vendor_invoice_cache")
              .select("id, internal_number, final_number, gross_cad, total_gross, currency_id, payment_status, status, final_date, payment_due_date")
              .eq("provider_id", xtrfVendorId)
              .in("payment_status", ["NOT_PAID", "UNPAID", "PARTIALLY_PAID"])
              .order("final_date", { ascending: true, nullsFirst: false })
              .range(from, from + PAGE - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            cacheRows.push(...data);
            if (data.length < PAGE) break;
            from += PAGE;
          }
          const cacheIds = cacheRows.map(r => r.id);
          const allocByXtrf = new Map<number, number>();
          if (cacheIds.length > 0) {
            const { data: allocs } = await sb.from("vendor_payment_allocations")
              .select("xtrf_invoice_id, allocated_amount").in("xtrf_invoice_id", cacheIds);
            for (const a of (allocs ?? []) as any[]) {
              allocByXtrf.set(a.xtrf_invoice_id, (allocByXtrf.get(a.xtrf_invoice_id) || 0) + Number(a.allocated_amount || 0));
            }
          }
          xtrfInvoices = cacheRows.map(r => {
            const total = Number(r.gross_cad ?? r.total_gross ?? 0);
            const allocated = allocByXtrf.get(r.id) || 0;
            const balance = Math.max(total - allocated, 0);
            return {
              id: r.id, kind: 'xtrf_invoice' as const,
              invoice_number: r.internal_number || r.final_number || `xtrf-${r.id}`,
              total_amount: total, amount_paid: allocated, balance_due: balance,
              status: r.status, invoice_date: r.final_date,
              due_date: r.payment_due_date, currency: 'CAD',
              xtrf_currency_id: r.currency_id,
            };
          }).filter(i => i.balance_due > 0);
        }
        return jr({ invoices: [...portalInvoices, ...xtrfInvoices] });
      }

      case "get_vendor_balance": {
        const vendorId = body.vendor_id as string;
        if (!vendorId) return jr({ error: "vendor_id required" }, 400);
        const { data: pay } = await sb.from("vendor_payables")
          .select("total, status, paid_at, voided_at")
          .eq("vendor_id", vendorId).is("voided_at", null).is("paid_at", null);
        const portalOutstanding = (pay ?? []).reduce(
          (s: number, r: any) => s + Number(r.total || 0), 0);
        const { data: v } = await sb.from("vendors")
          .select("xtrf_vendor_id").eq("id", vendorId).maybeSingle();
        let xtrfOutstanding = 0;
        if (v?.xtrf_vendor_id) {
          const { data: cache } = await sb.from("xtrf_vendor_invoice_cache")
            .select("gross_cad, total_gross")
            .eq("provider_id", v.xtrf_vendor_id)
            .in("payment_status", ["NOT_PAID","UNPAID","PARTIALLY_PAID"]);
          xtrfOutstanding = (cache ?? []).reduce(
            (s: number, r: any) => s + Number(r.gross_cad ?? r.total_gross ?? 0), 0);
        }
        const { data: credits } = await sb.from("vendor_payments")
          .select("unallocated_amount").eq("vendor_id", vendorId).gt("unallocated_amount", 0);
        const unallocated = (credits ?? []).reduce(
          (s: number, r: any) => s + Number(r.unallocated_amount || 0), 0);
        return jr({
          outstanding_portal: portalOutstanding,
          outstanding_xtrf: xtrfOutstanding,
          outstanding_total: portalOutstanding + xtrfOutstanding,
          unallocated_credits: unallocated,
        });
      }

      case "get_dashboard_stats": {
        let portalOutstanding = 0, portalCount = 0;
        const PAGE = 1000; let from = 0;
        while (true) {
          const { data, error } = await sb.from("vendor_payables")
            .select("total, total_cad, currency, status, paid_at, voided_at")
            .is("voided_at", null).is("paid_at", null).range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const r of data) {
            portalOutstanding += Number(r.total_cad ?? r.total ?? 0);
            portalCount += 1;
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
        let xtrfOutstanding = 0, xtrfCount = 0;
        from = 0;
        while (true) {
          const { data, error } = await sb.from("xtrf_vendor_invoice_cache")
            .select("gross_cad, total_gross")
            .in("payment_status", ["NOT_PAID","UNPAID","PARTIALLY_PAID"])
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const r of data) {
            xtrfOutstanding += Number(r.gross_cad ?? r.total_gross ?? 0);
            xtrfCount += 1;
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
        const thirtyAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
        let pay30 = 0, pay30Count = 0;
        from = 0;
        while (true) {
          const { data, error } = await sb.from("vendor_payments")
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
          outstanding_portal: portalOutstanding,
          outstanding_portal_count: portalCount,
          outstanding_xtrf: xtrfOutstanding,
          outstanding_xtrf_count: xtrfCount,
          outstanding_total: portalOutstanding + xtrfOutstanding,
          payments_last_30_days: pay30,
          payments_last_30_count: pay30Count,
        });
      }

      case "list_payments": {
        const page = Number(body.page || 1);
        const pageSize = Number(body.page_size || 25);
        const offset = (page - 1) * pageSize;
        const search = (body.search as string) || "";
        const status = (body.status as string) || "";
        const dateFrom = (body.date_from as string) || "";
        const dateTo = (body.date_to as string) || "";
        const vendorId = body.vendor_id as string | undefined;
        let q = sb.from("vendor_payments")
          .select(
            `id, vendor_id, amount, amount_cad, currency, payment_date,
             payment_method, payment_method_id, payment_method_code,
             payment_method_name, reference_number, notes, source,
             unallocated_amount, allocated_amount, status,
             confirmed_by_staff_id, created_at,
             vendor:vendor_id(id, full_name, email)`,
            { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (vendorId) q = q.eq("vendor_id", vendorId);
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

      case "get_payment": {
        const paymentId = body.payment_id as string;
        if (!paymentId) return jr({ error: "payment_id required" }, 400);
        const { data: pay, error } = await sb.from("vendor_payments")
          .select(`*, vendor:vendor_id(id, full_name, email)`)
          .eq("id", paymentId).maybeSingle();
        if (error) throw error;
        if (!pay) return jr({ error: "Payment not found" }, 404);
        const { data: allocs } = await sb.from("vendor_payment_allocations")
          .select(`id, payable_id, xtrf_invoice_id, allocated_amount, created_at`)
          .eq("payment_id", paymentId);
        const out: any[] = [];
        for (const a of (allocs ?? []) as any[]) {
          if (a.payable_id) {
            const { data: p } = await sb.from("vendor_payables")
              .select("id, vendor_invoice_number, step_name, total, currency")
              .eq("id", a.payable_id).maybeSingle();
            out.push({ ...a, target: { kind: 'payable', ...(p ?? {}) } });
          } else if (a.xtrf_invoice_id) {
            const { data: c } = await sb.from("xtrf_vendor_invoice_cache")
              .select("id, internal_number, final_number, gross_cad, total_gross")
              .eq("id", a.xtrf_invoice_id).maybeSingle();
            out.push({
              ...a,
              target: {
                kind: 'xtrf_invoice',
                invoice_number: c?.internal_number || c?.final_number,
                total: c?.gross_cad ?? c?.total_gross,
                ...c,
              },
            });
          }
        }
        return jr({ payment: pay, allocations: out });
      }

      case "record_payment": {
        const {
          vendor_id, amount, currency = "CAD", payment_date,
          payment_method_id, reference_number, notes, source = "manual",
          payment_method_name, payment_method_code, payment_method,
          amount_cad, exchange_rate_to_cad, exchange_rate_date,
        } = body as Record<string, any>;
        if (!vendor_id || !amount || !payment_date) {
          return jr({ error: "vendor_id, amount, payment_date required" }, 400);
        }
        const insert: Record<string, unknown> = {
          vendor_id, amount, currency, payment_date,
          payment_method_id: payment_method_id || null,
          payment_method: payment_method || null,
          payment_method_name: payment_method_name || null,
          payment_method_code: payment_method_code || null,
          reference_number: reference_number || null,
          notes: notes || null, source,
        };
        if (amount_cad != null) insert.amount_cad = amount_cad;
        if (exchange_rate_to_cad != null) insert.exchange_rate_to_cad = exchange_rate_to_cad;
        if (exchange_rate_date != null) insert.exchange_rate_date = exchange_rate_date;
        const { data, error } = await sb.from("vendor_payments")
          .insert(insert).select("*").single();
        if (error) throw error;
        return jr({ payment: data });
      }

      case "allocate_payment": {
        const { payment_id, allocations } = body as {
          payment_id: string;
          allocations: {
            kind: 'payable' | 'xtrf_invoice';
            target_id: string | number;
            amount: number;
          }[];
        };
        if (!payment_id || !Array.isArray(allocations) || allocations.length === 0) {
          return jr({ error: "payment_id + allocations[] required" }, 400);
        }
        const rows = allocations
          .filter(a => a.target_id != null && Number(a.amount) > 0)
          .map(a => ({
            payment_id,
            payable_id: a.kind === 'payable' ? String(a.target_id) : null,
            xtrf_invoice_id: a.kind === 'xtrf_invoice' ? Number(a.target_id) : null,
            allocated_amount: Number(a.amount),
          }));
        if (rows.length === 0) return jr({ error: "No valid allocations" }, 400);
        const { data, error } = await sb.from("vendor_payment_allocations")
          .insert(rows).select("id");
        if (error) throw error;
        // Mark portal payables fully_paid if balance hits zero.
        for (const r of rows) {
          if (r.payable_id) {
            const { data: agg } = await sb.from("vendor_payment_allocations")
              .select("allocated_amount").eq("payable_id", r.payable_id);
            const sum = (agg ?? []).reduce(
              (s: number, a: any) => s + Number(a.allocated_amount || 0), 0);
            const { data: p } = await sb.from("vendor_payables")
              .select("total").eq("id", r.payable_id).maybeSingle();
            if (p && sum >= Number(p.total || 0)) {
              await sb.from("vendor_payables")
                .update({ paid_at: new Date().toISOString(), status: 'paid' })
                .eq("id", r.payable_id);
            }
          }
        }
        return jr({ inserted: data?.length ?? 0 });
      }

      case "remove_allocation": {
        const allocationId = body.allocation_id as string;
        if (!allocationId) return jr({ error: "allocation_id required" }, 400);
        const { data: alloc } = await sb.from("vendor_payment_allocations")
          .select("payable_id").eq("id", allocationId).maybeSingle();
        const { error } = await sb.from("vendor_payment_allocations")
          .delete().eq("id", allocationId);
        if (error) throw error;
        if (alloc?.payable_id) {
          await sb.from("vendor_payables").update({ paid_at: null })
            .eq("id", alloc.payable_id).eq("status", "paid");
        }
        return jr({ removed: 1 });
      }

      case "delete_payment": {
        const paymentId = body.payment_id as string;
        if (!paymentId) return jr({ error: "payment_id required" }, 400);
        await sb.from("vendor_payment_allocations").delete().eq("payment_id", paymentId);
        const { error } = await sb.from("vendor_payments").delete().eq("id", paymentId);
        if (error) throw error;
        return jr({ deleted: 1 });
      }

      default:
        return jr({ error: `Unknown action: ${action || "(none)"}` }, 400);
    }
  } catch (err: any) {
    console.error("manage-vendor-payments error:", err?.message || err);
    return jr({ error: err?.message || "Internal error" }, 500);
  }
});
