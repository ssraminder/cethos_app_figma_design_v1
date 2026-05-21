import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { CreditCard, Loader2, Search, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { VendorPageData } from "./types";

interface PaymentRow {
  paymentId: string;
  invoiceId: number;
  internal_number: string | null;
  final_number: string | null;
  amount: number;
  currency_code: string;
  amount_cad: number | null;
  payment_date: string | null;
  payment_method: string;
  notes: string;
}

const PAGE_SIZE = 25;

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

export default function VendorPaymentsTab({ vendorData }: Props) {
  const xtrfVendorId = vendorData?.vendor?.xtrf_vendor_id ?? null;

  const [allPayments, setAllPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo]);

  const load = useCallback(async () => {
    if (!xtrfVendorId) {
      setAllPayments([]); setLoading(false); return;
    }
    setLoading(true);

    const [{ data: invs }, { data: ccyMap }, { data: pmMap }] = await Promise.all([
      supabase
        .from("xtrf_vendor_invoice_cache")
        .select("id, internal_number, final_number, currency_id, gross_cad, total_gross, payments")
        .eq("provider_id", xtrfVendorId)
        .not("payments", "is", null),
      supabase.from("xtrf_currency_map").select("xtrf_currency_id, iso_code"),
      supabase.from("xtrf_payment_methods").select("id, name"),
    ]);

    const ccy = new Map<number, string>();
    for (const r of ccyMap ?? []) ccy.set(r.xtrf_currency_id as number, r.iso_code as string);
    const pm = new Map<number, string>();
    for (const r of pmMap ?? []) pm.set(r.id as number, r.name as string);

    const rows: PaymentRow[] = [];
    for (const inv of (invs ?? []) as any[]) {
      const payments = Array.isArray(inv.payments) ? inv.payments : [];
      if (payments.length === 0) continue;
      const code = ccy.get(inv.currency_id ?? -1) || "CAD";
      const grossPerInvoice = Number(inv.gross_cad ?? inv.total_gross ?? 0);
      const sumPayments = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      payments.forEach((p: any, i: number) => {
        const amt = Number(p.amount || 0);
        const ratio = sumPayments > 0 ? amt / sumPayments : 1;
        rows.push({
          paymentId: `${inv.id}:${i}`,
          invoiceId: inv.id,
          internal_number: inv.internal_number,
          final_number: inv.final_number,
          amount: amt,
          currency_code: code,
          amount_cad: grossPerInvoice * ratio || null,
          payment_date: p.payment_date || null,
          payment_method: pm.get(p.payment_method_id) || "—",
          notes: p.notes || "",
        });
      });
    }
    rows.sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || ""));

    setAllPayments(rows);
    setLoading(false);
  }, [xtrfVendorId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return allPayments.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (!(r.internal_number?.toLowerCase().includes(q) ||
              r.final_number?.toLowerCase().includes(q) ||
              r.notes?.toLowerCase().includes(q) ||
              r.payment_method?.toLowerCase().includes(q))) return false;
      }
      if (dateFrom && (!r.payment_date || r.payment_date < dateFrom)) return false;
      if (dateTo && (!r.payment_date || r.payment_date > dateTo)) return false;
      return true;
    });
  }, [allPayments, search, dateFrom, dateTo]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    let sumNative = new Map<string, number>();
    let sumCad = 0;
    for (const r of filtered) {
      sumNative.set(r.currency_code, (sumNative.get(r.currency_code) || 0) + r.amount);
      if (r.amount_cad) sumCad += r.amount_cad;
    }
    return { sumNative, sumCad };
  }, [filtered]);

  const hasActiveFilters = Boolean(search || dateFrom || dateTo);

  if (!xtrfVendorId) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <CreditCard className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-500">
          This vendor has no <code>xtrf_vendor_id</code> set. Payment history is sourced from the XTRF cache.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Total payments</div>
          <div className="text-xl font-semibold text-gray-900">{totalCount}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Total paid (CAD est.)</div>
          <div className="text-xl font-semibold text-green-700">{fmt(totals.sumCad, "CAD")}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">By currency</div>
          <div className="text-xs text-gray-700 mt-1 space-y-0.5">
            {Array.from(totals.sumNative.entries()).map(([code, amt]) => (
              <div key={code}>{fmt(amt, code)}</div>
            ))}
            {totals.sumNative.size === 0 && <span className="text-gray-400">—</span>}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search invoice #, method, notes"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500">Paid between</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-md text-sm" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-md text-sm" />
          </div>
          {hasActiveFilters && (
            <button type="button" onClick={() => { setSearchInput(""); setSearch(""); setDateFrom(""); setDateTo(""); }} className="px-3 py-2 text-sm text-gray-600 hover:text-red-600 inline-flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Payment date</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-left">Currency</th>
                <th className="px-4 py-2.5 text-right">CAD (est.)</th>
                <th className="px-4 py-2.5 text-left">Method</th>
                <th className="px-4 py-2.5 text-left">Invoice paid</th>
                <th className="px-4 py-2.5 text-left">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
                </td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  <CreditCard className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                  {hasActiveFilters ? "No matches for current filters" : "No payments recorded for this vendor"}
                </td></tr>
              ) : (
                pageRows.map((r) => (
                  <tr key={r.paymentId} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600">{fmtDate(r.payment_date)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-900">{fmt(r.amount, r.currency_code)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.currency_code}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{fmt(r.amount_cad, "CAD")}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.payment_method}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.internal_number || r.final_number || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{r.notes || "—"}</td>
                  </tr>
                ))
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
