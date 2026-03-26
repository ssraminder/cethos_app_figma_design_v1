import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Link } from "react-router-dom";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────
interface CustomerInvoice {
  id: string;
  invoice_number: string | null;
  order_id: string | null;
  customer_id: string | null;
  subtotal: number | null;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  status: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  pdf_storage_path: string | null;
  pdf_generated_at: string | null;
  invoicing_branch_id: string | null;
  customers: { full_name: string | null; email: string | null; company_name: string | null } | null;
  orders: { order_number: string | null } | null;
}

interface BranchInfo {
  id: string;
  legal_name: string;
  code: string;
}

// ── Constants ──────────────────────────────────────────────────────
const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "issued", label: "Issued" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
  { value: "draft", label: "Draft" },
  { value: "partial", label: "Partial" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_STYLES: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700",
  sent: "bg-indigo-100 text-indigo-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-500",
  draft: "bg-gray-100 text-gray-600",
  partial: "bg-amber-100 text-amber-700",
  cancelled: "bg-gray-100 text-gray-500",
};

// ── Helpers ────────────────────────────────────────────────────────
function fmtCurrency(val: number | null): string {
  if (val == null) return "—";
  return val.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}

function fmtDate(val: string | null): string {
  if (!val) return "—";
  try {
    return format(new Date(val), "MMM d, yyyy");
  } catch {
    return val;
  }
}

// ── Component ──────────────────────────────────────────────────────
export default function CustomerInvoices() {
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<BranchInfo[]>([]);

  // Pagination
  const [page, setPage] = useState(1);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Summary stats
  const [stats, setStats] = useState({
    totalInvoiced: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    count: 0,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load branches once
  useEffect(() => {
    supabase
      .from("branches")
      .select("id, legal_name, code")
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) setBranches(data);
      });
  }, []);

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

  // Load summary stats (all invoices, no pagination)
  const fetchStats = useCallback(async () => {
    const { data } = await supabase
      .from("customer_invoices")
      .select("total_amount, amount_paid, balance_due");

    if (data) {
      const totalInvoiced = data.reduce((s, r) => s + (r.total_amount || 0), 0);
      const totalPaid = data.reduce((s, r) => s + (r.amount_paid || 0), 0);
      const totalOutstanding = data.reduce((s, r) => s + (r.balance_due || 0), 0);
      setStats({ totalInvoiced, totalPaid, totalOutstanding, count: data.length });
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Fetch invoices with filters and pagination
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const offset = (page - 1) * PAGE_SIZE;

    let query = supabase
      .from("customer_invoices")
      .select(
        `
        id, invoice_number, order_id, customer_id,
        subtotal, total_amount, amount_paid, balance_due,
        status, invoice_date, due_date, currency,
        pdf_storage_path, pdf_generated_at, invoicing_branch_id,
        customers(full_name, email, company_name),
        orders(order_number)
      `,
        { count: "exact" }
      )
      .order("invoice_date", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (search) {
      query = query.or(
        `invoice_number.ilike.%${search}%,customers.full_name.ilike.%${search}%`
      );
    }
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (branchFilter) {
      query = query.eq("invoicing_branch_id", branchFilter);
    }
    if (dateFrom) {
      query = query.gte("invoice_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("invoice_date", dateTo);
    }

    const { data, count, error } = await query;
    if (error) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to load invoices");
    }
    setInvoices((data as CustomerInvoice[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [page, search, statusFilter, branchFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const branchMap = new Map(branches.map((b) => [b.id, b.legal_name]));
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const showFrom = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showTo = Math.min(page * PAGE_SIZE, totalCount);

  const handleDownloadPdf = async (pdfPath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("invoices")
        .createSignedUrl(pdfPath, 3600);
      if (error || !data?.signedUrl) {
        toast.error("Failed to get download URL");
        return;
      }
      window.open(data.signedUrl, "_blank");
    } catch {
      toast.error("Failed to download PDF");
    }
  };

  const customerDisplay = (inv: CustomerInvoice) => {
    if (inv.customers?.company_name) return inv.customers.company_name;
    return inv.customers?.full_name || "—";
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customer Invoices</h1>
        <p className="text-sm text-gray-500 mt-1">
          Browse and manage customer invoices generated from orders.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Invoiced</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmtCurrency(stats.totalInvoiced)}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Paid</p>
          <p className="text-xl font-bold text-green-700 mt-1">{fmtCurrency(stats.totalPaid)}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Outstanding</p>
          <p className="text-xl font-bold text-red-700 mt-1">{fmtCurrency(stats.totalOutstanding)}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Count</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{stats.count}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search invoice# or customer…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Status filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Branch filter */}
          <div>
            <select
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value);
                setPage(1);
              }}
              className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.legal_name}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="From"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="To"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Invoice #</th>
                <th className="px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="px-4 py-3 font-medium text-gray-600">Order</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Total</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Balance</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-center">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Loading invoices…</span>
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    No invoices found matching your criteria.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {inv.order_id ? (
                        <Link
                          to={`/admin/orders/${inv.order_id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {inv.invoice_number || "—"}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-900">{inv.invoice_number || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate" title={customerDisplay(inv)}>
                      {customerDisplay(inv)}
                    </td>
                    <td className="px-4 py-3">
                      {inv.order_id ? (
                        <Link
                          to={`/admin/orders/${inv.order_id}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {inv.orders?.order_number || "—"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {fmtCurrency(inv.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-medium ${
                          (inv.balance_due || 0) > 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {fmtCurrency(inv.balance_due)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          STATUS_STYLES[inv.status || ""] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {inv.status
                          ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1)
                          : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(inv.invoice_date)}</td>
                    <td className="px-4 py-3 text-center">
                      {inv.pdf_storage_path ? (
                        <button
                          onClick={() => handleDownloadPdf(inv.pdf_storage_path!)}
                          className="text-blue-600 hover:text-blue-800 cursor-pointer"
                          title="Download PDF"
                        >
                          <FileText className="w-4 h-4 inline" />
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-600">
              Showing {showFrom}–{showTo} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
