import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import {
  FileText,
  ShoppingCart,
  ShoppingBag,
  DollarSign,
  CheckCircle,
  ArrowRight,
  RefreshCw,
  BarChart3,
  Plus,
  ExternalLink,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface DashboardStats {
  quotesToday: number;
  quotesThisWeek: number;
  ordersToday: number;
  ordersThisWeek: number;
  revenueToday: number;
  revenueThisWeek: number;
}

interface NeedsAttention {
  paidOrdersCount: number;
  unreadMessagesCount: number;
}

interface OrderStatusCount {
  status: string;
  count: number;
  color: string;
}

interface UpcomingDelivery {
  id: string;
  order_number: string;
  estimated_delivery_date: string;
  customer: { full_name: string } | null;
}

interface RecentActivity {
  id: string;
  type: "quote" | "order";
  title: string;
  subtitle: string;
  timestamp: string;
  status?: string;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function AdminDashboard() {
  const { session } = useAdminAuthContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [needsAttention, setNeedsAttention] = useState<NeedsAttention>({
    paidOrdersCount: 0,
    unreadMessagesCount: 0,
  });
  const [ordersByStatus, setOrdersByStatus] = useState<OrderStatusCount[]>([]);
  const [upcomingDeliveries, setUpcomingDeliveries] = useState<
    UpcomingDelivery[]
  >([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const todayEnd = endOfDay(now).toISOString();
      const weekStart = startOfDay(subDays(now, 7)).toISOString();

      const [quotesToday, quotesWeek] = await Promise.all([
        supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd),
        supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekStart),
      ]);

      const [ordersToday, ordersWeek] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekStart),
      ]);

      const [revenueToday, revenueWeek] = await Promise.all([
        supabase
          .from("orders")
          .select("total_amount")
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd)
          .eq("status", "paid"),
        supabase
          .from("orders")
          .select("total_amount")
          .gte("created_at", weekStart)
          .eq("status", "paid"),
      ]);

      const sumRevenue = (data: any[] | null) =>
        data?.reduce((sum, row) => sum + (row.total_amount || 0), 0) || 0;

      setStats({
        quotesToday: quotesToday.count || 0,
        quotesThisWeek: quotesWeek.count || 0,
        ordersToday: ordersToday.count || 0,
        ordersThisWeek: ordersWeek.count || 0,
        revenueToday: sumRevenue(revenueToday.data),
        revenueThisWeek: sumRevenue(revenueWeek.data),
      });

      const { count: paidOrdersCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "paid");

      let unreadMessagesCount = 0;
      try {
        const { count } = await supabase
          .from("conversation_messages")
          .select("conversation_id", { count: "exact", head: true })
          .eq("sender_type", "customer")
          .is("read_by_staff_at", null);
        unreadMessagesCount = count || 0;
      } catch {
        // column may not exist
      }

      setNeedsAttention({
        paidOrdersCount: paidOrdersCount || 0,
        unreadMessagesCount,
      });

      const { data: activeOrders } = await supabase
        .from("orders")
        .select("status")
        .not("status", "in", '("cancelled","completed","refunded")');

      const statusColorMap: Record<string, string> = {
        pending: "bg-gray-100 text-gray-800",
        paid: "bg-yellow-100 text-yellow-800",
        balance_due: "bg-amber-100 text-amber-800",
        in_production: "bg-blue-100 text-blue-800",
        draft_review: "bg-orange-100 text-orange-800",
        ready_for_delivery: "bg-green-100 text-green-800",
        delivered: "bg-purple-100 text-purple-800",
        invoiced: "bg-indigo-100 text-indigo-800",
      };

      if (activeOrders) {
        const counts: Record<string, number> = {};
        activeOrders.forEach((o) => {
          counts[o.status] = (counts[o.status] || 0) + 1;
        });
        setOrdersByStatus(
          Object.entries(counts).map(([status, count]) => ({
            status,
            count,
            color: statusColorMap[status] || "bg-gray-100 text-gray-800",
          })),
        );
      }

      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const { data: deliveries } = await supabase
        .from("orders")
        .select(
          `id, order_number, estimated_delivery_date,
          customer:customers!customer_id(full_name)`,
        )
        .not("status", "in", "(cancelled,completed,delivered)")
        .not("estimated_delivery_date", "is", null)
        .lte(
          "estimated_delivery_date",
          threeDaysFromNow.toISOString().split("T")[0],
        )
        .order("estimated_delivery_date", { ascending: true })
        .limit(5);

      setUpcomingDeliveries((deliveries as any[]) || []);

      const { data: recentQuotes } = await supabase
        .from("quotes")
        .select("id, quote_number, status, created_at, customers(full_name)")
        .is("converted_to_order_id", null)
        .not("status", "eq", "draft")
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: recentOrders } = await supabase
        .from("orders")
        .select("id, order_number, status, created_at, total_amount")
        .order("created_at", { ascending: false })
        .limit(5);

      const activity: RecentActivity[] = [
        ...(recentQuotes?.map((q) => ({
          id: q.id,
          type: "quote" as const,
          title: `Quote ${q.quote_number}`,
          subtitle: (q.customers as any)?.full_name || "New customer",
          timestamp: q.created_at,
          status: q.status,
        })) || []),
        ...(recentOrders?.map((o) => ({
          id: o.id,
          type: "order" as const,
          title: `Order ${o.order_number}`,
          subtitle: `$${o.total_amount?.toFixed(2)} CAD`,
          timestamp: o.created_at,
          status: o.status,
        })) || []),
      ]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, 10);

      setRecentActivity(activity);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const formatStatus = (status: string) =>
    status
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-2" />
          <div className="h-4 bg-gray-100 rounded w-40 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-[#e2e8f0] p-6">
                <div className="h-4 bg-gray-100 rounded w-24 mb-4" />
                <div className="h-8 bg-gray-200 rounded w-16 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const firstName = session?.staffName?.split(" ")[0] || "there";

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-sm text-[#64748b] mt-1">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://cethos.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm text-[#64748b] border border-[#e2e8f0] hover:bg-slate-50 rounded-md transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Site
          </a>
          <Link
            to="/admin/quotes/fast-create"
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] rounded-md transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            New Quote
          </Link>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-md transition-colors"
            title="Refresh"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          accentColor="border-l-[#2563eb]"
          icon={<FileText className="w-5 h-5" />}
          iconBg="bg-blue-50"
          iconColor="text-[#2563eb]"
          label="Quotes Today"
          value={stats?.quotesToday || 0}
          subtext={`${stats?.quotesThisWeek || 0} this week`}
          href="/admin/quotes"
        />
        <StatCard
          accentColor="border-l-[#16a34a]"
          icon={<ShoppingCart className="w-5 h-5" />}
          iconBg="bg-green-50"
          iconColor="text-[#16a34a]"
          label="Orders Today"
          value={stats?.ordersToday || 0}
          subtext={`${stats?.ordersThisWeek || 0} this week`}
          href="/admin/orders"
        />
        <StatCard
          accentColor="border-l-[#d97706]"
          icon={<DollarSign className="w-5 h-5" />}
          iconBg="bg-amber-50"
          iconColor="text-[#d97706]"
          label="Revenue Today"
          value={`$${(stats?.revenueToday || 0).toLocaleString()}`}
          subtext={`$${(stats?.revenueThisWeek || 0).toLocaleString()} this week`}
          href="/admin/reports"
        />
        <div className="bg-white rounded-lg border border-[#e2e8f0] border-l-4 border-l-purple-500 p-6">
          <h3 className="text-sm font-medium text-[#64748b] mb-3">
            Needs Attention
          </h3>
          <div className="space-y-2">
            {needsAttention.paidOrdersCount > 0 && (
              <Link
                to="/admin/orders?status=paid"
                className="flex justify-between items-center text-sm hover:bg-slate-50 -mx-2 px-2 py-1 rounded transition-colors"
              >
                <span className="text-[#0f172a]">Orders waiting to start</span>
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs font-medium">
                  {needsAttention.paidOrdersCount}
                </span>
              </Link>
            )}
            {needsAttention.unreadMessagesCount > 0 && (
              <Link
                to="/admin/orders"
                className="flex justify-between items-center text-sm hover:bg-slate-50 -mx-2 px-2 py-1 rounded transition-colors"
              >
                <span className="text-[#0f172a]">Unread messages</span>
                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium">
                  {needsAttention.unreadMessagesCount}
                </span>
              </Link>
            )}
            {needsAttention.paidOrdersCount === 0 &&
              needsAttention.unreadMessagesCount === 0 && (
                <p className="text-sm text-[#16a34a] flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" /> All caught up!
                </p>
              )}
          </div>
        </div>
      </div>

      {/* Operations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-6">
          <h3 className="text-sm font-medium text-[#64748b] mb-3">
            Active Orders
          </h3>
          <div className="flex flex-wrap gap-2">
            {ordersByStatus.length > 0 ? (
              ordersByStatus.map(({ status, count, color }) => (
                <Link
                  key={status}
                  to={`/admin/orders?status=${status}`}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium ${color} hover:opacity-80 transition-opacity`}
                >
                  {formatStatus(status)} ({count})
                </Link>
              ))
            ) : (
              <p className="text-sm text-[#64748b]">No active orders</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#e2e8f0] p-6">
          <h3 className="text-sm font-medium text-[#64748b] mb-3">
            Upcoming Deliveries
          </h3>
          <div className="space-y-3">
            {upcomingDeliveries.map((order) => {
              const isOverdue =
                new Date(order.estimated_delivery_date) < new Date();
              return (
                <Link
                  key={order.id}
                  to={`/admin/orders/${order.id}`}
                  className="flex justify-between items-center text-sm hover:bg-slate-50 -mx-2 px-2 py-1 rounded transition-colors"
                >
                  <div>
                    <span className="font-medium text-[#0f172a]">
                      {order.order_number}
                    </span>
                    <span className="text-[#64748b] ml-2">
                      {order.customer?.full_name}
                    </span>
                  </div>
                  <span
                    className={
                      isOverdue
                        ? "text-[#dc2626] font-medium"
                        : "text-[#64748b]"
                    }
                  >
                    {isOverdue ? "OVERDUE \u2014 " : ""}
                    {new Date(
                      order.estimated_delivery_date,
                    ).toLocaleDateString("en-CA", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </Link>
              );
            })}
            {upcomingDeliveries.length === 0 && (
              <p className="text-sm text-[#64748b]">No upcoming deliveries</p>
            )}
          </div>
        </div>
      </div>

      {/* Activity & Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-[#e2e8f0] rounded-lg">
          <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#64748b] uppercase tracking-wide">
              Recent Activity
            </h3>
            <div className="flex gap-3">
              <Link
                to="/admin/quotes"
                className="text-sm text-[#0d9488] hover:text-[#0f766e]"
              >
                View Quotes &rarr;
              </Link>
              <Link
                to="/admin/orders"
                className="text-sm text-[#0d9488] hover:text-[#0f766e]"
              >
                View Orders &rarr;
              </Link>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {recentActivity.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                to={
                  item.type === "quote"
                    ? `/admin/quotes/${item.id}`
                    : `/admin/orders/${item.id}`
                }
                className="flex items-center gap-4 px-6 py-4 hover:bg-[#f8fafc] transition-colors"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    item.type === "quote" ? "bg-blue-50" : "bg-green-50"
                  }`}
                >
                  {item.type === "quote" ? (
                    <FileText className="w-5 h-5 text-[#2563eb]" />
                  ) : (
                    <ShoppingCart className="w-5 h-5 text-[#16a34a]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0f172a] truncate">
                    {item.title}
                  </p>
                  <p className="text-sm text-[#64748b] truncate">
                    {item.subtitle}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={item.status} />
                  <p className="text-xs text-[#64748b] mt-1">
                    {format(new Date(item.timestamp), "MMM d, h:mm a")}
                  </p>
                </div>
              </Link>
            ))}
            {recentActivity.length === 0 && (
              <div className="px-6 py-8 text-center text-[#64748b]">
                No recent activity
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-lg">
          <div className="px-6 py-4 border-b border-[#e2e8f0]">
            <h3 className="text-sm font-medium text-[#64748b] uppercase tracking-wide">
              Quick Links
            </h3>
          </div>
          <div className="p-4 space-y-1">
            <QuickActionLink
              to="/admin/quotes"
              icon={<FileText className="w-5 h-5" />}
              label="All Quotes"
            />
            <QuickActionLink
              to="/admin/orders"
              icon={<ShoppingBag className="w-5 h-5" />}
              label="All Orders"
            />
            <QuickActionLink
              to="/admin/reports"
              icon={<BarChart3 className="w-5 h-5" />}
              label="Reports"
            />
            <QuickActionLink
              to="/admin/blog"
              icon={<FileText className="w-5 h-5" />}
              label="Blog Posts"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  accentColor,
  icon,
  iconBg,
  iconColor,
  label,
  value,
  subtext,
  href,
}: {
  accentColor: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  subtext: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      className={`bg-white border border-[#e2e8f0] border-l-4 ${accentColor} rounded-lg p-6 hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between">
        <div
          className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center ${iconColor}`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-2xl font-semibold text-[#0f172a] tabular-nums">
          {value}
        </p>
        <p className="text-sm text-[#64748b] mt-1">{label}</p>
        <p className="text-xs text-[#64748b] mt-2">{subtext}</p>
      </div>
    </Link>
  );
}

function QuickActionLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 rounded-md hover:bg-[#f8fafc] transition-colors"
    >
      <div className="text-[#64748b]">{icon}</div>
      <span className="flex-1 text-sm text-[#0f172a]">{label}</span>
      <ArrowRight className="w-4 h-4 text-[#64748b]" />
    </Link>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    details_pending: "bg-amber-100 text-amber-700",
    draft: "bg-gray-100 text-gray-700",
    processing: "bg-blue-100 text-blue-700",
    quote_ready: "bg-green-100 text-green-700",
    in_review: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    paid: "bg-green-100 text-green-700",
    expired: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-700",
  };

  const labels: Record<string, string> = {
    details_pending: "Incomplete",
    draft: "Draft",
    processing: "Processing",
    quote_ready: "Ready",
    in_review: "In Review",
    approved: "Approved",
    paid: "Paid",
    expired: "Expired",
    cancelled: "Cancelled",
  };

  return (
    <span
      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${styles[status || ""] || "bg-gray-100 text-gray-700"}`}
    >
      {labels[status || ""] || status || "Unknown"}
    </span>
  );
}
