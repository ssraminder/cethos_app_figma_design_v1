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
  Settings2,
} from "lucide-react";
import { format } from "date-fns";
import { StatCard } from "@/components/admin/StatCard";
import { DollarSign, Zap, TrendingUp, Hash } from "lucide-react";

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

const FILTERS_STORAGE_KEY = "adminOrdersFilters";
const COLUMN_SETTINGS_KEY = "adminOrdersColumnSettings";

// Column keys used for both UI and export visibility
type ColumnKey =
  | "orderDetails"
  | "customer"
  | "status"
  | "total"
  | "clientTotal"
  | "vendorCost"
  | "profit"
  | "profitPct"
  | "xtrfProject"
  | "xtrfInvoice"
  | "delivery";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  ui: boolean;
  export: boolean;
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "orderDetails", label: "Order Details", ui: true, export: true },
  { key: "customer", label: "Customer", ui: true, export: true },
  { key: "status", label: "Status", ui: true, export: true },
  { key: "total", label: "Total", ui: true, export: true },
  { key: "clientTotal", label: "Client Total", ui: true, export: true },
  { key: "vendorCost", label: "Vendor Cost", ui: true, export: true },
  { key: "profit", label: "Profit", ui: true, export: true },
  { key: "profitPct", label: "% Profit", ui: true, export: true },
  { key: "xtrfProject", label: "XTRF Project", ui: true, export: true },
  { key: "xtrfInvoice", label: "XTRF Invoice", ui: true, export: true },
  { key: "delivery", label: "Delivery", ui: true, export: true },
];

function loadColumnSettings(): ColumnDef[] {
  try {
    const saved = localStorage.getItem(COLUMN_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, { ui: boolean; export: boolean }>;
      return DEFAULT_COLUMNS.map((col) => ({
        ...col,
        ui: parsed[col.key]?.ui ?? col.ui,
        export: parsed[col.key]?.export ?? col.export,
      }));
    }
  } catch { /* ignore */ }
  return DEFAULT_COLUMNS;
}

