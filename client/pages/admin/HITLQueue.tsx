import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { useBranding } from "../../context/BrandingContext";

interface HITLReview {
  review_id: string;
  quote_number: string;
  customer_name: string;
  customer_email: string;
  status: string;
  priority: number;
  sla_status: string;
  minutes_to_sla: number;
}

export default function HITLQueue() {
  const { companyName, logoUrl, primaryColor } = useBranding();
  const [reviews, setReviews] = useState<HITLReview[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { session, loading: authLoading, signOut } = useAdminAuthContext();

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    if (!session) return;
    fetchReviews();
  }, [session, fetchReviews]);

  const fetchReviews = useCallback(async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("Database not configured");
      setFetching(false);
      return;
    }

    setFetching(true);
    setError(null);

    try {
      // Use direct fetch to Supabase REST API
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/v_hitl_queue?order=priority.asc,created_at.asc`,
        {
          method: "GET",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Fetch error:", errorText);
        setError(`Database error: ${response.status}`);
        setFetching(false);
        return;
      }

      const data = await response.json();
      console.log("HITL Queue data:", data);

      setReviews(data || []);
      setError(null);
    } catch (err) {
      console.error("Fetch exception:", err);
      setError(`Error: ${err}`);
    }

    setFetching(false);
  }, [SUPABASE_URL, SUPABASE_ANON_KEY]);

  const handleLogout = async () => {
    await signOut();
  };

  const getPriorityColor = (priority: number) => {
    if (priority <= 2) return "bg-red-100 text-red-700";
    if (priority <= 4) return "bg-orange-100 text-orange-700";
    if (priority <= 6) return "bg-yellow-100 text-yellow-700";
    return "bg-gray-100 text-gray-700";
  };

  const getSLAColor = (status: string) => {
    switch (status) {
      case "breached":
        return "text-red-600 font-semibold";
      case "critical":
        return "text-orange-600 font-semibold";
      case "warning":
        return "text-yellow-600";
      default:
        return "text-green-600";
    }
  };

  const formatSLA = (minutes: number) => {
    if (minutes < 0) return "OVERDUE";
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  // Calculate stats from reviews
  const stats = {
    pending: reviews.filter((r) => r.status === "pending").length,
    inProgress: reviews.filter((r) => r.status === "in_review").length,
    completed: reviews.filter((r) => r.status === "completed").length,
    slaBreached: reviews.filter((r) => r.sla_status === "breached").length,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-10" />
            ) : (
              <h1
                className="text-2xl font-bold"
                style={{ color: primaryColor }}
              >
                {companyName.toUpperCase()}
              </h1>
            )}
            <span className="text-gray-500">Staff Portal - HITL Queue</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/admin/analytics")}
              className="text-gray-600 hover:text-gray-800 flex items-center gap-1"
            >
              <span>📊</span> Analytics
            </button>
            {session?.staffRole === "super_admin" && (
              <button
                onClick={() => navigate("/admin/settings")}
                className="text-gray-600 hover:text-gray-800 flex items-center gap-1"
              >
                <span>⚙️</span> Settings
              </button>
            )}
            <span className="text-gray-600">{session?.email}</span>
            <button
              onClick={handleLogout}
              className="text-red-600 hover:text-red-800 font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-blue-600 font-medium">Pending</p>
            <p className="text-3xl font-bold text-blue-900">{stats.pending}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-yellow-600 font-medium">In Progress</p>
            <p className="text-3xl font-bold text-yellow-900">
              {stats.inProgress}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-green-600 font-medium">Completed</p>
            <p className="text-3xl font-bold text-green-900">
              {stats.completed}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-red-600 font-medium">SLA Breached</p>
            <p className="text-3xl font-bold text-red-900">
              {stats.slaBreached}
            </p>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Human-in-the-Loop Review Queue
            </h2>
            <button
              onClick={fetchReviews}
              disabled={fetching}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {fetching ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {fetching && reviews.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : reviews.length === 0 ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
              <p className="text-gray-500 text-lg">No reviews pending</p>
              <p className="text-gray-400 text-sm mt-2">
                Reviews will appear here when quotes need manual verification
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">
                      Quote #
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">
                      SLA Status
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">
                      Time Remaining
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reviews.map((review) => (
                    <tr
                      key={review.review_id}
                      className={`hover:bg-gray-50 ${review.sla_status === "breached" ? "bg-red-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <button
                          onClick={() =>
                            navigate(`/admin/hitl/${review.review_id}`)
                          }
                          style={{
                            color: "#3B82F6",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          {review.quote_number}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        <div className="text-sm">
                          <div className="font-medium">
                            {review.customer_name || "N/A"}
                          </div>
                          <div className="text-gray-500">
                            {review.customer_email || "N/A"}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            review.status === "pending"
                              ? "bg-yellow-100 text-yellow-800"
                              : review.status === "in_review"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-green-100 text-green-800"
                          }`}
                        >
                          {review.status.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${getPriorityColor(review.priority)}`}
                        >
                          {review.priority}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${getSLAColor(review.sla_status)}`}
                      >
                        {review.sla_status.toUpperCase()}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatSLA(review.minutes_to_sla)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            navigate(`/admin/hitl/${review.review_id}`)
                          }
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Test Mode Notice */}
        <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm text-orange-800">
            <strong>Test Mode:</strong> Authentication is using test code
            (700310). Data is fetched from Supabase v_hitl_queue view.
          </p>
        </div>
      </main>
    </div>
  );
}
