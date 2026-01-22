import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { useBranding } from "../../context/BrandingContext";
import { supabase } from "../../lib/supabase";

interface Analysis {
  id: string;
  category: string;
  status: string;
  accuracy_rate: number;
  total_predictions: number;
  correct_predictions: number;
  analysis_period_start: string;
  analysis_period_end: string;
  common_errors: Array<{
    ai_value?: string;
    aiValue?: string;
    correct_value?: string;
    correctValue?: string;
    count: number;
    percentage: number;
  }>;
  confusion_matrix: Record<string, Record<string, number>>;
  suggested_threshold_changes: Array<{
    threshold_type?: string;
    thresholdType?: string;
    current_value?: number;
    currentValue?: number;
    suggested_value?: number;
    suggestedValue?: number;
    reason: string;
  }>;
  suggested_prompt_improvements: Array<{
    suggestion: string;
    basedOn?: string;
  }>;
  generated_at: string;
}

// Helper Functions
function getCategoryColor(category: string) {
  const colors: Record<string, { bg: string; text: string }> = {
    document_type: { bg: "#DBEAFE", text: "#1E40AF" },
    language: { bg: "#D1FAE5", text: "#065F46" },
    complexity: { bg: "#FEF3C7", text: "#92400E" },
    overall: { bg: "#E5E7EB", text: "#374151" },
  };
  return colors[category] || colors.overall;
}

function getStatusColor(status: string) {
  const colors: Record<string, { bg: string; text: string }> = {
    generated: { bg: "#FEF3C7", text: "#92400E" },
    reviewed: { bg: "#DBEAFE", text: "#1E40AF" },
    applied: { bg: "#D1FAE5", text: "#065F46" },
    rejected: { bg: "#FEE2E2", text: "#991B1B" },
  };
  return colors[status] || colors.generated;
}

function getAccuracyColor(accuracy: number | null | undefined): string {
  if (!accuracy) return "#6B7280";
  if (accuracy >= 0.95) return "#10B981";
  if (accuracy >= 0.85) return "#3B82F6";
  if (accuracy >= 0.75) return "#F59E0B";
  return "#EF4444";
}

