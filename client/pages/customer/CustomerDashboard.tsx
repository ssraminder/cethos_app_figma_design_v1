import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/CustomerAuthContext";
import CustomerLayout from "../../components/layouts/CustomerLayout";
import {
  FileText,
  Package,
  CheckCircle,
  DollarSign,
  ArrowRight,
  Receipt,
  MessageSquare,
} from "lucide-react";

interface DashboardStats {
  activeQuotes: number;
  inProgressOrders: number;
  completedOrders: number;
  totalSpent: number;
  recentActivity: Array<{
    id: string;
    type: "quote" | "order";
    number: string;
    action: string;
    timestamp: string;
  }>;
  unreadMessages: number;
}

export default function CustomerDashboard() {
  const { customer } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customer?.id) {
      loadDashboard();
    }
  }, [customer?.id]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-customer-dashboard?customer_id=${customer?.id}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load dashboard");
      }

      setStats(data.data.stats);
    } catch (err: any) {
      console.error("Failed to load dashboard:", err);
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <CustomerLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-32 bg-gray-200 rounded"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (error) {
    return (
      <CustomerLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Welcome Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
            Welcome back, {customer?.full_name}!
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">
            Here's an overview of your translation orders and quotes.
          </p>
        </div>

        {/* Stats Cards - 2x2 on mobile, 4 columns on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1">Active Quotes</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                  {stats?.activeQuotes || 0}
                </p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1">In Progress</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                  {stats?.inProgressOrders || 0}
                </p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1">Completed</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                  {stats?.completedOrders || 0}
                </p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1">Total Spent</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">
                  ${(stats?.totalSpent ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              to="/quote"
              className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-teal-100 rounded-lg flex items-center justify-center group-hover:bg-teal-200">
                  <FileText className="w-5 h-5 text-teal-600" />
                </div>
                <span className="font-medium text-gray-900">
                  Start New Quote
                </span>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-teal-600" />
            </Link>

            <Link
              to="/dashboard/orders"
              className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-teal-100 rounded-lg flex items-center justify-center group-hover:bg-teal-200">
                  <Receipt className="w-5 h-5 text-teal-600" />
                </div>
                <span className="font-medium text-gray-900">View Invoices</span>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-teal-600" />
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Activity
            </h2>
            {stats?.unreadMessages && stats.unreadMessages > 0 && (
              <Link
                to="/dashboard/messages"
                className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700"
              >
                <MessageSquare className="w-4 h-4" />
                {stats.unreadMessages} unread message
                {stats.unreadMessages !== 1 ? "s" : ""}
              </Link>
            )}
          </div>

          {stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.map((activity) => (
                <Link
                  key={activity.id}
                  to={
                    activity.type === "quote"
                      ? `/dashboard/quotes/${activity.id}`
                      : `/dashboard/orders/${activity.id}`
                  }
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        activity.type === "quote"
                          ? "bg-blue-100 group-hover:bg-blue-200"
                          : "bg-green-100 group-hover:bg-green-200"
                      }`}
                    >
                      {activity.type === "quote" ? (
                        <FileText
                          className={`w-5 h-5 ${
                            activity.type === "quote"
                              ? "text-blue-600"
                              : "text-green-600"
                          }`}
                        />
                      ) : (
                        <Package className="w-5 h-5 text-green-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {activity.type === "quote" ? "Quote" : "Order"}{" "}
                        {activity.number}
                      </p>
                      <p className="text-sm text-gray-600">{activity.action}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">
                      {new Date(activity.timestamp).toLocaleDateString()}
                    </p>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-teal-600 ml-auto mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No recent activity</p>
              <Link
                to="/quote"
                className="text-teal-600 hover:text-teal-700 text-sm mt-2 inline-block"
              >
                Start your first quote →
              </Link>
            </div>
          )}
        </div>
      </div>
    </CustomerLayout>
  );
}
