import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  X,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import InvoiceDateFilter from "./components/InvoiceDateFilter";
import ColumnToggle, { type ColumnDef } from "./components/ColumnToggle";
import SummaryPanel, { type SummaryData } from "./components/SummaryPanel";

// ── Currency Map ────────────────────────────────────────────────────
const CURRENCY_MAP: Record<number, string> = {
  1: 'EUR',
  3: 'GBP',
  30: 'CAD',
  67: 'USD',
};

// ── Types ──────────────────────────────────────────────────────────
interface VendorInvoice {
  id: number;
  final_number: string | null;
  internal_number: string | null;
  draft_number: string | null;
  provider_id: number | null;
  vendor_name: string | null;
  customer_name: string | null;
  currency_id: number | null;
  total_gross: number | null;
  total_netto: number | null;
  netto_cad: number | null;
  gross_cad: number | null;
  tax_cad: number | null;
  status: string | null;
  payment_status: string | null;
  draft_date: string | null;
  final_date: string | null;
  payment_due_date: string | null;
  invoice_uploaded_date: string | null;
  last_payment_date: string | null;
  notes_from_provider: string | null;
  project_numbers: string[] | null;
  payments: any[] | null;
  branch: string | null;
  synced_at: string | null;
}

// ── Column definitions ─────────────────────────────────────────────
const COLUMNS: ColumnDef[] = [
  { key: "internal_number", label: "Internal No.", defaultVisible: true },
  { key: "final_number", label: "Invoice No.", defaultVisible: true },
  { key: "vendor_name", label: "Vendor Name", defaultVisible: true },
  { key: "customer_name", label: "Customer Name", defaultVisible: true },
  { key: "project_numbers", label: "Project(s)", defaultVisible: true },
  { key: "branch", label: "Branch", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "payment_status", label: "Payment", defaultVisible: true },
  { key: "final_date", label: "Final Date", defaultVisible: true },
  { key: "payment_due_date", label: "Due Date", defaultVisible: true },
  { key: "last_payment_date", label: "Last Payment", defaultVisible: true },
  { key: "gross_cad", label: "Gross (CAD)", defaultVisible: true },
  { key: "netto_cad", label: "Net (CAD)", defaultVisible: true },
  { key: "tax_cad", label: "Tax (CAD)", defaultVisible: true },
  { key: "currency_id", label: "Currency", defaultVisible: true },
  { key: "total_gross", label: "Gross (Original)", defaultVisible: false },
  { key: "draft_date", label: "Draft Date", defaultVisible: false },
  {
    key: "invoice_uploaded_date",
    label: "Uploaded Date",
    defaultVisible: false,
  },
  { key: "notes_from_provider", label: "Notes", defaultVisible: false },
  { key: "provider_id", label: "Vendor ID", defaultVisible: false },
];

const STORAGE_KEY = "cethos_vendor_invoice_columns";
const PAGE_SIZE = 50;

// ── Date field options ─────────────────────────────────────────────
const DATE_FIELD_OPTIONS = [
  { value: "final_date", label: "Final Date" },
  { value: "draft_date", label: "Draft Date" },
  { value: "payment_due_date", label: "Payment Due Date" },
  { value: "invoice_uploaded_date", label: "Invoice Uploaded Date" },
  { value: "last_payment_date", label: "Last Payment Date" },
];

// ── Helpers ────────────────────────────────────────────────────────
function fmtCurrency(val: number | null): string {
  if (val == null) return "--";
  return val.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}

function fmtDate(val: string | null): string {
  if (!val) return "--";
  try {
    return format(new Date(val + "T00:00:00"), "MMM dd, yyyy");
  } catch {
    return val;
  }
}

function branchLabel(branch: string | null): string {
  if (!branch) return "\u2014";
  if (branch.startsWith("Cethos")) return "Cethos";
  if (branch.startsWith("12537494")) return "12537494";
  return branch;
}

function defaultDateRange(): { from: string; to: string } {
  const today = new Date();
  const d30 = new Date(today);
  d30.setDate(d30.getDate() - 30);
  return {
    from: d30.toISOString().split("T")[0],
    to: today.toISOString().split("T")[0],
  };
}

