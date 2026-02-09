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
  RefreshCw,
  Save,
  Trash2,
  Truck,
  User,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import CancelOrderModal from "@/components/admin/CancelOrderModal";
import EditOrderModal from "@/components/admin/EditOrderModal";
import BalanceResolutionModal from "@/components/admin/BalanceResolutionModal";
import RecordOrderPaymentModal from "@/components/admin/RecordOrderPaymentModal";
import OcrResultsModal from "@/components/shared/analysis/OcrResultsModal";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { syncOrderFromQuote } from "../../utils/syncOrderFromQuote";

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
    promised_delivery_date: string | null;
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

interface TurnaroundOption {
  id: string;
  code: string;
  name: string;
  multiplier: number;
  fee_type: string;
  fee_value: number;
  estimated_days: number;
  is_default: boolean;
  sort_order: number;
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
  const [quoteFiles, setQuoteFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [selectedFileForOcr, setSelectedFileForOcr] = useState<any>(null);

  // Payment recording
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);

  // Status edit state
  const [editingStatus, setEditingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedWorkStatus, setSelectedWorkStatus] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // Recalculate state
  const [recalculating, setRecalculating] = useState(false);

  // Promised delivery date
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState<string>("");
  const [savingDate, setSavingDate] = useState(false);

  // Turnaround speed
  const [turnaroundOptions, setTurnaroundOptions] = useState<TurnaroundOption[]>([]);
  const [selectedTurnaroundId, setSelectedTurnaroundId] = useState<string>("");
  const [savingTurnaround, setSavingTurnaround] = useState(false);

  // Delivery method
  const [deliveryOptions, setDeliveryOptions] = useState<any[]>([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string>("");
  const [savingDelivery, setSavingDelivery] = useState(false);

  const fetchTurnaroundOptions = async () => {
    const { data } = await supabase
      .from("turnaround_options")
      .select("id, code, name, multiplier, fee_type, fee_value, estimated_days, is_default, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (data) setTurnaroundOptions(data);
  };

  const fetchDeliveryOptions = async () => {
    const { data } = await supabase
      .from("delivery_options")
      .select("*")
      .eq("category", "delivery")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (data) setDeliveryOptions(data);
  };

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
      fetchTurnaroundOptions();
      fetchDeliveryOptions();
    }
  }, [id]);

  // Fetch documents when order is loaded
  useEffect(() => {
    if (order?.quote_id) {
      fetchDocuments(order.quote_id);
    }
  }, [order?.quote_id]);

