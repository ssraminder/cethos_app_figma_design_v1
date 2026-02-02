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
  DollarSign,
  Clock,
  AlertTriangle,
  CreditCard,
  Send,
  Eye,
  MoreVertical,
  Calendar,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";
import { format, differenceInDays, startOfMonth, endOfMonth, parseISO, isAfter } from "date-fns";
import { toast } from "sonner";

// Types
interface UnpaidQuote {
  id: string;
  quote_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  total: number;
  created_at: string;
  expires_at: string;
  days_until_expiry: number;
}

interface BalanceDueOrder {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  paid_amount: number;
  balance_remaining: number;
  created_at: string;
}

interface RecentPayment {
  id: string;
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  amount: number;
  currency: string;
  payment_type: string;
  status: string;
  created_at: string;
  receipt_url: string | null;
}

interface OverdueQuote {
  id: string;
  quote_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  total: number;
  created_at: string;
  expires_at: string;
  days_overdue: number;
}

interface SummaryStats {
  totalOutstanding: number;
  awaitingPayment: number;
  awaitingPaymentCount: number;
  balanceDue: number;
  balanceDueCount: number;
  collectedThisMonth: number;
  overdueCount: number;
  overdueAmount: number;
}

const TABS = ["unpaid", "balance_due", "payments", "overdue"] as const;
type Tab = (typeof TABS)[number];

const PAGE_SIZE = 25;

