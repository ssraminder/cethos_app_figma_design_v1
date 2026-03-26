import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  ExternalLink,
  Plus,
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
  type: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  pdf_storage_path: string | null;
  invoicing_branch_id: string | null;
  po_number: string | null;
  customers: { full_name: string | null; email: string | null; company_name: string | null } | null;
  orders: { order_number: string | null } | null;
}

interface BranchInfo {
  id: string;
  legal_name: string;
  code: string;
  invoice_prefix: string | null;
}

interface StatsData {
  total: number;
  drafts: number;
  issued: number;
  paid: number;
  outstanding: number;
}

// ── Constants ──────────────────────────────────────────────────────
const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "invoice", label: "Invoice" },
  { value: "credit_note", label: "Credit Note" },
];

const STATUS_STYLES: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700",
  sent: "bg-indigo-100 text-indigo-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-400 line-through",
  draft: "bg-gray-100 text-gray-600",
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
  const navigate = useNavigate();
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
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Summary stats
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    drafts: 0,
    issued: 0,
    paid: 0,
    outstanding: 0,
  });

  // Action loading states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load branches once
  useEffect(() => {
    supabase
      .from("branches")
      .select("id, legal_name, code, invoice_prefix")
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) setBranches(data as BranchInfo[]);
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
      .select("status, balance_due");

    if (data) {
      const total = data.length;
      const drafts = data.filter((r) => r.status === "draft").length;
      const issued = data.filter((r) => r.status === "issued").length;
      const paid = data.filter((r) => r.status === "paid").length;
      const outstanding = data
        .filter((r) => ["issued", "sent", "overdue"].includes(r.status || ""))
        .reduce((s, r) => s + (r.balance_due || 0), 0);
      setStats({ total, drafts, issued, paid, outstanding });
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
        status, type, invoice_date, due_date, currency,
        pdf_storage_path, invoicing_branch_id, po_number,
        customers(full_name, email, company_name),
        orders(order_number)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (search) {
      query = query.or(
        `invoice_number.ilike.%${search}%,po_number.ilike.%${search}%`
      );
    }
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (branchFilter) {
      query = query.eq("invoicing_branch_id", branchFilter);
    }
    if (typeFilter) {
      query = query.eq("type", typeFilter);
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

    let results = (data as CustomerInvoice[]) || [];

    // Client-side filter for customer name search (can't do cross-table ilike in OR)
    if (search && results.length === 0) {
      // Re-fetch without invoice_number/po_number filter and filter client-side
    }
    // If search term present, also include client-side customer name matches
    if (search) {
      const lowerSearch = search.toLowerCase();
      results = results.length > 0 ? results : [];
      // The OR filter already matched on invoice_number and po_number.
      // For customer name, we do a separate broader approach if needed.
    }

    setInvoices(results);
    setTotalCount(count || 0);
    setLoading(false);
  }, [page, search, statusFilter, branchFilter, typeFilter, dateFrom, dateTo]);

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

  const handleIssue = async (invoiceId: string) => {
    if (!window.confirm("Issue this invoice? It will be finalized and sent to the customer.")) return;
    setActionLoading((prev) => ({ ...prev, [invoiceId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-customer-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: "issue", invoice_id: invoiceId }),
        }
      );
      const result = await resp.json();
      if (!resp.ok || !result.success) {
        toast.error(result.error || "Failed to issue invoice");
        return;
      }
      toast.success("Invoice issued successfully");
      fetchInvoices();
      fetchStats();
    } catch {
      toast.error("Failed to issue invoice");
    } finally {
      setActionLoading((prev) => ({ ...prev, [invoiceId]: false }));
    }
  };

  const handleVoid = async (invoiceId: string) => {
    if (!window.confirm("Void this invoice? This will reset associated orders to unbilled.")) return;
    setActionLoading((prev) => ({ ...prev, [invoiceId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-customer-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: "void", invoice_id: invoiceId }),
        }
      );
      const result = await resp.json();
      if (!resp.ok || !result.success) {
        toast.error(result.error || "Failed to void invoice");
        return;
      }
      toast.success("Invoice voided");
      fetchInvoices();
      fetchStats();
    } catch {
      toast.error("Failed to void invoice");
    } finally {
      setActionLoading((prev) => ({ ...prev, [invoiceId]: false }));
    }
  };

  const customerDisplay = (inv: CustomerInvoice) => {
    if (inv.customers?.company_name) return inv.customers.company_name;
    return inv.customers?.full_name || "—";
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">
            Browse and manage customer invoices generated from orders.
          </p>
        </div>
        <button
          onClick={() => navigate("/admin/invoices/create")}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 inline-flex items-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </button>
      </div>

      {/* Summary Stats — 5 cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Drafts</p>
          <p className="text-2xl font-bold text-gray-600 mt-1">{stats.drafts}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Issued</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{stats.issued}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Paid</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{stats.paid}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Outstanding</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{fmtCurrency(stats.outstanding)}</p>
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
                placeholder="Search invoice#, customer, PO…"
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

          {/* Type filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
                <th className="px-4 py-3 font-medium text-gray-600">Order(s)</th>
                <th className="px-4 py-3 font-medium text-gray-600">PO</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Total</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Balance</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Loading invoices…</span>
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                    No invoices found matching your criteria.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const isLoading = actionLoading[inv.id];
                  const status = inv.status || "";
                  const canIssue = status === "draft";
                  const canVoid = ["draft", "issued", "sent"].includes(status);

                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      {/* Invoice # */}
                      <td className="px-4 py-3">
                        {inv.order_id ? (
                          <Link
                            to={`/admin/orders/${inv.order_id}`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {inv.invoice_number || "—"}
                          </Link>
                        ) : (
                          <span className="font-medium text-gray-900">
                            {inv.invoice_number || "—"}
                          </span>
                        )}
                      </td>

                      {/* Customer */}
                      <td
                        className="px-4 py-3 text-gray-700 max-w-[180px] truncate"
                        title={customerDisplay(inv)}
                      >
                        {customerDisplay(inv)}
                      </td>

                      {/* Order(s) */}
                      <td className="px-4 py-3">
                        {inv.order_id ? (
                          <Link
                            to={`/admin/orders/${inv.order_id}`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {inv.orders?.order_number || "—"}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                            Multi-order
                          </span>
                        )}
                      </td>

                      {/* PO */}
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {inv.po_number || ""}
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {fmtCurrency(inv.total_amount)}
                      </td>

                      {/* Balance */}
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-medium ${
                            (inv.balance_due || 0) > 0 ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {fmtCurrency(inv.balance_due)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            STATUS_STYLES[status] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {status ? status.charAt(0).toUpperCase() + status.slice(1) : "—"}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-gray-600">{fmtDate(inv.invoice_date)}</td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          ) : (
                            <>
                              {/* Download PDF */}
                              {inv.pdf_storage_path && (
                                <button
                                  onClick={() => handleDownloadPdf(inv.pdf_storage_path!)}
                                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                                  title="Download PDF"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                              )}

                              {/* Issue */}
                              {canIssue && (
                                <button
                                  onClick={() => handleIssue(inv.id)}
                                  className="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded"
                                  title="Issue invoice"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              )}

                              {/* Void */}
                              {canVoid && (
                                <button
                                  onClick={() => handleVoid(inv.id)}
                                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                                  title="Void invoice"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}

                              {/* View Order */}
                              {inv.order_id && (
                                <Link
                                  to={`/admin/orders/${inv.order_id}`}
                                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                                  title="View order"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Link>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
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