function saveColumnSettings(columns: ColumnDef[]) {
  try {
    const data: Record<string, { ui: boolean; export: boolean }> = {};
    columns.forEach((c) => { data[c.key] = { ui: c.ui, export: c.export }; });
    localStorage.setItem(COLUMN_SETTINGS_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export default function AdminOrdersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [restoredFromSession, setRestoredFromSession] = useState(false);

  // Restore filters from sessionStorage on mount if URL has no filter params
  useEffect(() => {
    const filterKeys = ["search", "status", "work_status", "from", "to", "rush", "xtrfStatus", "xtrfInvStatus", "xtrfPayStatus"];
    const hasUrlFilters = filterKeys.some(k => searchParams.has(k));
    if (!hasUrlFilters) {
      try {
        const saved = sessionStorage.getItem(FILTERS_STORAGE_KEY);
        if (saved) {
          const restored = new URLSearchParams(saved);
          // Only restore if there are actual filter values
          if (filterKeys.some(k => restored.has(k))) {
            setSearchParams(restored, { replace: true });
          }
        }
      } catch { /* ignore storage errors */ }
    }
    setRestoredFromSession(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    if (!restoredFromSession) return;
    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, searchParams.toString());
    } catch { /* ignore storage errors */ }
  }, [searchParams, restoredFromSession]);

  const [searchInput, setSearchInput] = useState(search);
  const [showFilters, setShowFilters] = useState(() => {
    // Auto-open filter panel if there are active filters (from URL or session)
    const filterKeys = ["status", "work_status", "from", "to", "rush", "xtrfStatus", "xtrfInvStatus", "xtrfPayStatus"];
    return filterKeys.some(k => searchParams.has(k));
  });

  // Keep searchInput in sync when search param changes (e.g. after session restore)
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Auto-expand filter panel when filters become active
  useEffect(() => {
    if (restoredFromSession) {
      const filterKeys = ["status", "work_status", "from", "to", "rush", "xtrfStatus", "xtrfInvStatus", "xtrfPayStatus"];
      if (filterKeys.some(k => searchParams.has(k))) {
        setShowFilters(true);
      }
    }
  }, [searchParams, restoredFromSession]);

  // Actions menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Column visibility settings
  const [columnSettings, setColumnSettings] = useState<ColumnDef[]>(loadColumnSettings);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const isColVisible = (key: ColumnKey) => columnSettings.find((c) => c.key === key)?.ui !== false;
  const isColExported = (key: ColumnKey) => columnSettings.find((c) => c.key === key)?.export !== false;
  const toggleColumnSetting = (key: ColumnKey, field: "ui" | "export") => {
    setColumnSettings((prev) => {
      const next = prev.map((c) => c.key === key ? { ...c, [field]: !c[field] } : c);
      saveColumnSettings(next);
      return next;
    });
  };

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
    if (!restoredFromSession) return;
    fetchOrders();
  }, [restoredFromSession, search, status, workStatus, dateFrom, dateTo, rushOnly, xtrfStatus, xtrfInvoiceStatuses.join(","), xtrfPaymentStatuses.join(","), page]);

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
    try { sessionStorage.removeItem(FILTERS_STORAGE_KEY); } catch { /* ignore */ }
  };

  const handleExport = () => {
    // Map column keys to export headers and value extractors
    const exportColumns: { key: ColumnKey; headers: string[]; values: (o: Order) => string[] }[] = [
      { key: "orderDetails", headers: ["Order Number", "Rush", "Created"], values: (o) => [o.order_number, o.is_rush ? "Yes" : "No", format(new Date(o.created_at), "yyyy-MM-dd")] },
      { key: "customer", headers: ["Customer Name", "Customer Email"], values: (o) => [o.customer_name, o.customer_email] },
      { key: "status", headers: ["Status", "Work Status"], values: (o) => [o.status, o.work_status] },
      { key: "total", headers: ["Total"], values: (o) => [(o.total_amount || 0).toFixed(2)] },
      { key: "clientTotal", headers: ["Client Total"], values: (o) => [o.xtrf_project_total_agreed != null ? o.xtrf_project_total_agreed.toFixed(2) : ""] },
      { key: "vendorCost", headers: ["Vendor Cost"], values: (o) => [o.xtrf_project_total_cost != null && o.xtrf_project_total_cost > 0 ? o.xtrf_project_total_cost.toFixed(2) : ""] },
      { key: "profit", headers: ["Profit", "Currency"], values: (o) => {
        const clientTotal = o.xtrf_project_total_agreed;
        const vendorCost = o.xtrf_project_total_cost;
        const profit = clientTotal != null && vendorCost != null && vendorCost > 0 ? clientTotal - vendorCost : null;
        return [profit != null ? profit.toFixed(2) : "", o.xtrf_project_currency_code ?? ""];
      }},
      { key: "profitPct", headers: ["% Profit"], values: (o) => {
        const clientTotal = o.xtrf_project_total_agreed;
        const vendorCost = o.xtrf_project_total_cost;
        const profit = clientTotal != null && vendorCost != null && vendorCost > 0 ? clientTotal - vendorCost : null;
        const pct = profit != null && clientTotal != null && clientTotal > 0 ? (profit / clientTotal) * 100 : null;
        return [pct != null ? pct.toFixed(1) : ""];
      }},
      { key: "xtrfProject", headers: ["XTRF Project"], values: (o) => [o.xtrf_project_number ?? ""] },
      { key: "xtrfInvoice", headers: ["XTRF Invoice"], values: (o) => [o.xtrf_invoice_number ?? ""] },
      { key: "delivery", headers: ["Estimated Delivery"], values: (o) => [o.estimated_delivery_date ? format(new Date(o.estimated_delivery_date), "yyyy-MM-dd") : ""] },
    ];

    const visibleExportCols = exportColumns.filter((c) => isColExported(c.key));
    const headers = visibleExportCols.flatMap((c) => c.headers);
    const rows = orders.map((o) => visibleExportCols.flatMap((c) => c.values(o)));
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
          <button
            onClick={() => setShowColumnSettings(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Column Settings"
          >
            <Settings2 className="w-4 h-4" />
            Columns
          </button>
          <Link
            to="/admin/orders/new"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            New project
          </Link>
        </div>
      </div>

      <div>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Orders"
            value={totalCount}
            icon={Hash}
            color="blue"
          />
          <StatCard
            label="Page Revenue"
            value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            icon={DollarSign}
            color="green"
          />
          <StatCard
            label="Rush Orders"
            value={orders.filter((o) => o.is_rush).length}
            icon={Zap}
            color="amber"
            valueColor={orders.filter((o) => o.is_rush).length > 0 ? "text-amber-600" : undefined}
          />
          <StatCard
            label="Avg Order Value"
            value={`$${orders.length > 0 ? (totalRevenue / orders.length).toFixed(2) : "0.00"}`}
            icon={TrendingUp}
            color="purple"
          />
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
            <table className="w-full min-w-[1200px]">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  {isColVisible("orderDetails") && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Order Details</th>}
                  {isColVisible("customer") && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Customer</th>}
                  {isColVisible("status") && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Status</th>}
                  {isColVisible("total") && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Total</th>}
                  {isColVisible("clientTotal") && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Client Total</th>}
                  {isColVisible("vendorCost") && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Vendor Cost</th>}
                  {isColVisible("profit") && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Profit</th>}
                  {isColVisible("profitPct") && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Profit %</th>}
                  {isColVisible("xtrfProject") && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">XTRF Project</th>}
                  {isColVisible("xtrfInvoice") && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">XTRF Invoice</th>}
                  {isColVisible("delivery") && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Delivery</th>}
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={columnSettings.filter(c => c.ui).length + 1} className="px-6 py-12 text-center">
                      <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columnSettings.filter(c => c.ui).length + 1}
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
                      {/* Order Details */}
                      {isColVisible("orderDetails") && (
                        <td className="px-4 py-3">
                          <Link to={`/admin/orders/${order.id}`} className="block group">
                            <p className="text-sm font-semibold text-gray-900 font-mono group-hover:text-teal-600">
                              {order.order_number}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {format(new Date(order.created_at), "MMM d, yyyy")}
                              {order.is_rush && (
                                <span className="ml-1.5 text-amber-600 font-medium">⚡ Rush</span>
                              )}
                            </p>
                          </Link>
                        </td>
                      )}
                      {/* Customer */}
                      {isColVisible("customer") && (
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{order.customer_name || "—"}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{order.customer_email || "—"}</p>
                        </td>
                      )}
                      {/* Status */}
                      {isColVisible("status") && (
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <OrderStatusBadge status={order.status} />
                            <WorkStatusBadge status={order.work_status} />
                            <XtrfProjectStatusBadge status={order.xtrf_project_status} />
                          </div>
                        </td>
                      )}
                      {/* Total */}
                      {isColVisible("total") && (
                        <td className="px-4 py-3 text-right">
                          <p className="text-sm font-semibold text-gray-900 tabular-nums">
                            ${(order.total_amount || 0).toFixed(2)}
                          </p>
                        </td>
                      )}
                      {/* Client Total */}
                      {isColVisible("clientTotal") && (
                        <td className="px-4 py-3 text-right">
                          {order.xtrf_project_total_agreed != null ? (
                            <span className="text-sm text-gray-900 tabular-nums">
                              {order.xtrf_project_total_agreed.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* Vendor Cost */}
                      {isColVisible("vendorCost") && (
                        <td className="px-4 py-3 text-right">
                          {order.xtrf_project_total_cost != null && order.xtrf_project_total_cost > 0 ? (
                            <span className="text-sm text-gray-700 tabular-nums">
                              {order.xtrf_project_total_cost.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* Profit */}
                      {isColVisible("profit") && (
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
                      )}
                      {/* % Profit */}
                      {isColVisible("profitPct") && (
                        <td className="px-4 py-3 text-right">
                          {order.xtrf_project_total_agreed != null && order.xtrf_project_total_agreed > 0 && order.xtrf_project_total_cost != null && order.xtrf_project_total_cost > 0 ? (() => {
                            const profitPct = ((order.xtrf_project_total_agreed - order.xtrf_project_total_cost) / order.xtrf_project_total_agreed) * 100;
                            return (
                              <span className={`text-sm font-medium tabular-nums ${profitPct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {profitPct.toFixed(1)}%
                              </span>
                            );
                          })() : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* XTRF Project */}
                      {isColVisible("xtrfProject") && (
                        <td className="px-4 py-3 whitespace-nowrap">
                          {order.xtrf_project_number ? (
                            <span className="text-sm font-mono text-gray-900">{order.xtrf_project_number}</span>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* XTRF Invoice */}
                      {isColVisible("xtrfInvoice") && (
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
                      )}
                      {/* Delivery Date */}
                      {isColVisible("delivery") && (
                        <td className="px-4 py-3">
                          {order.estimated_delivery_date ? (
                            <p className="text-sm text-gray-700">
                              {format(new Date(order.estimated_delivery_date), "MMM d, yyyy")}
                            </p>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                      )}
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

        {/* Column Settings Modal */}
        {showColumnSettings && (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowColumnSettings(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Column Settings</h3>
                  <button onClick={() => setShowColumnSettings(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <div className="px-6 py-4">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                        <th className="pb-3">Column</th>
                        <th className="pb-3 text-center w-20">UI</th>
                        <th className="pb-3 text-center w-20">Export</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {columnSettings.map((col) => (
                        <tr key={col.key} className="hover:bg-gray-50">
                          <td className="py-2.5 text-sm text-gray-700">{col.label}</td>
                          <td className="py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={col.ui}
                              onChange={() => toggleColumnSetting(col.key, "ui")}
                              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={col.export}
                              onChange={() => toggleColumnSetting(col.key, "export")}
                              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-3 border-t border-gray-200 flex justify-between">
                  <button
                    onClick={() => {
                      setColumnSettings(DEFAULT_COLUMNS);
                      saveColumnSettings(DEFAULT_COLUMNS);
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Reset to defaults
                  </button>
                  <button
                    onClick={() => setShowColumnSettings(false)}
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
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
