import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  DollarSign,
  AlertTriangle,
  Clock,
  TrendingUp,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface OpenInvoice {
  id: string;
  kind: "payable" | "xtrf_invoice";
  vendor_id: string | null;
  vendor_name: string;
  xtrf_vendor_id: number | null;
  invoice_number: string;
  total_amount: number;
  total_cad: number;
  amount_paid: number;
  balance_due: number;
  invoice_date: string | null;
  due_date: string | null;
  days_overdue: number;
  currency: string;
}

interface VendorRow {
  vendor_id: string | null;
  vendor_name: string;
  xtrf_vendor_id: number | null;
  invoice_count: number;
  total_cad: number;
  current_cad: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
}

const PAGE_SIZE = 25;

function fmt(amount: number | null, code: string = "CAD"): string {
  if (amount == null) return "—";
  try {
    return amount.toLocaleString("en-CA", { style: "currency", currency: code, minimumFractionDigits: 2 });
  } catch {
    return `${code} ${(amount || 0).toFixed(2)}`;
  }
}

function fmtDate(val: string | null): string {
  if (!val) return "—";
  try {
    return format(new Date(val), "MMM d, yyyy");
  } catch {
    return val;
  }
}

function bucketize(daysOver: number): keyof Omit<VendorRow, "vendor_id" | "vendor_name" | "xtrf_vendor_id" | "invoice_count" | "total_cad"> {
  if (daysOver <= 0) return "current_cad";
  if (daysOver <= 30) return "days_1_30";
  if (daysOver <= 60) return "days_31_60";
  if (daysOver <= 90) return "days_61_90";
  return "days_90_plus";
}

type View = "by_vendor" | "by_invoice";

