import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  DollarSign,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  CreditCard,
} from "lucide-react";
import { format } from "date-fns";
import RecordVendorPaymentModal from "@/components/admin/RecordVendorPaymentModal";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-vendor-payments`;
const TOKEN = () =>
  localStorage.getItem("sb-access-token") || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

async function callApi(payload: Record<string, unknown>) {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  return d;
}

interface VendorPayment {
  id: string;
  vendor_id: string;
  amount: number;
  amount_cad: number | null;
  currency: string;
  payment_date: string;
  payment_method: string | null;
  payment_method_name: string | null;
  reference_number: string | null;
  notes: string | null;
  source: string;
  status: string;
  allocated_amount: number;
  unallocated_amount: number;
  created_at: string;
  vendor?: { id: string; full_name: string; email: string | null };
}

interface DashboardStats {
  outstanding_portal: number;
  outstanding_portal_count: number;
  outstanding_xtrf: number;
  outstanding_xtrf_count: number;
  outstanding_total: number;
  payments_last_30_days: number;
  payments_last_30_count: number;
}

const PAGE_SIZE = 25;

function fmt(amount: number | null, code: string | null): string {
  if (amount == null) return "—";
  try {
    return amount.toLocaleString("en-CA", { style: "currency", currency: code || "CAD", minimumFractionDigits: 2 });
  } catch {
    return `${code || ""} ${(amount || 0).toFixed(2)}`;
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

const STATUS_STYLES: Record<string, string> = {
  fully_allocated: "bg-green-100 text-green-700",
  partially_allocated: "bg-amber-100 text-amber-700",
  unallocated: "bg-gray-100 text-gray-600",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-red-100 text-red-700",
};

export default function VendorPaymentsList() {
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const d = await callApi({ action: "get_dashboard_stats" });
      setStats(d as DashboardStats);
    } catch (e) {
      console.error("vendor stats", e);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const d = await callApi({
        action: "list_payments",
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setPayments(d.payments || []);
      setTotalCount(d.total_count || 0);
    } catch (e) {
      console.error("list vendor payments", e);
      setPayments([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status, dateFrom, dateTo]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadPayments(); }, [loadPayments]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vendor Payments</h1>
          <p className="text-sm text-gray-500 mt-1">
            Record outgoing payments to vendors. Allocates to portal vendor payables and XTRF-imported invoices.
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-md">
          <Plus className="w-4 h-4" /> Record Payment
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Total outstanding (CAD)</span>
          </div>
          <p className="text-2xl font-semibold text-indigo-700">
            {statsLoading ? "—" : fmt(stats?.outstanding_total ?? 0, "CAD")}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {(stats?.outstanding_portal_count ?? 0) + (stats?.outstanding_xtrf_count ?? 0)} invoices
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <span className="text-sm">Portal payables</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {statsLoading ? "—" : fmt(stats?.outstanding_portal ?? 0, "CAD")}
          </p>
          <p className="text-xs text-gray-500 mt-1">{stats?.outstanding_portal_count ?? 0} items</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <span className="text-sm">XTRF invoices</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {statsLoading ? "—" : fmt(stats?.outstanding_xtrf ?? 0, "CAD")}
          </p>
          <p className="text-xs text-gray-500 mt-1">{stats?.outstanding_xtrf_count ?? 0} items</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CreditCard className="w-4 h-4" />
            <span className="text-sm">Paid last 30 days</span>
          </div>
          <p className="text-2xl font-semibold text-green-600">
            {statsLoading ? "—" : fmt(stats?.payments_last_30_days ?? 0, "CAD")}
          </p>
          <p className="text-xs text-gray-500 mt-1">{stats?.payments_last_30_count ?? 0} payments</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, notes"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
            <option value="">All statuses</option>
            <option value="unallocated">Unallocated</option>
            <option value="partially_allocated">Partially allocated</option>
            <option value="fully_allocated">Fully allocated</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Vendor</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-left">Currency</th>
                <th className="px-4 py-2.5 text-right">CAD</th>
                <th className="px-4 py-2.5 text-left">Method</th>
                <th className="px-4 py-2.5 text-left">Reference</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…
                </td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  <CreditCard className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                  No vendor payments recorded yet.
                </td></tr>
              ) : (
                payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600">{fmtDate(p.payment_date)}</td>
                    <td className="px-4 py-2.5">
                      {p.vendor ? (
                        <Link to={`/admin/vendors/${p.vendor_id}?tab=payments`} className="text-teal-600 hover:text-teal-700">
                          {p.vendor.full_name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-900">{fmt(p.amount, p.currency)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.currency}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{fmt(p.amount_cad, "CAD")}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.payment_method_name || p.payment_method || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{p.reference_number || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[p.status] || "bg-gray-100 text-gray-600"}`}>
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link to={`/admin/vendor-payments/${p.id}`} className="text-gray-400 hover:text-teal-600">
                        <Eye className="w-4 h-4 inline" />
                      </Link>
                    </td>
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

      <RecordVendorPaymentModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => { loadStats(); loadPayments(); }}
      />
    </div>
  );
}
