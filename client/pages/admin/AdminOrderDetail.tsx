import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  Building,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Truck,
  Upload,
  User,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import CancelOrderModal from "@/components/admin/CancelOrderModal";
import EditOrderModal from "@/components/admin/EditOrderModal";
import BalanceResolutionModal from "@/components/admin/BalanceResolutionModal";
import DocumentPreviewModal from "@/components/admin/DocumentPreviewModal";
import OrderUploadModal from "@/components/admin/OrderUploadModal";
import RecordOrderPaymentModal from "@/components/admin/RecordOrderPaymentModal";
import { AnalyzeDocumentModal, ManualEntryModal } from "@/components/admin/hitl";
import { useAdminAuthContext } from "@/context/AdminAuthContext";

interface OrderDetail {
  id: string;
  order_number: string;
  quote_id: string;
  customer_id: string;
  status: string;
  work_status: string;
  delivery_hold: boolean;
  subtotal: number;
  certification_total: number;
  rush_fee: number;
  delivery_fee: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  is_rush: boolean;
  delivery_option: string;
  estimated_delivery_date: string;
  actual_delivery_date: string;
  shipping_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string;
  tracking_number: string;
  customer?: {
    id: string;
    email: string;
    full_name: string;
    phone: string;
    customer_type: string;
    company_name: string;
  };
  quote?: {
    quote_number: string;
  };
  created_at: string;
  updated_at: string;
  cancelled_at?: string;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  payment_method: string;
  stripe_payment_intent_id: string;
  created_at: string;
}

interface Adjustment {
  id: string;
  type: string;
  amount: number;
  reason: string;
  created_at: string;
  created_by_name: string;
}

interface Cancellation {
  id: string;
  order_id: string;
  reason: string;
  refund_amount: number;
  refund_method: string;
  refund_status: string;
  refund_reference: string;
  created_at: string;
  created_by: string;
}

interface QuoteFile {
  id: string;
  original_filename: string;
  file_size: number;
  storage_path: string;
  mime_type: string;
  ai_processing_status: string | null;
  created_at: string;
}

interface AnalysisResult {
  id: string;
  quote_file_id: string | null;
  manual_filename: string | null;
  detected_language: string;
  language_name?: string;
  detected_document_type: string;
  document_type_other: string | null;
  word_count: number;
  page_count: number;
  billable_pages: number;
  base_rate: number;
  line_total: number;
  certification_type_id: string | null;
  certification_price: number;
  assessed_complexity: string;
  complexity_multiplier: number;
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  balance_due: "bg-amber-100 text-amber-700",
  in_production: "bg-blue-100 text-blue-700",
  ready_for_delivery: "bg-purple-100 text-purple-700",
  delivered: "bg-teal-100 text-teal-700",
  completed: "bg-gray-100 text-gray-700",
  refunded: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  balance_due: "Balance Due",
  in_production: "In Production",
  ready_for_delivery: "Ready for Delivery",
  delivered: "Delivered",
  completed: "Completed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

const WORK_STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  in_progress: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  delivered: "bg-teal-100 text-teal-700",
};

