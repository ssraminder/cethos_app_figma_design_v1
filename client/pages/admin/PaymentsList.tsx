import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  DollarSign,
  AlertTriangle,
  Clock,
  TrendingUp,
  Plus,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { CustomerPayment, ARDashboardStats } from "@/types/payments";
import { callPaymentApi, formatCurrency, formatDate } from "@/lib/payment-api";
import RecordPaymentModal from "@/components/admin/RecordPaymentModal";

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "unallocated", label: "Unallocated" },
  { value: "partially_allocated", label: "Partially Allocated" },
  { value: "fully_allocated", label: "Fully Allocated" },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    fully_allocated: "bg-green-100 text-green-700",
    completed: "bg-green-100 text-green-700",
    partially_allocated: "bg-amber-100 text-amber-700",
    unallocated: "bg-gray-100 text-gray-600",
  };
  const labels: Record<string, string> = {
    fully_allocated: "Fully Allocated",
    completed: "Completed",
    partially_allocated: "Partially Allocated",
    unallocated: "Unallocated",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${styles[status] || "bg-gray-100 text-gray-600"}`}
    >
      {labels[status] || status}
    </span>
  );
}

export default function PaymentsList() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Data
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [stats, setStats] = useState<ARDashboardStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("date_from") || "");
  const [dateTo, setDateTo] = useState(searchParams.get("date_to") || "");
  const page = parseInt(searchParams.get("page") || "1", 10);

  // UI
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [showRecordModal, setShowRecordModal] = useState(false);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const data = await callPaymentApi("manage-ar-aging", {
          action: "get_dashboard_stats",
        });
        setStats(data.stats || data);
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  // Fetch payments
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        action: "list_payments",
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (status) params.status = status;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const data = await callPaymentApi("manage-customer-payments", params);
      setPayments(data.payments || []);
      setTotalCount(data.total || data.payments?.length || 0);
    } catch (err: any) {
      toast.error("Failed to load payments");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status, dateFrom, dateTo]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Sync filters to URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (status) params.status = status;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [search, status, dateFrom, dateTo, page, setSearchParams]);

  const setPage = (p: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(p));
    setSearchParams(params, { replace: true });
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setSearchParams({ page: "1" }, { replace: true });
  };

  const hasFilters = search || status || dateFrom || dateTo;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <button
          onClick={() => setShowRecordModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Record Payment
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Outstanding"
          value={stats?.total_outstanding}
          count={stats?.outstanding_count}
          loading={statsLoading}
          color={stats && stats.total_outstanding > 0 ? "red" : "gray"}
          icon={DollarSign}
        />
        <StatCard
          label="Overdue Amount"
          value={stats?.total_overdue}
          count={stats?.overdue_count}
          loading={statsLoading}
          color="red"
          icon={AlertTriangle}
        />
        <StatCard
          label="Unallocated Credits"
          value={stats?.unallocated_credits}
          count={stats?.unallocated_count}
          loading={statsLoading}
          color={stats && stats.unallocated_credits > 0 ? "amber" : "gray"}
          icon={Clock}
        />
        <StatCard
          label="Payments Last 30 Days"
          value={stats?.payments_last_30_days}
          count={stats?.payments_last_30_count}
          loading={statsLoading}
          color="green"
          icon={TrendingUp}
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Customer Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, company, email..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-4 h-4" />
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            <span className="ml-2 text-gray-500">Loading payments...</span>
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-20 px-4">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {hasFilters
                ? "No payments match your filters."
                : "No payments recorded yet. Click 'Record Payment' to get started."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Date
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Customer
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">
                      Amount
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Method
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Reference
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Allocated / Total
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Status
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => {
                    const pct =
                      p.amount > 0
                        ? Math.round((p.allocated_amount / p.amount) * 100)
                        : 0;
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                          {formatDate(p.payment_date)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900">
                            {p.customer?.full_name || "—"}
                          </div>
                          {p.customer?.company_name && (
                            <div className="text-xs text-gray-500">
                              {p.customer.company_name}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                          {p.payment_method_name || p.payment_method || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {p.reference_number ? (
                            <span className="font-mono text-xs text-gray-600">
                              {p.reference_number}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-xs text-gray-600 mb-1">
                            {formatCurrency(p.allocated_amount)} /{" "}
                            {formatCurrency(p.amount)}
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                pct >= 100
                                  ? "bg-green-500"
                                  : pct > 0
                                    ? "bg-amber-500"
                                    : "bg-gray-300"
                              }`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            to={`/admin/payments/${p.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                    className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                    className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={showRecordModal}
        onClose={() => setShowRecordModal(false)}
        onSuccess={() => {
          setShowRecordModal(false);
          fetchPayments();
        }}
      />
    </div>
  );
}

/* ---------- stat card ---------- */

function StatCard({
  label,
  value,
  count,
  loading,
  color,
  icon: Icon,
}: {
  label: string;
  value?: number;
  count?: number;
  loading: boolean;
  color: string;
  icon: React.ElementType;
}) {
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    red: { bg: "bg-red-50", text: "text-red-700", icon: "text-red-500" },
    amber: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      icon: "text-amber-500",
    },
    green: {
      bg: "bg-green-50",
      text: "text-green-700",
      icon: "text-green-500",
    },
    gray: { bg: "bg-gray-50", text: "text-gray-700", icon: "text-gray-400" },
  };
  const c = colorMap[color] || colorMap.gray;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </span>
        <div className={`p-2 rounded-lg ${c.bg}`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
      </div>
      {loading ? (
        <div className="h-7 bg-gray-100 rounded animate-pulse w-28" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className={`text-xl font-bold ${c.text}`}>
            {formatCurrency(value ?? 0)}
          </span>
          {count !== undefined && count > 0 && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${c.bg} ${c.text}`}
            >
              {count}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

