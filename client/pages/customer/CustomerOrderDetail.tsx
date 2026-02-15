import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../../context/CustomerAuthContext";
import CustomerLayout from "../../components/layouts/CustomerLayout";
import {
  Package,
  Calendar,
  DollarSign,
  ArrowLeft,
  Download,
  MessageSquare,
  CheckCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  tax_amount: number;
  created_at: string;
  updated_at: string;
  quote_id: string;
  estimated_completion_date: string | null;
}

const STATUS_TIMELINE = [
  { status: "paid", label: "Payment Confirmed" },
  { status: "in_production", label: "In Production" },
  { status: "ready_for_pickup", label: "Ready" },
  { status: "out_for_delivery", label: "Out for Delivery" },
  { status: "delivered", label: "Delivered" },
  { status: "completed", label: "Completed" },
];

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  in_production: "bg-blue-100 text-blue-800",
  ready_for_pickup: "bg-purple-100 text-purple-800",
  out_for_delivery: "bg-yellow-100 text-yellow-800",
  delivered: "bg-teal-100 text-teal-800",
  completed: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

function FileSection({
  title,
  icon,
  files,
  emptyText,
}: {
  title: string;
  icon: string;
  files: any[];
  emptyText?: string;
}) {
  if (files.length === 0 && !emptyText) return null;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 16px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <span>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#4F8CFF",
            background: "rgba(79,140,255,0.1)",
            padding: "2px 8px",
            borderRadius: 10,
          }}
        >
          {files.length}
        </span>
      </div>
      <div>
        {files.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: "#9ca3af" }}>
            {emptyText}
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <span style={{ fontSize: 18 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {file.filename}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                  {file.size ? `${(file.size / 1024).toFixed(0)} KB` : ""}
                  {file.size && file.category_name ? " · " : ""}
                  {file.category_name}
                </div>
              </div>
              {file.signed_url && (
                <a
                  href={file.signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "5px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#6b7280",
                    border: "1px solid #e5e7eb",
                    textDecoration: "none",
                    background: "#fff",
                  }}
                >
                  ⬇ Download
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function CustomerOrderDetail() {
  const { id } = useParams();
  const { customer } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [orderFiles, setOrderFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState<any>(null);
  const [showChangesModal, setShowChangesModal] = useState<any>(null);
  const [changesComment, setChangesComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  useEffect(() => {
    if (id && customer?.id) {
      loadOrder();
    }
  }, [id, customer?.id]);

  useEffect(() => {
    if (!customer?.id || !id) return;
    fetchOrderFiles();
  }, [customer?.id, id]);

  const loadOrder = async () => {
    try {
      setLoading(true);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-customer-order-detail?order_id=${id}&customer_id=${customer?.id}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load order");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to load order");
      }

      setOrder(result.data);
    } catch (err) {
      console.error("Failed to load order:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderFiles = async () => {
    setFilesLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-customer-documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            customer_id: customer!.id,
            context: "order",
            order_id: id,
          }),
        }
      );
      const data = await response.json();
      if (data.success) {
        setOrderFiles(data.files || []);
      }
    } catch (err) {
      console.error("Error fetching order files:", err);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleApprove = async (file: any) => {
    setReviewSubmitting(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-draft-file`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            file_id: file.id,
            action: "approve",
            actor_type: "customer",
            actor_id: customer!.id,
          }),
        }
      );
      const data = await response.json();
      if (data.success) {
        setShowApproveModal(null);
        await fetchOrderFiles();
      } else {
        alert(data.error || "Failed to approve draft");
      }
    } catch (err) {
      console.error("Approve error:", err);
      alert("An error occurred. Please try again.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleRequestChanges = async (file: any) => {
    if (!changesComment.trim()) {
      alert("Please describe the changes needed");
      return;
    }
    setReviewSubmitting(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-draft-file`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            file_id: file.id,
            action: "request_changes",
            comment: changesComment.trim(),
            actor_type: "customer",
            actor_id: customer!.id,
          }),
        }
      );
      const data = await response.json();
      if (data.success) {
        setShowChangesModal(null);
        setChangesComment("");
        await fetchOrderFiles();
      } else {
        alert(data.error || "Failed to submit feedback");
      }
    } catch (err) {
      console.error("Request changes error:", err);
      alert("An error occurred. Please try again.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleDownloadInvoice = async () => {
    try {
      setDownloadingInvoice(true);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/generate-invoice-pdf?order_id=${order?.id}`,
      );

      if (!response.ok) {
        throw new Error("Failed to generate invoice");
      }

      const html = await response.text();

      // Open in new window for printing or saving
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      }
    } catch (err) {
      console.error("Failed to download invoice:", err);
      alert("Failed to download invoice. Please try again.");
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const getCurrentStatusIndex = () => {
    return STATUS_TIMELINE.findIndex((s) => s.status === order?.status);
  };

  // File categorization
  const draftFiles = orderFiles.filter(f => f.category === "draft_translation");
  const currentDrafts = draftFiles.filter(f => f.review_status === "pending_review");

  const sortedDrafts = [...draftFiles].sort((a, b) => {
    if (a.review_status === "pending_review" && b.review_status !== "pending_review") return -1;
    if (b.review_status === "pending_review" && a.review_status !== "pending_review") return 1;
    return (b.review_version || 0) - (a.review_version || 0);
  });

  const sourceFiles = orderFiles.filter(f =>
    !f.is_staff_created && f.category !== "draft_translation" && f.category !== "final_deliverable"
  );

  const staffFiles = orderFiles.filter(f =>
    f.is_staff_created && f.category !== "draft_translation" && f.category !== "final_deliverable"
  );

  const completedFiles = orderFiles.filter(f => f.category === "final_deliverable");

  const hasPendingDrafts = currentDrafts.length > 0;

  if (loading) {
    return (
      <CustomerLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (!order) {
    return (
      <CustomerLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">Order not found</p>
            <Link
              to="/dashboard/orders"
              className="text-red-600 hover:text-red-700 text-sm mt-2 inline-block"
            >
              ← Back to orders
            </Link>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  const currentStatusIndex = getCurrentStatusIndex();

  return (
    <CustomerLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link
          to="/dashboard/orders"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Orders
        </Link>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {order.order_number}
              </h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Ordered: {new Date(order.created_at).toLocaleDateString()}
                </div>
                {order.estimated_completion_date && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Est. Completion:{" "}
                    {new Date(
                      order.estimated_completion_date,
                    ).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
            <span
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                STATUS_COLORS[order.status] || "bg-gray-100 text-gray-800"
              }`}
            >
              {STATUS_TIMELINE.find((s) => s.status === order.status)?.label ||
                order.status}
            </span>
          </div>

          {/* Status Timeline */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">
              Order Progress
            </h3>
            <div className="relative">
              {/* Progress Line */}
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200">
                <div
                  className="h-full bg-teal-600 transition-all duration-500"
                  style={{
                    width: `${(currentStatusIndex / (STATUS_TIMELINE.length - 1)) * 100}%`,
                  }}
                ></div>
              </div>

              {/* Status Points */}
              <div className="relative flex justify-between">
                {STATUS_TIMELINE.map((timelineStatus, index) => {
                  const isCompleted = index <= currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;

                  return (
                    <div
                      key={timelineStatus.status}
                      className="flex flex-col items-center"
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isCompleted
                            ? "bg-teal-600 text-white"
                            : "bg-gray-200 text-gray-400"
                        } ${isCurrent ? "ring-4 ring-teal-100" : ""}`}
                      >
                        {isCompleted ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          <div className="w-2 h-2 bg-current rounded-full"></div>
                        )}
                      </div>
                      <p
                        className={`text-xs mt-2 text-center max-w-20 ${
                          isCompleted
                            ? "text-gray-900 font-medium"
                            : "text-gray-500"
                        }`}
                      >
                        {timelineStatus.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Order Summary
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-900">
                ${(order.total_amount - (order.tax_amount || 0)).toFixed(2)}
              </span>
            </div>
            {order.tax_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tax</span>
                <span className="font-medium text-gray-900">
                  ${order.tax_amount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-3 border-t border-gray-200">
              <span className="text-lg font-semibold text-gray-900">Total</span>
              <span className="text-lg font-bold text-teal-600">
                ${order.total_amount.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* === FILES SECTION === */}
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, marginTop: 24 }}>Files & Translations</h3>

        {filesLoading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Loading files...</div>
        ) : (
          <>
            {/* DRAFTS FOR REVIEW */}
            {sortedDrafts.length > 0 && (
              <div style={{
                background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
                overflow: "hidden", marginBottom: 16,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px", borderBottom: "1px solid #e5e7eb",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>📝</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>Drafts for Review</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: "#D97706",
                      background: "rgba(217,119,6,0.1)", padding: "2px 8px", borderRadius: 10,
                    }}>{sortedDrafts.length}</span>
                  </div>
                  {hasPendingDrafts && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: "#D97706",
                      background: "rgba(217,119,6,0.1)", padding: "4px 10px", borderRadius: 6,
                    }}>Action Required</span>
                  )}
                </div>

                {sortedDrafts.map((file, idx) => {
                  const isPending = file.review_status === "pending_review";
                  const isOld = file.review_status === "changes_requested" || file.review_status === "approved";

                  return (
                    <div key={file.id} style={{
                      padding: "12px 16px", borderBottom: idx < sortedDrafts.length - 1 ? "1px solid #f3f4f6" : "none",
                      opacity: isOld ? 0.6 : 1,
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <span style={{ fontSize: 18, marginTop: 2 }}>📄</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{file.filename}</span>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                              color: isPending ? "#D97706" : file.review_status === "approved" ? "#059669" : "#DC2626",
                              background: isPending ? "rgba(217,119,6,0.1)" : file.review_status === "approved" ? "rgba(5,150,105,0.1)" : "rgba(220,38,38,0.1)",
                            }}>
                              {isPending ? `Draft v${file.review_version}` : file.review_status === "approved" ? "Approved" : "Changes Requested"}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                            {file.size ? `${(file.size / 1024).toFixed(0)} KB` : ""} · {new Date(file.created_at).toLocaleDateString()}
                          </div>
                          {file.review_comment && (
                            <div style={{
                              marginTop: 6, padding: "6px 10px", borderRadius: 6,
                              background: "rgba(217,119,6,0.06)", fontSize: 12, color: "#92400e",
                              fontStyle: "italic", borderLeft: "3px solid #D97706",
                            }}>"{file.review_comment}"</div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                          {file.signed_url && (
                            <a href={file.signed_url} target="_blank" rel="noopener noreferrer" style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                              color: "#6b7280", border: "1px solid #e5e7eb", textDecoration: "none", background: "#fff",
                            }}>⬇ Download</a>
                          )}
                          {isPending && (
                            <>
                              <button onClick={() => setShowApproveModal(file)} style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                                color: "#fff", background: "#059669", border: "none", cursor: "pointer",
                              }}>✅ Approve</button>
                              <button onClick={() => setShowChangesModal(file)} style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                                color: "#DC2626", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", cursor: "pointer",
                              }}>✏️ Request Changes</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* SOURCE DOCUMENTS */}
            <FileSection title="Your Uploaded Documents" icon="📁" files={sourceFiles} emptyText="No documents uploaded" />

            {/* STAFF FILES */}
            {staffFiles.length > 0 && (
              <FileSection title="Staff Files" icon="👤" files={staffFiles} />
            )}

            {/* COMPLETED TRANSLATIONS */}
            {completedFiles.length > 0 && (
              <div style={{
                background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
                overflow: "hidden", marginBottom: 16,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "14px 16px", borderBottom: "1px solid #e5e7eb",
                }}>
                  <span>✅</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Completed Translations</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: "#059669",
                    background: "rgba(5,150,105,0.1)", padding: "2px 8px", borderRadius: 10,
                  }}>{completedFiles.length}</span>
                </div>
                {completedFiles.map((file) => (
                  <div key={file.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                    borderBottom: "1px solid #f3f4f6",
                  }}>
                    <span style={{ fontSize: 18 }}>🏆</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{file.filename}</div>
                      <div style={{ fontSize: 11, color: "#059669", marginTop: 2, fontWeight: 600 }}>
                        Certified Translation · {new Date(file.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    {file.signed_url && (
                      <a href={file.signed_url} target="_blank" rel="noopener noreferrer" style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                        color: "#fff", background: "#4F8CFF", textDecoration: "none",
                      }}>⬇ Download</a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginTop: 24 }}>
          <button
            onClick={handleDownloadInvoice}
            disabled={downloadingInvoice}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            {downloadingInvoice ? "Generating..." : "Download Invoice"}
          </button>

          <Link
            to="/dashboard/messages"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <MessageSquare className="w-5 h-5" />
            Message Staff
          </Link>
        </div>
      </div>

      {/* Approve Draft Modal */}
      {showApproveModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }} onClick={() => !reviewSubmitting && setShowApproveModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 16, padding: 24, width: 420, maxWidth: "90vw",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>✅ Approve Draft</h3>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, margin: "0 0 20px" }}>
              You are approving <strong>{showApproveModal.filename}</strong>.
              This confirms the translation meets your requirements. Our team will proceed to finalize your certified translation.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowApproveModal(null)} disabled={reviewSubmitting}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "#f3f4f6", border: "none", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => handleApprove(showApproveModal)} disabled={reviewSubmitting}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "#059669", color: "#fff", border: "none", cursor: "pointer", opacity: reviewSubmitting ? 0.6 : 1 }}>
                {reviewSubmitting ? "Approving..." : "✅ Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Changes Modal */}
      {showChangesModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }} onClick={() => !reviewSubmitting && setShowChangesModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 16, padding: 24, width: 460, maxWidth: "90vw",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>✏️ Request Changes</h3>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, margin: "0 0 12px" }}>
              Describe what needs to be changed in <strong>{showChangesModal.filename}</strong>.
            </p>
            <textarea
              value={changesComment}
              onChange={e => setChangesComment(e.target.value)}
              style={{
                width: "100%", height: 100, padding: 12, borderRadius: 8,
                border: "1px solid #d1d5db", fontSize: 13, resize: "vertical",
                fontFamily: "inherit", boxSizing: "border-box",
              }}
              placeholder="e.g. The date on page 2 should be March 15, not March 5..."
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => { setShowChangesModal(null); setChangesComment(""); }} disabled={reviewSubmitting}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "#f3f4f6", border: "none", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => handleRequestChanges(showChangesModal)} disabled={reviewSubmitting || !changesComment.trim()}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "#D97706", color: "#fff", border: "none", cursor: "pointer", opacity: (reviewSubmitting || !changesComment.trim()) ? 0.6 : 1 }}>
                {reviewSubmitting ? "Sending..." : "📨 Send Feedback"}
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}