const WORK_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  in_progress: "In Progress",
  paused: "Paused",
  completed: "Completed",
  delivered: "Delivered",
};

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { session: currentStaff } = useAdminAuthContext();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [cancellation, setCancellation] = useState<Cancellation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBalanceResolutionModal, setShowBalanceResolutionModal] = useState(false);
  const [balanceChange, setBalanceChange] = useState(0);
  const [originalTotal, setOriginalTotal] = useState(0);

  // Document management state
  const [quoteFiles, setQuoteFiles] = useState<QuoteFile[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Document modals
  const [previewFile, setPreviewFile] = useState<QuoteFile | null>(null);
  const [analyzeFile, setAnalyzeFile] = useState<QuoteFile | null>(null);
  const [manualEntryFile, setManualEntryFile] = useState<QuoteFile | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Payment recording
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);

  // Status edit state
  const [editingStatus, setEditingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedWorkStatus, setSelectedWorkStatus] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
    }
  }, [id]);

  // Fetch documents when order is loaded
  useEffect(() => {
    if (order?.quote_id) {
      fetchDocuments();
    }
  }, [order?.quote_id]);

  const fetchDocuments = async () => {
    if (!order?.quote_id) return;

    setLoadingDocs(true);
    try {
      // Fetch quote files
      const { data: files, error: filesError } = await supabase
        .from("quote_files")
        .select("*")
        .eq("quote_id", order.quote_id)
        .order("created_at", { ascending: true });

      if (filesError) throw filesError;
      setQuoteFiles(files || []);

      // Fetch analysis results
      const { data: analysis, error: analysisError } = await supabase
        .from("ai_analysis_results")
        .select("*")
        .eq("quote_id", order.quote_id)
        .order("created_at", { ascending: true });

      if (analysisError) throw analysisError;
      setAnalysisResults(analysis || []);
    } catch (err) {
      console.error("Error fetching documents:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const fetchOrderDetails = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(
          `
          *,
          customer:customers(*),
          quote:quotes(quote_number)
        `,
        )
        .eq("id", id)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData as OrderDetail);

      const { data: paymentsData } = await supabase
        .from("payments")
        .select("*")
        .eq("order_id", id)
        .order("created_at", { ascending: false });
      setPayments(paymentsData || []);

      const { data: adjustmentsData } = await supabase
        .from("adjustments")
        .select(
          `
          *,
          created_by:staff_users!adjustments_created_by_fkey(full_name)
        `,
        )
        .eq("order_id", id)
        .order("created_at", { ascending: false });

      setAdjustments(
        (adjustmentsData || []).map((adjustment: any) => ({
          ...adjustment,
          created_by_name: adjustment.created_by?.full_name || "System",
        })),
      );

      // Fetch cancellation data if order is cancelled
      if (orderData.status === 'cancelled') {
        const { data: cancellationData } = await supabase
          .from('order_cancellations')
          .select('*')
          .eq('order_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        setCancellation(cancellationData);
      } else {
        setCancellation(null);
      }
    } catch (err: any) {
      console.error("Error fetching order:", err);
      setError(err.message || "Failed to load order");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!order) return;

    setSavingStatus(true);
    try {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      let hasChanges = false;

      if (selectedStatus && selectedStatus !== order.status) {
        updates.status = selectedStatus;
        hasChanges = true;
      }
      if (selectedWorkStatus && selectedWorkStatus !== order.work_status) {
        updates.work_status = selectedWorkStatus;
        hasChanges = true;
      }

      if (!hasChanges) {
        toast.info("No changes to save");
        setEditingStatus(false);
        setSavingStatus(false);
        return;
      }

      // Update order
      const { error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", order.id);

      if (error) throw error;

      // Log status change to history
      const historyRecord: Record<string, any> = {
        order_id: order.id,
        previous_status: order.status,
        new_status: selectedStatus || order.status,
        previous_work_status: order.work_status,
        new_work_status: selectedWorkStatus || order.work_status,
        changed_by_staff_id: currentStaff?.staffId || null,
        created_at: new Date().toISOString(),
      };

      await supabase
        .from("order_status_history")
        .insert(historyRecord)
        .then(({ error }) => {
          if (error) console.warn("Failed to log status history:", error);
        });

      toast.success("Order status updated");
      setEditingStatus(false);
      fetchOrderDetails(); // Refresh order data
    } catch (err: any) {
      console.error("Error updating status:", err);
      toast.error(err.message || "Failed to update status");
    } finally {
      setSavingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Error loading order</p>
            <p className="text-red-600 text-sm">{error || "Order not found"}</p>
          </div>
        </div>
        <Link
          to="/admin/orders"
          className="mt-4 inline-flex items-center gap-2 text-teal-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Orders
        </Link>
      </div>
    );
  }

  const totalAdjustments = adjustments.reduce(
    (sum, adjustment) =>
      sum +
      (adjustment.type === "refund" ? -adjustment.amount : adjustment.amount),
    0,
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link
          to="/admin/orders"
          className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Orders
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {order.order_number}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {editingStatus ? (
                <>
                  {/* Status Dropdown */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-500">Status:</label>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Work Status Dropdown */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-500">Work:</label>
                    <select
                      value={selectedWorkStatus}
                      onChange={(e) => setSelectedWorkStatus(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    >
                      {Object.entries(WORK_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={handleStatusUpdate}
                    disabled={savingStatus}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                  >
                    {savingStatus ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save
                  </button>

                  {/* Cancel Button */}
                  <button
                    onClick={() => setEditingStatus(false)}
                    disabled={savingStatus}
                    className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {/* Status Badge */}
                  <span
                    className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                      STATUS_STYLES[order.status] || "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {STATUS_LABELS[order.status] || order.status}
                  </span>

                  {/* Work Status Badge */}
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      WORK_STATUS_STYLES[order.work_status] || "bg-gray-100 text-gray-700"
                    }`}
                  >
                    Work: {WORK_STATUS_LABELS[order.work_status] || order.work_status}
                  </span>

                  {/* Delivery Hold Badge */}
                  {order.delivery_hold && (
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                      Delivery Hold
                    </span>
                  )}

                  {/* Edit Button */}
                  {order.status !== 'cancelled' && (
                    <button
                      onClick={() => {
                        setSelectedStatus(order.status);
                        setSelectedWorkStatus(order.work_status);
                        setEditingStatus(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      title="Edit Status"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {order.quote_id && (
              <Link
                to={`/admin/quotes/${order.quote_id}`}
                className="inline-flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
              >
                View Quote ({order.quote?.quote_number})
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}

            {/* Edit Order Button */}
            {order.status !== "cancelled" && order.status !== "refunded" && (
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit Order
              </button>
            )}

            {/* Cancel Order Button */}
            {order.status !== "cancelled" && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Cancel Order
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cancelled Banner */}
      {order.status === "cancelled" && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">
                This order has been cancelled
              </p>
              {order.cancelled_at && (
                <p className="text-sm text-red-600 mt-1">
                  Cancelled on{" "}
                  {format(
                    new Date(order.cancelled_at),
                    "MMMM d, yyyy 'at' h:mm a"
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-gray-400" />
              Customer Information
            </h2>

            {order.customer ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium">
                    {order.customer.full_name || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium flex items-center gap-1">
                    <Mail className="w-4 h-4 text-gray-400" />
                    {order.customer.email}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium flex items-center gap-1">
                    <Phone className="w-4 h-4 text-gray-400" />
                    {order.customer.phone || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Type</p>
                  <p className="font-medium capitalize">
                    {order.customer.customer_type || "Individual"}
                  </p>
                </div>
                {order.customer.company_name && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">Company</p>
                    <p className="font-medium flex items-center gap-1">
                      <Building className="w-4 h-4 text-gray-400" />
                      {order.customer.company_name}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No customer information</p>
            )}
          </div>

          {order.shipping_address_line1 && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-gray-400" />
                Shipping Address
              </h2>

              <div className="text-gray-700">
                <p className="font-medium">{order.shipping_name}</p>
                <p>{order.shipping_address_line1}</p>
                {order.shipping_address_line2 && (
                  <p>{order.shipping_address_line2}</p>
                )}
                <p>
                  {order.shipping_city}, {order.shipping_state}{" "}
                  {order.shipping_postal_code}
                </p>
                <p>{order.shipping_country}</p>
              </div>

              {order.tracking_number && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500">Tracking Number</p>
                  <p className="font-mono font-medium">
                    {order.tracking_number}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Documents Section */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-400" />
                Documents ({quoteFiles.length})
              </h2>
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Document
              </button>
            </div>

            {loadingDocs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
              </div>
            ) : quoteFiles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>No documents uploaded</p>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="mt-2 text-teal-600 hover:text-teal-700 text-sm font-medium"
                >
                  Upload documents
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {quoteFiles.map((file) => {
                  // Find matching analysis result
                  const analysis = analysisResults.find(
                    (a) => a.quote_file_id === file.id || a.manual_filename === file.original_filename
                  );

                  return (
                    <div
                      key={file.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* File Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {file.original_filename}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-500">
                            <span>{formatFileSize(file.file_size)}</span>
                            <span>•</span>
                            <span>{format(new Date(file.created_at), "MMM d, yyyy")}</span>
                            {file.ai_processing_status && (
                              <>
                                <span>•</span>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                    file.ai_processing_status === "completed"
                                      ? "bg-green-100 text-green-700"
                                      : file.ai_processing_status === "processing"
                                      ? "bg-blue-100 text-blue-700"
                                      : file.ai_processing_status === "failed"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {file.ai_processing_status === "processing" && (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  )}
                                  {file.ai_processing_status === "completed"
                                    ? "Analyzed"
                                    : file.ai_processing_status === "processing"
                                    ? "Processing..."
                                    : file.ai_processing_status === "failed"
                                    ? "Failed"
                                    : "Pending"}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Analysis Summary */}
                          {analysis && (
                            <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                  <span className="text-gray-500">Type:</span>{" "}
                                  <span className="font-medium">
                                    {analysis.detected_document_type
                                      ?.replace(/_/g, " ")
                                      .replace(/\b\w/g, (c) => c.toUpperCase()) || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Language:</span>{" "}
                                  <span className="font-medium">
                                    {analysis.language_name || analysis.detected_language || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Words:</span>{" "}
                                  <span className="font-medium">
                                    {analysis.word_count?.toLocaleString() || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Total:</span>{" "}
                                  <span className="font-medium text-teal-600">
                                    ${(analysis.line_total || 0).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setAnalyzeFile(file)}
                            className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Analyze with AI"
                          >
                            <Brain className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setManualEntryFile(file)}
                            className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Manual Entry"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setPreviewFile(file)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${file.storage_path}`;
                              window.open(url, "_blank");
                            }}
                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Analysis Summary */}
                {analysisResults.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Documents:</span>
                      <span className="font-medium">{analysisResults.length}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-gray-600">Total Words:</span>
                      <span className="font-medium">
                        {analysisResults.reduce((sum, a) => sum + (a.word_count || 0), 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-gray-600">Documents Total:</span>
                      <span className="font-semibold text-teal-600">
                        ${analysisResults.reduce((sum, a) => sum + (a.line_total || 0), 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-gray-400" />
              Payment History
            </h2>

            {payments.length > 0 ? (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          ${payment.amount.toFixed(2)}
                        </span>
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                            payment.status === "succeeded"
                              ? "bg-green-100 text-green-700"
                              : payment.status === "pending"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {payment.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {payment.payment_method || "Card"} •{" "}
                        {format(
                          new Date(payment.created_at),
                          "MMM d, yyyy h:mm a",
                        )}
                      </p>
                    </div>
                    {payment.stripe_payment_intent_id && (
                      <a
                        href={`https://dashboard.stripe.com/payments/${payment.stripe_payment_intent_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 hover:text-teal-700"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No payments recorded</p>
            )}
          </div>

          {adjustments.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-gray-400" />
                Adjustments
              </h2>

              <div className="space-y-3">
                {adjustments.map((adjustment) => (
                  <div
                    key={adjustment.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium ${
                            adjustment.type === "refund"
                              ? "text-red-600"
                              : "text-green-600"
                          }`}
                        >
                          {adjustment.type === "refund" ? "-" : "+"}$
                          {adjustment.amount.toFixed(2)}
                        </span>
                        <span className="text-sm text-gray-500 capitalize">
                          {adjustment.type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {adjustment.reason}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        By {adjustment.created_by_name} •{" "}
                        {format(new Date(adjustment.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-gray-400" />
              Order Summary
            </h2>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>${order.subtotal?.toFixed(2) || "0.00"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Certification</span>
                <span>${order.certification_total?.toFixed(2) || "0.00"}</span>
              </div>
              {order.is_rush && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-500" />
                    Rush Fee
                  </span>
                  <span>${order.rush_fee?.toFixed(2) || "0.00"}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery</span>
                <span>${order.delivery_fee?.toFixed(2) || "0.00"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span>${order.tax_amount?.toFixed(2) || "0.00"}</span>
              </div>

              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between font-semibold">
                  <span>Order Total</span>
                  <span>${order.total_amount?.toFixed(2) || "0.00"}</span>
                </div>
              </div>

              {adjustments.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Adjustments</span>
                  <span
                    className={
                      totalAdjustments >= 0 ? "text-green-600" : "text-red-600"
                    }
                  >
                    {totalAdjustments >= 0 ? "+" : ""}$
                    {totalAdjustments.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Paid</span>
                <span className="text-green-600">${(order.amount_paid ?? 0).toFixed(2)}</span>
              </div>

              {/* Refund Section - Only for cancelled orders */}
              {order.status === 'cancelled' && cancellation && cancellation.refund_amount > 0 && (
                <>
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Refund Amount</span>
                      <span className="text-red-600 font-medium">
                        -${cancellation.refund_amount?.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Refund Method</span>
                      <span className="capitalize">{cancellation.refund_method?.replace('_', ' ') || '—'}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-gray-500">Refund Status</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        cancellation.refund_status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : cancellation.refund_status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {cancellation.refund_status}
                      </span>
                    </div>
                    {cancellation.refund_reference && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Reference</span>
                        <span className="font-mono text-xs">{cancellation.refund_reference}</span>
                      </div>
                    )}
                  </div>

                  {/* Final Balance After Refund */}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between font-semibold">
                      <span>Final Balance</span>
                      <span className={
                        ((order.amount_paid || 0) - (cancellation.refund_amount || 0)) === 0
                          ? 'text-gray-500'
                          : 'text-amber-600'
                      }>
                        ${Math.max(0, (order.amount_paid || 0) - (cancellation.refund_amount || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Balance Due - Only show for non-cancelled orders */}
              {order.status !== 'cancelled' && (order.balance_due ?? 0) > 0 && (
                <>
                  <div className="flex justify-between font-semibold text-amber-600 bg-amber-50 -mx-2 px-2 py-2 rounded">
                    <span>Balance Due</span>
                    <span>${(order.balance_due ?? 0).toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => setShowRecordPaymentModal(true)}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    <DollarSign className="w-4 h-4" />
                    Record Payment
                  </button>
                </>
              )}

              {/* Cancelled Notice */}
              {order.status === 'cancelled' && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700 font-medium text-center">
                    Order Cancelled
                  </p>
                  {cancellation?.created_at && (
                    <p className="text-xs text-red-600 text-center mt-1">
                      {new Date(cancellation.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Truck className="w-5 h-5 text-gray-400" />
              Delivery
            </h2>

            <div className="space-y-3">
              {order.is_rush && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  <Zap className="w-4 h-4" />
                  <span className="font-medium">Rush Order</span>
                </div>
              )}

              <div>
                <p className="text-sm text-gray-500">Method</p>
                <p className="font-medium capitalize">
                  {order.delivery_option || "—"}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Estimated Delivery</p>
                <p className="font-medium">
                  {order.estimated_delivery_date
                    ? format(
                        new Date(order.estimated_delivery_date),
                        "MMMM d, yyyy",
                      )
                    : "—"}
                </p>
              </div>

              {order.actual_delivery_date && (
                <div>
                  <p className="text-sm text-gray-500">Actual Delivery</p>
                  <p className="font-medium text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {format(
                      new Date(order.actual_delivery_date),
                      "MMMM d, yyyy",
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              Timeline
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span>
                  {format(new Date(order.created_at), "MMM d, yyyy h:mm a")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last Updated</span>
                <span>
                  {format(new Date(order.updated_at), "MMM d, yyyy h:mm a")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Order Modal */}
      {order && (
        <CancelOrderModal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          order={{
            id: order.id,
            order_number: order.order_number,
            total_amount: order.total_amount,
            amount_paid: order.amount_paid || 0,
            customer: order.customer,
          }}
          staffId={currentStaff?.staffId || ""}
          onSuccess={fetchOrderDetails}
        />
      )}

      {/* Edit Order Modal */}
      {order && showEditModal && (
        <EditOrderModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          order={{
            id: order.id,
            order_number: order.order_number,
            customer_id: order.customer_id,
            subtotal: order.subtotal,
            certification_total: order.certification_total,
            rush_fee: order.rush_fee,
            delivery_fee: order.delivery_fee,
            tax_rate: order.tax_rate || 0,
            tax_amount: order.tax_amount,
            total_amount: order.total_amount,
            amount_paid: order.amount_paid || 0,
            balance_due: order.balance_due || 0,
            is_rush: order.is_rush,
            delivery_option: order.delivery_option,
            estimated_delivery_date: order.estimated_delivery_date,
          }}
          staffId={currentStaff?.staffId || ""}
          staffRole={currentStaff?.role || "reviewer"}
          onSuccess={(newTotal, balanceChangeAmount) => {
            if (Math.abs(balanceChangeAmount) > 0.01) {
              // Store original total before refresh
              setOriginalTotal(order.total_amount);
              setBalanceChange(balanceChangeAmount);
              // Refresh order data first, then show balance resolution modal
              fetchOrderDetails().then(() => {
                setShowBalanceResolutionModal(true);
              });
            } else {
              fetchOrderDetails();
            }
          }}
        />
      )}

      {/* Balance Resolution Modal */}
      {order && order.customer && showBalanceResolutionModal && (
        <BalanceResolutionModal
          isOpen={showBalanceResolutionModal}
          onClose={() => {
            setShowBalanceResolutionModal(false);
            setBalanceChange(0);
            setOriginalTotal(0);
          }}
          order={{
            id: order.id,
            order_number: order.order_number,
            customer_id: order.customer_id,
            total_amount: order.total_amount,
            amount_paid: order.amount_paid || 0,
            balance_due: order.balance_due || 0,
          }}
          customer={{
            id: order.customer.id,
            full_name: order.customer.full_name || "Customer",
            email: order.customer.email,
          }}
          originalTotal={originalTotal}
          balanceChange={balanceChange}
          staffId={currentStaff?.staffId || ""}
          staffRole={currentStaff?.role || "reviewer"}
          onSuccess={() => {
            fetchOrderDetails();
          }}
        />
      )}

      {/* Document Upload Modal */}
      {showUploadModal && order?.quote_id && (
        <OrderUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          quoteId={order.quote_id}
          onUploadComplete={() => {
            fetchDocuments();
            setShowUploadModal(false);
          }}
        />
      )}

      {/* Document Preview Modal */}
      {previewFile && (
        <DocumentPreviewModal
          isOpen={true}
          onClose={() => setPreviewFile(null)}
          fileUrl={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${previewFile.storage_path}`}
          fileName={previewFile.original_filename}
          fileType={previewFile.mime_type?.includes("pdf") ? "pdf" : "image"}
        />
      )}

      {/* Analyze Document Modal */}
      {analyzeFile && order?.quote_id && (
        <AnalyzeDocumentModal
          isOpen={true}
          onClose={() => setAnalyzeFile(null)}
          file={analyzeFile}
          quoteId={order.quote_id}
          onAnalysisComplete={async () => {
            await fetchDocuments();
            setAnalyzeFile(null);
          }}
        />
      )}

      {/* Manual Entry Modal */}
      {manualEntryFile && order?.quote_id && (
        <ManualEntryModal
          isOpen={true}
          onClose={() => setManualEntryFile(null)}
          file={manualEntryFile}
          quoteId={order.quote_id}
          onSaveComplete={async () => {
            await fetchDocuments();
            setManualEntryFile(null);
          }}
        />
      )}

      {/* Record Payment Modal */}
      {showRecordPaymentModal && order && (
        <RecordOrderPaymentModal
          isOpen={showRecordPaymentModal}
          onClose={() => setShowRecordPaymentModal(false)}
          order={{
            id: order.id,
            order_number: order.order_number,
            total_amount: order.total_amount,
            amount_paid: order.amount_paid || 0,
            balance_due: order.balance_due || 0,
            customer: order.customer,
          }}
          staffId={currentStaff?.staffId || ""}
          onSuccess={() => {
            fetchOrderDetails();
            setShowRecordPaymentModal(false);
          }}
        />
      )}
    </div>
  );
}
