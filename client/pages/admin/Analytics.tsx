import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { useBranding } from "../../context/BrandingContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface AnalyticsData {
  success: boolean;
  currentMetrics: {
    overall: string;
    language: string;
    documentType: string;
    complexity: string;
    hitlTriggerRate: string;
    hitlCorrectionRate: string;
    avgHitlTimeMinutes: number;
    date: string;
  };
  trends: {
    dates: string[];
    overallAccuracy: number[];
    languageAccuracy: number[];
    documentTypeAccuracy: number[];
    complexityAccuracy: number[];
  };
  topErrors: Array<{
    id: string;
    type: string;
    aiPrediction: string;
    correctValue: string;
    occurrenceCount: number;
  }>;
  recommendations: Array<{
    id: string;
    reason: string;
  }>;
  periodSummary: {
    totalDocuments: number;
    totalQuotes: number;
    avgAccuracy: string;
    totalCorrections: number;
    daysWithData: number;
  };
}

export default function Analytics() {
  const { companyName, logoUrl, primaryColor } = useBranding();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("month");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(
    null,
  );
  const { session, loading: authLoading } = useAdminAuthContext();

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Fetch analytics data
  useEffect(() => {
    if (authLoading || !session) return;

    async function fetchAnalytics() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/get-ai-analytics`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              period,
              includeRecommendations: true,
              includeTrends: true,
              includeErrors: true,
            }),
          },
        );

        const data = await response.json();
        if (data.success) {
          setAnalyticsData(data);
        } else {
          setError(data.error || "Failed to load analytics");
        }
      } catch (err) {
        console.error("Analytics fetch error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load analytics",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [authLoading, session, period, SUPABASE_URL, SUPABASE_ANON_KEY]);

  // Helper: Color based on accuracy percentage
  function getAccuracyColor(accuracyStr: string | undefined): string {
    if (!accuracyStr) return "#6B7280";
    const value = parseFloat(accuracyStr);
    if (value >= 95) return "#10B981"; // Green
    if (value >= 85) return "#3B82F6"; // Blue
    if (value >= 75) return "#F59E0B"; // Yellow
    return "#EF4444"; // Red
  }

  // Helper: Format trend data for Recharts
  function formatTrendData(trends: AnalyticsData["trends"]) {
    if (!trends?.dates) return [];
    return trends.dates.map((date, i) => ({
      date: new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      overall: trends.overallAccuracy[i],
      language: trends.languageAccuracy[i],
      documentType: trends.documentTypeAccuracy[i],
      complexity: trends.complexityAccuracy[i],
    }));
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F9FAFB" }}>
      {/* Header */}
      <header
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #E5E7EB",
          padding: "16px 24px",
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              onClick={() => navigate("/admin/hitl")}
              style={{
                color: "#6B7280",
                textDecoration: "none",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              ← Back to Queue
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={companyName}
                  style={{ height: "32px" }}
                />
              ) : (
                <h1
                  style={{
                    fontSize: "20px",
                    fontWeight: "600",
                    margin: 0,
                    color: primaryColor,
                  }}
                >
                  {companyName.toUpperCase()}
                </h1>
              )}
              <h1 style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
                AI Analytics
              </h1>
            </div>
          </div>

          {/* Period Selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #D1D5DB",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <option value="day">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="quarter">Last 90 Days</option>
            <option value="year">Last Year</option>
          </select>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "3px solid #E5E7EB",
                borderTopColor: primaryColor,
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto",
              }}
            />
            <p style={{ marginTop: "16px", color: "#6B7280" }}>
              Loading analytics...
            </p>
          </div>
        ) : error ? (
          <div
            style={{
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: "8px",
              padding: "16px",
              color: "#991B1B",
            }}
          >
            Error loading analytics: {error}
          </div>
        ) : (
          <>
            {/* Accuracy Cards Row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "16px",
                marginBottom: "24px",
              }}
            >
              {/* Overall Accuracy */}
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <p
                  style={{
                    color: "#6B7280",
                    fontSize: "14px",
                    marginBottom: "8px",
                  }}
                >
                  Overall Accuracy
                </p>
                <p
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: getAccuracyColor(
                      analyticsData?.currentMetrics?.overall,
                    ),
                    margin: "8px 0",
                  }}
                >
                  {analyticsData?.currentMetrics?.overall || "N/A"}
                </p>
                <p style={{ color: "#9CA3AF", fontSize: "12px", margin: 0 }}>
                  {analyticsData?.currentMetrics?.date}
                </p>
              </div>

              {/* Language Accuracy */}
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <p
                  style={{
                    color: "#6B7280",
                    fontSize: "14px",
                    marginBottom: "8px",
                  }}
                >
                  Language Detection
                </p>
                <p
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: getAccuracyColor(
                      analyticsData?.currentMetrics?.language,
                    ),
                    margin: "8px 0",
                  }}
                >
                  {analyticsData?.currentMetrics?.language || "N/A"}
                </p>
              </div>

              {/* Document Type Accuracy */}
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <p
                  style={{
                    color: "#6B7280",
                    fontSize: "14px",
                    marginBottom: "8px",
                  }}
                >
                  Document Type
                </p>
                <p
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: getAccuracyColor(
                      analyticsData?.currentMetrics?.documentType,
                    ),
                    margin: "8px 0",
                  }}
                >
                  {analyticsData?.currentMetrics?.documentType || "N/A"}
                </p>
              </div>

              {/* Complexity Accuracy */}
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <p
                  style={{
                    color: "#6B7280",
                    fontSize: "14px",
                    marginBottom: "8px",
                  }}
                >
                  Complexity Assessment
                </p>
                <p
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: getAccuracyColor(
                      analyticsData?.currentMetrics?.complexity,
                    ),
                    margin: "8px 0",
                  }}
                >
                  {analyticsData?.currentMetrics?.complexity || "N/A"}
                </p>
              </div>
            </div>

            {/* HITL Metrics Row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "16px",
                marginBottom: "24px",
              }}
            >
              {/* HITL Trigger Rate */}
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <p
                  style={{
                    color: "#6B7280",
                    fontSize: "14px",
                    marginBottom: "8px",
                  }}
                >
                  HITL Trigger Rate
                </p>
                <p
                  style={{
                    fontSize: "28px",
                    fontWeight: "700",
                    color: "#1F2937",
                    margin: "8px 0",
                  }}
                >
                  {analyticsData?.currentMetrics?.hitlTriggerRate || "N/A"}
                </p>
                <p style={{ color: "#9CA3AF", fontSize: "12px", margin: 0 }}>
                  Quotes requiring review
                </p>
              </div>

              {/* HITL Correction Rate */}
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <p
                  style={{
                    color: "#6B7280",
                    fontSize: "14px",
                    marginBottom: "8px",
                  }}
                >
                  Correction Rate
                </p>
                <p
                  style={{
                    fontSize: "28px",
                    fontWeight: "700",
                    color: "#1F2937",
                    margin: "8px 0",
                  }}
                >
                  {analyticsData?.currentMetrics?.hitlCorrectionRate || "N/A"}
                </p>
                <p style={{ color: "#9CA3AF", fontSize: "12px", margin: 0 }}>
                  Reviews with corrections
                </p>
              </div>

              {/* Avg Review Time */}
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <p
                  style={{
                    color: "#6B7280",
                    fontSize: "14px",
                    marginBottom: "8px",
                  }}
                >
                  Avg Review Time
                </p>
                <p
                  style={{
                    fontSize: "28px",
                    fontWeight: "700",
                    color: "#1F2937",
                    margin: "8px 0",
                  }}
                >
                  {analyticsData?.currentMetrics?.avgHitlTimeMinutes
                    ? `${analyticsData.currentMetrics.avgHitlTimeMinutes} min`
                    : "N/A"}
                </p>
                <p style={{ color: "#9CA3AF", fontSize: "12px", margin: 0 }}>
                  Time to complete review
                </p>
              </div>
            </div>

            {/* Two Column Layout: Trends Chart + Top Errors */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr",
                gap: "24px",
                marginBottom: "24px",
              }}
            >
              {/* Trends Chart */}
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    marginBottom: "16px",
                  }}
                >
                  Accuracy Trend
                </h3>
                {analyticsData?.trends ? (
                  <div style={{ height: "300px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={formatTrendData(analyticsData.trends)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" fontSize={12} />
                        <YAxis domain={[0, 100]} fontSize={12} />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="overall"
                          stroke="#3B82F6"
                          name="Overall"
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="language"
                          stroke="#10B981"
                          name="Language"
                        />
                        <Line
                          type="monotone"
                          dataKey="documentType"
                          stroke="#F59E0B"
                          name="Doc Type"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p style={{ color: "#9CA3AF" }}>No trend data available</p>
                )}
              </div>

              {/* Top Errors */}
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <h3
                    style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}
                  >
                    Top Errors
                  </h3>
                  <button
                    onClick={() => navigate("/admin/learning")}
                    style={{
                      color: "#3B82F6",
                      fontSize: "14px",
                      textDecoration: "none",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    View All →
                  </button>
                </div>

                {analyticsData?.topErrors?.length ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    {analyticsData.topErrors.slice(0, 5).map((error, idx) => (
                      <div
                        key={error.id || idx}
                        style={{
                          padding: "12px",
                          backgroundColor: "#F9FAFB",
                          borderRadius: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "4px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#6B7280",
                              textTransform: "capitalize",
                            }}
                          >
                            {error.type.replace(/_/g, " ")}
                          </span>
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: "600",
                              color: "#1F2937",
                            }}
                          >
                            {error.occurrenceCount}x
                          </span>
                        </div>
                        <p style={{ fontSize: "14px", margin: 0 }}>
                          <span style={{ color: "#EF4444" }}>
                            {error.aiPrediction}
                          </span>
                          {" → "}
                          <span style={{ color: "#10B981" }}>
                            {error.correctValue}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "#9CA3AF", fontSize: "14px" }}>
                    No errors recorded yet
                  </p>
                )}
              </div>
            </div>

            {/* Pending Recommendations */}
            {analyticsData?.recommendations?.length ? (
              <div
                style={{
                  backgroundColor: "#FFFBEB",
                  border: "1px solid #FCD34D",
                  borderRadius: "8px",
                  padding: "20px",
                  marginBottom: "24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#92400E",
                      margin: 0,
                    }}
                  >
                    ⚠️ Pending Recommendations (
                    {analyticsData.recommendations.length})
                  </h3>
                  <button
                    onClick={() => navigate("/admin/thresholds")}
                    style={{
                      backgroundColor: "#F59E0B",
                      color: "white",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      textDecoration: "none",
                      fontSize: "14px",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Review Thresholds
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {analyticsData.recommendations.slice(0, 3).map((rec, idx) => (
                    <div
                      key={rec.id || idx}
                      style={{ fontSize: "14px", color: "#78350F" }}
                    >
                      • {rec.reason}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Period Summary */}
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                marginBottom: "24px",
              }}
            >
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  marginBottom: "16px",
                }}
              >
                Period Summary
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "16px",
                }}
              >
                <div>
                  <p
                    style={{
                      color: "#6B7280",
                      fontSize: "14px",
                      margin: "0 0 8px 0",
                    }}
                  >
                    Documents
                  </p>
                  <p style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
                    {analyticsData?.periodSummary?.totalDocuments || 0}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      color: "#6B7280",
                      fontSize: "14px",
                      margin: "0 0 8px 0",
                    }}
                  >
                    Quotes
                  </p>
                  <p style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
                    {analyticsData?.periodSummary?.totalQuotes || 0}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      color: "#6B7280",
                      fontSize: "14px",
                      margin: "0 0 8px 0",
                    }}
                  >
                    Avg Accuracy
                  </p>
                  <p style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
                    {analyticsData?.periodSummary?.avgAccuracy || "N/A"}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      color: "#6B7280",
                      fontSize: "14px",
                      margin: "0 0 8px 0",
                    }}
                  >
                    Corrections
                  </p>
                  <p style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
                    {analyticsData?.periodSummary?.totalCorrections || 0}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      color: "#6B7280",
                      fontSize: "14px",
                      margin: "0 0 8px 0",
                    }}
                  >
                    Days Tracked
                  </p>
                  <p style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
                    {analyticsData?.periodSummary?.daysWithData || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <div
              style={{
                display: "flex",
                gap: "16px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => navigate("/admin/learning")}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "white",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "#374151",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                📚 Learning Log
              </button>
              <button
                onClick={() => navigate("/admin/thresholds")}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "white",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "#374151",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                ⚙️ Threshold Management
              </button>
              <button
                onClick={() => navigate("/admin/patterns")}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "white",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "#374151",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                🔍 Pattern Analysis
              </button>
            </div>
          </>
        )}
      </main>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
