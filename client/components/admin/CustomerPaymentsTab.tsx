import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Link } from "react-router-dom";
import {
  CreditCard,
  Loader2,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";

interface PaymentRow {
  id: string;
  amount: number | null;
  amount_cad: number | null;
  currency: string | null;
  payment_method: string | null;
  payment_method_name: string | null;
  reference_number: string | null;
  payment_date: string | null;
  source: string | null;
  status: string | null;
  notes: string | null;
  unallocated_amount: number | null;
}

interface Allocation {
  payment_id: string;
  invoice_id: string;
  allocated_amount: number;
  invoice_number: string | null;
  invoice_total: number | null;
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
  customerId: string;
}

export default function CustomerPaymentsTab({ customerId }: Props) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [allocations, setAllocations] = useState<Map<string, Allocation[]>>(new Map());
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [methodOptions, setMethodOptions] = useState<string[]>([]);
  const [currencyOptions, setCurrencyOptions] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [methodFilter, sourceFilter, dateFrom, dateTo, currencyFilter]);

  useEffect(() => {
    supabase
      .from("customer_payments")
      .select("payment_method, currency")
      .eq("customer_id", customerId)
      .then(({ data }) => {
        if (!data) return;
        const mSet = new Set<string>();
        const cSet = new Set<string>();
        for (const r of data) {
          if (r.payment_method) mSet.add(r.payment_method as string);
          if (r.currency) cSet.add(r.currency as string);
        }
        setMethodOptions(Array.from(mSet).sort());
        setCurrencyOptions(Array.from(cSet).sort());
      });
  }, [customerId]);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const offset = (page - 1) * PAGE_SIZE;
    let query = supabase
      .from("customer_payments")
      .select(
        `id, amount, amount_cad, currency, payment_method, payment_method_name,
         reference_number, payment_date, source, status, notes, unallocated_amount`,
        { count: "exact" },
      )
      .eq("customer_id", customerId)
      .order("payment_date", { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (search) {
      const esc = search.replace(/[%_,]/g, (m) => `\\${m}`);
      query = query.or(
        `reference_number.ilike.%${esc}%,notes.ilike.%${esc}%,payment_method.ilike.%${esc}%,payment_method_name.ilike.%${esc}%`,
      );
    }
    if (methodFilter.length) query = query.in("payment_method", methodFilter);
    if (currencyFilter.length) query = query.in("currency", currencyFilter);
    if (sourceFilter === "portal") query = query.neq("source", "xtrf_csv_import").neq("source", "xtrf_import");
    if (sourceFilter === "xtrf") query = query.in("source", ["xtrf_csv_import", "xtrf_import"]);
    if (dateFrom) query = query.gte("payment_date", dateFrom);
    if (dateTo) query = query.lte("payment_date", dateTo);

    const { data, count, error } = await query;
    if (error) {
      console.error(error);
      setPayments([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    const rows = (data as PaymentRow[]) || [];
    setPayments(rows);
    setTotalCount(count || 0);

    // Fetch allocations for the visible payments
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const { data: allocs } = await supabase
        .from("customer_payment_allocations")
        .select(
          `payment_id, invoice_id, allocated_amount,
           customer_invoices!inner(invoice_number, total_amount)`,
        )
        .in("payment_id", ids);
      const map = new Map<string, Allocation[]>();
      for (const a of (allocs as any[]) || []) {
        const list = map.get(a.payment_id) || [];
        list.push({
          payment_id: a.payment_id,
          invoice_id: a.invoice_id,
          allocated_amount: a.allocated_amount,
          invoice_number: a.customer_invoices?.invoice_number ?? null,
          invoice_total: a.customer_invoices?.total_amount ?? null,
        });
        map.set(a.payment_id, list);
      }
      setAllocations(map);
    } else {
      setAllocations(new Map());
    }
    setLoading(false);
  }, [customerId, page, search, methodFilter, currencyFilter, sourceFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        search ||
          methodFilter.length ||
          currencyFilter.length ||
          sourceFilter ||
          dateFrom ||
          dateTo,
      ),
    [search, methodFilter, currencyFilter, sourceFilter, dateFrom, dateTo],
  );

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setMethodFilter([]);
    setCurrencyFilter([]);
    setSourceFilter("");
    setDateFrom("");
    setDateTo("");
  };

  const toggleMethod = (m: string) =>
    setMethodFilter((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const toggleCurrency = (c: string) =>
    setCurrencyFilter((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const toggleRow = (id: string) =>
    setExpandedRows((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search reference, notes, method"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="">All sources</option>
            <option value="portal">Portal-recorded</option>
            <option value="xtrf">XTRF-imported</option>
          </select>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md"
          >
            {showAdvanced ? "Hide" : "More"} filters
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 text-sm text-gray-600 hover:text-red-600 inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
        {(methodOptions.length > 0 || currencyOptions.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {methodOptions.map((m) => {
              const active = methodFilter.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMethod(m)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? "bg-teal-50 border-teal-500 text-teal-700"
                      : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        )}
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Payment date</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
              <div className="flex flex-wrap gap-2">
                {currencyOptions.map((c) => {
                  const active = currencyFilter.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCurrency(c)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        active
                          ? "bg-teal-50 border-teal-500 text-teal-700"
                          : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
                {currencyOptions.length === 0 && (
                  <span className="text-xs text-gray-400">No payments yet</span>
                )}
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
                <th className="w-8 px-2 py-2.5"></th>
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-left">Currency</th>
                <th className="px-4 py-2.5 text-right">CAD</th>
                <th className="px-4 py-2.5 text-left">Method</th>
                <th className="px-4 py-2.5 text-left">Receiving account / ref</th>
                <th className="px-4 py-2.5 text-left">Source</th>
                <th className="px-4 py-2.5 text-left">Invoices paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading…
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    <CreditCard className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                    {hasActiveFilters
                      ? "No matches for current filters"
                      : "No payments yet for this customer"}
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const allocs = allocations.get(p.id) || [];
                  const expanded = expandedRows.has(p.id);
                  return (
                    <>
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-2 py-2.5 text-center">
                          {allocs.length > 0 && (
                            <button
                              onClick={() => toggleRow(p.id)}
                              className="text-gray-400 hover:text-teal-600"
                              aria-label={expanded ? "Collapse" : "Expand"}
                            >
                              {expanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{fmtDate(p.payment_date)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-900">
                          {fmt(p.amount, p.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{p.currency || "—"}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">
                          {fmt(p.amount_cad, "CAD")}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {p.payment_method_name || p.payment_method || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          {p.reference_number || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">
                          {p.source?.startsWith("xtrf") ? "XTRF" : p.source || "Portal"}
                        </td>
                        <td className="px-4 py-2.5">
                          {allocs.length === 0 ? (
                            <span className="text-xs text-gray-400">Unallocated</span>
                          ) : (
                            <span className="text-xs text-gray-700">
                              {allocs.length === 1
                                ? allocs[0].invoice_number || "—"
                                : `${allocs.length} invoices`}
                            </span>
                          )}
                        </td>
                      </tr>
                      {expanded && allocs.length > 0 && (
                        <tr className="bg-gray-50">
                          <td></td>
                          <td colSpan={8} className="px-4 py-3">
                            <div className="text-xs text-gray-500 mb-1">Allocations:</div>
                            <div className="space-y-1">
                              {allocs.map((a) => (
                                <div
                                  key={`${a.payment_id}-${a.invoice_id}`}
                                  className="flex items-center justify-between text-xs text-gray-700 bg-white border border-gray-200 rounded px-2 py-1"
                                >
                                  <Link
                                    to={`/admin/invoices/customer/${a.invoice_id}`}
                                    className="font-mono text-teal-600 hover:text-teal-700"
                                  >
                                    {a.invoice_number || a.invoice_id.slice(0, 8)}
                                  </Link>
                                  <span className="text-gray-600">
                                    {fmt(a.allocated_amount, p.currency)} of {fmt(a.invoice_total, p.currency)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of{" "}
              {totalCount}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 border border-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-xs text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 border border-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
