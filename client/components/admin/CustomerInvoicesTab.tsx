import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Link } from "react-router-dom";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";

interface CustomerInvoice {
  id: string;
  invoice_number: string | null;
  order_id: string | null;
  subtotal: number | null;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  status: string | null;
  type: string | null;
  invoice_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  currency: string | null;
  po_number: string | null;
  client_project_number: string | null;
  xtrf_invoice_id: number | null;
}

interface Stats {
  total: number;
  totalValue: number;
  paid: number;
  paidValue: number;
  outstanding: number;
  outstandingValue: number;
  overdue: number;
  overdueValue: number;
}

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700",
  sent: "bg-indigo-100 text-indigo-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-400 line-through",
  draft: "bg-gray-100 text-gray-600",
};

function fmt(amount: number | null, currency: string | null): string {
  if (amount == null) return "—";
  try {
    return amount.toLocaleString("en-CA", {
      style: "currency",
      currency: currency || "CAD",
      minimumFractionDigits: 2,
    });
  } catch {
    return `${currency || ""} ${amount.toFixed(2)}`;
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

type SourceFilter = "all" | "portal" | "xtrf";

interface Props {
  customerId: string;
}

export default function CustomerInvoicesTab({ customerId }: Props) {
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [stats, setStats] = useState<Stats>({
    total: 0,
    totalValue: 0,
    paid: 0,
    paidValue: 0,
    outstanding: 0,
    outstandingValue: 0,
    overdue: 0,
    overdueValue: 0,
  });

  const [currencyOptions, setCurrencyOptions] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Reset page when other filters change
  useEffect(() => {
    setPage(1);
  }, [
    statusFilter,
    typeFilter,
    sourceFilter,
    dateFrom,
    dateTo,
    dueFrom,
    dueTo,
    amountMin,
    amountMax,
    currencyFilter,
  ]);

  // Currency options derived from this customer's invoices
  useEffect(() => {
    supabase
      .from("customer_invoices")
      .select("currency")
      .eq("customer_id", customerId)
      .then(({ data }) => {
        if (!data) return;
        const set = new Set<string>();
        for (const r of data) if (r.currency) set.add(r.currency as string);
        setCurrencyOptions(Array.from(set).sort());
      });
  }, [customerId]);

  // Stats — always computed across all filters except pagination
  const fetchStats = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    const baseFilter = supabase
      .from("customer_invoices")
      .select("status, total_amount, amount_paid, balance_due, due_date", {
        count: "exact",
      })
      .eq("customer_id", customerId);
    const { data } = await baseFilter;
    if (!data) return;
    let total = 0,
      totalValue = 0,
      paid = 0,
      paidValue = 0,
      outstanding = 0,
      outstandingValue = 0,
      overdue = 0,
      overdueValue = 0;
    for (const r of data) {
      total += 1;
      totalValue += Number(r.total_amount || 0);
      if (r.status === "paid") {
        paid += 1;
        paidValue += Number(r.amount_paid || 0);
      }
      if (["issued", "sent", "overdue"].includes(r.status || "")) {
        outstanding += 1;
        outstandingValue += Number(r.balance_due || 0);
        if (r.due_date && r.due_date < today && Number(r.balance_due || 0) > 0) {
          overdue += 1;
          overdueValue += Number(r.balance_due || 0);
        }
      }
    }
    setStats({
      total,
      totalValue,
      paid,
      paidValue,
      outstanding,
      outstandingValue,
      overdue,
      overdueValue,
    });
  }, [customerId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const offset = (page - 1) * PAGE_SIZE;
    let query = supabase
      .from("customer_invoices")
      .select(
        `id, invoice_number, order_id, subtotal, total_amount, amount_paid,
         balance_due, status, type, invoice_date, due_date, paid_at, currency,
         po_number, client_project_number, xtrf_invoice_id`,
        { count: "exact" },
      )
      .eq("customer_id", customerId)
      .order("invoice_date", { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (search) {
      const esc = search.replace(/[%_,]/g, (m) => `\\${m}`);
      query = query.or(
        `invoice_number.ilike.%${esc}%,po_number.ilike.%${esc}%,client_project_number.ilike.%${esc}%`,
      );
    }
    if (statusFilter.length) query = query.in("status", statusFilter);
    if (typeFilter) query = query.eq("type", typeFilter);
    if (sourceFilter === "portal") query = query.is("xtrf_invoice_id", null);
    if (sourceFilter === "xtrf") query = query.not("xtrf_invoice_id", "is", null);
    if (dateFrom) query = query.gte("invoice_date", dateFrom);
    if (dateTo) query = query.lte("invoice_date", dateTo);
    if (dueFrom) query = query.gte("due_date", dueFrom);
    if (dueTo) query = query.lte("due_date", dueTo);
    if (amountMin) query = query.gte("total_amount", parseFloat(amountMin));
    if (amountMax) query = query.lte("total_amount", parseFloat(amountMax));
    if (currencyFilter.length) query = query.in("currency", currencyFilter);

    const { data, count, error } = await query;
    if (error) {
      console.error(error);
      setInvoices([]);
      setTotalCount(0);
    } else {
      setInvoices((data as CustomerInvoice[]) || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [
    customerId,
    page,
    search,
    statusFilter,
    typeFilter,
    sourceFilter,
    dateFrom,
    dateTo,
    dueFrom,
    dueTo,
    amountMin,
    amountMax,
    currencyFilter,
  ]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        search ||
          statusFilter.length ||
          typeFilter ||
          sourceFilter !== "all" ||
          dateFrom ||
          dateTo ||
          dueFrom ||
          dueTo ||
          amountMin ||
          amountMax ||
          currencyFilter.length,
      ),
    [
      search,
      statusFilter,
      typeFilter,
      sourceFilter,
      dateFrom,
      dateTo,
      dueFrom,
      dueTo,
      amountMin,
      amountMax,
      currencyFilter,
    ],
  );

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatusFilter([]);
    setTypeFilter("");
    setSourceFilter("all");
    setDateFrom("");
    setDateTo("");
    setDueFrom("");
    setDueTo("");
    setAmountMin("");
    setAmountMax("");
    setCurrencyFilter([]);
  };

  const toggleStatus = (s: string) => {
    setStatusFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };
  const toggleCurrency = (c: string) => {
    setCurrencyFilter((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Total invoices</div>
          <div className="text-xl font-semibold text-gray-900">{stats.total}</div>
          <div className="text-xs text-gray-500 mt-1">{fmt(stats.totalValue, "CAD")}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Paid</div>
          <div className="text-xl font-semibold text-green-700">{stats.paid}</div>
          <div className="text-xs text-gray-500 mt-1">{fmt(stats.paidValue, "CAD")}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Outstanding</div>
          <div className="text-xl font-semibold text-indigo-700">{stats.outstanding}</div>
          <div className="text-xs text-gray-500 mt-1">{fmt(stats.outstandingValue, "CAD")}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Overdue</div>
          <div className="text-xl font-semibold text-red-700">{stats.overdue}</div>
          <div className="text-xs text-gray-500 mt-1">{fmt(stats.overdueValue, "CAD")}</div>
        </div>
      </div>

      {/* Primary filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search invoice #, PO #, project #"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="all">All sources</option>
            <option value="portal">Portal-native</option>
            <option value="xtrf">XTRF imports</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="">All types</option>
            <option value="invoice">Invoice</option>
            <option value="credit_note">Credit note</option>
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

        {/* Status chips */}
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => {
            const active = statusFilter.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleStatus(s.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-teal-50 border-teal-500 text-teal-700"
                    : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Invoice date
              </label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Due date
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dueFrom}
                  onChange={(e) => setDueFrom(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
                <input
                  type="date"
                  value={dueTo}
                  onChange={(e) => setDueTo(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Amount (total)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Min"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Max"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Currency
              </label>
              <div className="flex flex-wrap gap-2">
                {currencyOptions.length === 0 && (
                  <span className="text-xs text-gray-400">No invoices yet</span>
                )}
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
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Invoice #</th>
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Due</th>
                <th className="px-4 py-2.5 text-left">PO / Project</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Paid</th>
                <th className="px-4 py-2.5 text-right">Balance</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Source</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading…
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    <FileText className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                    {hasActiveFilters ? "No matches for current filters" : "No invoices yet"}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <Link
                        to={`/admin/invoices/customer/${inv.id}`}
                        className="text-teal-600 hover:text-teal-700"
                      >
                        {inv.invoice_number || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{fmtDate(inv.invoice_date)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{fmtDate(inv.due_date)}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {inv.po_number || inv.client_project_number || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-900">
                      {fmt(inv.total_amount, inv.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      {fmt(inv.amount_paid, inv.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-900 font-medium">
                      {fmt(inv.balance_due, inv.currency)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_STYLES[inv.status || ""] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {inv.status || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {inv.xtrf_invoice_id ? "XTRF" : "Portal"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        to={`/admin/invoices/customer/${inv.id}`}
                        className="text-gray-400 hover:text-teal-600"
                      >
                        <ExternalLink className="w-4 h-4 inline" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
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
