import { useEffect, useRef, useState } from "react";
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
  Mail,
  MapPin,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  Truck,
  User,
  XCircle,
  Zap,
  MessageSquare,
  Paperclip,
  Upload,
  Send,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import CancelOrderModal from "@/components/admin/CancelOrderModal";
import EditOrderModal from "@/components/admin/EditOrderModal";
import BalanceResolutionModal from "@/components/admin/BalanceResolutionModal";
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
  surcharge_type: string;
  surcharge_value: number;
  surcharge_total: number;
  discount_type: string;
  discount_value: number;
  discount_total: number;
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
    country_of_issue: string | null;
    source_language: { id: string; code: string; name: string } | null;
    target_language: { id: string; code: string; name: string } | null;
  };
  created_at: string;
  updated_at: string;
  cancelled_at?: string;
  balance_payment_link?: string;
  balance_payment_requested_at?: string;
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

const ORDER_STATUSES = [
  { value: "pending", label: "Pending", color: "gray" },
  { value: "paid", label: "Paid", color: "green" },
  { value: "balance_due", label: "Balance Due", color: "amber" },
  { value: "in_production", label: "In Production", color: "blue" },
  { value: "draft_review", label: "Draft Review", color: "amber" },
  { value: "ready_for_delivery", label: "Ready for Delivery", color: "teal" },
  { value: "delivered", label: "Delivered", color: "green" },
  { value: "invoiced", label: "Invoiced", color: "purple" },
  { value: "completed", label: "Completed", color: "green" },
  { value: "cancelled", label: "Cancelled", color: "red" },
  { value: "refunded", label: "Refunded", color: "red" },
];