  const fetchDocuments = async (quoteId: string) => {
    setLoadingFiles(true);
    try {
      const { data, error } = await supabase
        .from("quote_files")
        .select("id, original_filename, file_size, mime_type, storage_path, created_at")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setQuoteFiles(data);
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handlePreviewFile = async (file: any) => {
    try {
      const { data } = await supabase.storage
        .from("quote-files")
        .createSignedUrl(file.storage_path, 3600);
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch (err) {
      console.error("Preview error:", err);
    }
  };

  const handleDownloadFile = async (file: any) => {
    try {
      const { data } = await supabase.storage
        .from("quote-files")
        .download(file.storage_path);
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.original_filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Download error:", err);
    }
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
          quote:quotes(quote_number, promised_delivery_date)
        `,
        )
        .eq("id", id)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData as OrderDetail);

      // Set promised delivery date from quote, fallback to order's estimated date
      setPromisedDeliveryDate(
        orderData.quote?.promised_delivery_date || orderData.estimated_delivery_date || ""
      );

      // Fetch quote details for turnaround and delivery options
      if (orderData.quote_id) {
        const { data: quoteData } = await supabase
          .from("quotes")
          .select("turnaround_option_id, physical_delivery_option_id")
          .eq("id", orderData.quote_id)
          .single();

        if (quoteData) {
          setSelectedTurnaroundId(quoteData.turnaround_option_id || "");
          setSelectedDeliveryId(quoteData.physical_delivery_option_id || "");
        }
      }

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

  const handleRecalculateOrder = async () => {
    if (!order) return;

    setRecalculating(true);
    try {
      const { error } = await supabase.functions.invoke(
        "recalculate-quote-pricing",
        { body: { quoteId: order.quote_id } }
      );

      if (error) throw error;

      const currentStaffId = currentStaff?.staffId || undefined;
      const syncResult = await syncOrderFromQuote(order.id, order.quote_id, currentStaffId);
      if (!syncResult.success) {
        console.error("Order sync error:", syncResult.error);
      }

      if (syncResult.delta !== 0) {
        toast.info(
          `Order total changed by $${syncResult.delta.toFixed(2)}. New balance due: $${syncResult.newBalanceDue.toFixed(2)}`
        );
      } else {
        toast.success("Totals recalculated — no change");
      }

      await fetchOrderDetails();
    } catch (err) {
      console.error("Recalculate error:", err);
      toast.error("Failed to recalculate totals");
    } finally {
      setRecalculating(false);
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

  const handleDeliveryDateChange = async (date: string) => {
    if (!order) return;

    setSavingDate(true);
    try {
      // Update quote (source of truth)
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({ promised_delivery_date: date })
        .eq("id", order.quote_id);

      if (quoteError) throw quoteError;

      // Also update order's estimated_delivery_date for consistency
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          estimated_delivery_date: date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (orderError) console.error("Order date update error:", orderError);

      // Log activity
      if (currentStaff?.staffId) {
        await supabase.from("staff_activity_log").insert({
          staff_id: currentStaff.staffId,
          activity_type: "delivery_date_updated",
          entity_type: "order",
          entity_id: order.id,
          details: {
            order_id: order.id,
            quote_id: order.quote_id,
            new_date: date,
            previous_date: promisedDeliveryDate,
          },
        });
      }

      setPromisedDeliveryDate(date);
      await fetchOrderDetails();
    } catch (err) {
      console.error("Date change error:", err);
      toast.error("Failed to update delivery date");
    } finally {
      setSavingDate(false);
    }
  };

  const handleTurnaroundChange = async (optionId: string) => {
    if (!order) return;

    setSavingTurnaround(true);
    try {
      const option = turnaroundOptions.find((o) => o.id === optionId);
      if (!option) return;

      // Write to quotes table (source of truth for pricing inputs)
      const { error } = await supabase
        .from("quotes")
        .update({
          turnaround_option_id: optionId,
          turnaround_type: option.code,
          is_rush: option.code !== "standard",
        })
        .eq("id", order.quote_id);

      if (error) throw error;

      // Recalculate quote pricing
      const { error: recalcError } = await supabase.functions.invoke(
        "recalculate-quote-pricing",
        { body: { quoteId: order.quote_id } }
      );
      if (recalcError) console.error("Recalculate error:", recalcError);

      // Sync updated totals to order
      const currentStaffId = currentStaff?.staffId || undefined;
      const syncResult = await syncOrderFromQuote(order.id, order.quote_id, currentStaffId);
      if (!syncResult.success) {
        console.error("Order sync error:", syncResult.error);
      }

      // Show delta notification if total changed
      if (syncResult.delta !== 0) {
        toast.info(
          `Order total changed by $${syncResult.delta.toFixed(2)}. New balance due: $${syncResult.newBalanceDue.toFixed(2)}`
        );
      }

      setSelectedTurnaroundId(optionId);

      // Re-fetch order to refresh all displayed data
      await fetchOrderDetails();
    } catch (err) {
      console.error("Turnaround change error:", err);
      toast.error("Failed to update turnaround speed");
    } finally {
      setSavingTurnaround(false);
    }
  };

  const handleDeliveryChange = async (optionId: string) => {
    if (!order) return;

    setSavingDelivery(true);
    try {
      const option = deliveryOptions.find((o) => o.id === optionId);
      if (!option) return;

      const { error } = await supabase
        .from("quotes")
        .update({
          physical_delivery_option_id: optionId,
          delivery_fee: option.price || 0,
        })
        .eq("id", order.quote_id);

      if (error) throw error;

      const { error: recalcError } = await supabase.functions.invoke(
        "recalculate-quote-pricing",
        { body: { quoteId: order.quote_id } }
      );
      if (recalcError) console.error("Recalculate error:", recalcError);

      const currentStaffId = currentStaff?.staffId || undefined;
      const syncResult = await syncOrderFromQuote(order.id, order.quote_id, currentStaffId);
      if (!syncResult.success) {
        console.error("Order sync error:", syncResult.error);
      }

      if (syncResult.delta !== 0) {
        toast.info(
          `Order total changed by $${syncResult.delta.toFixed(2)}. New balance due: $${syncResult.newBalanceDue.toFixed(2)}`
        );
      }

      setSelectedDeliveryId(optionId);
      await fetchOrderDetails();
    } catch (err) {
      console.error("Delivery change error:", err);
      toast.error("Failed to update delivery method");
    } finally {
      setSavingDelivery(false);
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Documents ({quoteFiles.length})
            </h3>

            {loadingFiles ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : quoteFiles.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">No documents uploaded</p>
            ) : (
              <div className="space-y-3">
                {quoteFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {file.original_filename}
                        </p>
                        <p className="text-xs text-gray-500">
                          {file.file_size
                            ? `${(file.file_size / 1024).toFixed(1)} KB`
                            : "—"}{" "}
                          • {file.mime_type || "Unknown type"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handlePreviewFile(file)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadFile(file)}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedFileForOcr(file);
                          setShowOcrModal(true);
                        }}
                        className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="OCR & Pricing"
                      >
                        <Brain className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
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

              {/* Recalculate + Quote Link buttons */}
              {order.status !== 'cancelled' && (
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleRecalculateOrder}
                    disabled={recalculating}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                  >
                    <RefreshCw className={`w-4 h-4 ${recalculating ? "animate-spin" : ""}`} />
                    {recalculating ? "Recalculating..." : "Recalculate Totals"}
                  </button>

                  {order.quote_id && (
                    <Link
                      to={`/admin/quotes/${order.quote_id}`}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Quote
                    </Link>
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

              {/* Turnaround Speed Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Turnaround Speed
                </label>
                <select
                  value={selectedTurnaroundId}
                  onChange={(e) => handleTurnaroundChange(e.target.value)}
                  disabled={savingTurnaround}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— Select —</option>
                  {turnaroundOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} ({opt.multiplier}×)
                      {opt.fee_value > 0
                        ? ` — +${opt.fee_value}${opt.fee_type === "percentage" ? "%" : "$"}`
                        : " — No fee"}
                    </option>
                  ))}
                </select>
                {savingTurnaround && (
                  <p className="text-xs text-blue-600 mt-1">Updating...</p>
                )}
              </div>

              {/* Delivery Method Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Method
                </label>
                <select
                  value={selectedDeliveryId}
                  onChange={(e) => handleDeliveryChange(e.target.value)}
                  disabled={savingDelivery}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— Select —</option>
                  {deliveryOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                      {opt.price > 0 ? ` — $${Number(opt.price).toFixed(2)}` : " — Free"}
                    </option>
                  ))}
                </select>
                {savingDelivery && (
                  <p className="text-xs text-blue-600 mt-1">Updating...</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Promised Delivery Date
                </label>
                <input
                  type="date"
                  value={promisedDeliveryDate}
                  onChange={(e) => handleDeliveryDateChange(e.target.value)}
                  disabled={savingDate}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {savingDate && (
                  <p className="text-xs text-blue-600 mt-1">Updating...</p>
                )}
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

      {/* OCR Results Modal */}
      {showOcrModal && selectedFileForOcr && (
        <OcrResultsModal
          isOpen={showOcrModal}
          onClose={() => {
            setShowOcrModal(false);
            setSelectedFileForOcr(null);
          }}
          fileId={selectedFileForOcr.id}
          fileName={selectedFileForOcr.original_filename}
          mode="view"
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