export default function AccountsPayable() {
  const [view, setView] = useState<View>("by_vendor");
  const [rawInvoices, setRawInvoices] = useState<OpenInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [bucketFilter, setBucketFilter] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [sourceFilter, bucketFilter, view]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    // 1. All vendors (small lookup map)
    const vendorById = new Map<string, { id: string; full_name: string; xtrf_vendor_id: number | null }>();
    const vendorByXtrf = new Map<number, { id: string; full_name: string; xtrf_vendor_id: number | null }>();
    {
      let from = 0; const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("vendors")
          .select("id, full_name, xtrf_vendor_id")
          .range(from, from + PAGE - 1);
        if (error) { console.error(error); break; }
        if (!data || data.length === 0) break;
        for (const v of data) {
          vendorById.set(v.id as string, v as any);
          if (v.xtrf_vendor_id != null) vendorByXtrf.set(v.xtrf_vendor_id as number, v as any);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }

    // 2. Portal vendor_payables — unpaid
    const portalOpen: OpenInvoice[] = [];
    {
      let from = 0; const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("vendor_payables")
          .select("id, vendor_id, step_name, vendor_invoice_number, vendor_invoice_date, total, total_cad, currency, status, paid_at, voided_at")
          .is("voided_at", null).is("paid_at", null)
          .not("status", "in", "(cancelled,voided)")
          .range(from, from + PAGE - 1);
        if (error) { console.error(error); break; }
        if (!data || data.length === 0) break;
        for (const p of data as any[]) {
          const total = Number(p.total || 0);
          const cad = Number(p.total_cad ?? p.total ?? 0);
          if (total <= 0) continue;
          const v = p.vendor_id ? vendorById.get(p.vendor_id) : null;
          const due = p.vendor_invoice_date || null;
          const days = due ? differenceInDays(new Date(today), new Date(due)) : 0;
          portalOpen.push({
            id: p.id, kind: "payable",
            vendor_id: p.vendor_id, vendor_name: v?.full_name || "(unknown)",
            xtrf_vendor_id: v?.xtrf_vendor_id ?? null,
            invoice_number: p.vendor_invoice_number || p.step_name || p.id.slice(0, 8),
            total_amount: total, total_cad: cad, amount_paid: 0, balance_due: total,
            invoice_date: due, due_date: due, days_overdue: days,
            currency: p.currency || "CAD",
          });
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }

    // 3. XTRF cache — payment_status != FULLY_PAID
    const xtrfOpen: OpenInvoice[] = [];
    {
      let from = 0; const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("xtrf_vendor_invoice_cache")
          .select("id, provider_id, vendor_name, internal_number, final_number, total_gross, gross_cad, currency_id, payment_status, final_date, payment_due_date")
          .in("payment_status", ["NOT_PAID", "UNPAID", "PARTIALLY_PAID"])
          .range(from, from + PAGE - 1);
        if (error) { console.error(error); break; }
        if (!data || data.length === 0) break;
        for (const r of data as any[]) {
          const total = Number(r.total_gross || 0);
          const cad = Number(r.gross_cad ?? r.total_gross ?? 0);
          if (total <= 0) continue;
          const v = r.provider_id ? vendorByXtrf.get(r.provider_id) : null;
          const due = r.payment_due_date || null;
          const days = due ? differenceInDays(new Date(today), new Date(due)) : 0;
          xtrfOpen.push({
            id: String(r.id), kind: "xtrf_invoice",
            vendor_id: v?.id ?? null, vendor_name: r.vendor_name || v?.full_name || "(unknown)",
            xtrf_vendor_id: r.provider_id,
            invoice_number: r.internal_number || r.final_number || `xtrf-${r.id}`,
            total_amount: total, total_cad: cad, amount_paid: 0, balance_due: total,
            invoice_date: r.final_date, due_date: due, days_overdue: days,
            currency: "CAD",
          });
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }
    setRawInvoices([...portalOpen, ...xtrfOpen]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filters
  const filteredInvoices = useMemo(() => {
    return rawInvoices.filter((inv) => {
      if (search) {
        const q = search.toLowerCase();
        if (!(inv.vendor_name.toLowerCase().includes(q) || inv.invoice_number.toLowerCase().includes(q))) return false;
      }
      if (sourceFilter === "portal" && inv.kind !== "payable") return false;
      if (sourceFilter === "xtrf" && inv.kind !== "xtrf_invoice") return false;
      if (bucketFilter) {
        const d = inv.days_overdue;
        if (bucketFilter === "current" && d > 0) return false;
        if (bucketFilter === "1_30" && (d <= 0 || d > 30)) return false;
        if (bucketFilter === "31_60" && (d <= 30 || d > 60)) return false;
        if (bucketFilter === "61_90" && (d <= 60 || d > 90)) return false;
        if (bucketFilter === "90_plus" && d <= 90) return false;
      }
      return true;
    });
  }, [rawInvoices, search, sourceFilter, bucketFilter]);

  // Aggregate stats
  const stats = useMemo(() => {
    let total = 0, current = 0, b1_30 = 0, b31_60 = 0, b61_90 = 0, b90 = 0;
    for (const r of filteredInvoices) {
      total += r.total_cad;
      const bucket = bucketize(r.days_overdue);
      if (bucket === "current_cad") current += r.total_cad;
      else if (bucket === "days_1_30") b1_30 += r.total_cad;
      else if (bucket === "days_31_60") b31_60 += r.total_cad;
      else if (bucket === "days_61_90") b61_90 += r.total_cad;
      else b90 += r.total_cad;
    }
    return { total, current, b1_30, b31_60, b61_90, b90, count: filteredInvoices.length };
  }, [filteredInvoices]);

  // By-vendor grouping
  const vendorRows = useMemo<VendorRow[]>(() => {
    const map = new Map<string, VendorRow>();
    for (const inv of filteredInvoices) {
      const key = inv.vendor_id || `name:${inv.vendor_name}`;
      let row = map.get(key);
      if (!row) {
        row = {
          vendor_id: inv.vendor_id, vendor_name: inv.vendor_name,
          xtrf_vendor_id: inv.xtrf_vendor_id,
          invoice_count: 0, total_cad: 0,
          current_cad: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0,
        };
        map.set(key, row);
      }
      row.invoice_count += 1;
      row.total_cad += inv.total_cad;
      const b = bucketize(inv.days_overdue);
      (row as any)[b] += inv.total_cad;
    }
    return Array.from(map.values()).sort((a, b) => b.total_cad - a.total_cad);
  }, [filteredInvoices]);

  const totalPages = Math.max(1, Math.ceil(
    (view === "by_vendor" ? vendorRows.length : filteredInvoices.length) / PAGE_SIZE
  ));
  const pageRows = (view === "by_vendor" ? vendorRows : filteredInvoices).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasActiveFilters = Boolean(search || sourceFilter || bucketFilter);

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Accounts Payable</h1>
          <p className="text-sm text-gray-500 mt-1">
            Open vendor balances — portal payables + XTRF-imported invoices.
          </p>
        </div>
        <button onClick={() => loadData()} className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">
          <RotateCcw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-3 col-span-2 md:col-span-1">
          <div className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Total open</div>
          <div className="text-xl font-semibold text-indigo-700">{fmt(stats.total, "CAD")}</div>
          <div className="text-xs text-gray-500 mt-1">{stats.count} invoices</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Current</div>
          <div className="text-lg font-semibold text-green-700">{fmt(stats.current, "CAD")}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">1–30 days</div>
          <div className="text-lg font-semibold text-amber-700">{fmt(stats.b1_30, "CAD")}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">31–60 days</div>
          <div className="text-lg font-semibold text-orange-700">{fmt(stats.b31_60, "CAD")}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">61+ days</div>
          <div className="text-lg font-semibold text-red-700">{fmt(stats.b61_90 + stats.b90, "CAD")}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search vendor name or invoice number"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div className="flex items-center gap-1 border border-gray-300 rounded-md p-0.5">
            <button onClick={() => setView("by_vendor")}
              className={`px-3 py-1 text-xs font-medium rounded ${view === "by_vendor" ? "bg-teal-50 text-teal-700" : "text-gray-600 hover:bg-gray-50"}`}>
              By vendor
            </button>
            <button onClick={() => setView("by_invoice")}
              className={`px-3 py-1 text-xs font-medium rounded ${view === "by_invoice" ? "bg-teal-50 text-teal-700" : "text-gray-600 hover:bg-gray-50"}`}>
              By invoice
            </button>
          </div>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
            <option value="">All sources</option>
            <option value="portal">Portal payables</option>
            <option value="xtrf">XTRF imports</option>
          </select>
          <select value={bucketFilter} onChange={(e) => setBucketFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
            <option value="">All aging buckets</option>
            <option value="current">Current</option>
            <option value="1_30">1–30 days</option>
            <option value="31_60">31–60 days</option>
            <option value="61_90">61–90 days</option>
            <option value="90_plus">90+ days</option>
          </select>
          {hasActiveFilters && (
            <button onClick={() => { setSearchInput(""); setSearch(""); setSourceFilter(""); setBucketFilter(""); }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-red-600">Reset</button>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {view === "by_vendor" ? (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Vendor</th>
                  <th className="px-4 py-2.5 text-right">Invoices</th>
                  <th className="px-4 py-2.5 text-right">Total (CAD)</th>
                  <th className="px-4 py-2.5 text-right">Current</th>
                  <th className="px-4 py-2.5 text-right">1–30</th>
                  <th className="px-4 py-2.5 text-right">31–60</th>
                  <th className="px-4 py-2.5 text-right">61–90</th>
                  <th className="px-4 py-2.5 text-right">90+</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
                  </td></tr>
                ) : (pageRows as VendorRow[]).length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No open AP</td></tr>
                ) : (
                  (pageRows as VendorRow[]).map((r) => (
                    <tr key={r.vendor_id || r.vendor_name} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        {r.vendor_id ? (
                          <Link to={`/admin/vendors/${r.vendor_id}?tab=invoices`} className="text-teal-600 hover:text-teal-700 font-medium">
                            {r.vendor_name}
                          </Link>
                        ) : (
                          <span className="text-gray-700">{r.vendor_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{r.invoice_count}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900 font-semibold">{fmt(r.total_cad, "CAD")}</td>
                      <td className="px-4 py-2.5 text-right text-green-700">{fmt(r.current_cad, "CAD")}</td>
                      <td className="px-4 py-2.5 text-right text-amber-700">{fmt(r.days_1_30, "CAD")}</td>
                      <td className="px-4 py-2.5 text-right text-orange-700">{fmt(r.days_31_60, "CAD")}</td>
                      <td className="px-4 py-2.5 text-right text-red-700">{fmt(r.days_61_90, "CAD")}</td>
                      <td className="px-4 py-2.5 text-right text-red-700 font-semibold">{fmt(r.days_90_plus, "CAD")}</td>
                      <td className="px-4 py-2.5 text-right">
                        {r.vendor_id && (
                          <Link to={`/admin/vendors/${r.vendor_id}?tab=invoices`} className="text-gray-400 hover:text-teal-600">
                            <ExternalLink className="w-4 h-4 inline" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Vendor</th>
                  <th className="px-4 py-2.5 text-left">Invoice #</th>
                  <th className="px-4 py-2.5 text-left">Source</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Due</th>
                  <th className="px-4 py-2.5 text-right">Days OD</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">CAD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
                  </td></tr>
                ) : (pageRows as OpenInvoice[]).length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No open AP</td></tr>
                ) : (
                  (pageRows as OpenInvoice[]).map((r) => (
                    <tr key={`${r.kind}:${r.id}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        {r.vendor_id ? (
                          <Link to={`/admin/vendors/${r.vendor_id}?tab=invoices`} className="text-teal-600 hover:text-teal-700">
                            {r.vendor_name}
                          </Link>
                        ) : r.vendor_name}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.invoice_number}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{r.kind === "xtrf_invoice" ? "XTRF" : "Portal"}</td>
                      <td className="px-4 py-2.5 text-gray-600">{fmtDate(r.invoice_date)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{fmtDate(r.due_date)}</td>
                      <td className={`px-4 py-2.5 text-right ${r.days_overdue > 60 ? "text-red-700 font-medium" : r.days_overdue > 0 ? "text-amber-700" : "text-gray-500"}`}>
                        {r.days_overdue > 0 ? r.days_overdue : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900">{fmt(r.total_amount, r.currency)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900">{fmt(r.total_cad, "CAD")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        {((view === "by_vendor" ? vendorRows.length : filteredInvoices.length) > PAGE_SIZE) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1.5 border border-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1.5 border border-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
