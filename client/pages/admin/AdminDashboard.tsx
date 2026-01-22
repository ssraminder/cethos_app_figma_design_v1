import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { 
  FileText, 
  ShoppingCart, 
  DollarSign, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface DashboardStats {
  // Quotes
  quotesToday: number;
  quotesThisWeek: number;
  quotesThisMonth: number;
  quotesTrend: number; // percentage change from previous period
  
  // Orders
  ordersToday: number;
  ordersThisWeek: number;
  ordersThisMonth: number;
  ordersTrend: number;
  
  // Revenue
  revenueToday: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
  revenueTrend: number;
  
  // HITL
  hitlPending: number;
  hitlInReview: number;
  hitlBreached: number;
  avgReviewTime: number; // minutes
  
  // AI
  aiAccuracy: number;
  documentsProcessed: number;
  hitlTriggerRate: number;
}

interface RecentActivity {
  id: string;
  type: "quote" | "order" | "hitl" | "payment";
  title: string;
  subtitle: string;
  timestamp: string;
  status?: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const todayEnd = endOfDay(now).toISOString();
      const weekStart = startOfDay(subDays(now, 7)).toISOString();
      const monthStart = startOfDay(subDays(now, 30)).toISOString();

      // Fetch quotes counts
      const [quotesToday, quotesWeek, quotesMonth] = await Promise.all([
        supabase.from("quotes").select("id", { count: "exact", head: true })
          .gte("created_at", todayStart).lte("created_at", todayEnd),
        supabase.from("quotes").select("id", { count: "exact", head: true })
          .gte("created_at", weekStart),
        supabase.from("quotes").select("id", { count: "exact", head: true })
          .gte("created_at", monthStart),
      ]);

      // Fetch orders counts
      const [ordersToday, ordersWeek, ordersMonth] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true })
          .gte("created_at", todayStart).lte("created_at", todayEnd),
        supabase.from("orders").select("id", { count: "exact", head: true })
          .gte("created_at", weekStart),
        supabase.from("orders").select("id", { count: "exact", head: true })
          .gte("created_at", monthStart),
      ]);

      // Fetch revenue
      const [revenueToday, revenueWeek, revenueMonth] = await Promise.all([
        supabase.from("orders").select("total_amount")
          .gte("created_at", todayStart).lte("created_at", todayEnd)
          .eq("status", "paid"),
        supabase.from("orders").select("total_amount")
          .gte("created_at", weekStart).eq("status", "paid"),
        supabase.from("orders").select("total_amount")
          .gte("created_at", monthStart).eq("status", "paid"),
      ]);

      // Fetch HITL stats
      const [hitlPending, hitlInReview, hitlBreached] = await Promise.all([
        supabase.from("hitl_reviews").select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase.from("hitl_reviews").select("id", { count: "exact", head: true })
          .eq("status", "in_review"),
        supabase.from("hitl_reviews").select("id", { count: "exact", head: true })
          .eq("sla_breached", true).in("status", ["pending", "in_review"]),
      ]);

      // Fetch AI metrics
      const { data: aiMetrics } = await supabase
        .from("ai_performance_metrics")
        .select("overall_accuracy, total_documents_processed, hitl_trigger_rate")
        .eq("metric_type", "daily")
        .order("metric_date", { ascending: false })
        .limit(1)
        .single();

      // Calculate revenue sums
      const sumRevenue = (data: any[] | null) => 
        data?.reduce((sum, row) => sum + (row.total_amount || 0), 0) || 0;

      setStats({
        quotesToday: quotesToday.count || 0,
        quotesThisWeek: quotesWeek.count || 0,
        quotesThisMonth: quotesMonth.count || 0,
        quotesTrend: 12, // TODO: Calculate actual trend
        
        ordersToday: ordersToday.count || 0,
        ordersThisWeek: ordersWeek.count || 0,
        ordersThisMonth: ordersMonth.count || 0,
        ordersTrend: 8,
        
        revenueToday: sumRevenue(revenueToday.data),
        revenueThisWeek: sumRevenue(revenueWeek.data),
        revenueThisMonth: sumRevenue(revenueMonth.data),
        revenueTrend: 15,
        
        hitlPending: hitlPending.count || 0,
        hitlInReview: hitlInReview.count || 0,
        hitlBreached: hitlBreached.count || 0,
        avgReviewTime: 45,
        
        aiAccuracy: aiMetrics?.overall_accuracy || 0,
        documentsProcessed: aiMetrics?.total_documents_processed || 0,
        hitlTriggerRate: aiMetrics?.hitl_trigger_rate || 0,
      });

      // Fetch recent activity
      const { data: recentQuotes } = await supabase
        .from("quotes")
        .select("id, quote_number, status, created_at, customers(full_name)")
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: recentOrders } = await supabase
        .from("orders")
        .select("id, order_number, status, created_at, total_amount")
        .order("created_at", { ascending: false })
        .limit(5);

      const activity: RecentActivity[] = [
        ...(recentQuotes?.map(q => ({
          id: q.id,
          type: "quote" as const,
          title: `Quote ${q.quote_number}`,
          subtitle: (q.customers as any)?.full_name || "New customer",
          timestamp: q.created_at,
          status: q.status,
        })) || []),
        ...(recentOrders?.map(o => ({
          id: o.id,
          type: "order" as const,
          title: `Order ${o.order_number}`,
          subtitle: `$${o.total_amount?.toFixed(2)} CAD`,
          timestamp: o.created_at,
          status: o.status,
        })) || []),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
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
    // Refresh every 5 minutes
    const interval = setInterval(fetchDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f9fc] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f9fc]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Welcome back. Here's what's happening today.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Primary Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Quotes Today */}
          <StatCard
            icon={<FileText className="w-5 h-5" />}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            label="Quotes Today"
            value={stats?.quotesToday || 0}
            subtext={`${stats?.quotesThisWeek || 0} this week`}
            trend={stats?.quotesTrend}
          />

          {/* Orders Today */}
          <StatCard
            icon={<ShoppingCart className="w-5 h-5" />}
            iconBg="bg-green-50"
            iconColor="text-green-600"
            label="Orders Today"
            value={stats?.ordersToday || 0}
            subtext={`${stats?.ordersThisWeek || 0} this week`}
            trend={stats?.ordersTrend}
          />

          {/* Revenue Today */}
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            iconBg="bg-purple-50"
            iconColor="text-purple-600"
            label="Revenue Today"
            value={`$${(stats?.revenueToday || 0).toLocaleString()}`}
            subtext={`$${(stats?.revenueThisWeek || 0).toLocaleString()} this week`}
            trend={stats?.revenueTrend}
            isCurrency
          />

          {/* HITL Queue */}
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            iconBg={stats?.hitlBreached ? "bg-red-50" : "bg-amber-50"}
            iconColor={stats?.hitlBreached ? "text-red-600" : "text-amber-600"}
            label="HITL Queue"
            value={stats?.hitlPending || 0}
            subtext={`${stats?.hitlInReview || 0} in review`}
            alert={stats?.hitlBreached ? `${stats.hitlBreached} breached SLA` : undefined}
            linkTo="/admin/hitl"
          />
        </div>

        {/* Secondary Stats & HITL Alert */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* HITL SLA Alert */}
          {stats?.hitlBreached ? (
            <div className="lg:col-span-2 bg-red-50 border border-red-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-800">
                    {stats.hitlBreached} Review{stats.hitlBreached > 1 ? "s" : ""} Breached SLA
                  </h3>
                  <p className="text-red-600 mt-1">
                    These reviews have exceeded the 4-hour response time. Immediate attention required.
                  </p>
                  <Link
                    to="/admin/hitl?filter=breached"
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    View Breached Reviews
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2 bg-green-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-800">
                    All Reviews On Track
                  </h3>
                  <p className="text-green-600 mt-1">
                    No SLA breaches. Average review time: {stats?.avgReviewTime || 0} minutes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* AI Performance */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
              AI Performance
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Accuracy Rate</span>
                <span className="text-lg font-semibold text-gray-900">
                  {((stats?.aiAccuracy || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${(stats?.aiAccuracy || 0) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">HITL Trigger Rate</span>
                <span className="text-gray-700">
                  {((stats?.hitlTriggerRate || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Docs Processed (30d)</span>
                <span className="text-gray-700">{stats?.documentsProcessed || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Recent Activity & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Recent Activity
              </h3>
              <Link
                to="/admin/quotes"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                View all
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {recentActivity.map((item) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  to={item.type === "quote" ? `/admin/quotes/${item.id}` : `/admin/orders/${item.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    item.type === "quote" ? "bg-blue-50" : "bg-green-50"
                  }`}>
                    {item.type === "quote" ? (
                      <FileText className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ShoppingCart className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.title}
                    </p>
                    <p className="text-sm text-gray-500 truncate">{item.subtitle}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={item.status} />
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(item.timestamp), "MMM d, h:mm a")}
                    </p>
                  </div>
                </Link>
              ))}
              {recentActivity.length === 0 && (
                <div className="px-6 py-8 text-center text-gray-500">
                  No recent activity
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Quick Actions
              </h3>
            </div>
            <div className="p-4 space-y-2">
              <QuickActionLink
                to="/admin/hitl"
                icon={<Clock className="w-5 h-5" />}
                label="HITL Review Queue"
                badge={stats?.hitlPending}
              />
              <QuickActionLink
                to="/admin/quotes"
                icon={<FileText className="w-5 h-5" />}
                label="All Quotes"
              />
              <QuickActionLink
                to="/admin/orders"
                icon={<ShoppingCart className="w-5 h-5" />}
                label="All Orders"
              />
              <QuickActionLink
                to="/admin/settings"
                icon={<Users className="w-5 h-5" />}
                label="Settings"
              />
            </div>
          </div>
        </div>

        {/* Monthly Summary */}
        <div className="mt-8 bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-6">
            30-Day Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-3xl font-semibold text-gray-900 tabular-nums">
                {stats?.quotesThisMonth || 0}
              </p>
              <p className="text-sm text-gray-500 mt-1">Total Quotes</p>
            </div>
            <div>
              <p className="text-3xl font-semibold text-gray-900 tabular-nums">
                {stats?.ordersThisMonth || 0}
              </p>
              <p className="text-sm text-gray-500 mt-1">Total Orders</p>
            </div>
            <div>
              <p className="text-3xl font-semibold text-gray-900 tabular-nums">
                ${(stats?.revenueThisMonth || 0).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 mt-1">Total Revenue</p>
            </div>
            <div>
              <p className="text-3xl font-semibold text-gray-900 tabular-nums">
                {((stats?.aiAccuracy || 0) * 100).toFixed(0)}%
              </p>
              <p className="text-sm text-gray-500 mt-1">AI Accuracy</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ 
  icon, 
  iconBg, 
  iconColor, 
  label, 
  value, 
  subtext, 
  trend, 
  alert,
  linkTo,
  isCurrency 
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  subtext: string;
  trend?: number;
  alert?: string;
  linkTo?: string;
  isCurrency?: boolean;
}) {
  const content = (
    <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center ${iconColor}`}>
          {icon}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-sm ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
            {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</p>
        <p className="text-sm text-gray-500 mt-1">{label}</p>
        <p className="text-xs text-gray-400 mt-2">{subtext}</p>
        {alert && (
          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {alert}
          </p>
        )}
      </div>
    </div>
  );

  if (linkTo) {
    return <Link to={linkTo}>{content}</Link>;
  }
  return content;
}

// Quick Action Link Component
function QuickActionLink({ 
  to, 
  icon, 
  label, 
  badge 
}: { 
  to: string; 
  icon: React.ReactNode; 
  label: string; 
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div className="text-gray-400">{icon}</div>
      <span className="flex-1 text-sm text-gray-700">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
          {badge}
        </span>
      )}
      <ArrowRight className="w-4 h-4 text-gray-400" />
    </Link>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    processing: "bg-blue-100 text-blue-700",
    quote_ready: "bg-green-100 text-green-700",
    hitl_pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    paid: "bg-green-100 text-green-700",
    expired: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-700",
  };

  const labels: Record<string, string> = {
    draft: "Draft",
    processing: "Processing",
    quote_ready: "Ready",
    hitl_pending: "HITL Pending",
    approved: "Approved",
    paid: "Paid",
    expired: "Expired",
    cancelled: "Cancelled",
  };

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${styles[status || ""] || "bg-gray-100 text-gray-700"}`}>
      {labels[status || ""] || status || "Unknown"}
    </span>
  );
}
