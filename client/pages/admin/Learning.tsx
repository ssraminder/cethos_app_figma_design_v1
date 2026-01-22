import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { useBranding } from "../../context/BrandingContext";
import { supabase } from "../../lib/supabase";

interface LearningPattern {
  id: string;
  learning_type: string;
  ai_prediction: string;
  correct_value: string;
  occurrence_count: number;
  confidence_score: number | null;
  first_seen_at: string;
  last_seen_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  action_taken: string | null;
  action_notes: string | null;
  document_characteristics: any;
  updated_at: string;
}

// Helper Functions
function getTypeBadgeColor(type: string) {
  switch (type) {
    case "document_type":
      return { bg: "#DBEAFE", text: "#1E40AF" };
    case "language":
      return { bg: "#D1FAE5", text: "#065F46" };
    case "complexity":
      return { bg: "#FEF3C7", text: "#92400E" };
    default:
      return { bg: "#F3F4F6", text: "#374151" };
  }
}

function formatType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Learning() {
  const { companyName, logoUrl, primaryColor } = useBranding();
  const navigate = useNavigate();
  const { session: staffSession, loading: authLoading } = useAdminAuthContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [learningPatterns, setLearningPatterns] = useState<LearningPattern[]>(
    [],
  );
  const [filters, setFilters] = useState({
    type: "all",
    status: "all",
    sortBy: "occurrence",
  });
  const [selectedPattern, setSelectedPattern] =
    useState<LearningPattern | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);

  // Fetch patterns when filters change
  useEffect(() => {
    if (staffSession) {
      fetchPatterns();
    }
  }, [filters, staffSession]);

  async function fetchPatterns() {
    setLoading(true);
    setError(null);

    try {
      // Build query
      let query = supabase.from("ai_learning_log").select("*");

      if (filters.type !== "all") {
        query = query.eq("learning_type", filters.type);
      }

      if (filters.status === "unreviewed") {
        query = query.is("reviewed_at", null);
      } else if (filters.status === "reviewed") {
        query = query.not("reviewed_at", "is", null);
      }

      if (filters.sortBy === "occurrence") {
        query = query.order("occurrence_count", { ascending: false });
      } else {
        query = query.order("last_seen_at", { ascending: false });
      }

      query = query.limit(100);

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setLearningPatterns(data || []);
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load patterns");
    } finally {
      setLoading(false);
    }
  }

  // Mark pattern as reviewed
  async function markAsReviewed(
    patternId: string,
    action: string,
    notes: string,
  ) {
    if (!staffSession?.staffId) {
      alert("Session invalid. Please log in again.");
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from("ai_learning_log")
        .update({
          reviewed_at: new Date().toISOString(),
          reviewed_by: staffSession.staffId,
          action_taken: action,
          action_notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", patternId);

      if (updateError) throw updateError;

      // Refresh patterns
      fetchPatterns();
      setActionModalOpen(false);
      setSelectedPattern(null);
    } catch (err) {
      alert(
        "Error updating pattern: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    }
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
            📚 Learning Log
          </h1>
        </div>

        {/* Stats Badge */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "center",
          }}
        >
          <span
            style={{
              backgroundColor: "#FEF3C7",
              color: "#92400E",
              padding: "4px 12px",
              borderRadius: "999px",
              fontSize: "14px",
            }}
          >
            {learningPatterns.filter((p) => !p.reviewed_at).length} unreviewed
          </span>
          <span
            style={{
              backgroundColor: "#DBEAFE",
              color: "#1E40AF",
              padding: "4px 12px",
              borderRadius: "999px",
              fontSize: "14px",
            }}
          >
            {learningPatterns.length} total patterns
          </span>
        </div>
      </header>

      {/* Filters */}
      <div
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #E5E7EB",
          padding: "12px 24px",
          display: "flex",
          gap: "16px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* Type Filter */}
        <div>
          <label
            style={{
              fontSize: "12px",
              color: "#6B7280",
              marginRight: "8px",
            }}
          >
            Type:
          </label>
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #D1D5DB",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <option value="all">All Types</option>
            <option value="document_type">Document Type</option>
            <option value="language">Language</option>
            <option value="complexity">Complexity</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label
            style={{
              fontSize: "12px",
              color: "#6B7280",
              marginRight: "8px",
            }}
          >
            Status:
          </label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #D1D5DB",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <option value="all">All</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </div>

        {/* Sort */}
        <div>
          <label
            style={{
              fontSize: "12px",
              color: "#6B7280",
              marginRight: "8px",
            }}
          >
            Sort:
          </label>
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #D1D5DB",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <option value="occurrence">Most Frequent</option>
            <option value="recent">Most Recent</option>
          </select>
        </div>

        <div style={{ flex: 1 }} />

        {/* Refresh Button */}
        <button
          onClick={fetchPatterns}
          style={{
            padding: "6px 12px",
            backgroundColor: "white",
            border: "1px solid #D1D5DB",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Main Content */}
      <main style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px" }}>
            <p>Loading learning patterns...</p>
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
            Error: {error}
          </div>
        ) : learningPatterns.length === 0 ? (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "60px",
              textAlign: "center",
              color: "#6B7280",
            }}
          >
            <p style={{ fontSize: "18px" }}>No learning patterns found</p>
            <p style={{ fontSize: "14px" }}>
              Patterns will appear here as staff make corrections
            </p>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              overflow: "hidden",
            }}
          >
            {/* Table Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 1fr 100px 80px 140px 120px",
                gap: "16px",
                padding: "12px 20px",
                backgroundColor: "#F9FAFB",
                borderBottom: "1px solid #E5E7EB",
                fontWeight: "600",
                fontSize: "12px",
                color: "#6B7280",
                textTransform: "uppercase",
              }}
            >
              <div>Type</div>
              <div>AI Predicted</div>
              <div>Correct Value</div>
              <div style={{ textAlign: "center" }}>Count</div>
              <div style={{ textAlign: "center" }}>Conf.</div>
              <div>Last Seen</div>
              <div>Status</div>
            </div>

            {/* Table Rows */}
            {learningPatterns.map((pattern) => (
              <div
                key={pattern.id}
                onClick={() => {
                  setSelectedPattern(pattern);
                  setActionModalOpen(true);
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 1fr 100px 80px 140px 120px",
                  gap: "16px",
                  padding: "16px 20px",
                  borderBottom: "1px solid #E5E7EB",
                  cursor: "pointer",
                  backgroundColor: pattern.reviewed_at ? "#F9FAFB" : "white",
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "#F3F4F6")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = pattern.reviewed_at
                    ? "#F9FAFB"
                    : "white")
                }
              >
                {/* Type Badge */}
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "500",
                      backgroundColor: getTypeBadgeColor(pattern.learning_type)
                        .bg,
                      color: getTypeBadgeColor(pattern.learning_type).text,
                    }}
                  >
                    {formatType(pattern.learning_type)}
                  </span>
                </div>

                {/* AI Prediction */}
                <div
                  style={{
                    color: "#EF4444",
                    fontSize: "14px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pattern.ai_prediction}
                </div>

                {/* Correct Value */}
                <div
                  style={{
                    color: "#10B981",
                    fontSize: "14px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pattern.correct_value}
                </div>

                {/* Occurrence Count */}
                <div
                  style={{
                    textAlign: "center",
                    fontWeight: "600",
                    fontSize: "16px",
                    color:
                      pattern.occurrence_count >= 10
                        ? "#EF4444"
                        : pattern.occurrence_count >= 5
                          ? "#F59E0B"
                          : "#1F2937",
                  }}
                >
                  {pattern.occurrence_count}
                </div>

                {/* Confidence */}
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "14px",
                    color: "#6B7280",
                  }}
                >
                  {pattern.confidence_score
                    ? (pattern.confidence_score * 100).toFixed(0) + "%"
                    : "-"}
                </div>

                {/* Last Seen */}
                <div style={{ fontSize: "14px", color: "#6B7280" }}>
                  {formatDate(pattern.last_seen_at)}
                </div>

                {/* Status */}
                <div>
                  {pattern.reviewed_at ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        backgroundColor: "#D1FAE5",
                        color: "#065F46",
                      }}
                    >
                      ✓ {pattern.action_taken || "Reviewed"}
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        backgroundColor: "#FEF3C7",
                        color: "#92400E",
                      }}
                    >
                      Pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Action Modal */}
      {actionModalOpen && selectedPattern && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActionModalOpen(false);
              setSelectedPattern(null);
            }
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                marginBottom: "16px",
              }}
            >
              Review Learning Pattern
            </h3>

            {/* Pattern Details */}
            <div
              style={{
                backgroundColor: "#F9FAFB",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "16px",
              }}
            >
              <p
                style={{
                  fontSize: "12px",
                  color: "#6B7280",
                  marginBottom: "4px",
                }}
              >
                {formatType(selectedPattern.learning_type)}
              </p>
              <p style={{ fontSize: "16px", marginBottom: "8px" }}>
                <span style={{ color: "#EF4444" }}>
                  {selectedPattern.ai_prediction}
                </span>
                {" → "}
                <span style={{ color: "#10B981" }}>
                  {selectedPattern.correct_value}
                </span>
              </p>
              <p style={{ fontSize: "14px", color: "#6B7280" }}>
                Occurred {selectedPattern.occurrence_count} times
                {selectedPattern.confidence_score &&
                  ` at avg ${(selectedPattern.confidence_score * 100).toFixed(0)}% confidence`}
              </p>
              <p style={{ fontSize: "12px", color: "#9CA3AF" }}>
                First seen: {formatDate(selectedPattern.first_seen_at)}
                <br />
                Last seen: {formatDate(selectedPattern.last_seen_at)}
              </p>
            </div>

            {/* Document Characteristics */}
            {selectedPattern.document_characteristics && (
              <div style={{ marginBottom: "16px" }}>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#6B7280",
                    marginBottom: "8px",
                  }}
                >
                  Document Characteristics:
                </p>
                <pre
                  style={{
                    backgroundColor: "#F3F4F6",
                    padding: "8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(
                    selectedPattern.document_characteristics,
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}

            {/* Already Reviewed */}
            {selectedPattern.reviewed_at ? (
              <div
                style={{
                  backgroundColor: "#D1FAE5",
                  padding: "12px",
                  borderRadius: "8px",
                  marginBottom: "16px",
                }}
              >
                <p style={{ fontSize: "14px", color: "#065F46" }}>
                  ✓ Reviewed on {formatDate(selectedPattern.reviewed_at)}
                </p>
                <p style={{ fontSize: "12px", color: "#065F46" }}>
                  Action: {selectedPattern.action_taken || "None specified"}
                </p>
                {selectedPattern.action_notes && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#065F46",
                      marginTop: "4px",
                    }}
                  >
                    Notes: {selectedPattern.action_notes}
                  </p>
                )}
              </div>
            ) : (
              /* Action Buttons */
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    marginBottom: "8px",
                  }}
                >
                  Take Action:
                </p>

                <button
                  onClick={() =>
                    markAsReviewed(
                      selectedPattern.id,
                      "threshold_adjusted",
                      "Adjusted related threshold",
                    )
                  }
                  style={{
                    padding: "12px",
                    backgroundColor: "#3B82F6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    textAlign: "left",
                  }}
                >
                  ⚙️ Adjust Threshold
                  <span
                    style={{
                      display: "block",
                      fontSize: "12px",
                      opacity: 0.8,
                    }}
                  >
                    Mark as addressed via threshold change
                  </span>
                </button>

                <button
                  onClick={() =>
                    markAsReviewed(
                      selectedPattern.id,
                      "prompt_updated",
                      "Updated AI prompt",
                    )
                  }
                  style={{
                    padding: "12px",
                    backgroundColor: "#8B5CF6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    textAlign: "left",
                  }}
                >
                  📝 Update Prompt
                  <span
                    style={{
                      display: "block",
                      fontSize: "12px",
                      opacity: 0.8,
                    }}
                  >
                    Mark as addressed via prompt improvement
                  </span>
                </button>

                <button
                  onClick={() =>
                    markAsReviewed(
                      selectedPattern.id,
                      "training_added",
                      "Added to training data",
                    )
                  }
                  style={{
                    padding: "12px",
                    backgroundColor: "#10B981",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    textAlign: "left",
                  }}
                >
                  🎓 Add to Training
                  <span
                    style={{
                      display: "block",
                      fontSize: "12px",
                      opacity: 0.8,
                    }}
                  >
                    Mark as added to training examples
                  </span>
                </button>

                <button
                  onClick={() =>
                    markAsReviewed(
                      selectedPattern.id,
                      "ignored",
                      "Edge case, no action needed",
                    )
                  }
                  style={{
                    padding: "12px",
                    backgroundColor: "#6B7280",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    textAlign: "left",
                  }}
                >
                  ⏭️ Ignore
                  <span
                    style={{
                      display: "block",
                      fontSize: "12px",
                      opacity: 0.8,
                    }}
                  >
                    Mark as reviewed but no action needed
                  </span>
                </button>
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={() => {
                setActionModalOpen(false);
                setSelectedPattern(null);
              }}
              style={{
                marginTop: "16px",
                padding: "12px",
                width: "100%",
                backgroundColor: "#F3F4F6",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
