import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import type { VendorPageData } from "./types";

interface VendorInvoice {
  id: number;
  internal_number: string | null;
  final_number: string | null;
  draft_number: string | null;
  provider_id: number | null;
  currency_id: number | null;
  total_gross: number | null;
  total_netto: number | null;
  gross_cad: number | null;
  netto_cad: number | null;
  tax_cad: number | null;
  status: string | null;
  payment_status: string | null;
  draft_date: string | null;
  final_date: string | null;
  payment_due_date: string | null;
  last_payment_date: string | null;
  notes_from_provider: string | null;
}

interface Currency {
  xtrf_currency_id: number;
  iso_code: string;
}

interface Stats {
  total: number;
  paidCount: number;
  paidCad: number;
  openCount: number;
  openCad: number;
  overdueCount: number;
  overdueCad: number;
}

const PAGE_SIZE = 25;

const PAYMENT_STATUS_OPTIONS = [
  { value: "FULLY_PAID", label: "Paid" },
  { value: "PARTIALLY_PAID", label: "Partial" },
  { value: "NOT_PAID", label: "Unpaid" },
  { value: "UNPAID", label: "Unpaid (legacy)" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  FULLY_PAID: "bg-green-100 text-green-700",
  PARTIALLY_PAID: "bg-yellow-100 text-yellow-700",
  NOT_PAID: "bg-indigo-100 text-indigo-700",
  UNPAID: "bg-indigo-100 text-indigo-700",
};

function fmt(amount: number | null, code: string | null): string {
  if (amount == null) return "—";
  try {
    return amount.toLocaleString("en-CA", {
      style: "currency",
      currency: code || "CAD",
      minimumFractionDigits: 2,
    });
  } catch {
    return `${code || ""} ${amount.toFixed(2)}`;
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

interface Props {
  vendorData: VendorPageData;
}

export default function VendorInvoicesTab({ vendorData }: Props) {
  const xtrfVendorId = vendorData?.vendor?.xtrf_vendor_id ?? null;

  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [currencyMap, setCurrencyMap] = useState<Map<number, string>>(new Map());

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [stats, setStats] = useState<Stats>({
    total: 0, paidCount: 0, paidCad: 0, openCount: 0, openCad: 0, overdueCount: 0, overdueCad: 0,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    supabase.from("xtrf_currency_map").select("xtrf_currency_id, iso_code").then(({ data }) => {
      if (!data) return;
      const map = new Map<number, string>();
      for (const r of data) map.set(r.xtrf_currency_id as number, r.iso_code as string);
      setCurrencyMap(map);
    });
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [paymentStatusFilter, dateFrom, dateTo]);

  const fetchStats = useCallback(async () => {
    if (!xtrfVendorId) return;
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("xtrf_vendor_invoice_cache")
      .select("payment_status, gross_cad, total_gross, payment_due_date")
      .eq("provider_id", xtrfVendorId);
    if (!data) return;
    let total = 0, paidCount = 0, paidCad = 0, openCount = 0, openCad = 0, overdueCount = 0, overdueCad = 0;
    for (const r of data) {
      total += 1;
      const cad = Number(r.gross_cad || r.total_gross || 0);
      if (r.payment_status === "FULLY_PAID") {
        paidCount += 1;
        paidCad += cad;
      } else {
        openCount += 1;
        openCad += cad;
        if (r.payment_due_date && r.payment_due_date < today) {
          overdueCount += 1;
          overdueCad += cad;
        }
      }
    }
    setStats({ total, paidCount, paidCad, openCount, openCad, overdueCount, overdueCad });
  }, [xtrfVendorId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const fetchInvoices = useCallback(async () => {
    if (!xtrfVendorId) {
      setInvoices([]); setTotalCount(0); setLoading(false);
      return;
    }
    setLoading(true);
    const offset = (page - 1) * PAGE_SIZE;
    let query = supabase
      .from("xtrf_vendor_invoice_cache")
      .select(
        `id, internal_number, final_number, draft_number, provider_id, currency_id,
         total_gross, total_netto, gross_cad, netto_cad, tax_cad, status, payment_status,
         draft_date, final_date, payment_due_date, last_payment_date, notes_from_provider`,
        { count: "exact" },
      )
      .eq("provider_id", xtrfVendorId)
      .order("final_date", { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (search) {
      const esc = search.replace(/[%_,]/g, (m) => `\\${m}`);
      query = query.or(
        `internal_number.ilike.%${esc}%,final_number.ilike.%${esc}%,draft_number.ilike.%${esc}%`,
      );
    }
    if (paymentStatusFilter.length) query = query.in("payment_status", paymentStatusFilter);
    if (dateFrom) query = query.gte("final_date", dateFrom);
    if (dateTo) query = query.lte("final_date", dateTo);

    const { data, count, error } = await query;
    if (error) {
      console.error(error);
      setInvoices([]); setTotalCount(0);
    } else {
      setInvoices((data as VendorInvoice[]) || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [xtrfVendorId, page, search, paymentStatusFilter, dateFrom, dateTo]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasActiveFilters = useMemo(
    () => Boolean(search || paymentStatusFilter.length || dateFrom || dateTo),
    [search, paymentStatusFilter, dateFrom, dateTo],
  );

  const resetFilters = () => {
    setSearchInput(""); setSearch(""); setPaymentStatusFilter([]);
    setDateFrom(""); setDateTo("");
  };

  const toggleStatus = (s: string) =>
    setPaymentStatusFilter((p) => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  if (!xtrfVendorId) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-500">
          This vendor has no <code>xtrf_vendor_id</code> set. Invoices are sourced from the XTRF cache and need that link.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Total invoices</div>
          <div className="text-xl font-semibold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Paid (CAD)</div>
          <div className="text-xl font-semibold text-green-700">{stats.paidCount}</div>
          <div className="text-xs text-gray-500 mt-1">{fmt(stats.paidCad, "CAD")}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Outstanding (CAD)</div>
          <div className="text-xl font-semibold text-indigo-700">{stats.openCount}</div>
          <div className="text-xs text-gray-500 mt-1">{fmt(stats.openCad, "CAD")}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Overdue (CAD)</div>
          <div className="text-xl font-semibold text-red-700">{stats.overdueCount}</div>
          <div className="text-xs text-gray-500 mt-1">{fmt(stats.overdueCad, "CAD")}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search invoice / final / draft number"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button type="button" onClick={() => setShowAdvanced(v => !v)} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md">
            {showAdvanced ? "Hide" : "More"} filters
          </button>
          {hasActiveFilters && (
            <button type="button" onClick={resetFilters} className="px-3 py-2 text-sm text-gray-600 hover:text-red-600 inline-flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_STATUS_OPTIONS.map((s) => {
            const active = paymentStatusFilter.includes(s.value);
            return (
              <button key={s.value} type="button" onClick={() => toggleStatus(s.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active ? "bg-teal-50 border-teal-500 text-teal-700" : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}>{s.label}</button>
            );
          })}
        </div>
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Invoice date</label>
              <div className="flex gap-2">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm" />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Internal #</th>
                <th className="px-4 py-2.5 text-left">Vendor #</th>
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Due</th>
                <th className="px-4 py-2.5 text-right">Gross</th>
                <th className="px-4 py-2.5 text-right">Gross (CAD)</th>
                <th className="px-4 py-2.5 text-right">Tax (CAD)</th>
                <th className="px-4 py-2.5 text-left">Payment</th>
                <th className="px-4 py-2.5 text-left">Paid on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
                </td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  <FileText className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                  {hasActiveFilters ? "No matches for current filters" : "No invoices for this vendor"}
                </td></tr>
              ) : (
                invoices.map((inv) => {
                  const code = currencyMap.get(inv.currency_id ?? -1) || "CAD";
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{inv.internal_number || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{inv.final_number || inv.draft_number || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-600">{fmtDate(inv.final_date || inv.draft_date)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{fmtDate(inv.payment_due_date)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900">{fmt(inv.total_gross, code)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900">{fmt(inv.gross_cad, "CAD")}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{fmt(inv.tax_cad && inv.tax_cad > 0 ? inv.tax_cad : null, "CAD")}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[inv.payment_status || ""] || "bg-gray-100 text-gray-600"}`}>
                          {inv.payment_status === "FULLY_PAID" ? "Paid" : inv.payment_status === "PARTIALLY_PAID" ? "Partial" : "Unpaid"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{fmtDate(inv.last_payment_date)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1.5 border border-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-xs text-gray-600">Page {page} of {totalPages}</span>
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