function loadVisibleColumns(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return new Set<string>(JSON.parse(stored));
  } catch {}
  return new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
}

function saveVisibleColumns(cols: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...cols]));
}

// ── Component ──────────────────────────────────────────────────────
export default function VendorInvoices() {
  // Data state
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);

  // Filters
  const [branch, setBranch] = useState("all");
  const [dateField, setDateField] = useState("final_date");
  const [dateRange, setDateRange] = useState("last_30");
  const defDates = defaultDateRange();
  const [dateFrom, setDateFrom] = useState(defDates.from);
  const [dateTo, setDateTo] = useState(defDates.to);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [paymentStatuses, setPaymentStatuses] = useState<string[]>([]);
  const [currencies, setCurrencies] = useState<number[]>([]);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Filter UI
  const [showFilters, setShowFilters] = useState(false);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns);

  // Expanded row
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Summary
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Currency options (loaded dynamically)
  const [currencyOptions, setCurrencyOptions] = useState<number[]>([]);

  // Page jump input
  const [jumpPage, setJumpPage] = useState("");

  // Debounce ref for search
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load currency options once
  useEffect(() => {
    supabase
      .from("xtrf_vendor_invoice_cache")
      .select("currency_id")
      .not("currency_id", "is", null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set<number>(data.map((r) => r.currency_id as number))];
          unique.sort((a, b) => a - b);
          setCurrencyOptions(unique);
        }
      });
  }, []);

  // Build the Supabase query with current filters (reusable for data + summary)
  const applyFilters = useCallback(
    (query: any) => {
      if (branch && branch !== "all") {
        if (branch === "unassigned") query = query.is("branch", null);
        else query = query.eq("branch", branch);
      }
      if (dateFrom) query = query.gte(dateField, dateFrom);
      if (dateTo) query = query.lte(dateField, dateTo);
      if (statuses.length) query = query.in("status", statuses);
      if (paymentStatuses.length)
        query = query.in("payment_status", paymentStatuses);
      if (currencies.length) query = query.in("currency_id", currencies);
      if (amountMin) query = query.gte("gross_cad", parseFloat(amountMin));
      if (amountMax) query = query.lte("gross_cad", parseFloat(amountMax));
      if (search) {
        query = query.or(
          `final_number.ilike.%${search}%,internal_number.ilike.%${search}%,draft_number.ilike.%${search}%,vendor_name.ilike.%${search}%,customer_name.ilike.%${search}%,project_numbers.cs.{"${search}"}`,
        );
      }
      return query;
    },
    [
      branch,
      dateField,
      dateFrom,
      dateTo,
      statuses,
      paymentStatuses,
      currencies,
      amountMin,
      amountMax,
      search,
    ],
  );

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("xtrf_vendor_invoice_cache")
        .select("*", { count: "exact" })
        .order("final_date", { ascending: false });

      query = applyFilters(query);

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      setInvoices((data as VendorInvoice[]) || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error("Failed to fetch vendor invoices:", err);
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [page, applyFilters]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      let query = supabase
        .from("xtrf_vendor_invoice_cache")
        .select("gross_cad, netto_cad, tax_cad, payment_status");
      query = applyFilters(query);

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      const result: SummaryData = {
        totalInvoices: rows.length,
        fullyPaid: { gross: 0, net: 0, tax: 0 },
        partiallyPaid: { gross: 0, net: 0, tax: 0 },
        unpaid: { gross: 0, net: 0, tax: 0 },
      };

      for (const r of rows) {
        const bucket =
          r.payment_status === "FULLY_PAID"
            ? result.fullyPaid
            : r.payment_status === "PARTIALLY_PAID"
              ? result.partiallyPaid
              : result.unpaid;
        bucket.gross += Number(r.gross_cad) || 0;
        bucket.net += Number(r.netto_cad) || 0;
        bucket.tax += Number(r.tax_cad) || 0;
      }

      setSummaryData(result);
    } catch (err) {
      console.error("Failed to fetch summary:", err);
      toast.error("Failed to load summary");
    } finally {
      setSummaryLoading(false);
    }
  }, [applyFilters]);

  useEffect(() => {
    if (summaryOpen) fetchSummary();
  }, [summaryOpen, fetchSummary]);

  // Column toggle handlers
  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set<string>(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveVisibleColumns(next);
      return next;
    });
  };

  const showAllColumns = () => {
    const all = new Set(COLUMNS.map((c) => c.key));
    setVisibleColumns(all);
    saveVisibleColumns(all);
  };

  const resetColumns = () => {
    const defaults = new Set(
      COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
    );
    setVisibleColumns(defaults);
    saveVisibleColumns(defaults);
  };

  // Multi-select toggle helper
  function toggleMulti<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
  }

  // CSV Export
  const exportCSV = async () => {
    toast.info("Preparing CSV export...");
    try {
      let query = supabase
        .from("xtrf_vendor_invoice_cache")
        .select("*")
        .order("final_date", { ascending: false });
      query = applyFilters(query);

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      const visCols = COLUMNS.filter((c) => visibleColumns.has(c.key));
      const header = visCols.map((c) => c.label).join(",");
      const csvRows = rows.map((row: any) =>
        visCols
          .map((c) => {
            let val = row[c.key];
            if (c.key === "project_numbers") {
              return (val ?? []).join('; ');
            }
            if (c.key === "currency_id" && val != null) {
              val = CURRENCY_MAP[val as number] ?? `ID:${val}`;
            }
            if (val == null) return "";
            const str = String(val);
            return str.includes(",") || str.includes('"') || str.includes("\n")
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(","),
      );
      const csv = [header, ...csvRows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vendor-invoices-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch (err) {
      console.error("CSV export failed:", err);
      toast.error("Export failed");
    }
  };

  // Clear filters
  const clearFilters = () => {
    setBranch("all");
    setDateField("final_date");
    setDateRange("last_30");
    const d = defaultDateRange();
    setDateFrom(d.from);
    setDateTo(d.to);
    setCustomFrom("");
    setCustomTo("");
    setStatuses([]);
    setPaymentStatuses([]);
    setCurrencies([]);
    setAmountMin("");
    setAmountMax("");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const hasActiveFilters =
    branch !== "all" ||
    statuses.length > 0 ||
    paymentStatuses.length > 0 ||
    currencies.length > 0 ||
    amountMin !== "" ||
    amountMax !== "" ||
    search !== "";

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Cell renderer
  const renderCell = (invoice: VendorInvoice, key: string) => {
    const val = (invoice as any)[key];
    switch (key) {
      case "gross_cad":
      case "netto_cad":
      case "tax_cad":
      case "total_gross":
      case "total_netto":
        return (
          <span className="tabular-nums">{fmtCurrency(val as number)}</span>
        );
      case "currency_id":
        return <span>{val != null ? (CURRENCY_MAP[val as number] ?? `ID:${val}`) : "\u2014"}</span>;
      case "payment_status":
        return <PaymentBadge status={val} />;
      case "status":
        return <StatusBadge status={val} />;
      case "branch":
        return <span>{branchLabel(val)}</span>;
      case "final_date":
      case "draft_date":
      case "payment_due_date":
      case "invoice_uploaded_date":
      case "last_payment_date":
        return <span>{fmtDate(val)}</span>;
      case "project_numbers": {
        const arr = val as string[] | null;
        if (!arr || arr.length === 0) return <span className="text-gray-400">{"\u2014"}</span>;
        if (arr.length <= 3) {
          return <span className="text-xs font-mono text-gray-700">{arr.join(', ')}</span>;
        }
        return (
          <span className="text-xs font-mono text-gray-700">
            {arr.slice(0, 3).join(', ')} <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-sans">+{arr.length - 3}</span>
          </span>
        );
      }
      case "notes_from_provider":
        return (
          <span className="truncate max-w-[200px] block" title={val || ""}>
            {val || "\u2014"}
          </span>
        );
      default:
        return <span>{val != null ? String(val) : "\u2014"}</span>;
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Vendor Invoices
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount.toLocaleString()} total invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSummaryOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Summary
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={() => toast.info("XLSX export coming soon")}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            XLSX
          </button>
          <button
            onClick={() => fetchInvoices()}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3 items-start">
          {/* Search */}
          <div className="flex-1 md:max-w-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search invoices, vendors, customers..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
              />
            </div>
          </div>

          {/* Date filter */}
          <InvoiceDateFilter
            dateField={dateField}
            dateFieldOptions={DATE_FIELD_OPTIONS}
            onDateFieldChange={(f) => {
              setDateField(f);
              setPage(1);
            }}
            selectedRange={dateRange}
            onRangeChange={(range, from, to) => {
              setDateRange(range);
              if (range !== "custom") {
                setDateFrom(from);
                setDateTo(to);
              }
              setPage(1);
            }}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={(val) => {
              setCustomFrom(val);
              setDateFrom(val);
              setPage(1);
            }}
            onCustomToChange={(val) => {
              setCustomTo(val);
              setDateTo(val);
              setPage(1);
            }}
          />

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors text-sm ${
              hasActiveFilters
                ? "border-teal-300 bg-teal-50 text-teal-700"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="w-5 h-5 bg-teal-600 text-white text-xs rounded-full flex items-center justify-center">
                {
                  [
                    branch !== "all",
                    statuses.length > 0,
                    paymentStatuses.length > 0,
                    currencies.length > 0,
                    amountMin !== "",
                    amountMax !== "",
                  ].filter(Boolean).length
                }
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
            />
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Branch */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch
              </label>
              <select
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">All</option>
                <option value="Cethos Solutions Inc.">
                  Cethos Solutions Inc.
                </option>
                <option value="12537494 Canada Inc.">
                  12537494 Canada Inc.
                </option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>

            {/* Invoice Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Status
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: "CONFIRMED", label: "Confirmed" },
                  { value: "NOT_READY", label: "Draft" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStatuses(toggleMulti(statuses, opt.value));
                      setPage(1);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      statuses.includes(opt.value)
                        ? "bg-teal-50 border-teal-300 text-teal-700"
                        : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Status
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    value: "FULLY_PAID",
                    label: "Fully Paid",
                    color: "bg-green-50 border-green-300 text-green-700",
                  },
                  {
                    value: "PARTIALLY_PAID",
                    label: "Partial",
                    color: "bg-yellow-50 border-yellow-300 text-yellow-700",
                  },
                  {
                    value: "NOT_PAID",
                    label: "Unpaid",
                    color: "bg-red-50 border-red-300 text-red-700",
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setPaymentStatuses(
                        toggleMulti(paymentStatuses, opt.value),
                      );
                      setPage(1);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      paymentStatuses.includes(opt.value)
                        ? opt.color
                        : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {currencyOptions.map((cid) => (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => {
                      setCurrencies(toggleMulti(currencies, cid));
                      setPage(1);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      currencies.includes(cid)
                        ? "bg-teal-50 border-teal-300 text-teal-700"
                        : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {CURRENCY_MAP[cid] ?? `ID:${cid}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Range */}
            <div className="xl:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gross CAD Range
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={amountMin}
                  onChange={(e) => {
                    setAmountMin(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Min"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-400">-</span>
                <input
                  type="number"
                  value={amountMax}
                  onChange={(e) => {
                    setAmountMax(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Max"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
          <p className="text-xs text-gray-500">
            {totalCount > 0
              ? `Showing ${(page - 1) * PAGE_SIZE + 1}\u2013${Math.min(page * PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()} invoices`
              : "No invoices found"}
          </p>
          <ColumnToggle
            columns={COLUMNS}
            visibleColumns={visibleColumns}
            onToggle={toggleColumn}
            onShowAll={showAllColumns}
            onReset={resetColumns}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {COLUMNS.filter((c) => visibleColumns.has(c.key)).map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                      [
                        "gross_cad",
                        "netto_cad",
                        "tax_cad",
                        "total_gross",
                        "total_netto",
                      ].includes(col.key)
                        ? "text-right"
                        : "text-left"
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      COLUMNS.filter((c) => visibleColumns.has(c.key)).length
                    }
                    className="px-6 py-12 text-center"
                  >
                    <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      COLUMNS.filter((c) => visibleColumns.has(c.key)).length
                    }
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    No invoices found
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <Fragment key={inv.id}>
                    <tr
                      onClick={() =>
                        setExpandedId(expandedId === inv.id ? null : inv.id)
                      }
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      {COLUMNS.filter((c) => visibleColumns.has(c.key)).map(
                        (col) => (
                          <td
                            key={col.key}
                            className={`px-4 py-3 text-sm whitespace-nowrap ${
                              [
                                "gross_cad",
                                "netto_cad",
                                "tax_cad",
                                "total_gross",
                                "total_netto",
                              ].includes(col.key)
                                ? "text-right"
                                : "text-left"
                            }`}
                          >
                            {renderCell(inv, col.key)}
                          </td>
                        ),
                      )}
                    </tr>
                    {expandedId === inv.id && (
                      <tr>
                        <td
                          colSpan={
                            COLUMNS.filter((c) => visibleColumns.has(c.key))
                              .length
                          }
                          className="bg-gray-50 px-6 py-4"
                        >
                          <ExpandedRow invoice={inv} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = parseInt(jumpPage, 10);
                  if (p >= 1 && p <= totalPages) setPage(p);
                  setJumpPage("");
                }}
                className="flex items-center gap-1"
              >
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value)}
                  placeholder={String(page)}
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-500"
                />
              </form>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary Panel */}
      <SummaryPanel
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        data={summaryData}
        loading={summaryLoading}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function PaymentBadge({ status }: { status: string | null }) {
  const config: Record<string, { style: string; label: string }> = {
    FULLY_PAID: {
      style: "bg-green-100 text-green-700",
      label: "Fully Paid",
    },
    PARTIALLY_PAID: {
      style: "bg-yellow-100 text-yellow-700",
      label: "Partial",
    },
    NOT_PAID: { style: "bg-red-100 text-red-700", label: "Unpaid" },
  };
  const c = config[status || ""] || {
    style: "bg-gray-100 text-gray-600",
    label: status || "\u2014",
  };
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${c.style}`}
    >
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const config: Record<string, { style: string; label: string }> = {
    CONFIRMED: { style: "bg-blue-100 text-blue-700", label: "Confirmed" },
    NOT_READY: { style: "bg-gray-100 text-gray-600", label: "Draft" },
  };
  const c = config[status || ""] || {
    style: "bg-gray-100 text-gray-600",
    label: status || "\u2014",
  };
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${c.style}`}
    >
      {c.label}
    </span>
  );
}

function ExpandedRow({ invoice }: { invoice: VendorInvoice }) {
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];

  return (
    <div className="space-y-4">
      {/* Notes */}
      {invoice.notes_from_provider && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Notes from Provider
          </h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {invoice.notes_from_provider}
          </p>
        </div>
      )}

      {/* Payments */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Payments ({payments.length})
        </h4>
        {payments.length === 0 ? (
          <p className="text-sm text-gray-400">No payments recorded</p>
        ) : (
          <table className="w-full max-w-lg text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1.5 pr-4 font-medium text-gray-500">
                  Amount
                </th>
                <th className="text-left py-1.5 pr-4 font-medium text-gray-500">
                  Date
                </th>
                <th className="text-left py-1.5 pr-4 font-medium text-gray-500">
                  Method ID
                </th>
                <th className="text-left py-1.5 font-medium text-gray-500">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any, idx: number) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-1.5 pr-4 tabular-nums">
                    {fmtCurrency(p.amount)}
                  </td>
                  <td className="py-1.5 pr-4">{fmtDate(p.payment_date)}</td>
                  <td className="py-1.5 pr-4">{p.payment_method_id ?? "\u2014"}</td>
                  <td className="py-1.5">{p.notes || "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

