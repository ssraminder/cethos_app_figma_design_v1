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
  MoreVertical,
  Eye,
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
  xtrf_invoice_id: number | null;
  xtrf_invoice_number: string | null;
  xtrf_invoice_status: string | null;
  xtrf_invoice_payment_status: string | null;
  xtrf_project_total_agreed: number | null;
  xtrf_project_total_cost: number | null;
  xtrf_project_currency_code: string | null;
  xtrf_project_number: string | null;
  xtrf_project_status: string | null;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "draft_review", label: "Draft Review" },
  { value: "completed", label: "Completed" },
  { value: "delivered", label: "Delivered" },
  { value: "invoiced", label: "Invoiced" },
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
  const xtrfStatus = searchParams.get("xtrfStatus") || "";
  const xtrfInvoiceStatuses = searchParams.get("xtrfInvStatus")?.split(",").filter(Boolean) || [];
  const xtrfPaymentStatuses = searchParams.get("xtrfPayStatus")?.split(",").filter(Boolean) || [];
  const page = parseInt(searchParams.get("page") || "1", 10);

  const [searchInput, setSearchInput] = useState(search);
  const [showFilters, setShowFilters] = useState(false);

  // Actions menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
          xtrf_invoice_id, xtrf_invoice_number, xtrf_invoice_status, xtrf_invoice_payment_status,
          xtrf_project_number, xtrf_project_total_agreed, xtrf_project_total_cost, xtrf_project_currency_code, xtrf_project_status,
          customers!inner(email, full_name)
        `,
        { count: "exact" },
      );

      // Apply filters
      if (search) {
        // PostgREST doesn't support foreign table refs in .or(), so find matching customers first
        const { data: matchingCustomers } = await supabase
          .from("customers")
          .select("id")
          .or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);

        const customerIds = matchingCustomers?.map((c) => c.id) || [];

        if (customerIds.length > 0) {
          query = query.or(
            `order_number.ilike.%${search}%,xtrf_project_number.ilike.%${search}%,customer_id.in.(${customerIds.join(",")})`,
          );
        } else {
          query = query.or(
            `order_number.ilike.%${search}%,xtrf_project_number.ilike.%${search}%`,
          );
        }
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
      if (xtrfStatus === "none") {
        query = query.is("xtrf_project_number", null);
      } else if (xtrfStatus) {
        query = query.eq("xtrf_project_status", xtrfStatus);
      }
      if (xtrfInvoiceStatuses.length > 0) {
        if (xtrfInvoiceStatuses.includes("NONE")) {
          const otherStatuses = xtrfInvoiceStatuses.filter(s => s !== "NONE");
          if (otherStatuses.length > 0) {
            query = query.or(`xtrf_invoice_status.is.null,xtrf_invoice_status.in.(${otherStatuses.join(",")})`);
          } else {
            query = query.is("xtrf_invoice_status", null);
          }
        } else {
          query = query.in("xtrf_invoice_status", xtrfInvoiceStatuses);
        }
      }
      if (xtrfPaymentStatuses.length > 0) {
        query = query.in("xtrf_invoice_payment_status", xtrfPaymentStatuses);
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
          xtrf_project_number: order.xtrf_project_number,
          xtrf_invoice_id: order.xtrf_invoice_id,
          xtrf_invoice_number: order.xtrf_invoice_number,
          xtrf_invoice_status: order.xtrf_invoice_status,
          xtrf_invoice_payment_status: order.xtrf_invoice_payment_status,
          xtrf_project_total_agreed: order.xtrf_project_total_agreed,
          xtrf_project_total_cost: order.xtrf_project_total_cost,
          xtrf_project_currency_code: order.xtrf_project_currency_code,
          xtrf_project_status: order.xtrf_project_status,
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
  }, [search, status, workStatus, dateFrom, dateTo, rushOnly, xtrfStatus, xtrfInvoiceStatuses.join(","), xtrfPaymentStatuses.join(","), page]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== "page") {
      params.set("page", "1");
    }
    setSearchParams(params);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter("search", searchInput);
  };

  const toggleMultiFilter = (key: string, value: string, current: string[]) => {
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    updateFilter(key, next.join(","));
  };

  const clearFilters = () => {
    setSearchParams({});
    setSearchInput("");
  };

  const handleExport = () => {
    const headers = [
      "Order Number",
      "Customer Name",
      "Customer Email",
      "Status",
      "Work Status",
      "Total",
      "Rush",
      "XTRF Project",
      "Client Total",
      "Vendor Cost",
      "Profit",
      "ROI %",
      "Currency",
      "XTRF Invoice",
      "Estimated Delivery",
      "Created",
    ];
    const rows = orders.map((o) => {
      const clientTotal = o.xtrf_project_total_agreed;
      const vendorCost = o.xtrf_project_total_cost;
      const profit = clientTotal != null && vendorCost != null && vendorCost > 0
        ? clientTotal - vendorCost
        : null;
      const roi = profit != null && vendorCost != null && vendorCost > 0
        ? (profit / vendorCost) * 100
        : null;
      return [
        o.order_number,
        o.customer_name,
        o.customer_email,
        o.status,
        o.work_status,
        (o.total_amount || 0).toFixed(2),
        o.is_rush ? "Yes" : "No",
        o.xtrf_project_number ?? "",
        clientTotal != null ? clientTotal.toFixed(2) : "",
        vendorCost != null && vendorCost > 0 ? vendorCost.toFixed(2) : "",
        profit != null ? profit.toFixed(2) : "",
        roi != null ? roi.toFixed(1) : "",
        o.xtrf_project_currency_code ?? "",
        o.xtrf_invoice_number ?? "",
        o.estimated_delivery_date
          ? format(new Date(o.estimated_delivery_date), "yyyy-MM-dd")
          : "",
        format(new Date(o.created_at), "yyyy-MM-dd"),
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasActiveFilters =
    search || status || workStatus || dateFrom || dateTo || rushOnly || xtrfStatus || xtrfInvoiceStatuses.length > 0 || xtrfPaymentStatuses.length > 0;

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
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
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
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 md:max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search orders..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
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
                      xtrfStatus,
                      xtrfInvoiceStatuses.length > 0,
                      xtrfPaymentStatuses.length > 0,
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
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-6 gap-4">
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

              {/* XTRF Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  XTRF Status
                </label>
                <select
                  value={xtrfStatus}
                  onChange={(e) => updateFilter("xtrfStatus", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All XTRF Status</option>
                  <option value="OPENED">XTRF Open</option>
                  <option value="CLOSED">XTRF Closed</option>
                  <option value="CANCELLED">XTRF Cancelled</option>
                  <option value="none">No XTRF Project</option>
                </select>
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

              {/* XTRF Invoice Status */}
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  XTRF Invoice Status
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {[
                    { value: "NONE", label: "No Invoice" },
                    { value: "READY", label: "Ready" },
                    { value: "SENT", label: "Sent" },
                    { value: "NOT_READY", label: "Not Ready" },
                    { value: "DRAFT", label: "Draft" },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={xtrfInvoiceStatuses.includes(opt.value)}
                        onChange={() => toggleMultiFilter("xtrfInvStatus", opt.value, xtrfInvoiceStatuses)}
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* XTRF Payment Status */}
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  XTRF Payment Status
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {[
                    { value: "FULLY_PAID", label: "Paid" },
                    { value: "PARTIALLY_PAID", label: "Partially Paid" },
                    { value: "NOT_PAID", label: "Unpaid" },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={xtrfPaymentStatuses.includes(opt.value)}
                        onChange={() => toggleMultiFilter("xtrfPayStatus", opt.value, xtrfPaymentStatuses)}
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order Details
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vendor Cost
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profit
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ROI %
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    XTRF Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    XTRF Invoice
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Delivery
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-12 text-center">
                      <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
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
                      {/* Combined Order Details */}
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/orders/${order.id}`}
                          className="block group"
                        >
                          <p className="text-sm font-semibold text-gray-900 font-mono group-hover:text-teal-600">
                            {order.order_number}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {format(new Date(order.created_at), "MMM d, yyyy")}
                            {order.is_rush && (
                              <span className="ml-1.5 text-amber-600 font-medium">
                                ⚡ Rush
                              </span>
                            )}
                          </p>
                        </Link>
                      </td>
                      {/* Customer */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {order.customer_name || "—"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {order.customer_email || "—"}
                        </p>
                      </td>
                      {/* Combined Status Column */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <OrderStatusBadge status={order.status} />
                          <div>
                            <WorkStatusBadge status={order.work_status} />
                          </div>
                          <XtrfProjectStatusBadge status={order.xtrf_project_status} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">
                          ${(order.total_amount || 0).toFixed(2)}
                        </p>
                      </td>
                      {/* Client Total */}
                      <td className="px-4 py-3 text-right">
                        {order.xtrf_project_total_agreed != null ? (
                          <span className="text-sm text-gray-900 tabular-nums">
                            {order.xtrf_project_total_agreed.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      {/* Vendor Cost */}
                      <td className="px-4 py-3 text-right">
                        {order.xtrf_project_total_cost != null && order.xtrf_project_total_cost > 0 ? (
                          <span className="text-sm text-gray-700 tabular-nums">
                            {order.xtrf_project_total_cost.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      {/* Profit */}
                      <td className="px-4 py-3 text-right">
                        {order.xtrf_project_total_agreed != null && order.xtrf_project_total_cost != null && order.xtrf_project_total_cost > 0 ? (() => {
                          const profit = order.xtrf_project_total_agreed - order.xtrf_project_total_cost;
                          return (
                            <span className={`text-sm font-medium tabular-nums ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {profit.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                            </span>
                          );
                        })() : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      {/* ROI % */}
                      <td className="px-4 py-3 text-right">
                        {order.xtrf_project_total_agreed != null && order.xtrf_project_total_cost != null && order.xtrf_project_total_cost > 0 ? (() => {
                          const roi = ((order.xtrf_project_total_agreed - order.xtrf_project_total_cost) / order.xtrf_project_total_cost) * 100;
                          return (
                            <span className={`text-sm font-medium tabular-nums ${roi >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {roi.toFixed(1)}%
                            </span>
                          );
                        })() : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      {/* XTRF Project */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {order.xtrf_project_number ? (
                          <span className="text-sm font-mono text-gray-900">{order.xtrf_project_number}</span>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      {/* XTRF Invoice */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {order.xtrf_invoice_number ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-mono text-gray-900">{order.xtrf_invoice_number}</span>
                            <div className="flex items-center gap-1">
                              <XtrfInvoiceStatusBadge status={order.xtrf_invoice_status} />
                              <XtrfPaymentStatusBadge status={order.xtrf_invoice_payment_status} />
                            </div>
                          </div>
                        ) : order.xtrf_project_total_agreed != null ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-400 italic">No invoice</span>
                            <span className="text-xs text-gray-500">
                              {order.xtrf_project_total_agreed.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      {/* Delivery Date */}
                      <td className="px-4 py-3">
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
                      {/* Actions Meatball Menu */}
                      <td className="px-4 py-3 text-center relative">
                        <button
                          onClick={() =>
                            setOpenMenuId(
                              openMenuId === order.id ? null : order.id,
                            )
                          }
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          aria-label="Actions"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-600" />
                        </button>
                        {openMenuId === order.id && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenMenuId(null)}
                            />
                            <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                              <Link
                                to={`/admin/orders/${order.id}`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <Eye className="w-4 h-4" />
                                View Details
                              </Link>
                            </div>
                          </>
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

// Order Status Badge - Normalized to Title Case
function OrderStatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    pending_payment: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    processing: "bg-blue-100 text-blue-700",
    draft_review: "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
    delivered: "bg-green-100 text-green-700",
    invoiced: "bg-purple-100 text-purple-700",
    refunded: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-700",
  };

  const labels: Record<string, string> = {
    pending: "Pending",
    pending_payment: "Pending Payment",
    paid: "Paid",
    processing: "Processing",
    draft_review: "Draft Review",
    completed: "Completed",
    delivered: "Delivered",
    invoiced: "Invoiced",
    refunded: "Refunded",
    cancelled: "Cancelled",
  };

  // Fallback: convert snake_case to Title Case
  const formatStatus = (s: string) => {
    return s
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${styles[status || ""] || "bg-gray-100 text-gray-700"}`}
    >
      {labels[status || ""] || (status ? formatStatus(status) : "Unknown")}
    </span>
  );
}

// Work Status Badge - Normalized to Title Case
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

  // Fallback: convert snake_case to Title Case
  const formatStatus = (s: string) => {
    return s
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const { style, icon, label } = config[status || ""] || {
    style: "bg-gray-100 text-gray-700",
    icon: null,
    label: status ? formatStatus(status) : "Unknown",
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

function XtrfProjectStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const cfg: Record<string, { style: string; label: string }> = {
    OPENED:    { style: "bg-blue-100 text-blue-700",   label: "XTRF Open" },
    CLOSED:    { style: "bg-green-100 text-green-700", label: "XTRF Closed" },
    CANCELLED: { style: "bg-red-100 text-red-700",     label: "XTRF Cancelled" },
  };
  const { style, label } = cfg[status] ?? { style: "bg-gray-100 text-gray-500", label: status };
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${style}`}>
      {label}
    </span>
  );
}

function XtrfInvoiceStatusBadge({ status }: { status?: string | null }) {
  const styles: Record<string, string> = {
    SENT:      "bg-green-100 text-green-700",
    READY:     "bg-blue-100 text-blue-700",
    NOT_READY: "bg-gray-100 text-gray-500",
    DRAFT:     "bg-yellow-100 text-yellow-700",
  };
  if (!status) return null;
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${styles[status] || "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

function XtrfPaymentStatusBadge({ status }: { status?: string | null }) {
  const styles: Record<string, string> = {
    FULLY_PAID:     "bg-green-100 text-green-700",
    PARTIALLY_PAID: "bg-amber-100 text-amber-700",
    NOT_PAID:       "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    FULLY_PAID:     "Paid",
    PARTIALLY_PAID: "Partial",
    NOT_PAID:       "Unpaid",
  };
  if (!status) return null;
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${styles[status] || "bg-gray-100 text-gray-500"}`}>
      {labels[status] || status}
    </span>
  );
}
