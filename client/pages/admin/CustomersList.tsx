import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Users,
  Building2,
  User,
  Eye,
  MoreVertical,
  Mail,
  Phone,
  ArrowUpDown,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

interface Customer {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  customer_type: "individual" | "business";
  company_name: string | null;
  created_at: string;
  last_login_at: string | null;
  total_orders: number;
  total_spent: number;
  last_order_date: string | null;
}

interface SummaryStats {
  totalCustomers: number;
  individualCount: number;
  businessCount: number;
  newThisMonth: number;
}

const PAGE_SIZE = 25;

type SortField = "full_name" | "email" | "created_at" | "total_orders" | "total_spent";
type SortDirection = "asc" | "desc";

export default function CustomersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get("page") || "1", 10);
  const search = searchParams.get("search") || "";
  const customerType = searchParams.get("type") || "";
  const sortField = (searchParams.get("sort") as SortField) || "created_at";
  const sortDir = (searchParams.get("dir") as SortDirection) || "desc";

  const [searchInput, setSearchInput] = useState(search);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<SummaryStats>({
    totalCustomers: 0,
    individualCount: 0,
    businessCount: 0,
    newThisMonth: 0,
  });

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Fetch summary stats
  const fetchStats = async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    try {
      const [totalRes, individualRes, businessRes, newRes] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("customer_type", "individual"),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("customer_type", "business"),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .gte("created_at", monthStart),
      ]);

      setStats({
        totalCustomers: totalRes.count || 0,
        individualCount: individualRes.count || 0,
        businessCount: businessRes.count || 0,
        newThisMonth: newRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  // Fetch customers with order aggregation
  const fetchCustomers = async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      // Build the query
      let query = supabase.from("customers").select(
        `
        id,
        email,
        full_name,
        phone,
        customer_type,
        company_name,
        created_at,
        last_login_at
      `,
        { count: "exact" }
      );

      // Apply search filter
      if (search) {
        query = query.or(
          `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,company_name.ilike.%${search}%`
        );
      }

      // Apply type filter
      if (customerType) {
        query = query.eq("customer_type", customerType);
      }

      // Apply sorting
      query = query.order(sortField, { ascending: sortDir === "asc" });

      // Apply pagination
      query = query.range(from, to);

      const { data: customersData, count, error } = await query;

      if (error) throw error;

      // Fetch order aggregates for these customers
      const customerIds = (customersData || []).map((c) => c.id);

      if (customerIds.length > 0) {
        // Get order counts and totals
        const { data: orderAggregates } = await supabase
          .from("orders")
          .select("customer_id, total_amount, created_at")
          .in("customer_id", customerIds);

        // Calculate aggregates per customer
        const aggregateMap = new Map<
          string,
          { total_orders: number; total_spent: number; last_order_date: string | null }
        >();

        (orderAggregates || []).forEach((order) => {
          const existing = aggregateMap.get(order.customer_id) || {
            total_orders: 0,
            total_spent: 0,
            last_order_date: null,
          };

          existing.total_orders += 1;
          existing.total_spent += order.total_amount || 0;

          if (!existing.last_order_date || order.created_at > existing.last_order_date) {
            existing.last_order_date = order.created_at;
          }

          aggregateMap.set(order.customer_id, existing);
        });

        // Merge aggregates with customer data
        const enrichedCustomers = (customersData || []).map((c) => {
          const agg = aggregateMap.get(c.id) || {
            total_orders: 0,
            total_spent: 0,
            last_order_date: null,
          };
          return {
            ...c,
            total_orders: agg.total_orders,
            total_spent: agg.total_spent,
            last_order_date: agg.last_order_date,
          };
        });

        // Re-sort if sorting by aggregated fields
        if (sortField === "total_orders" || sortField === "total_spent") {
          enrichedCustomers.sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            return sortDir === "asc" ? aVal - bVal : bVal - aVal;
          });
        }

        setCustomers(enrichedCustomers);
      } else {
        setCustomers([]);
      }

      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchCustomers()]);
    setRefreshing(false);
    toast.success("Data refreshed");
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [page, search, customerType, sortField, sortDir]);

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

  const handleSort = (field: SortField) => {
    const params = new URLSearchParams(searchParams);
    if (sortField === field) {
      // Toggle direction
      params.set("dir", sortDir === "asc" ? "desc" : "asc");
    } else {
      params.set("sort", field);
      params.set("dir", "desc");
    }
    params.set("page", "1");
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearchParams({});
    setSearchInput("");
  };

  const hasActiveFilters = search || customerType;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const SortHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <button
      onClick={() => handleSort(field)}
      className={`flex items-center gap-1 text-xs font-medium uppercase tracking-wider ${
        sortField === field ? "text-teal-600" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount.toLocaleString()} total customers
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-sm">Total Customers</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{stats.totalCustomers}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <User className="w-4 h-4" />
            <span className="text-sm">Individual</span>
          </div>
          <p className="text-2xl font-semibold text-blue-600">{stats.individualCount}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <Building2 className="w-4 h-4" />
            <span className="text-sm">Business</span>
          </div>
          <p className="text-2xl font-semibold text-purple-600">{stats.businessCount}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-sm">New This Month</span>
          </div>
          <p className="text-2xl font-semibold text-green-600">{stats.newThisMonth}</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex-1 md:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, email, phone, or company..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
              />
            </div>
          </form>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              hasActiveFilters
                ? "border-teal-300 bg-teal-50 text-teal-700"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="w-5 h-5 bg-teal-600 text-white text-xs rounded-full flex items-center justify-center">
                {[search, customerType].filter(Boolean).length}
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
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Type
              </label>
              <select
                value={customerType}
                onChange={(e) => updateFilter("type", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
              >
                <option value="">All Types</option>
                <option value="individual">Individual</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left">
                  <SortHeader field="full_name">Customer</SortHeader>
                </th>
                <th className="px-4 py-3 text-left">
                  <SortHeader field="email">Email</SortHeader>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-right">
                  <SortHeader field="total_orders">Orders</SortHeader>
                </th>
                <th className="px-4 py-3 text-right">
                  <SortHeader field="total_spent">Total Spent</SortHeader>
                </th>
                <th className="px-4 py-3 text-left">
                  <SortHeader field="created_at">Joined</SortHeader>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                    <p className="text-gray-500 mt-2">Loading...</p>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No customers found
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/customers/${customer.id}`}
                        className="block group"
                      >
                        <p className="text-sm font-medium text-gray-900 group-hover:text-teal-600">
                          {customer.full_name || "—"}
                        </p>
                        {customer.company_name && (
                          <p className="text-xs text-gray-500">{customer.company_name}</p>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`mailto:${customer.email}`}
                        className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-teal-600"
                      >
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        {customer.email}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      {customer.phone ? (
                        <a
                          href={`tel:${customer.phone}`}
                          className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-teal-600"
                        >
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          {customer.phone}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <CustomerTypeBadge type={customer.customer_type} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-medium text-gray-900 tabular-nums">
                        {customer.total_orders}
                      </p>
                      {customer.last_order_date && (
                        <p className="text-xs text-gray-500">
                          Last: {format(parseISO(customer.last_order_date), "MMM d")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">
                        ${customer.total_spent.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">
                        {format(parseISO(customer.created_at), "MMM d, yyyy")}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center relative">
                      <button
                        onClick={() =>
                          setOpenMenuId(openMenuId === customer.id ? null : customer.id)
                        }
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="Actions"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-600" />
                      </button>
                      {openMenuId === customer.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                            <Link
                              to={`/admin/customers/${customer.id}`}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <Eye className="w-4 h-4" />
                              View Details
                            </Link>
                            <a
                              href={`mailto:${customer.email}`}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <Mail className="w-4 h-4" />
                              Send Email
                            </a>
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
              {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
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
  );
}

// Customer Type Badge
function CustomerTypeBadge({ type }: { type: "individual" | "business" }) {
  if (type === "business") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
        <Building2 className="w-3 h-3" />
        Business
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
      <User className="w-3 h-3" />
      Individual
    </span>
  );
}