export default function AccountsReceivable() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as Tab) || "unpaid";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const search = searchParams.get("search") || "";
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";
  const paymentType = searchParams.get("payment_type") || "";
  const paymentStatus = searchParams.get("payment_status") || "";

  const [searchInput, setSearchInput] = useState(search);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [stats, setStats] = useState<SummaryStats>({
    totalOutstanding: 0,
    awaitingPayment: 0,
    awaitingPaymentCount: 0,
    balanceDue: 0,
    balanceDueCount: 0,
    collectedThisMonth: 0,
    overdueCount: 0,
    overdueAmount: 0,
  });
  const [unpaidQuotes, setUnpaidQuotes] = useState<UnpaidQuote[]>([]);
  const [unpaidQuotesCount, setUnpaidQuotesCount] = useState(0);
  const [balanceDueOrders, setBalanceDueOrders] = useState<BalanceDueOrder[]>([]);
  const [balanceDueCount, setBalanceDueCount] = useState(0);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [recentPaymentsCount, setRecentPaymentsCount] = useState(0);
  const [overdueQuotes, setOverdueQuotes] = useState<OverdueQuote[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);

  // Actions menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Fetch summary stats
  const fetchStats = async () => {
    const now = new Date();
    const monthStart = startOfMonth(now).toISOString();
    const monthEnd = endOfMonth(now).toISOString();

    try {
      // Fetch awaiting payment quotes
      const { data: awaitingQuotes, error: awaitingErr } = await supabase
        .from("quotes")
        .select("id, total")
        .eq("status", "awaiting_payment")
        .is("deleted_at", null);

      if (awaitingErr) throw awaitingErr;

      // Fetch balance due orders with their payments
      const { data: balanceOrders, error: balanceErr } = await supabase
        .from("orders")
        .select(`
          id,
          total_amount,
          payments(amount, status)
        `)
        .eq("status", "balance_due");

      if (balanceErr) throw balanceErr;

      // Calculate balance due amounts
      let balanceDueTotal = 0;
      (balanceOrders || []).forEach((order: any) => {
        const paidAmount = (order.payments || [])
          .filter((p: any) => p.status === "succeeded")
          .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
        balanceDueTotal += (order.total_amount || 0) - paidAmount;
      });

      // Fetch this month's successful payments
      const { data: monthPayments, error: monthErr } = await supabase
        .from("payments")
        .select("amount")
        .eq("status", "succeeded")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);

      if (monthErr) throw monthErr;

      const collectedThisMonth = (monthPayments || []).reduce(
        (sum, p) => sum + (p.amount || 0),
        0
      );

      // Fetch overdue quotes (past expires_at, still awaiting_payment)
      const { data: overdueData, error: overdueErr } = await supabase
        .from("quotes")
        .select("id, total")
        .eq("status", "awaiting_payment")
        .lt("expires_at", now.toISOString())
        .is("deleted_at", null);

      if (overdueErr) throw overdueErr;

      const awaitingTotal = (awaitingQuotes || []).reduce(
        (sum, q) => sum + (q.total || 0),
        0
      );

      const overdueAmount = (overdueData || []).reduce(
        (sum, q) => sum + (q.total || 0),
        0
      );

      setStats({
        totalOutstanding: awaitingTotal + balanceDueTotal,
        awaitingPayment: awaitingTotal,
        awaitingPaymentCount: awaitingQuotes?.length || 0,
        balanceDue: balanceDueTotal,
        balanceDueCount: balanceOrders?.length || 0,
        collectedThisMonth,
        overdueCount: overdueData?.length || 0,
        overdueAmount,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast.error("Failed to load summary statistics");
    }
  };

  // Fetch unpaid quotes
  const fetchUnpaidQuotes = async () => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const now = new Date();

    try {
      let query = supabase
        .from("quotes")
        .select(
          `
          id,
          quote_number,
          customer_id,
          total,
          created_at,
          expires_at,
          customers!inner(id, full_name, email)
        `,
          { count: "exact" }
        )
        .eq("status", "awaiting_payment")
        .gt("expires_at", now.toISOString())
        .is("deleted_at", null);

      if (search) {
        query = query.or(
          `quote_number.ilike.%${search}%,customers.email.ilike.%${search}%,customers.full_name.ilike.%${search}%`
        );
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom);
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo + "T23:59:59");
      }

      query = query.order("expires_at", { ascending: true }).range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;

      const transformed = (data || []).map((q: any) => ({
        id: q.id,
        quote_number: q.quote_number,
        customer_id: q.customer_id,
        customer_name: q.customers?.full_name || "",
        customer_email: q.customers?.email || "",
        total: q.total || 0,
        created_at: q.created_at,
        expires_at: q.expires_at,
        days_until_expiry: differenceInDays(parseISO(q.expires_at), now),
      }));

      setUnpaidQuotes(transformed);
      setUnpaidQuotesCount(count || 0);
    } catch (error) {
      console.error("Error fetching unpaid quotes:", error);
      toast.error("Failed to load unpaid quotes");
    }
  };

  // Fetch balance due orders
  const fetchBalanceDueOrders = async () => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      let query = supabase
        .from("orders")
        .select(
          `
          id,
          order_number,
          customer_id,
          total_amount,
          created_at,
          customers!inner(id, full_name, email),
          payments(amount, status)
        `,
          { count: "exact" }
        )
        .eq("status", "balance_due");

      if (search) {
        query = query.or(
          `order_number.ilike.%${search}%,customers.email.ilike.%${search}%,customers.full_name.ilike.%${search}%`
        );
      }

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;

      const transformed = (data || []).map((o: any) => {
        const paidAmount = (o.payments || [])
          .filter((p: any) => p.status === "succeeded")
          .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

        return {
          id: o.id,
          order_number: o.order_number,
          customer_id: o.customer_id,
          customer_name: o.customers?.full_name || "",
          customer_email: o.customers?.email || "",
          total_amount: o.total_amount || 0,
          paid_amount: paidAmount,
          balance_remaining: (o.total_amount || 0) - paidAmount,
          created_at: o.created_at,
        };
      });

      setBalanceDueOrders(transformed);
      setBalanceDueCount(count || 0);
    } catch (error) {
      console.error("Error fetching balance due orders:", error);
      toast.error("Failed to load balance due orders");
    }
  };

  // Fetch recent payments
  const fetchRecentPayments = async () => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      let query = supabase
        .from("payments")
        .select(
          `
          id,
          order_id,
          amount,
          currency,
          payment_type,
          status,
          created_at,
          receipt_url,
          orders!inner(
            order_number,
            customer_id,
            customers(full_name, email)
          )
        `,
          { count: "exact" }
        );

      if (search) {
        query = query.or(
          `orders.order_number.ilike.%${search}%,orders.customers.email.ilike.%${search}%`
        );
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom);
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo + "T23:59:59");
      }
      if (paymentType) {
        query = query.eq("payment_type", paymentType);
      }
      if (paymentStatus) {
        query = query.eq("status", paymentStatus);
      }

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;

      const transformed = (data || []).map((p: any) => ({
        id: p.id,
        order_id: p.order_id,
        order_number: p.orders?.order_number || "",
        customer_name: p.orders?.customers?.full_name || "",
        customer_email: p.orders?.customers?.email || "",
        amount: p.amount || 0,
        currency: p.currency || "CAD",
        payment_type: p.payment_type || "",
        status: p.status || "",
        created_at: p.created_at,
        receipt_url: p.receipt_url,
      }));

      setRecentPayments(transformed);
      setRecentPaymentsCount(count || 0);
    } catch (error) {
      console.error("Error fetching recent payments:", error);
      toast.error("Failed to load recent payments");
    }
  };

  // Fetch overdue quotes
  const fetchOverdueQuotes = async () => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const now = new Date();

    try {
      let query = supabase
        .from("quotes")
        .select(
          `
          id,
          quote_number,
          customer_id,
          total,
          created_at,
          expires_at,
          customers!inner(id, full_name, email)
        `,
          { count: "exact" }
        )
        .eq("status", "awaiting_payment")
        .lt("expires_at", now.toISOString())
        .is("deleted_at", null);

      if (search) {
        query = query.or(
          `quote_number.ilike.%${search}%,customers.email.ilike.%${search}%,customers.full_name.ilike.%${search}%`
        );
      }

      query = query.order("expires_at", { ascending: true }).range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;

      const transformed = (data || []).map((q: any) => ({
        id: q.id,
        quote_number: q.quote_number,
        customer_id: q.customer_id,
        customer_name: q.customers?.full_name || "",
        customer_email: q.customers?.email || "",
        total: q.total || 0,
        created_at: q.created_at,
        expires_at: q.expires_at,
        days_overdue: differenceInDays(now, parseISO(q.expires_at)),
      }));

      setOverdueQuotes(transformed);
      setOverdueCount(count || 0);
    } catch (error) {
      console.error("Error fetching overdue quotes:", error);
      toast.error("Failed to load overdue quotes");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    await fetchStats();

    switch (activeTab) {
      case "unpaid":
        await fetchUnpaidQuotes();
        break;
      case "balance_due":
        await fetchBalanceDueOrders();
        break;
      case "payments":
        await fetchRecentPayments();
        break;
      case "overdue":
        await fetchOverdueQuotes();
        break;
    }

    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success("Data refreshed");
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, page, search, dateFrom, dateTo, paymentType, paymentStatus]);

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

  const setTab = (tab: Tab) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    params.set("page", "1");
    setSearchParams(params);
    setSearchInput("");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter("search", searchInput);
  };

  const clearFilters = () => {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    setSearchParams(params);
    setSearchInput("");
  };

  const hasActiveFilters = search || dateFrom || dateTo || paymentType || paymentStatus;

  const getTotalCount = () => {
    switch (activeTab) {
      case "unpaid":
        return unpaidQuotesCount;
      case "balance_due":
        return balanceDueCount;
      case "payments":
        return recentPaymentsCount;
      case "overdue":
        return overdueCount;
      default:
        return 0;
    }
  };

  const totalPages = Math.ceil(getTotalCount() / PAGE_SIZE);

  // Mark quote as expired
  const handleMarkExpired = async (quoteId: string) => {
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ status: "expired" })
        .eq("id", quoteId);

      if (error) throw error;

      toast.success("Quote marked as expired");
      fetchData();
    } catch (error) {
      console.error("Error marking quote as expired:", error);
      toast.error("Failed to mark quote as expired");
    }
    setOpenMenuId(null);
  };

  // Extend quote expiry
  const handleExtendExpiry = async (quoteId: string, days: number = 7) => {
    try {
      const { data: quote, error: fetchErr } = await supabase
        .from("quotes")
        .select("expires_at")
        .eq("id", quoteId)
        .single();

      if (fetchErr) throw fetchErr;

      const currentExpiry = parseISO(quote.expires_at);
      const newExpiry = new Date(currentExpiry);
      newExpiry.setDate(newExpiry.getDate() + days);

      const { error } = await supabase
        .from("quotes")
        .update({ expires_at: newExpiry.toISOString() })
        .eq("id", quoteId);

      if (error) throw error;

      toast.success(`Quote expiry extended by ${days} days`);
      fetchData();
    } catch (error) {
      console.error("Error extending quote expiry:", error);
      toast.error("Failed to extend quote expiry");
    }
    setOpenMenuId(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Accounts Receivable
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track payments, outstanding balances, and overdue quotes
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Total Outstanding</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            ${stats.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Awaiting Payment</span>
          </div>
          <p className="text-2xl font-semibold text-amber-600">
            ${stats.awaitingPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.awaitingPaymentCount} quote{stats.awaitingPaymentCount !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <CreditCard className="w-4 h-4" />
            <span className="text-sm">Balance Due</span>
          </div>
          <p className="text-2xl font-semibold text-blue-600">
            ${stats.balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.balanceDueCount} order{stats.balanceDueCount !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Collected This Month</span>
          </div>
          <p className="text-2xl font-semibold text-green-600">
            ${stats.collectedThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Overdue</span>
          </div>
          <p className="text-2xl font-semibold text-red-600">
            ${stats.overdueAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.overdueCount} quote{stats.overdueCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-gray-200 rounded-xl mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setTab("unpaid")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "unpaid"
                  ? "border-teal-500 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Unpaid Quotes
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                {stats.awaitingPaymentCount}
              </span>
            </button>
            <button
              onClick={() => setTab("balance_due")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "balance_due"
                  ? "border-teal-500 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Balance Due
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                {stats.balanceDueCount}
              </span>
            </button>
            <button
              onClick={() => setTab("payments")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "payments"
                  ? "border-teal-500 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Recent Payments
            </button>
            <button
              onClick={() => setTab("overdue")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "overdue"
                  ? "border-teal-500 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Overdue
              {stats.overdueCount > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                  {stats.overdueCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Search & Filters */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col md:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 md:max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={
                    activeTab === "payments"
                      ? "Search by order or customer..."
                      : "Search by quote/order or customer..."
                  }
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
                  {[search, dateFrom, dateTo, paymentType, paymentStatus].filter(Boolean).length}
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
                  From Date
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => updateFilter("from", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => updateFilter("to", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {activeTab === "payments" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Type
                    </label>
                    <select
                      value={paymentType}
                      onChange={(e) => updateFilter("payment_type", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">All Types</option>
                      <option value="initial">Initial</option>
                      <option value="balance">Balance</option>
                      <option value="refund">Refund</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={paymentStatus}
                      onChange={(e) => updateFilter("payment_status", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">All Statuses</option>
                      <option value="succeeded">Succeeded</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="px-6 py-12 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
              <p className="text-gray-500 mt-2">Loading...</p>
            </div>
          ) : (
            <>
              {/* Unpaid Quotes Tab */}
              {activeTab === "unpaid" && (
                <table className="w-full min-w-[640px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quote
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expires
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {unpaidQuotes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                          No unpaid quotes found
                        </td>
                      </tr>
                    ) : (
                      unpaidQuotes.map((quote) => (
                        <tr key={quote.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/quotes/${quote.id}`}
                              className="text-sm font-semibold text-gray-900 font-mono hover:text-teal-600"
                            >
                              {quote.quote_number}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/customers/${quote.customer_id}`}
                              className="block hover:text-teal-600"
                            >
                              <p className="text-sm font-medium text-gray-900">
                                {quote.customer_name || "—"}
                              </p>
                              <p className="text-xs text-gray-500">{quote.customer_email}</p>
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm font-semibold text-gray-900 tabular-nums">
                              ${quote.total.toFixed(2)}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-700">
                              {format(parseISO(quote.created_at), "MMM d, yyyy")}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-700">
                              {format(parseISO(quote.expires_at), "MMM d, yyyy")}
                            </p>
                            <p
                              className={`text-xs ${
                                quote.days_until_expiry <= 2
                                  ? "text-red-600"
                                  : quote.days_until_expiry <= 5
                                    ? "text-amber-600"
                                    : "text-gray-500"
                              }`}
                            >
                              {quote.days_until_expiry} day{quote.days_until_expiry !== 1 ? "s" : ""}{" "}
                              left
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center relative">
                            <button
                              onClick={() =>
                                setOpenMenuId(openMenuId === quote.id ? null : quote.id)
                              }
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                            {openMenuId === quote.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenMenuId(null)}
                                />
                                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                                  <Link
                                    to={`/admin/quotes/${quote.id}`}
                                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    onClick={() => setOpenMenuId(null)}
                                  >
                                    <Eye className="w-4 h-4" />
                                    View Quote
                                  </Link>
                                  <button
                                    onClick={() => handleExtendExpiry(quote.id, 7)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <Calendar className="w-4 h-4" />
                                    Extend 7 Days
                                  </button>
                                  <button
                                    onClick={() => handleMarkExpired(quote.id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                  >
                                    <XCircle className="w-4 h-4" />
                                    Mark Expired
                                  </button>
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* Balance Due Orders Tab */}
              {activeTab === "balance_due" && (
                <table className="w-full min-w-[640px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Original Total
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Paid
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Balance
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {balanceDueOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                          No balance due orders found
                        </td>
                      </tr>
                    ) : (
                      balanceDueOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/orders/${order.id}`}
                              className="text-sm font-semibold text-gray-900 font-mono hover:text-teal-600"
                            >
                              {order.order_number}
                            </Link>
                            <p className="text-xs text-gray-500">
                              {format(parseISO(order.created_at), "MMM d, yyyy")}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/customers/${order.customer_id}`}
                              className="block hover:text-teal-600"
                            >
                              <p className="text-sm font-medium text-gray-900">
                                {order.customer_name || "—"}
                              </p>
                              <p className="text-xs text-gray-500">{order.customer_email}</p>
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm text-gray-700 tabular-nums">
                              ${order.total_amount.toFixed(2)}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm text-green-600 tabular-nums">
                              ${order.paid_amount.toFixed(2)}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm font-semibold text-red-600 tabular-nums">
                              ${order.balance_remaining.toFixed(2)}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center relative">
                            <button
                              onClick={() =>
                                setOpenMenuId(openMenuId === order.id ? null : order.id)
                              }
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                            {openMenuId === order.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenMenuId(null)}
                                />
                                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                                  <Link
                                    to={`/admin/orders/${order.id}`}
                                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    onClick={() => setOpenMenuId(null)}
                                  >
                                    <Eye className="w-4 h-4" />
                                    View Order
                                  </Link>
                                  <button
                                    onClick={() => {
                                      toast.info("Payment reminder feature coming soon");
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <Send className="w-4 h-4" />
                                    Send Reminder
                                  </button>
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* Recent Payments Tab */}
              {activeTab === "payments" && (
                <table className="w-full min-w-[640px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {recentPayments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                          No payments found
                        </td>
                      </tr>
                    ) : (
                      recentPayments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/orders/${payment.order_id}`}
                              className="text-sm font-semibold text-gray-900 font-mono hover:text-teal-600"
                            >
                              {payment.order_number}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">
                              {payment.customer_name || "—"}
                            </p>
                            <p className="text-xs text-gray-500">{payment.customer_email}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p
                              className={`text-sm font-semibold tabular-nums ${
                                payment.payment_type === "refund" ? "text-red-600" : "text-gray-900"
                              }`}
                            >
                              {payment.payment_type === "refund" ? "-" : ""}$
                              {payment.amount.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500">{payment.currency}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-700 capitalize">
                              {payment.payment_type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <PaymentStatusBadge status={payment.status} />
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-700">
                              {format(parseISO(payment.created_at), "MMM d, yyyy")}
                            </p>
                            <p className="text-xs text-gray-500">
                              {format(parseISO(payment.created_at), "h:mm a")}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {payment.receipt_url && (
                              <a
                                href={payment.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"
                              >
                                <ArrowUpRight className="w-4 h-4" />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* Overdue Quotes Tab */}
              {activeTab === "overdue" && (
                <table className="w-full min-w-[640px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quote
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expired On
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Days Overdue
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {overdueQuotes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                          No overdue quotes found
                        </td>
                      </tr>
                    ) : (
                      overdueQuotes.map((quote) => (
                        <tr key={quote.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/quotes/${quote.id}`}
                              className="text-sm font-semibold text-gray-900 font-mono hover:text-teal-600"
                            >
                              {quote.quote_number}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/customers/${quote.customer_id}`}
                              className="block hover:text-teal-600"
                            >
                              <p className="text-sm font-medium text-gray-900">
                                {quote.customer_name || "—"}
                              </p>
                              <p className="text-xs text-gray-500">{quote.customer_email}</p>
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm font-semibold text-gray-900 tabular-nums">
                              ${quote.total.toFixed(2)}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-700">
                              {format(parseISO(quote.expires_at), "MMM d, yyyy")}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                              {quote.days_overdue} day{quote.days_overdue !== 1 ? "s" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center relative">
                            <button
                              onClick={() =>
                                setOpenMenuId(openMenuId === quote.id ? null : quote.id)
                              }
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                            {openMenuId === quote.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenMenuId(null)}
                                />
                                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                                  <Link
                                    to={`/admin/quotes/${quote.id}`}
                                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    onClick={() => setOpenMenuId(null)}
                                  >
                                    <Eye className="w-4 h-4" />
                                    View Quote
                                  </Link>
                                  <button
                                    onClick={() => handleExtendExpiry(quote.id, 7)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <Calendar className="w-4 h-4" />
                                    Extend 7 Days
                                  </button>
                                  <button
                                    onClick={() => handleMarkExpired(quote.id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                  >
                                    <XCircle className="w-4 h-4" />
                                    Archive Quote
                                  </button>
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
              {Math.min(page * PAGE_SIZE, getTotalCount())} of {getTotalCount().toLocaleString()}
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

// Payment Status Badge
function PaymentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { style: string; icon: React.ReactNode }> = {
    succeeded: {
      style: "bg-green-100 text-green-700",
      icon: <CheckCircle className="w-3 h-3" />,
    },
    pending: {
      style: "bg-amber-100 text-amber-700",
      icon: <Clock className="w-3 h-3" />,
    },
    failed: {
      style: "bg-red-100 text-red-700",
      icon: <XCircle className="w-3 h-3" />,
    },
    refunded: {
      style: "bg-gray-100 text-gray-700",
      icon: <CreditCard className="w-3 h-3" />,
    },
  };

  const { style, icon } = config[status] || {
    style: "bg-gray-100 text-gray-700",
    icon: null,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full capitalize ${style}`}
    >
      {icon}
      {status}
    </span>
  );
}
