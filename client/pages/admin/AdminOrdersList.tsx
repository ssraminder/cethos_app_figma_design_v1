import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Download,
  RefreshCw,
  X,
  Package,
  Truck,
  CheckCircle,
} from "lucide-react";
import { format } from "date-fns";

interface Order {
  id: string;
  order_number: string;
  status: string;
  work_status: string;
  total_amount: number;
  is_rush: boolean;
  created_at: string;
  estimated_delivery_date: string;
  customer_email: string;
  customer_name: string;
  document_count: number;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "delivered", label: "Delivered" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
];

const WORK_STATUS_OPTIONS = [
  { value: "", label: "All Work Statuses" },
  { value: "queued", label: "Queued" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "In Review" },
  { value: "completed", label: "Completed" },
];

const PAGE_SIZE = 25;

export default function AdminOrdersList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters from URL
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const workStatus = searchParams.get("work_status") || "";
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";
  const rushOnly = searchParams.get("rush") === "true";
  const page = parseInt(searchParams.get("page") || "1", 10);

  const [searchInput, setSearchInput] = useState(search);
  const [showFilters, setShowFilters] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      let query = supabase.from("orders").select(
        `
          id,
          order_number,
          status,
          work_status,
          total_amount,
          is_rush,
          created_at,
          estimated_delivery_date,
          customers!inner(email, full_name)
        `,
        { count: "exact" },
      );

      // Apply filters
      if (search) {
        query = query.or(
          `order_number.ilike.%${search}%,customers.email.ilike.%${search}%,customers.full_name.ilike.%${search}%`,
        );
      }
      if (status) {
        query = query.eq("status", status);
      }
      if (workStatus) {
        query = query.eq("work_status", workStatus);
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom);
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo + "T23:59:59");
      }
      if (rushOnly) {
        query = query.eq("is_rush", true);
      }

      // Pagination
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;

      // Transform data
      const transformedOrders =
        data?.map((order) => ({
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          work_status: order.work_status,
          total_amount: order.total_amount,
          is_rush: order.is_rush,
          created_at: order.created_at,
          estimated_delivery_date: order.estimated_delivery_date,
          customer_email: (order.customers as any)?.email || "",
          customer_name: (order.customers as any)?.full_name || "",
          document_count: 0, // TODO: Add document count
        })) || [];

      setOrders(transformedOrders);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [search, status, workStatus, dateFrom, dateTo, rushOnly, page]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1");
    setSearchParams(params);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter("search", searchInput);
  };

  const clearFilters = () => {
    setSearchParams({});
    setSearchInput("");
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasActiveFilters =
    search || status || workStatus || dateFrom || dateTo || rushOnly;

  // Calculate summary stats
  const totalRevenue = orders.reduce(
    (sum, o) => sum + (o.total_amount || 0),
    0,
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount.toLocaleString()} total orders
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchOrders()}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      <div>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Total Orders</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              {totalCount}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Page Revenue</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              $
              {totalRevenue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Rush Orders</p>
            <p className="text-2xl font-semibold text-amber-600 mt-1">
              {orders.filter((o) => o.is_rush).length}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Avg Order Value</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              $
              {orders.length > 0
                ? (totalRevenue / orders.length).toFixed(2)
                : "0.00"}
            </p>
          </div>
        </div>

        {/* Search & Filters Bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by order number, email, or name..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </form>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                hasActiveFilters
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                  {
                    [
                      search,
                      status,
                      workStatus,
                      dateFrom,
                      dateTo,
                      rushOnly,
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
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Order Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Order Status
                </label>
                <select
                  value={status}
                  onChange={(e) => updateFilter("status", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Work Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Status
                </label>
                <select
                  value={workStatus}
                  onChange={(e) => updateFilter("work_status", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {WORK_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => updateFilter("from", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => updateFilter("to", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Rush Only */}
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rushOnly}
                    onChange={(e) =>
                      updateFilter("rush", e.target.checked ? "true" : "")
                    }
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Rush orders only
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Work Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Delivery
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      No orders found
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link
                          to={`/admin/orders/${order.id}`}
                          className="flex items-center gap-3"
                        >
                          <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                            <ShoppingCart className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {order.order_number}
                            </p>
                            <p className="text-xs text-gray-500">
                              {format(
                                new Date(order.created_at),
                                "MMM d, yyyy",
                              )}
                              {order.is_rush && (
                                <span className="ml-2 text-amber-600">
                                  ⚡ Rush
                                </span>
                              )}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-900">
                          {order.customer_name || "—"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {order.customer_email || "—"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-6 py-4">
                        <WorkStatusBadge status={order.work_status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="text-sm font-medium text-gray-900 tabular-nums">
                          ${(order.total_amount || 0).toFixed(2)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        {order.estimated_delivery_date ? (
                          <p className="text-sm text-gray-700">
                            {format(
                              new Date(order.estimated_delivery_date),
                              "MMM d, yyyy",
                            )}
                          </p>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                {Math.min(page * PAGE_SIZE, totalCount)} of{" "}
                {totalCount.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateFilter("page", String(page - 1))}
                  disabled={page <= 1}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => updateFilter("page", String(page + 1))}
                  disabled={page >= totalPages}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Order Status Badge
function OrderStatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    processing: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    delivered: "bg-green-100 text-green-700",
    refunded: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-700",
  };

  const labels: Record<string, string> = {
    pending: "Pending",
    paid: "Paid",
    processing: "Processing",
    completed: "Completed",
    delivered: "Delivered",
    refunded: "Refunded",
    cancelled: "Cancelled",
  };

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${styles[status || ""] || "bg-gray-100 text-gray-700"}`}
    >
      {labels[status || ""] || status || "Unknown"}
    </span>
  );
}

// Work Status Badge
function WorkStatusBadge({ status }: { status?: string }) {
  const config: Record<
    string,
    { style: string; icon: React.ReactNode; label: string }
  > = {
    queued: {
      style: "bg-gray-100 text-gray-700",
      icon: <Package className="w-3 h-3" />,
      label: "Queued",
    },
    in_progress: {
      style: "bg-blue-100 text-blue-700",
      icon: <Truck className="w-3 h-3" />,
      label: "In Progress",
    },
    review: {
      style: "bg-amber-100 text-amber-700",
      icon: <Package className="w-3 h-3" />,
      label: "In Review",
    },
    completed: {
      style: "bg-green-100 text-green-700",
      icon: <CheckCircle className="w-3 h-3" />,
      label: "Completed",
    },
  };

  const { style, icon, label } = config[status || ""] || {
    style: "bg-gray-100 text-gray-700",
    icon: null,
    label: status || "Unknown",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full ${style}`}
    >
      {icon}
      {label}
    </span>
  );
}