function formatLabel(label: string | null | undefined): string {
  if (!label) return "-";
  return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatThresholdName(key: string | null | undefined): string {
  if (!key) return "Unknown";
  return key
    .replace("hitl_", "")
    .replace("ai_", "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start || !end) return "-";
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} - ${e.toLocaleDateString("en-US", opts)}`;
}

// Confusion Matrix Component
function ConfusionMatrixTable({
  matrix,
}: {
  matrix: Record<string, Record<string, number>>;
}) {
  if (!matrix || Object.keys(matrix).length === 0) {
    return <p style={{ color: "#6B7280" }}>No confusion matrix data</p>;
  }

  // Get all unique labels
  const labels = [
    ...new Set([
      ...Object.keys(matrix),
      ...Object.values(matrix).flatMap((row) => Object.keys(row)),
    ]),
  ].sort();

  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "12px",
      }}
    >
      <thead>
        <tr>
          <th
            style={{
              padding: "8px",
              textAlign: "left",
              borderBottom: "2px solid #E5E7EB",
            }}
          >
            Predicted ↓ / Actual →
          </th>
          {labels.map((label) => (
            <th
              key={label}
              style={{
                padding: "8px",
                textAlign: "center",
                borderBottom: "2px solid #E5E7EB",
                maxWidth: "100px",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {formatLabel(label)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((predicted) => (
          <tr key={predicted}>
            <td
              style={{
                padding: "8px",
                fontWeight: "500",
                borderBottom: "1px solid #E5E7EB",
              }}
            >
              {formatLabel(predicted)}
            </td>
            {labels.map((actual) => {
              const value = matrix[predicted]?.[actual] || 0;
              const isDiagonal = predicted === actual;
              const hasErrors = !isDiagonal && value > 0;

              return (
                <td
                  key={actual}
                  style={{
                    padding: "8px",
                    textAlign: "center",
                    borderBottom: "1px solid #E5E7EB",
                    backgroundColor:
                      isDiagonal && value > 0
                        ? "#D1FAE5"
                        : hasErrors
                          ? "#FEE2E2"
                          : "transparent",
                    fontWeight: value > 0 ? "600" : "400",
                    color: value === 0 ? "#D1D5DB" : "#1F2937",
                  }}
                >
                  {value}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Patterns() {
  const { companyName, logoUrl, primaryColor } = useBranding();
  const navigate = useNavigate();
  const { session: staffSession, loading: authLoading } = useAdminAuthContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(
    null,
  );
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [generating, setGenerating] = useState(false);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Fetch analyses on load
  useEffect(() => {
    if (authLoading || !staffSession) return;
    fetchAnalyses();
  }, [authLoading, staffSession, categoryFilter]);

  async function fetchAnalyses() {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("ai_pattern_analysis")
        .select("*")
        .order("generated_at", { ascending: false })
        .limit(20);

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setAnalyses(data || []);

      // Auto-select most recent
      if (data && data.length > 0 && !selectedAnalysis) {
        setSelectedAnalysis(data[0]);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load analyses");
    } finally {
      setLoading(false);
    }
  }

  // Generate new analysis
  async function generateNewAnalysis() {
    setGenerating(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/analyze-ai-patterns`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            category: categoryFilter === "all" ? undefined : categoryFilter,
          }),
        },
      );

      const result = await response.json();

      if (result.success) {
        alert("Analysis generated successfully!");
        fetchAnalyses();
      } else {
        alert("Error: " + result.error);
      }
    } catch (err) {
      alert(
        "Error generating analysis: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    } finally {
      setGenerating(false);
    }
  }

  if (authLoading || !staffSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F9FAFB" }}>
      {/* Header */}
      <header
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #E5E7EB",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            onClick={() => navigate("/admin/analytics")}
            style={{
              color: "#6B7280",
              textDecoration: "none",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            ← Back to Analytics
          </button>
          <h1 style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
            🔍 Pattern Analysis
          </h1>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #D1D5DB",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <option value="all">All Categories</option>
            <option value="document_type">Document Type</option>
            <option value="language">Language</option>
            <option value="complexity">Complexity</option>
            <option value="overall">Overall</option>
          </select>

          {/* Generate New Analysis */}
          <button
            onClick={generateNewAnalysis}
            disabled={generating}
            style={{
              padding: "8px 16px",
              backgroundColor: primaryColor,
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: generating ? "not-allowed" : "pointer",
              fontSize: "14px",
              opacity: generating ? 0.5 : 1,
            }}
          >
            {generating ? "Generating..." : "+ Generate Analysis"}
          </button>
        </div>
      </header>

      {/* Main Content - Two Column Layout */}
      <main style={{ display: "flex", height: "calc(100vh - 65px)" }}>
        {/* Left Panel - Analysis List */}
        <div
          style={{
            width: "320px",
            borderRight: "1px solid #E5E7EB",
            backgroundColor: "white",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid #E5E7EB",
            }}
          >
            <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
              {analyses.length} analyses found
            </p>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              Loading...
            </div>
          ) : analyses.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: "#6B7280",
              }}
            >
              <p>No analyses found</p>
              <p style={{ fontSize: "14px" }}>
                Click "Generate Analysis" to create one
              </p>
            </div>
          ) : (
            analyses.map((analysis) => (
              <div
                key={analysis.id}
                onClick={() => setSelectedAnalysis(analysis)}
                style={{
                  padding: "16px",
                  borderBottom: "1px solid #E5E7EB",
                  cursor: "pointer",
                  backgroundColor:
                    selectedAnalysis?.id === analysis.id ? "#EFF6FF" : "white",
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
                      padding: "2px 8px",
                      borderRadius: "4px",
                      backgroundColor: getCategoryColor(analysis.category).bg,
                      color: getCategoryColor(analysis.category).text,
                    }}
                  >
                    {analysis.category}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      backgroundColor: getStatusColor(analysis.status).bg,
                      color: getStatusColor(analysis.status).text,
                    }}
                  >
                    {analysis.status}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    marginBottom: "4px",
                  }}
                >
                  Accuracy:{" "}
                  {analysis.accuracy_rate
                    ? (analysis.accuracy_rate * 100).toFixed(1) + "%"
                    : "N/A"}
                </p>

                <p style={{ fontSize: "12px", color: "#6B7280" }}>
                  {formatDateRange(
                    analysis.analysis_period_start,
                    analysis.analysis_period_end,
                  )}
                </p>

                <p style={{ fontSize: "11px", color: "#9CA3AF" }}>
                  {analysis.total_predictions} predictions
                </p>
              </div>
            ))
          )}
        </div>

        {/* Right Panel - Analysis Details */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {!selectedAnalysis ? (
            <div
              style={{
                textAlign: "center",
                padding: "60px",
                color: "#6B7280",
              }}
            >
              Select an analysis to view details
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "16px",
                  marginBottom: "24px",
                }}
              >
                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "8px",
                    padding: "16px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                >
                  <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
                    Accuracy
                  </p>
                  <p
                    style={{
                      fontSize: "28px",
                      fontWeight: "700",
                      color: getAccuracyColor(selectedAnalysis.accuracy_rate),
                      margin: "8px 0 0 0",
                    }}
                  >
                    {selectedAnalysis.accuracy_rate
                      ? (selectedAnalysis.accuracy_rate * 100).toFixed(1) + "%"
                      : "N/A"}
                  </p>
                </div>

                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "8px",
                    padding: "16px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                >
                  <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
                    Total Predictions
                  </p>
                  <p
                    style={{
                      fontSize: "28px",
                      fontWeight: "700",
                      margin: "8px 0 0 0",
                    }}
                  >
                    {selectedAnalysis.total_predictions || 0}
                  </p>
                </div>

                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "8px",
                    padding: "16px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                >
                  <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
                    Correct
                  </p>
                  <p
                    style={{
                      fontSize: "28px",
                      fontWeight: "700",
                      color: "#10B981",
                      margin: "8px 0 0 0",
                    }}
                  >
                    {selectedAnalysis.correct_predictions || 0}
                  </p>
                </div>

                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "8px",
                    padding: "16px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                >
                  <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
                    Errors
                  </p>
                  <p
                    style={{
                      fontSize: "28px",
                      fontWeight: "700",
                      color: "#EF4444",
                      margin: "8px 0 0 0",
                    }}
                  >
                    {(selectedAnalysis.total_predictions || 0) -
                      (selectedAnalysis.correct_predictions || 0)}
                  </p>
                </div>
              </div>

              {/* Common Errors */}
              {selectedAnalysis.common_errors &&
                selectedAnalysis.common_errors.length > 0 && (
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
                      Common Errors
                    </h3>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {selectedAnalysis.common_errors
                        .slice(0, 10)
                        .map((err, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "12px",
                              backgroundColor: "#F9FAFB",
                              borderRadius: "6px",
                            }}
                          >
                            <div>
                              <span style={{ color: "#EF4444" }}>
                                {err.ai_value || err.aiValue}
                              </span>
                              {" → "}
                              <span style={{ color: "#10B981" }}>
                                {err.correct_value || err.correctValue}
                              </span>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "16px",
                              }}
                            >
                              <span
                                style={{ fontSize: "14px", fontWeight: "600" }}
                              >
                                {err.count}x
                              </span>
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "#6B7280",
                                  width: "60px",
                                  textAlign: "right",
                                }}
                              >
                                {((err.percentage || 0) * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

              {/* Confusion Matrix */}
              {selectedAnalysis.confusion_matrix &&
                Object.keys(selectedAnalysis.confusion_matrix).length > 0 && (
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
                      Confusion Matrix
                    </h3>

                    <div style={{ overflowX: "auto" }}>
                      <ConfusionMatrixTable
                        matrix={selectedAnalysis.confusion_matrix}
                      />
                    </div>
                  </div>
                )}

              {/* Threshold Recommendations */}
              {selectedAnalysis.suggested_threshold_changes &&
                selectedAnalysis.suggested_threshold_changes.length > 0 && (
                  <div
                    style={{
                      backgroundColor: "#FFFBEB",
                      border: "1px solid #FCD34D",
                      borderRadius: "8px",
                      padding: "20px",
                      marginBottom: "24px",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "#92400E",
                        marginBottom: "16px",
                      }}
                    >
                      ⚠️ Threshold Recommendations
                    </h3>

                    {selectedAnalysis.suggested_threshold_changes.map(
                      (rec, idx) => (
                        <div
                          key={idx}
                          style={{
                            backgroundColor: "white",
                            borderRadius: "6px",
                            padding: "12px",
                            marginBottom: "8px",
                          }}
                        >
                          <p
                            style={{
                              fontSize: "14px",
                              fontWeight: "500",
                              marginBottom: "4px",
                            }}
                          >
                            {formatThresholdName(
                              rec.threshold_type || rec.thresholdType,
                            )}
                          </p>
                          <p
                            style={{
                              fontSize: "14px",
                              color: "#6B7280",
                              margin: 0,
                            }}
                          >
                            {rec.current_value || rec.currentValue} →{" "}
                            {rec.suggested_value || rec.suggestedValue}
                          </p>
                          <p
                            style={{
                              fontSize: "12px",
                              color: "#78350F",
                              marginTop: "4px",
                              margin: 0,
                            }}
                          >
                            {rec.reason}
                          </p>
                        </div>
                      ),
                    )}

                    <button
                      onClick={() => navigate("/admin/thresholds")}
                      style={{
                        display: "inline-block",
                        marginTop: "12px",
                        padding: "8px 16px",
                        backgroundColor: "#F59E0B",
                        color: "white",
                        borderRadius: "6px",
                        textDecoration: "none",
                        fontSize: "14px",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Apply Recommendations →
                    </button>
                  </div>
                )}

              {/* Prompt Improvements */}
              {selectedAnalysis.suggested_prompt_improvements &&
                selectedAnalysis.suggested_prompt_improvements.length > 0 && (
                  <div
                    style={{
                      backgroundColor: "#EFF6FF",
                      border: "1px solid #BFDBFE",
                      borderRadius: "8px",
                      padding: "20px",
                      marginBottom: "24px",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "#1E40AF",
                        marginBottom: "16px",
                      }}
                    >
                      💡 Prompt Improvement Suggestions
                    </h3>

                    {selectedAnalysis.suggested_prompt_improvements.map(
                      (imp, idx) => (
                        <div
                          key={idx}
                          style={{
                            backgroundColor: "white",
                            borderRadius: "6px",
                            padding: "12px",
                            marginBottom: "8px",
                          }}
                        >
                          <p style={{ fontSize: "14px", margin: 0 }}>
                            {imp.suggestion}
                          </p>
                          {imp.basedOn && (
                            <p
                              style={{
                                fontSize: "12px",
                                color: "#6B7280",
                                marginTop: "4px",
                                margin: 0,
                              }}
                            >
                              Based on: {imp.basedOn}
                            </p>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}

              {/* Analysis Metadata */}
              <div
                style={{
                  backgroundColor: "#F9FAFB",
                  borderRadius: "8px",
                  padding: "16px",
                  fontSize: "12px",
                  color: "#6B7280",
                }}
              >
                <p style={{ margin: "0 0 4px 0" }}>
                  Analysis ID: {selectedAnalysis.id}
                </p>
                <p style={{ margin: "0 0 4px 0" }}>
                  Generated: {formatDate(selectedAnalysis.generated_at)}
                </p>
                <p style={{ margin: "0 0 4px 0" }}>
                  Period:{" "}
                  {formatDateRange(
                    selectedAnalysis.analysis_period_start,
                    selectedAnalysis.analysis_period_end,
                  )}
                </p>
                <p style={{ margin: 0 }}>Status: {selectedAnalysis.status}</p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