const WORK_STATUSES = [
  { value: "queued", label: "Queued", color: "gray" },
  { value: "in_progress", label: "In Progress", color: "blue" },
  { value: "review", label: "Review", color: "amber" },
  { value: "completed", label: "Completed", color: "green" },
];

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

  // Balance payment request state
  const [requestingPayment, setRequestingPayment] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);

  // Document management state
  const [quoteFiles, setQuoteFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [selectedFileForOcr, setSelectedFileForOcr] = useState<any>(null);

  // Payment recording
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    method_id: "",
    amount: "",
    reference: "",
    notes: "",
  });
  const [savingPayment, setSavingPayment] = useState(false);

  // Adjustment modal
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<"surcharge" | "discount">("surcharge");
  const [adjustmentForm, setAdjustmentForm] = useState({
    value_type: "fixed",
    value: "",
    reason: "",
  });
  const [savingAdjustment, setSavingAdjustment] = useState(false);

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

  // Translation details
  const [documentAnalysis, setDocumentAnalysis] = useState<any[]>([]);

  // Activity log
  const [activityLog, setActivityLog] = useState<any[]>([]);

  // File upload & draft management
  const [orderFiles, setOrderFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState<"draft" | "final" | "other">("draft");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("reference");
  const [reviewHistory, setReviewHistory] = useState<any[]>([]);

  // File delete state
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ fileId: string; filename: string } | null>(null);

  // Inline chat state
  const [conversationMessages, setConversationMessages] = useState<any[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messageFilter, setMessageFilter] = useState<"all" | "order">("all");
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [unreadStaffCount, setUnreadStaffCount] = useState(0);
  const messagesBottomRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const fetchPaymentMethods = async () => {
    const { data } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (data) setPaymentMethods(data);
  };

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
      fetchTurnaroundOptions();
      fetchDeliveryOptions();
      fetchPaymentMethods();
    }
  }, [id]);

  // Fetch documents when order is loaded
  useEffect(() => {
    if (order?.quote_id) {
      fetchDocuments(order.quote_id);
      fetchOrderFiles();
    }
  }, [order?.quote_id]);

  // Sync payment link URL when order loads
  useEffect(() => {
    if (order) {
      setPaymentLinkUrl(order.balance_payment_link || null);
    }
  }, [order?.balance_payment_link]);

  const fetchDocuments = async (quoteId: string) => {
    setLoadingFiles(true);
    try {
      const { data, error } = await supabase
        .from("quote_files")
        .select("id, original_filename, file_size, mime_type, storage_path, file_category_id, is_staff_created, review_status, review_version, created_at, file_categories!file_category_id(id, name, slug)")
        .eq("quote_id", quoteId)
        .in("upload_status", ["uploaded", "completed"])
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

  const fetchOrderFiles = async () => {
    if (!order?.quote_id) return;
    setFilesLoading(true);
    try {
      const { data: files, error } = await supabase
        .from("quote_files")
        .select(`
          id, quote_id, original_filename, storage_path, file_size, mime_type,
          upload_status, is_staff_created, created_at,
          file_category_id, review_status, review_comment, reviewed_at, review_version,
          file_categories ( id, name, slug )
        `)
        .eq("quote_id", order.quote_id)
        .is("deleted_at", null)
        .in("upload_status", ["uploaded", "completed"])
        .order("created_at", { ascending: true });

      if (error) throw error;

      const filesWithUrls = await Promise.all(
        (files || []).map(async (file: any) => {
          const categorySlug = file.file_categories?.slug;

          let signedUrl = null;
          const tryPaths = [
            file.storage_path,
            `uploads/${file.original_filename}`,
            `${order.quote_id}/${file.storage_path}`,
          ];

          for (const path of tryPaths) {
            const { data } = await supabase.storage
              .from("quote-files")
              .createSignedUrl(path, 600);
            if (data?.signedUrl) {
              signedUrl = data.signedUrl;
              break;
            }
          }

          return { ...file, signed_url: signedUrl, category_slug: categorySlug };
        })
      );

      setOrderFiles(filesWithUrls);

      // Fetch review history for draft files
      const draftIds = filesWithUrls
        .filter(f => f.category_slug === "draft_translation")
        .map(f => f.id);

      if (draftIds.length > 0) {
        const { data: history } = await supabase
          .from("file_review_history")
          .select("*")
          .in("file_id", draftIds)
          .order("created_at", { ascending: false });

        setReviewHistory(history || []);
      } else {
        setReviewHistory([]);
      }
    } catch (err) {
      console.error("Error fetching order files:", err);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile || !order?.quote_id || !currentStaff?.staffId) return;
    setUploading(true);

    try {
      // Determine file category slug
      let categorySlug = "reference";
      if (uploadType === "draft") categorySlug = "draft_translation";
      else if (uploadType === "final") categorySlug = "final_deliverable";
      else categorySlug = uploadCategory;

      // Look up category ID
      const { data: category } = await supabase
        .from("file_categories")
        .select("id")
        .eq("slug", categorySlug)
        .single();

      if (!category) {
        toast.error(`Category "${categorySlug}" not found. Run the migration first.`);
        return;
      }

      // Upload via existing upload-staff-quote-file edge function
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("quoteId", order.quote_id);
      formData.append("staffId", currentStaff.staffId);
      formData.append("processWithAI", "false");
      formData.append("file_category", categorySlug);

      const uploadResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-staff-quote-file`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: formData,
        }
      );

      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadData.success) {
        throw new Error(uploadData.error || "Upload failed");
      }

      // Handle both old (camelCase) and new (snake_case) response shapes
      const fileId = uploadData.file_id || uploadData.fileId;
      const storagePath = uploadData.storage_path || uploadData.storagePath;
      const filename = uploadData.filename;

      if (!fileId) {
        throw new Error("Upload succeeded but no file ID returned");
      }

      console.log("File uploaded:", { fileId, filename, storagePath });

      // Update the file category and review fields
      const updateFields: any = {
        file_category_id: category.id,
      };

      if (uploadType === "draft") {
        const existingDrafts = orderFiles.filter(
          f => f.category_slug === "draft_translation"
        );
        updateFields.review_version = existingDrafts.length + 1;
      }

      await supabase
        .from("quote_files")
        .update(updateFields)
        .eq("id", fileId);

      // If draft, submit for customer review
      if (uploadType === "draft") {
        const reviewResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-draft-file`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              file_id: fileId,
              action: "submit_for_review",
              actor_type: "staff",
              actor_id: currentStaff.staffId,
            }),
          }
        );

        const reviewData = await reviewResponse.json();
        if (!reviewData.success) {
          console.error("Review submission failed:", reviewData.error);
        }
      }

      // Reset and refresh
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadType("draft");
      toast.success(
        uploadType === "draft"
          ? "Draft uploaded and customer notified"
          : uploadType === "final"
          ? "Final deliverable uploaded"
          : "File uploaded"
      );
      await fetchOrderFiles();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemindCustomer = async (fileId: string) => {
    if (!currentStaff?.staffId) return;
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
            file_id: fileId,
            action: "submit_for_review",
            actor_type: "staff",
            actor_id: currentStaff.staffId,
          }),
        }
      );
      const data = await response.json();
      if (data.success) {
        toast.success("Reminder sent to customer");
      } else {
        toast.error(data.error || "Failed to send reminder");
      }
    } catch (err) {
      console.error("Remind error:", err);
      toast.error("Failed to send reminder");
    }
  };

  const REFERENCE_CATEGORY_ID = "f1aed462-a25f-4dd0-96c0-f952c3a72950";

  const getBucketForFile = (file: any) =>
    file.file_category_id === REFERENCE_CATEGORY_ID ? "quote-reference-files" : "quote-files";

  const handlePreviewFile = async (file: any) => {
    try {
      const { data } = await supabase.storage
        .from(getBucketForFile(file))
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
        .from(getBucketForFile(file))
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

  const handleDeleteFile = (fileId: string, filename: string) => {
    setDeleteModal({ fileId, filename });
  };

  const deleteFile = async (fileId: string) => {
    setDeletingFileId(fileId);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-staff-quote-file`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_id: fileId,
            staffId: currentStaff?.staffId || undefined,
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Delete failed");
      }

      toast.success(`File "${data.filename}" deleted successfully.`);
      await fetchOrderFiles();
      if (order?.quote_id) {
        await fetchDocuments(order.quote_id);
      }
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error(`Failed to delete file: ${err.message}`);
    } finally {
      setDeletingFileId(null);
    }
  };

  const fetchActivityLog = async (orderId: string, quoteId: string) => {
    const { data } = await supabase
      .from("staff_activity_log")
      .select("*, staff_users(full_name)")
      .or(`entity_id.eq.${orderId},entity_id.eq.${quoteId}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) setActivityLog(data);
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
          quote:quotes(
            quote_number,
            promised_delivery_date,
            country_of_issue,
            special_instructions,
            source_language:languages!source_language_id(id, code, name),
            target_language:languages!target_language_id(id, code, name)
          )
        `,
        )
        .eq("id", id)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData as OrderDetail);

      // Fetch document analysis for translation details
      if (orderData.quote_id) {
        const { data: analysisData } = await supabase
          .from("ai_analysis_results")
          .select(`
            id,
            detected_language,
            detected_document_type,
            word_count,
            page_count,
            country_of_issue,
            quote_file:quote_files!ai_analysis_results_quote_file_id_fkey(
              original_filename
            )
          `)
          .eq("quote_id", orderData.quote_id)
          .is("deleted_at", null)
          .order("created_at");

        if (analysisData) {
          setDocumentAnalysis(analysisData);
        }
      }

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

      // Fetch activity log
      await fetchActivityLog(orderData.id, orderData.quote_id);
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

  const handleStatusChange = async (field: "status" | "work_status", value: string) => {
    if (!order) return;

    const previousValue = field === "status" ? order.status : order.work_status;

    if (!confirm(`Change ${field === "status" ? "order status" : "work status"} from "${previousValue}" to "${value}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          [field]: value,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (error) throw error;

      // Log activity
      const currentStaffId = currentStaff?.staffId;
      if (currentStaffId) {
        await supabase.from("staff_activity_log").insert({
          staff_id: currentStaffId,
          activity_type: field === "status" ? "order_status_changed" : "order_work_status_changed",
          entity_type: "order",
          entity_id: order.id,
          details: {
            order_id: order.id,
            field,
            previous_value: previousValue,
            new_value: value,
          },
        });
      }

      await fetchOrderDetails();
    } catch (err) {
      console.error("Status change error:", err);
      alert(`Failed to update ${field}`);
    }
  };

  const handleRecordPayment = async () => {
    if (!order) return;

    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }
    if (!paymentForm.method_id) {
      alert("Please select a payment method");
      return;
    }

    setSavingPayment(true);
    try {
      const method = paymentMethods.find((m) => m.id === paymentForm.method_id);
      const currentStaffId = currentStaff?.staffId;

      // Insert payment record
      const { error: payError } = await supabase.from("payments").insert({
        order_id: order.id,
        customer_id: order.customer_id,
        amount,
        payment_type: method?.code || "manual",
        payment_method: method?.name || "Manual",
        status: "succeeded",
        reference_number: paymentForm.reference || null,
        notes: paymentForm.notes || null,
        recorded_by_staff_id: currentStaffId,
      });

      if (payError) throw payError;

      // Update order
      const newAmountPaid = (order.amount_paid || 0) + amount;
      const newBalanceDue = (order.total_amount || 0) - newAmountPaid;

      const { error: orderError } = await supabase
        .from("orders")
        .update({
          amount_paid: newAmountPaid,
          balance_due: Math.max(0, newBalanceDue),
          status: newBalanceDue <= 0 ? "paid" : "balance_due",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (orderError) throw orderError;

      // Log activity
      if (currentStaffId) {
        await supabase.from("staff_activity_log").insert({
          staff_id: currentStaffId,
          activity_type: "order_payment_recorded",
          entity_type: "order",
          entity_id: order.id,
          details: {
            order_id: order.id,
            amount,
            method: method?.name,
            reference: paymentForm.reference,
            new_amount_paid: newAmountPaid,
            new_balance_due: Math.max(0, newBalanceDue),
          },
        });
      }

      setShowPaymentModal(false);
      setPaymentForm({ method_id: "", amount: "", reference: "", notes: "" });
      await fetchOrderDetails();
    } catch (err) {
      console.error("Record payment error:", err);
      alert("Failed to record payment");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleAddAdjustment = async () => {
    if (!order) return;

    const value = parseFloat(adjustmentForm.value);
    if (!value || value <= 0) {
      alert("Please enter a valid amount");
      return;
    }
    if (!adjustmentForm.reason.trim()) {
      alert("Please enter a reason");
      return;
    }

    setSavingAdjustment(true);
    try {
      const currentStaffId = currentStaff?.staffId;
      const amount =
        adjustmentForm.value_type === "percentage"
          ? (order.subtotal || 0) * (value / 100)
          : value;

      // Insert order adjustment (for order record-keeping)
      const { error: adjError } = await supabase.from("order_adjustments").insert({
        order_id: order.id,
        type: adjustmentType,
        value_type: adjustmentForm.value_type,
        value,
        amount: adjustmentType === "discount" ? -amount : amount,
        reason: adjustmentForm.reason,
        created_by_staff_id: currentStaffId,
      });

      if (adjError) throw adjError;

      // Also add to quote_adjustments for recalculation consistency
      const { error: quoteAdjError } = await supabase.from("quote_adjustments").insert({
        quote_id: order.quote_id,
        type: adjustmentType,
        value_type: adjustmentForm.value_type,
        value,
        amount: adjustmentType === "discount" ? -amount : amount,
        reason: adjustmentForm.reason + " (from order)",
        created_by_staff_id: currentStaffId,
      });

      if (quoteAdjError) console.error("Quote adjustment sync error:", quoteAdjError);

      // Recalculate and sync
      await supabase.functions.invoke("recalculate-quote-pricing", {
        body: { quoteId: order.quote_id },
      });
      const syncResult = await syncOrderFromQuote(order.id, order.quote_id, currentStaffId);

      if (syncResult.delta !== 0) {
        alert(
          `Order total changed by $${syncResult.delta.toFixed(2)}. New balance due: $${syncResult.newBalanceDue.toFixed(2)}`
        );
      }

      setShowAdjustmentModal(false);
      setAdjustmentForm({ value_type: "fixed", value: "", reason: "" });
      await fetchOrderDetails();
    } catch (err) {
      console.error("Adjustment error:", err);
      alert("Failed to add adjustment");
    } finally {
      setSavingAdjustment(false);
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

  const handleRequestBalancePayment = async () => {
    if (!order || !order.balance_due || order.balance_due <= 0) {
      toast.error("No balance due on this order");
      return;
    }

    setRequestingPayment(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-balance-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            order_id: order.id,
            staff_id: currentStaff?.staffId || null,
            reason: "balance_due",
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to create payment link");
      }

      setPaymentLinkUrl(result.payment_url);

      if (result.reused) {
        toast.success("Existing payment link found — email previously sent");
      } else {
        toast.success(`Payment link created and emailed to customer ($${result.amount.toFixed(2)})`);
      }

      // Refresh order data
      fetchOrderDetails();
    } catch (err: any) {
      console.error("Balance payment error:", err);
      toast.error(err.message || "Failed to request payment");
    } finally {
      setRequestingPayment(false);
    }
  };

  // ── Inline chat: fetch conversation messages ──
  const fetchConversationMessages = async () => {
    const customerId = order?.customer_id;
    const orderId = id;
    const quoteId = order?.quote_id;

    if (!customerId && !orderId) return;
    setMessagesLoading(true);

    try {
      const messageSelectFields = `
        id, conversation_id, quote_id, order_id, sender_type,
        sender_staff_id, sender_customer_id,
        message_text, message_type, source, created_at,
        read_by_staff_at, read_by_customer_at, metadata,
        staff_users:sender_staff_id(full_name),
        customers:sender_customer_id(full_name),
        message_attachments(id, filename, original_filename, file_size, storage_path, mime_type)
      `;

      // Step 1: Fetch messages tagged to this order directly
      let orderMessages: any[] = [];
      if (orderId) {
        const { data: om, error: omError } = await supabase
          .from("conversation_messages")
          .select(messageSelectFields)
          .eq("order_id", orderId)
          .order("created_at", { ascending: true });
        if (!omError) orderMessages = om || [];
      }

      // Step 1b: Also fetch messages tagged to the original quote
      let quoteMessages: any[] = [];
      if (quoteId) {
        const { data: qm, error: qmError } = await supabase
          .from("conversation_messages")
          .select(messageSelectFields)
          .eq("quote_id", quoteId)
          .order("created_at", { ascending: true });
        if (!qmError) quoteMessages = qm || [];
      }

      // Step 2: Fetch all messages from the customer's conversation
      let convMessages: any[] = [];
      let resolvedConvId: string | null = null;

      if (customerId) {
        const { data: conv } = await supabase
          .from("customer_conversations")
          .select("id")
          .eq("customer_id", customerId)
          .maybeSingle();

        if (conv?.id) {
          resolvedConvId = conv.id;
          const { data: cm } = await supabase
            .from("conversation_messages")
            .select(messageSelectFields)
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true });
          convMessages = cm || [];
        }
      }

      // Fallback conversation_id from fetched messages
      if (!resolvedConvId) {
        const firstMsg = orderMessages[0] || quoteMessages[0];
        resolvedConvId = firstMsg?.conversation_id || null;
      }

      setConversationId(resolvedConvId);

      // Step 3: Merge and deduplicate
      const messageMap = new Map<string, any>();
      for (const msg of orderMessages) messageMap.set(msg.id, msg);
      for (const msg of quoteMessages) messageMap.set(msg.id, msg);
      for (const msg of convMessages) messageMap.set(msg.id, msg);

      const mergedMessages = Array.from(messageMap.values()).sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setConversationMessages(mergedMessages);

      // Step 4: Count unread + auto-mark as read
      const unreadIds = mergedMessages
        .filter((m: any) => m.sender_type === "customer" && !m.read_by_staff_at)
        .map((m: any) => m.id);

      setUnreadStaffCount(unreadIds.length);

      if (unreadIds.length > 0) {
        await supabase
          .from("conversation_messages")
          .update({ read_by_staff_at: new Date().toISOString() })
          .in("id", unreadIds);
        setUnreadStaffCount(0);
      }
    } catch (err) {
      console.error("fetchConversationMessages error:", err);
    } finally {
      setMessagesLoading(false);
    }
  };

  // ── Inline chat: send message handler ──
  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !attachmentFile) || sendingMessage) return;
    setSendingMessage(true);

    try {
      let attachmentPaths: string[] = [];

      if (attachmentFile) {
        setUploadingAttachment(true);
        try {
          const timestamp = Date.now();
          const randomId = Math.random().toString(36).substring(2, 8);
          const tempPath = `temp/${timestamp}-${randomId}-${attachmentFile.name}`;

          const { error: uploadError } = await supabase.storage
            .from("message-attachments")
            .upload(tempPath, attachmentFile, {
              contentType: attachmentFile.type,
              upsert: false,
            });

          if (uploadError) {
            toast.error("Failed to upload attachment.");
            setSendingMessage(false);
            setUploadingAttachment(false);
            return;
          }
          attachmentPaths = [tempPath];
        } finally {
          setUploadingAttachment(false);
        }
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-staff-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            customer_id: order?.customer_id,
            quote_id: order?.quote_id,
            staff_id: currentStaff?.staffId,
            message_text: newMessage.trim() || (attachmentFile ? `Sent a file: ${attachmentFile.name}` : ""),
            attachments: attachmentPaths,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        setNewMessage("");
        setAttachmentFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await fetchConversationMessages();
      } else {
        toast.error("Failed to send message: " + (result.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Send message error:", err);
      toast.error("Failed to send message.");
    } finally {
      setSendingMessage(false);
    }
  };

  // ── Inline chat: format message time ──
  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (isToday) return time;
    if (isYesterday) return `Yesterday ${time}`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` ${time}`;
  };

  // ── Inline chat: filtered messages ──
  const filteredMessages = messageFilter === "order"
    ? conversationMessages.filter((msg: any) => msg.order_id === id)
    : conversationMessages;

  // Fetch messages when order loads
  useEffect(() => {
    if (order?.customer_id || id) {
      fetchConversationMessages();
    }
  }, [order?.customer_id, id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesBottomRef.current) {
      messagesBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filteredMessages.length]);

  // Auto-resize textarea
  useEffect(() => {
    if (messageInputRef.current) {
      messageInputRef.current.style.height = "auto";
      messageInputRef.current.style.height =
        Math.min(messageInputRef.current.scrollHeight, 120) + "px";
    }
  }, [newMessage]);

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`admin-order-messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => { fetchConversationMessages(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

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
            {/* Status Dropdowns */}
            <div className="flex gap-4 mt-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Order Status</label>
                <select
                  value={order.status}
                  onChange={(e) => handleStatusChange("status", e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-blue-500"
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Work Status</label>
                <select
                  value={order.work_status || "queued"}
                  onChange={(e) => handleStatusChange("work_status", e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-blue-500"
                >
                  {WORK_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Delivery Hold Badge */}
              {order.delivery_hold && (
                <div className="flex items-end pb-1">
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                    Delivery Hold
                  </span>
                </div>
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
            {order.status !== "cancelled" && order.status !== "refunded" && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 text-sm font-medium"
              >
                <XCircle className="w-4 h-4" />
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

          {/* Translation Details */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-400" />
              Translation Details
            </h2>

            <div className="grid grid-cols-2 gap-4">
              {order.quote?.source_language && (
                <div>
                  <p className="text-sm text-gray-500">Source Language</p>
                  <p className="font-medium">
                    {order.quote.source_language.name}
                    <span className="text-gray-400 text-xs ml-1">
                      ({order.quote.source_language.code})
                    </span>
                  </p>
                </div>
              )}
              {order.quote?.target_language && (
                <div>
                  <p className="text-sm text-gray-500">Target Language</p>
                  <p className="font-medium">
                    {order.quote.target_language.name}
                    <span className="text-gray-400 text-xs ml-1">
                      ({order.quote.target_language.code})
                    </span>
                  </p>
                </div>
              )}
              {order.quote?.country_of_issue && (
                <div>
                  <p className="text-sm text-gray-500">Country of Issue</p>
                  <p className="font-medium">{order.quote.country_of_issue}</p>
                </div>
              )}
              {order.quote?.special_instructions && (
                <div className="col-span-2">
                  <p className="text-sm text-gray-500 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Customer Instructions
                  </p>
                  <p className="font-medium whitespace-pre-wrap">{order.quote.special_instructions}</p>
                </div>
              )}
            </div>

            {/* Per-Document Analysis Summary */}
            {documentAnalysis.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Documents ({documentAnalysis.length})
                </p>
                <div className="space-y-2">
                  {documentAnalysis.map((doc: any) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {doc.quote_file?.original_filename || "Manual Entry"}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {doc.detected_document_type || "Unknown"} •{" "}
                          {doc.detected_language || "—"} •{" "}
                          {doc.word_count || 0} words •{" "}
                          {doc.page_count || 1} page{(doc.page_count || 1) !== 1 ? "s" : ""}
                          {doc.country_of_issue ? ` • Issued: ${doc.country_of_issue}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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

          {/* Documents & Files Section */}
          <div className="bg-white rounded-lg border p-6">
            {/* Header with upload buttons */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-400" />
                Documents & Files
              </h2>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => { setUploadType("draft"); setShowUploadModal(true); }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Upload Draft Translation
                </button>
                <button
                  onClick={() => { setUploadType("final"); setShowUploadModal(true); }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Upload Final Deliverable
                </button>
                <button
                  onClick={() => { setUploadType("other"); setShowUploadModal(true); }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Upload Other File
                </button>
              </div>
            </div>

            {/* Source Documents */}
            {(() => {
              const translateFiles = quoteFiles.filter((f: any) => {
                const slug = (f.file_categories as any)?.slug;
                return !f.is_staff_created && slug !== "reference" && slug !== "glossary" && slug !== "style_guide";
              });
              const referenceFiles = quoteFiles.filter((f: any) => {
                const slug = (f.file_categories as any)?.slug;
                return slug === "reference" || slug === "glossary" || slug === "style_guide";
              });

              return (
                <>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Source Documents ({translateFiles.length})
                  </h3>

                  {loadingFiles ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                  ) : translateFiles.length === 0 ? (
                    <p className="text-gray-500 text-sm py-4">No documents uploaded</p>
                  ) : (
                    <div className="space-y-3">
                      {translateFiles.map((file: any) => (
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
                            {file.is_staff_created && (
                              <button
                                onClick={() => handleDeleteFile(file.id, file.original_filename)}
                                disabled={deletingFileId === file.id}
                                className={`p-2 transition-colors rounded-lg ${
                                  deletingFileId === file.id
                                    ? "text-gray-300 cursor-not-allowed"
                                    : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                                }`}
                                title="Delete file"
                              >
                                {deletingFileId === file.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {referenceFiles.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">
                        Reference Files
                      </h4>
                      <div className="space-y-1.5">
                        {referenceFiles.map((rf: any) => (
                          <div key={rf.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm">
                            <Paperclip className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate text-gray-600">{rf.original_filename}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {rf.file_size ? `${(rf.file_size / 1024).toFixed(1)} KB` : "—"}
                            </span>
                            <button
                              onClick={() => handleDownloadFile(rf)}
                              className="text-xs text-teal-600 hover:underline flex-shrink-0 ml-auto"
                            >
                              Download
                            </button>
                            {rf.is_staff_created && (
                              <button
                                onClick={() => handleDeleteFile(rf.id, rf.original_filename)}
                                disabled={deletingFileId === rf.id}
                                className={`p-1 transition-colors ${
                                  deletingFileId === rf.id
                                    ? "text-gray-300 cursor-not-allowed"
                                    : "text-gray-400 hover:text-red-500"
                                }`}
                                title="Delete file"
                              >
                                {deletingFileId === rf.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Translations & Other Files */}
            <hr className="my-6 border-gray-200" />
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Translations & Other Files
            </h3>

            {filesLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : orderFiles.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">No categorized files yet. Upload a draft or final translation above.</p>
            ) : (
              <div className="space-y-5">
                {/* Draft Translations */}
                {(() => {
                  const drafts = orderFiles.filter(f => f.category_slug === "draft_translation" && f.is_staff_created);
                  if (drafts.length === 0) return null;
                  return (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">
                        Draft Translations ({drafts.length})
                      </h4>
                      <div className="space-y-2">
                        {drafts.map((file: any) => (
                          <div key={file.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <FileText className="w-4 h-4 text-amber-700" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.original_filename}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {file.review_version && (
                                    <span className="text-xs text-gray-500">v{file.review_version}</span>
                                  )}
                                  <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded-full ${
                                    file.review_status === "approved"
                                      ? "bg-green-100 text-green-700"
                                      : file.review_status === "changes_requested"
                                      ? "bg-red-100 text-red-700"
                                      : file.review_status === "pending_review"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-gray-100 text-gray-600"
                                  }`}>
                                    {file.review_status === "approved" ? "Approved" :
                                     file.review_status === "changes_requested" ? "Changes Requested" :
                                     file.review_status === "pending_review" ? "Pending Review" :
                                     file.review_status || "Draft"}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {format(new Date(file.created_at), "MMM d, h:mm a")}
                                  </span>
                                </div>
                                {file.review_comment && (
                                  <p className="text-xs text-red-600 mt-1 italic">"{file.review_comment}"</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {file.signed_url && (
                                <a
                                  href={file.signed_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Preview"
                                >
                                  <Eye className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                onClick={() => handleDownloadFile(file)}
                                className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              {file.review_status === "pending_review" && (
                                <button
                                  onClick={() => handleRemindCustomer(file.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-md hover:bg-amber-200 transition-colors"
                                  title="Resend review notification"
                                >
                                  <Send className="w-3 h-3" />
                                  Remind
                                </button>
                              )}
                              {file.is_staff_created && (
                                <button
                                  onClick={() => handleDeleteFile(file.id, file.original_filename)}
                                  disabled={deletingFileId === file.id}
                                  className={`p-1.5 transition-colors rounded-lg ${
                                    deletingFileId === file.id
                                      ? "text-gray-300 cursor-not-allowed"
                                      : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                                  }`}
                                  title="Delete file"
                                >
                                  {deletingFileId === file.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Final Deliverables */}
                {(() => {
                  const finals = orderFiles.filter(f => f.category_slug === "final_deliverable" && f.is_staff_created);
                  if (finals.length === 0) return null;
                  return (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">
                        Completed Translations ({finals.length})
                      </h4>
                      <div className="space-y-2">
                        {finals.map((file: any) => (
                          <div key={file.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <CheckCircle className="w-4 h-4 text-green-700" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.original_filename}</p>
                                <p className="text-xs text-gray-400">
                                  {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : "—"} • {format(new Date(file.created_at), "MMM d, h:mm a")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {file.signed_url && (
                                <a
                                  href={file.signed_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Preview"
                                >
                                  <Eye className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                onClick={() => handleDownloadFile(file)}
                                className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              {file.is_staff_created && (
                                <button
                                  onClick={() => handleDeleteFile(file.id, file.original_filename)}
                                  disabled={deletingFileId === file.id}
                                  className={`p-1.5 transition-colors rounded-lg ${
                                    deletingFileId === file.id
                                      ? "text-gray-300 cursor-not-allowed"
                                      : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                                  }`}
                                  title="Delete file"
                                >
                                  {deletingFileId === file.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Staff Files (other) */}
                {(() => {
                  const staffFiles = orderFiles.filter(
                    f => f.is_staff_created &&
                      f.category_slug !== "draft_translation" &&
                      f.category_slug !== "final_deliverable" &&
                      f.category_slug !== "reference" &&
                      f.category_slug !== "glossary" &&
                      f.category_slug !== "style_guide"
                  );
                  if (staffFiles.length === 0) return null;
                  return (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">
                        Staff Files ({staffFiles.length})
                      </h4>
                      <div className="space-y-1.5">
                        {staffFiles.map((file: any) => (
                          <div key={file.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm">
                            <Paperclip className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate text-gray-600">{file.original_filename}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {file.category_slug || "other"} • {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : "—"}
                            </span>
                            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                              {file.signed_url && (
                                <a
                                  href={file.signed_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  View
                                </a>
                              )}
                              <button
                                onClick={() => handleDownloadFile(file)}
                                className="text-xs text-teal-600 hover:underline"
                              >
                                Download
                              </button>
                              {file.is_staff_created && (
                                <button
                                  onClick={() => handleDeleteFile(file.id, file.original_filename)}
                                  disabled={deletingFileId === file.id}
                                  className={`p-1 transition-colors ${
                                    deletingFileId === file.id
                                      ? "text-gray-300 cursor-not-allowed"
                                      : "text-gray-400 hover:text-red-500"
                                  }`}
                                  title="Delete file"
                                >
                                  {deletingFileId === file.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Review History Timeline */}
            {reviewHistory.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">
                  Review History
                </h4>
                <div className="space-y-0">
                  {reviewHistory.map((entry: any, idx: number) => {
                    const isStaff = entry.actor_type === "staff";
                    const isApproval = entry.action === "approved";
                    const isChangeRequest = entry.action === "changes_requested";
                    const dotColor = isApproval
                      ? "bg-green-400"
                      : isChangeRequest
                      ? "bg-red-400"
                      : isStaff
                      ? "bg-blue-400"
                      : "bg-amber-400";

                    return (
                      <div key={entry.id} className="flex items-start gap-3 pb-3 relative">
                        {idx < reviewHistory.length - 1 && (
                          <div className="absolute left-[7px] top-4 bottom-0 w-px bg-gray-200" />
                        )}
                        <div className={`w-3.5 h-3.5 ${dotColor} rounded-full mt-0.5 flex-shrink-0 relative z-10`} />
                        <div className="min-w-0 text-sm">
                          <p className="font-medium text-gray-900">
                            {entry.action === "submit_for_review"
                              ? "Submitted for review"
                              : entry.action === "approved"
                              ? "Approved by customer"
                              : entry.action === "changes_requested"
                              ? "Changes requested"
                              : entry.action?.replace(/_/g, " ") || "Action"}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {isStaff ? "Staff" : "Customer"} • {format(new Date(entry.created_at), "MMM d, h:mm a")}
                          </p>
                          {entry.comment && (
                            <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded px-2 py-1 italic">
                              "{entry.comment}"
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-6">
          {/* ================================================================
              MESSAGES — INLINE CHAT
              ================================================================ */}
          <div className="bg-white rounded-lg border overflow-hidden">
            {/* ── Header ── */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Messages</h2>
                  {conversationMessages.length > 0 && (
                    <p className="text-xs text-gray-500">{conversationMessages.length} message{conversationMessages.length !== 1 ? "s" : ""}</p>
                  )}
                </div>
                {unreadStaffCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {unreadStaffCount}
                  </span>
                )}
              </div>

              {/* Filter toggle */}
              {conversationMessages.length > 0 && (
                <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setMessageFilter("all")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      messageFilter === "all"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    All ({conversationMessages.length})
                  </button>
                  <button
                    onClick={() => setMessageFilter("order")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      messageFilter === "order"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    This Order ({conversationMessages.filter((m: any) => m.order_id === id).length})
                  </button>
                </div>
              )}
            </div>

            {/* ── Message Thread ── */}
            <div
              className="px-5 py-4 overflow-y-auto bg-gradient-to-b from-gray-50/30 to-white"
              style={{ maxHeight: "420px", minHeight: "120px" }}
            >
              {messagesLoading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500 mb-2" />
                  <p className="text-xs text-gray-400">Loading messages...</p>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                    <MessageSquare className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-400 font-medium">
                    {messageFilter === "order" ? "No messages for this order" : "No messages yet"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {messageFilter === "order" && conversationMessages.length > 0 ? (
                      <button
                        onClick={() => setMessageFilter("all")}
                        className="text-blue-500 hover:text-blue-600 underline"
                      >
                        View all {conversationMessages.length} messages
                      </button>
                    ) : (
                      "Send a message below to start the conversation"
                    )}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredMessages.map((msg: any, idx: number) => {
                    const isStaff = msg.sender_type === "staff";
                    const isSystem = msg.sender_type === "system";
                    const senderName = isStaff
                      ? msg.staff_users?.full_name || "Staff"
                      : msg.customers?.full_name || "Customer";
                    const isViaEmail = msg.source === "email";

                    // Date separator
                    const showDateSep =
                      idx === 0 ||
                      new Date(msg.created_at).toDateString() !==
                        new Date(filteredMessages[idx - 1].created_at).toDateString();

                    return (
                      <div key={msg.id}>
                        {showDateSep && (
                          <div className="flex items-center gap-3 py-3">
                            <div className="flex-1 border-t border-gray-200" />
                            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                              {new Date(msg.created_at).toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                            <div className="flex-1 border-t border-gray-200" />
                          </div>
                        )}

                        {isSystem ? (
                          <div className="text-center py-1">
                            <span className="text-[11px] text-gray-400 italic bg-gray-50 px-3 py-1 rounded-full">
                              {msg.message_text}
                            </span>
                          </div>
                        ) : (
                          <div className={`flex ${isStaff ? "justify-end" : "justify-start"} mb-2`}>
                            <div className={`max-w-[78%] group`}>
                              {/* Sender + meta */}
                              <div className={`flex items-center gap-1.5 mb-0.5 ${isStaff ? "justify-end" : ""}`}>
                                <span className="text-[11px] font-medium text-gray-500">
                                  {senderName}
                                </span>
                                <span className="text-[11px] text-gray-400">
                                  {formatMessageTime(msg.created_at)}
                                </span>
                                {isViaEmail && (
                                  <span className="text-[10px] bg-amber-50 text-amber-600 px-1 py-0.5 rounded font-medium">
                                    email
                                  </span>
                                )}
                                {messageFilter === "all" && msg.metadata?.quote_number && (
                                  <span className="text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded font-mono">
                                    {msg.metadata.quote_number}
                                  </span>
                                )}
                                {messageFilter === "all" && !msg.quote_id && !msg.order_id && !isSystem && (
                                  <span className="text-[10px] bg-gray-100 text-gray-400 px-1 py-0.5 rounded">
                                    general
                                  </span>
                                )}
                                {isStaff && msg.read_by_customer_at && (
                                  <span className="text-[10px] text-blue-400">{"\u2713\u2713"}</span>
                                )}
                                {isStaff && !msg.read_by_customer_at && (
                                  <span className="text-[10px] text-gray-300">{"\u2713"}</span>
                                )}
                              </div>

                              {/* Bubble */}
                              <div
                                className={`rounded-2xl px-3.5 py-2 ${
                                  isStaff
                                    ? "bg-blue-600 text-white rounded-br-sm"
                                    : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm"
                                }`}
                              >
                                {msg.message_text && (
                                  <p className="text-[13px] whitespace-pre-wrap leading-relaxed">
                                    {msg.message_text}
                                  </p>
                                )}

                                {/* Attachments */}
                                {msg.message_attachments && msg.message_attachments.length > 0 && (
                                  <div className={`${msg.message_text ? "mt-2 pt-2 border-t" : ""} ${
                                    isStaff ? "border-blue-500/30" : "border-gray-100"
                                  } space-y-1`}>
                                    {msg.message_attachments.map((att: any) => (
                                      <div
                                        key={att.id}
                                        className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg cursor-pointer ${
                                          isStaff
                                            ? "bg-blue-500/30 text-blue-100 hover:bg-blue-500/40"
                                            : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                                        }`}
                                        onClick={async () => {
                                          const { data } = await supabase.storage
                                            .from("message-attachments")
                                            .createSignedUrl(att.storage_path, 300);
                                          if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                                        }}
                                      >
                                        <Paperclip className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate flex-1">{att.original_filename || att.filename}</span>
                                        {att.file_size && (
                                          <span className="flex-shrink-0 opacity-70">
                                            {att.file_size > 1048576
                                              ? `${(att.file_size / 1048576).toFixed(1)} MB`
                                              : `${Math.round(att.file_size / 1024)} KB`}
                                          </span>
                                        )}
                                        <Download className="w-3 h-3 flex-shrink-0 opacity-50" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesBottomRef} />
                </div>
              )}
            </div>

            {/* ── Composer ── */}
            <div className="px-4 py-3 border-t border-gray-100 bg-white">
              {/* Attachment preview */}
              {attachmentFile && (
                <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
                  <Paperclip className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-blue-700 truncate flex-1">{attachmentFile.name}</span>
                  <span className="text-blue-500 text-xs flex-shrink-0">
                    {attachmentFile.size > 1048576
                      ? `${(attachmentFile.size / 1048576).toFixed(1)} MB`
                      : `${Math.round(attachmentFile.size / 1024)} KB`}
                  </span>
                  <button
                    onClick={() => {
                      setAttachmentFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-blue-400 hover:text-blue-600 flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">
                {/* Attachment button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Attach file"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 10 * 1024 * 1024) {
                        toast.error("File must be under 10MB");
                        return;
                      }
                      setAttachmentFile(file);
                    }
                  }}
                />

                {/* Text input */}
                <textarea
                  ref={messageInputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={order?.customer?.full_name ? `Message ${order.customer.full_name}...` : "Type a message..."}
                  rows={1}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3.5 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-gray-50 focus:bg-white transition-colors placeholder:text-gray-400"
                  style={{ minHeight: "38px", maxHeight: "100px" }}
                />

                {/* Send button */}
                <button
                  onClick={handleSendMessage}
                  disabled={(!newMessage.trim() && !attachmentFile) || sendingMessage}
                  className="flex-shrink-0 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                  title="Send (Enter)"
                >
                  {sendingMessage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>

              <p className="text-[11px] text-gray-400 mt-1.5 px-1">
                Enter to send · Shift+Enter for new line · Customer receives an email notification
              </p>
            </div>
          </div>

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
                <div className="space-y-3">
                  <div className="flex justify-between font-semibold text-amber-600 bg-amber-50 -mx-2 px-2 py-2 rounded">
                    <span>Balance Due</span>
                    <span>${(order.balance_due ?? 0).toFixed(2)}</span>
                  </div>

                  {/* Send Payment Link Button */}
                  <button
                    onClick={handleRequestBalancePayment}
                    disabled={requestingPayment}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {requestingPayment ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Creating Link...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        Send Payment Link (${(order.balance_due ?? 0).toFixed(2)})
                      </>
                    )}
                  </button>

                  {/* Show existing payment link if available */}
                  {(paymentLinkUrl || order.balance_payment_link) && (
                    <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-teal-700 font-medium">Payment link sent to customer</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(paymentLinkUrl || order.balance_payment_link || "");
                            toast.success("Payment link copied!");
                          }}
                          className="flex-1 text-xs px-3 py-1.5 bg-white border border-teal-300 text-teal-700 rounded-md hover:bg-teal-50 transition-colors"
                        >
                          Copy Link
                        </button>
                        <a
                          href={paymentLinkUrl || order.balance_payment_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-xs px-3 py-1.5 bg-white border border-teal-300 text-teal-700 rounded-md hover:bg-teal-50 transition-colors text-center"
                        >
                          Open Link
                        </a>
                      </div>
                      {order.balance_payment_requested_at && (
                        <p className="text-xs text-teal-600">
                          Sent: {new Date(order.balance_payment_requested_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Record Manual Payment Button */}
                  <button
                    onClick={() => {
                      setPaymentForm({
                        ...paymentForm,
                        amount: order.balance_due.toFixed(2),
                      });
                      setShowPaymentModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
                  >
                    <DollarSign className="w-4 h-4" />
                    Record Manual Payment (${(order.balance_due ?? 0).toFixed(2)})
                  </button>
                </div>
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

          {/* Activity */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              Activity
            </h2>

            <div className="space-y-0 relative">
              {/* Vertical timeline line */}
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-200" />

              {(() => {
                // Build unified entries from timeline + activity log
                const entries: Array<{
                  id: string;
                  date: Date;
                  label: string;
                  detail?: string;
                  detailsJson?: string;
                  type: "timeline" | "activity";
                }> = [];

                // Timeline entries
                entries.push({
                  id: "timeline-created",
                  date: new Date(order.created_at),
                  label: "Order Created",
                  type: "timeline",
                });
                entries.push({
                  id: "timeline-updated",
                  date: new Date(order.updated_at),
                  label: "Last Updated",
                  type: "timeline",
                });

                // Activity log entries
                activityLog.forEach((entry) => {
                  entries.push({
                    id: `activity-${entry.id}`,
                    date: new Date(entry.created_at),
                    label: (entry.activity_type || "unknown")
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c: string) => c.toUpperCase()),
                    detail: entry.staff_users?.full_name || "System",
                    detailsJson: entry.details
                      ? JSON.stringify(entry.details, null, 2).substring(0, 200)
                      : undefined,
                    type: "activity",
                  });
                });

                // Sort newest first
                entries.sort((a, b) => b.date.getTime() - a.date.getTime());

                if (entries.length === 0) {
                  return (
                    <p className="text-sm text-gray-500 pl-5">No activity recorded</p>
                  );
                }

                return entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 py-2.5 relative text-sm"
                  >
                    <div
                      className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 z-10 ${
                        entry.type === "timeline"
                          ? "bg-gray-400"
                          : "bg-blue-400"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{entry.label}</p>
                      <p className="text-gray-500 text-xs">
                        {entry.detail ? `${entry.detail} \u2022 ` : ""}
                        {format(entry.date, "MMM d, yyyy h:mm a")}
                      </p>
                      {entry.detailsJson && (
                        <pre className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">
                          {entry.detailsJson}
                        </pre>
                      )}
                    </div>
                  </div>
                ));
              })()}
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
            quote_id: order.quote_id,
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
            surcharge_type: order.surcharge_type || 'flat',
            surcharge_value: order.surcharge_value || 0,
            surcharge_total: order.surcharge_total || 0,
            discount_type: order.discount_type || 'flat',
            discount_value: order.discount_value || 0,
            discount_total: order.discount_total || 0,
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
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Record Payment</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                <select
                  value={paymentForm.method_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, method_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— Select —</option>
                  {paymentMethods.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference #</label>
                <input
                  type="text"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  placeholder="e.g. cheque number, e-transfer ref"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={savingPayment}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                {savingPayment ? "Recording..." : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete File Confirmation Modal */}
      {deleteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onClick={() => !deletingFileId && setDeleteModal(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete File</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <strong>{deleteModal.filename}</strong>?
              This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={!!deletingFileId}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await deleteFile(deleteModal.fileId);
                  setDeleteModal(null);
                }}
                disabled={!!deletingFileId}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {deletingFileId ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Upload Modal */}
      {showUploadModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onClick={() => !uploading && setShowUploadModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[90vw] p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {uploadType === "draft" ? "Upload Draft Translation" :
               uploadType === "final" ? "Upload Final Deliverable" : "Upload File"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {uploadType === "draft"
                ? "Upload a draft for customer review. Customer will be notified via email."
                : uploadType === "final"
                ? "Upload the certified final translation for customer download."
                : "Upload a supporting file for this order."}
            </p>

            {/* File drop zone */}
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer mb-4 transition-colors hover:border-blue-400"
              style={{ background: uploadFile ? "rgba(79,140,255,0.04)" : "#f9fafb" }}
            >
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
              />
              {uploadFile ? (
                <>
                  <FileText className="w-8 h-8 text-blue-500 mb-2" />
                  <p className="text-sm font-semibold text-gray-900">{uploadFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(uploadFile.size / 1024 / 1024).toFixed(1)} MB — Click to change
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm font-semibold text-gray-900">Drop file here or click to browse</p>
                  <p className="text-xs text-gray-500 mt-1">PDF, DOCX, JPG, PNG — Max 10 MB</p>
                </>
              )}
            </label>

            {/* Draft notification callout */}
            {uploadType === "draft" && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 mb-4">
                <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>This will set the file to <strong>Pending Review</strong> and send the customer a notification email asking them to review the draft.</span>
              </div>
            )}

            {/* Category selector for "other" type */}
            {uploadType === "other" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Upload As:</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: "to_translate", label: "Source Document", color: "blue" },
                    { value: "reference", label: "Reference File", color: "gray" },
                    { value: "glossary", label: "Glossary", color: "gray" },
                    { value: "style_guide", label: "Style Guide", color: "gray" },
                  ].map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setUploadCategory(cat.value)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        uploadCategory === cat.value
                          ? cat.color === "blue"
                            ? "bg-blue-100 border-blue-500 text-blue-800"
                            : "bg-gray-100 border-gray-500 text-gray-800"
                          : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowUploadModal(false); setUploadFile(null); }}
                disabled={uploading}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleFileUpload}
                disabled={uploading || !uploadFile}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {uploading
                  ? "Uploading..."
                  : uploadType === "draft"
                  ? "Upload & Notify Customer"
                  : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
