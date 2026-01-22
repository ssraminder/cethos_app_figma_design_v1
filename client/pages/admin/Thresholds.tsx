import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { useBranding } from "../../context/BrandingContext";
import { supabase } from "../../lib/supabase";

interface ThresholdSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  description: string | null;
  updated_at: string;
}

interface ThresholdHistory {
  id: string;
  threshold_type: string;
  previous_value: number;
  new_value: number;
  change_reason: string;
  change_source: string;
  changed_by: string;
  changed_by_name: string | null;
  changed_at: string;
}

interface Recommendation {
  id: string;
  analysis_type: string;
  threshold_name: string;
  current_value: number;
  suggested_value: number;
  reason: string;
  status: string;
  suggested_threshold_changes: any;
  created_at: string;
}

export default function Thresholds() {
  const { companyName, logoUrl, primaryColor } = useBranding();
  const navigate = useNavigate();
  const { session: staffSession, loading: authLoading } = useAdminAuthContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<ThresholdSetting[]>([]);
  const [history, setHistory] = useState<ThresholdHistory[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Fetch all data when session is ready
  useEffect(() => {
    if (staffSession) {
      fetchAllData();
    }
  }, [staffSession]);

  async function fetchAllData() {
    setLoading(true);
    setError(null);

    try {
      // Fetch thresholds from app_settings
      const { data: thresholdData, error: thresholdError } = await supabase
        .from("app_settings")
        .select("*")
        .or(
          "setting_key.ilike.%hitl%threshold%,setting_key.ilike.%hitl%confidence%,setting_key.ilike.%ai%threshold%,setting_key.ilike.%ai%confidence%",
        )
        .order("setting_key", { ascending: true });

      if (thresholdError) throw thresholdError;
      setThresholds(thresholdData || []);

      // Fetch threshold history with staff names
      const { data: historyData, error: historyError } = await supabase
        .from("threshold_history")
        .select(
          `
          *,
          staff_users!threshold_history_changed_by_fkey(full_name)
        `,
        )
        .order("changed_at", { ascending: false })
        .limit(10);

      if (historyError) throw historyError;

      // Format history with staff names
      const formattedHistory =
        historyData?.map((record: any) => ({
          ...record,
          changed_by_name: record.staff_users?.full_name || "Unknown",
        })) || [];
      setHistory(formattedHistory);

      // Fetch pending recommendations
      const { data: recData, error: recError } = await supabase
        .from("ai_pattern_analysis")
        .select("*")
        .eq("status", "generated")
        .not("suggested_threshold_changes", "is", null)
        .order("created_at", { ascending: false });

      if (recError) throw recError;

      // Parse suggestions and flatten
      const flatRecommendations: Recommendation[] = [];
      recData?.forEach((rec: any) => {
        if (rec.suggested_threshold_changes) {
          const changes =
            typeof rec.suggested_threshold_changes === "string"
              ? JSON.parse(rec.suggested_threshold_changes)
              : rec.suggested_threshold_changes;

          if (Array.isArray(changes)) {
            changes.forEach((change: any) => {
              flatRecommendations.push({
                id: rec.id,
                analysis_type: rec.analysis_type,
                threshold_name: change.threshold_name || change.name,
                current_value: change.current_value || change.currentValue,
                suggested_value:
                  change.suggested_value || change.suggestedValue,
                reason:
                  change.reason || rec.recommendations || "No reason provided",
                status: rec.status,
                suggested_threshold_changes: rec.suggested_threshold_changes,
                created_at: rec.created_at,
              });
            });
          }
        }
      });

      setRecommendations(flatRecommendations);
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function applyThresholdChange(
    thresholdType: string,
    newValue: number,
    reason: string,
    analysisId?: string,
  ) {
    if (!staffSession?.staffId) {
      alert("Session invalid. Please log in again.");
      return;
    }

    if (staffSession.staffRole !== "super_admin") {
      alert("Only super_admin users can modify thresholds.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/apply-threshold-change`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            staffId: staffSession.staffId,
            thresholdType,
            newValue,
            reason,
            analysisId: analysisId || null,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to apply threshold change");
      }

      alert("Threshold updated successfully!");
      fetchAllData(); // Refresh all data
      setEditingId(null);
      setEditValue("");
      setEditReason("");
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function dismissRecommendation(analysisId: string) {
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("ai_pattern_analysis")
        .update({ status: "rejected" })
        .eq("id", analysisId);

      if (error) throw error;

      alert("Recommendation dismissed");
      fetchAllData();
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(threshold: ThresholdSetting) {
    if (staffSession?.staffRole !== "super_admin") {
      alert("Only super_admin users can edit thresholds.");
      return;
    }
    setEditingId(threshold.id);
    setEditValue(threshold.setting_value);
    setEditReason("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
    setEditReason("");
  }

  function handleSaveEdit(threshold: ThresholdSetting) {
    if (!editReason.trim()) {
      alert("Please provide a reason for this change.");
      return;
    }

    const newValue = parseFloat(editValue);
    if (isNaN(newValue)) {
      alert("Invalid value. Please enter a valid number.");
      return;
    }

    applyThresholdChange(threshold.setting_key, newValue, editReason);
  }

  function formatThresholdName(key: string): string {
    return key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/Hitl/g, "HITL")
      .replace(/Ai/g, "AI");
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const isSuperAdmin = staffSession?.staffRole === "super_admin";

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
                ⚙️ Threshold Management
              </h1>
            </div>
          </div>

          {/* Role Badge */}
          {!isSuperAdmin && (
            <span
              style={{
                backgroundColor: "#FEF3C7",
                color: "#92400E",
                padding: "4px 12px",
                borderRadius: "999px",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              🔒 View Only
            </span>
          )}
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
              Loading thresholds...
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
            Error: {error}
          </div>
        ) : (
          <>
            {/* Pending Recommendations Panel */}
            {recommendations.length > 0 && (
              <div
                style={{
                  backgroundColor: "#FFFBEB",
                  border: "1px solid #FCD34D",
                  borderRadius: "8px",
                  padding: "20px",
                  marginBottom: "24px",
                }}
              >
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    color: "#92400E",
                    marginBottom: "16px",
                  }}
                >
                  ⚠️ Pending Recommendations ({recommendations.length})
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {recommendations.map((rec, idx) => (
                    <div
                      key={`${rec.id}-${idx}`}
                      style={{
                        backgroundColor: "white",
                        borderRadius: "6px",
                        padding: "16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <p
                          style={{
                            fontSize: "14px",
                            fontWeight: "600",
                            color: "#1F2937",
                            marginBottom: "4px",
                          }}
                        >
                          {formatThresholdName(rec.threshold_name)}
                        </p>
                        <p
                          style={{
                            fontSize: "14px",
                            color: "#6B7280",
                            marginBottom: "4px",
                          }}
                        >
                          <span style={{ color: "#EF4444" }}>
                            {(rec.current_value * 100).toFixed(0)}%
                          </span>
                          {" → "}
                          <span style={{ color: "#10B981" }}>
                            {(rec.suggested_value * 100).toFixed(0)}%
                          </span>
                        </p>
                        <p style={{ fontSize: "13px", color: "#6B7280" }}>
                          {rec.reason}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() =>
                            applyThresholdChange(
                              rec.threshold_name,
                              rec.suggested_value,
                              `Applied recommendation: ${rec.reason}`,
                              rec.id,
                            )
                          }
                          disabled={submitting || !isSuperAdmin}
                          style={{
                            padding: "8px 16px",
                            backgroundColor: isSuperAdmin
                              ? "#10B981"
                              : "#D1D5DB",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: isSuperAdmin ? "pointer" : "not-allowed",
                            fontSize: "14px",
                            fontWeight: "500",
                          }}
                        >
                          Apply
                        </button>
                        <button
                          onClick={() => dismissRecommendation(rec.id)}
                          disabled={submitting || !isSuperAdmin}
                          style={{
                            padding: "8px 16px",
                            backgroundColor: "white",
                            color: "#6B7280",
                            border: "1px solid #D1D5DB",
                            borderRadius: "6px",
                            cursor: isSuperAdmin ? "pointer" : "not-allowed",
                            fontSize: "14px",
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current Thresholds Table */}
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                marginBottom: "24px",
                overflow: "hidden",
              }}
            >
              <div
                style={{ padding: "20px", borderBottom: "1px solid #E5E7EB" }}
              >
                <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>
                  Current Thresholds
                </h2>
              </div>

              {thresholds.length === 0 ? (
                <div
                  style={{
                    padding: "40px",
                    textAlign: "center",
                    color: "#6B7280",
                  }}
                >
                  No thresholds found
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#F9FAFB" }}>
                        <th
                          style={{
                            padding: "12px 20px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            textTransform: "uppercase",
                          }}
                        >
                          Threshold Name
                        </th>
                        <th
                          style={{
                            padding: "12px 20px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            textTransform: "uppercase",
                          }}
                        >
                          Description
                        </th>
                        <th
                          style={{
                            padding: "12px 20px",
                            textAlign: "center",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            textTransform: "uppercase",
                          }}
                        >
                          Current Value
                        </th>
                        <th
                          style={{
                            padding: "12px 20px",
                            textAlign: "right",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            textTransform: "uppercase",
                          }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {thresholds.map((threshold) => (
                        <tr
                          key={threshold.id}
                          style={{ borderBottom: "1px solid #E5E7EB" }}
                        >
                          <td
                            style={{
                              padding: "16px 20px",
                              fontSize: "14px",
                              fontWeight: "500",
                            }}
                          >
                            {formatThresholdName(threshold.setting_key)}
                          </td>
                          <td
                            style={{
                              padding: "16px 20px",
                              fontSize: "14px",
                              color: "#6B7280",
                            }}
                          >
                            {threshold.description || "No description"}
                          </td>
                          <td
                            style={{
                              padding: "16px 20px",
                              textAlign: "center",
                            }}
                          >
                            {editingId === threshold.id ? (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "8px",
                                  alignItems: "center",
                                }}
                              >
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  style={{
                                    width: "100px",
                                    padding: "4px 8px",
                                    border: "1px solid #D1D5DB",
                                    borderRadius: "4px",
                                    fontSize: "14px",
                                  }}
                                />
                                <input
                                  type="text"
                                  placeholder="Reason for change..."
                                  value={editReason}
                                  onChange={(e) =>
                                    setEditReason(e.target.value)
                                  }
                                  style={{
                                    width: "200px",
                                    padding: "4px 8px",
                                    border: "1px solid #D1D5DB",
                                    borderRadius: "4px",
                                    fontSize: "13px",
                                  }}
                                />
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button
                                    onClick={() => handleSaveEdit(threshold)}
                                    disabled={submitting}
                                    style={{
                                      padding: "4px 12px",
                                      backgroundColor: "#10B981",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      fontSize: "13px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    style={{
                                      padding: "4px 12px",
                                      backgroundColor: "#6B7280",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      fontSize: "13px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span
                                style={{
                                  fontSize: "16px",
                                  fontWeight: "600",
                                  color: "#1F2937",
                                }}
                              >
                                {(
                                  parseFloat(threshold.setting_value) * 100
                                ).toFixed(0)}
                                %
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "16px 20px",
                              textAlign: "right",
                            }}
                          >
                            {editingId !== threshold.id && (
                              <button
                                onClick={() => startEdit(threshold)}
                                disabled={!isSuperAdmin}
                                style={{
                                  padding: "6px 16px",
                                  backgroundColor: isSuperAdmin
                                    ? "#3B82F6"
                                    : "#D1D5DB",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "6px",
                                  fontSize: "14px",
                                  cursor: isSuperAdmin
                                    ? "pointer"
                                    : "not-allowed",
                                }}
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Change History Table */}
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                overflow: "hidden",
              }}
            >
              <div
                style={{ padding: "20px", borderBottom: "1px solid #E5E7EB" }}
              >
                <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>
                  Change History (Last 10)
                </h2>
              </div>

              {history.length === 0 ? (
                <div
                  style={{
                    padding: "40px",
                    textAlign: "center",
                    color: "#6B7280",
                  }}
                >
                  No changes recorded yet
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#F9FAFB" }}>
                        <th
                          style={{
                            padding: "12px 20px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            textTransform: "uppercase",
                          }}
                        >
                          Threshold
                        </th>
                        <th
                          style={{
                            padding: "12px 20px",
                            textAlign: "center",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            textTransform: "uppercase",
                          }}
                        >
                          Change
                        </th>
                        <th
                          style={{
                            padding: "12px 20px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            textTransform: "uppercase",
                          }}
                        >
                          Reason
                        </th>
                        <th
                          style={{
                            padding: "12px 20px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            textTransform: "uppercase",
                          }}
                        >
                          Changed By
                        </th>
                        <th
                          style={{
                            padding: "12px 20px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            textTransform: "uppercase",
                          }}
                        >
                          Date
                        </th>
                        <th
                          style={{
                            padding: "12px 20px",
                            textAlign: "center",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            textTransform: "uppercase",
                          }}
                        >
                          Source
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((record) => (
                        <tr
                          key={record.id}
                          style={{ borderBottom: "1px solid #E5E7EB" }}
                        >
                          <td
                            style={{
                              padding: "16px 20px",
                              fontSize: "14px",
                              fontWeight: "500",
                            }}
                          >
                            {formatThresholdName(record.threshold_type)}
                          </td>
                          <td
                            style={{
                              padding: "16px 20px",
                              textAlign: "center",
                              fontSize: "14px",
                            }}
                          >
                            <span style={{ color: "#EF4444" }}>
                              {(record.previous_value * 100).toFixed(0)}%
                            </span>
                            {" → "}
                            <span style={{ color: "#10B981" }}>
                              {(record.new_value * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "16px 20px",
                              fontSize: "14px",
                              color: "#6B7280",
                            }}
                          >
                            {record.change_reason}
                          </td>
                          <td
                            style={{
                              padding: "16px 20px",
                              fontSize: "14px",
                              color: "#6B7280",
                            }}
                          >
                            {record.changed_by_name || "Unknown"}
                          </td>
                          <td
                            style={{
                              padding: "16px 20px",
                              fontSize: "14px",
                              color: "#6B7280",
                            }}
                          >
                            {formatDate(record.changed_at)}
                          </td>
                          <td
                            style={{
                              padding: "16px 20px",
                              textAlign: "center",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: "500",
                                backgroundColor:
                                  record.change_source === "recommendation"
                                    ? "#DBEAFE"
                                    : "#F3F4F6",
                                color:
                                  record.change_source === "recommendation"
                                    ? "#1E40AF"
                                    : "#374151",
                              }}
                            >
                              {record.change_source === "recommendation"
                                ? "Auto"
                                : "Manual"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
