import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PDFDocument } from "pdf-lib";
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
  Lock,
  Mail,
  MapPin,
  Minus,
  Pencil,
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
  Layers,
  Loader2,
  Package,
  RotateCcw,
  ShoppingCart,
  X,
  AlertTriangle,
  Link2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import CancelOrderModal from "@/components/admin/CancelOrderModal";
import EditOrderModal from "@/components/admin/EditOrderModal";
import BalanceResolutionModal from "@/components/admin/BalanceResolutionModal";
import OcrResultsModal from "@/components/shared/analysis/OcrResultsModal";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import OriginalsModal from "@/components/admin/OriginalsModal";
import { syncOrderFromQuote } from "../../utils/syncOrderFromQuote";
import OrderWorkflowSection from "@/components/admin/OrderWorkflowSection";
import OrderFinanceSection from "@/components/admin/OrderFinanceSection";
import OrderFinanceTab from "@/components/admin/OrderFinanceTab";
import OrderInvoiceCard from "@/components/admin/OrderInvoiceCard";

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
    turnaround_type: string | null;
    is_rush: boolean | null;
    physical_delivery_option_id: string | null;
    digital_delivery_options: string[] | null;
    selected_pickup_location_id: string | null;
    shipping_address: Record<string, any> | null;
    delivery_fee: number | null;
    calculated_totals: Record<string, number> | null;
    source_language: { id: string; code: string; name: string } | null;
    target_language: { id: string; code: string; name: string } | null;
    intended_use?: {
      id: string;
      name: string;
      default_certification_type?: {
        id: string;
        code: string;
        name: string;
        price: number;
      } | null;
    } | null;
  };
  created_at: string;
  updated_at: string;
  cancelled_at?: string;
  balance_payment_link?: string;
  balance_payment_requested_at?: string;
  delivery_email_sent_at?: string;
  xtrf_project_number?: string | null;
  xtrf_project_id?: string | null;
  xtrf_status?: string | null;
  xtrf_last_synced_at?: string | null;
  xtrf_invoice_id: number | null;
  xtrf_invoice_number: string | null;
  xtrf_invoice_status: string | null;
  xtrf_invoice_payment_status: string | null;
  xtrf_project_total_agreed: number | null;
  xtrf_project_total_cost: number | null;
  xtrf_project_currency_code: string | null;
  xtrf_project_status: string | null;
  xtrf_project_link_source: string | null;
  xtrf_project_linked_at: string | null;
  xtrf_project_original_number: string | null;
  refund_amount: number;
  refund_status: string | null;
  overpayment_credit: number | null;
  invoice_status: string | null;
  po_number: string | null;
  client_project_number: string | null;
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  quotes: {
    payment_method_id: string | null;
    payment_methods: { name: string; code: string } | null;
  } | null;
}

interface PaymentAllocation {
  allocated_amount: number;
  created_at: string;
  customer_payments: {
    id: string;
    amount: number;
    payment_method_name: string | null;
    payment_date: string | null;
    reference_number: string | null;
    status: string;
    notes: string | null;
  } | null;
}

interface PaymentRequest {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  stripe_payment_link_url: string | null;
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

interface DocumentLineItem {
  id: string;
  group_label: string | null;
  document_type: string | null;
  detected_language_name: string | null;
  billable_pages: number;
  base_rate: number;
  line_total: number;
  certification_price: number;
}

interface OrderAdjustment {
  id: string;
  adjustment_type: string;
  value_type: string;
  value: number;
  calculated_amount: number;
  reason: string | null;
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
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [paymentAllocations, setPaymentAllocations] = useState<PaymentAllocation[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
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

  // XTRF Invoice creation state
  const [creatingXtrfInvoice, setCreatingXtrfInvoice] = useState(false);
  const [xtrfInvoiceMessage, setXtrfInvoiceMessage] = useState<{ type: 'success' | 'warning' | 'error' | 'info'; text: string } | null>(null);
  const [refreshingXtrfInvoice, setRefreshingXtrfInvoice] = useState(false);
  const [xtrfRefreshMessage, setXtrfRefreshMessage] = useState<string | null>(null);

  // XTRF Project linking state
  const [showXtrfLinkInput, setShowXtrfLinkInput] = useState(false);
  const [xtrfLinkNumber, setXtrfLinkNumber] = useState("");
  const [linkingXtrfProject, setLinkingXtrfProject] = useState(false);
  const [xtrfLinkMessage, setXtrfLinkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // XTRF Action Buttons state
  const [retryingXtrfPush, setRetryingXtrfPush] = useState(false);
  const [pushingReceivable, setPushingReceivable] = useState(false);
  const [xtrfPushLogs, setXtrfPushLogs] = useState<any[]>([]);
  const [showPushLogHistory, setShowPushLogHistory] = useState(false);

  // Refund / balance payment state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [refundMessage, setRefundMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [requestingBalance, setRequestingBalance] = useState(false);
  const [balanceMessage, setBalanceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Document management state
  const [quoteFiles, setQuoteFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [selectedFileForOcr, setSelectedFileForOcr] = useState<any>(null);
  const [sourceFileMap, setSourceFileMap] = useState<Record<string, any[]>>({});
  const [originalsModalFile, setOriginalsModalFile] = useState<any>(null);

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

  // Delivery section read-only data & edit toggle
  const [isDeliveryEditing, setIsDeliveryEditing] = useState(false);
  const [physicalDelivery, setPhysicalDelivery] = useState<any>(null);
  const [digitalDeliveries, setDigitalDeliveries] = useState<any[]>([]);
  const [pickupLocation, setPickupLocation] = useState<any>(null);

  // Translation details
  const [documentAnalysis, setDocumentAnalysis] = useState<any[]>([]);

  // Activity log
  const [activityLog, setActivityLog] = useState<any[]>([]);

  // Activity timeline (unified)
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // File upload & draft management
  const [orderFiles, setOrderFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState<"draft" | "final" | "other">("draft");
  const [uploadFiles, setUploadFiles] = useState<{ file: File; status: "pending" | "uploading" | "done" | "failed"; error?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("reference");
  const [uploadStaffNotes, setUploadStaffNotes] = useState("");

  // File selection & send modal state
  const [selectedDraftFileIds, setSelectedDraftFileIds] = useState<string[]>([]);
  const [selectedFinalFileIds, setSelectedFinalFileIds] = useState<string[]>([]);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendModalType, setSendModalType] = useState<"draft" | "final" | null>(null);
  const [sendModalNotes, setSendModalNotes] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [reviewHistory, setReviewHistory] = useState<any[]>([]);

  // Admin approve/request changes on behalf of customer
  const [showApproveOnBehalfModal, setShowApproveOnBehalfModal] = useState<string | null>(null);
  const [showChangesOnBehalfModal, setShowChangesOnBehalfModal] = useState<string | null>(null);
  const [onBehalfComment, setOnBehalfComment] = useState("");
  const [processingOnBehalf, setProcessingOnBehalf] = useState(false);

  // File delete state
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  // PO / Project Number inline edit
  const [editingPO, setEditingPO] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [poValue, setPoValue] = useState("");
  const [projectValue, setProjectValue] = useState("");
  const [savingPO, setSavingPO] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
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
  const [documentLineItems, setDocumentLineItems] = useState<DocumentLineItem[]>([]);
  const [orderAdjustments, setOrderAdjustments] = useState<OrderAdjustment[]>([]);
  const [workflowData, setWorkflowData] = useState<any>(null);
  const [workflowRefreshKey, setWorkflowRefreshKey] = useState(0);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [activeMainTab, setActiveMainTab] = useState<"workflow" | "finance">("workflow");
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

  // Fetch activity timeline independently when order loads
  useEffect(() => {
    if (order?.id) {
      fetchActivityTimeline(order);
    }
  }, [order?.id]);

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
        .select("id, original_filename, file_size, mime_type, storage_path, file_category_id, is_staff_created, review_status, review_version, staff_notes, created_at, is_combined, source_file_ids, combined_from_count, file_categories!file_category_id(id, name, slug)")
        .eq("quote_id", quoteId)
        .is("deleted_at", null)
        .in("upload_status", ["uploaded", "completed"])
        .order("created_at", { ascending: true });

      if (!error && data) {
        // Fetch soft-deleted source files for combined files
        const sourceIds = data
          .filter((f: any) => f.is_combined && f.source_file_ids?.length)
          .flatMap((f: any) => f.source_file_ids as string[]);

        let sourceFiles: any[] = [];
        if (sourceIds.length > 0) {
          const { data: sfData } = await supabase
            .from("quote_files")
            .select("id, original_filename, storage_path, file_size, mime_type, created_at")
            .in("id", sourceIds);
          sourceFiles = sfData || [];
        }

        const sfMap: Record<string, any[]> = {};
        for (const combined of data.filter((f: any) => f.is_combined)) {
          sfMap[combined.id] = (combined.source_file_ids || [])
            .map((sid: string) => sourceFiles.find((sf: any) => sf.id === sid))
            .filter(Boolean);
        }
        setSourceFileMap(sfMap);

        // Group non-combined chunk files by original_filename.
        // When a PDF is split into N chunks for OCR, N quote_files rows are created
        // with the same original_filename — these should appear as a single file.
        const combinedFiles = data.filter((f: any) => f.is_combined);
        const chunkFiles = data.filter((f: any) => !f.is_combined);

        const chunkGroups = new Map<string, any[]>();
        for (const f of chunkFiles) {
          const groupKey = f.original_filename || f.storage_path;
          if (!chunkGroups.has(groupKey)) chunkGroups.set(groupKey, []);
          chunkGroups.get(groupKey)!.push(f);
        }

        const groupedChunks = Array.from(chunkGroups.values()).map((group) => {
          const rep = group[0];
          const totalSize = group.reduce((sum: number, f: any) => sum + (f.file_size || 0), 0);
          return {
            ...rep,
            file_size: totalSize,
            _chunk_count: group.length,
            _chunk_ids: group.map((f: any) => f.id),
            _chunk_paths: group.map((f: any) => f.storage_path),
          };
        });

        setQuoteFiles([...groupedChunks, ...combinedFiles]);
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
          staff_notes,
          file_categories ( id, name, slug )
        `)
        .eq("quote_id", order.quote_id)
        .is("deleted_at", null)
        .in("upload_status", ["uploaded", "completed"])
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Build a signed URL map via the server-side edge function
      const fileIds = (files || []).map((f: any) => f.id);
      let signedUrlMap: Record<string, string | null> = {};

      if (fileIds.length > 0) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-signed-urls`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({ file_ids: fileIds }),
            }
          );
          if (response.ok) {
            const result = await response.json();
            for (const entry of result.files || []) {
              signedUrlMap[entry.id] = entry.signed_url;
            }
          } else {
            console.error("get-signed-urls failed:", response.status);
          }
        } catch (err) {
          console.error("get-signed-urls network error:", err);
        }
      }

      const filesWithUrls = (files || []).map((file: any) => {
        const categorySlug = file.file_categories?.slug;
        return { ...file, signed_url: signedUrlMap[file.id] || null, category_slug: categorySlug };
      });

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
    if (uploadFiles.length === 0 || !order?.quote_id || !currentStaff?.staffId) return;
    if (uploadType === "final" && isDelivering) return;
    setUploading(true);

    // Determine file category slug
    let categorySlug = "reference";
    if (uploadType === "draft") categorySlug = "draft_translation";
    else if (uploadType === "final") categorySlug = "final_deliverable";
    else categorySlug = uploadCategory;

    let successCount = 0;
    let failCount = 0;
    const uploadedFileIds: string[] = [];

    for (let i = 0; i < uploadFiles.length; i++) {
      const item = uploadFiles[i];
      if (item.status !== "pending") continue;

      // Mark as uploading
      setUploadFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: "uploading" } : f));

      try {
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("quoteId", order.quote_id);
        formData.append("staffId", currentStaff.staffId);
        formData.append("processWithAI", "false");
        formData.append("file_category", categorySlug);
        if (uploadStaffNotes.trim()) {
          formData.append("staffNotes", uploadStaffNotes.trim());
        }
        // skipNotification: uploads should not trigger individual emails;
        // one consolidated notification is sent after all uploads complete
        formData.append("skipNotification", "true");

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

        const fileId = uploadData.file_id || uploadData.fileId;
        if (!fileId) throw new Error("Upload succeeded but no file ID returned");

        // Update the file category and review fields
        const updateFields: any = {};

        if (uploadType === "draft") {
          const existingDrafts = orderFiles.filter(
            f => f.category_slug === "draft_translation"
          );
          updateFields.review_version = existingDrafts.length + successCount + 1;
        }

        if (Object.keys(updateFields).length > 0) {
          await supabase
            .from("quote_files")
            .update(updateFields)
            .eq("id", fileId);
        }

        uploadedFileIds.push(fileId);

        setUploadFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: "done" } : f));
        successCount++;
      } catch (err: any) {
        console.error("Upload error:", err);
        setUploadFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: "failed", error: err.message } : f));
        failCount++;
      }
    }

    // Send ONE consolidated notification after all uploads complete
    if (uploadedFileIds.length > 0) {
      const lastFileId = uploadedFileIds[uploadedFileIds.length - 1];
      try {
        if (uploadType === "draft") {
          // Draft: submit for review using the last uploaded file_id
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-draft-file`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                file_id: lastFileId,
                action: "submit_for_review",
                actor_type: "staff",
                actor_id: currentStaff.staffId,
                skip_notification: true,
                staff_notes: uploadStaffNotes.trim() || null,
              }),
            }
          );
          console.log("Customer notification sent for all draft files");
        } else if (uploadType === "final") {
          // Final delivery: notify using the order_id
          setIsDelivering(true);
          try {
            await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-draft-file`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                  order_id: order.id,
                  action: "deliver_final",
                  actor_type: "staff",
                  actor_id: currentStaff.staffId,
                  skip_notification: true,
                  staff_notes: uploadStaffNotes.trim() || null,
                }),
              }
            );
          } finally {
            setIsDelivering(false);
          }
        }
      } catch (err) {
        console.warn("Notification call failed (non-blocking)", err);
      }
    }

    setUploading(false);

    if (failCount === 0) {
      // All succeeded
      setShowUploadModal(false);
      setUploadFiles([]);
      setUploadStaffNotes("");
      setUploadType("draft");
      toast.success(
        uploadType === "final"
          ? "Files uploaded successfully. Click Send Files to Customer to notify the customer."
          : successCount === 1
          ? uploadType === "draft"
            ? "Draft uploaded. Use Send Selected to notify customer."
            : "File uploaded"
          : `${successCount} files uploaded successfully`
      );
    } else if (successCount > 0) {
      toast.warning(`${successCount} of ${successCount + failCount} files uploaded successfully`);
    } else {
      toast.error("All uploads failed");
    }

    await fetchOrderFiles();
  };

  const handleApproveOnBehalf = async (fileId: string) => {
    if (!currentStaff?.staffId) return;
    setProcessingOnBehalf(true);
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
            action: "approve",
            actor_type: "staff",
            actor_id: currentStaff.staffId,
            acting_on_behalf: true,
            staff_id: currentStaff.staffId,
          }),
        }
      );
      const data = await response.json();
      if (data.success) {
        toast.success("Draft approved on behalf of customer");
        setShowApproveOnBehalfModal(null);
        await fetchOrderFiles();
      } else {
        toast.error(data.error || "Failed to approve");
      }
    } catch (err) {
      console.error("Approve on behalf error:", err);
      toast.error("Failed to approve draft");
    } finally {
      setProcessingOnBehalf(false);
    }
  };

  const handleRequestChangesOnBehalf = async (fileId: string) => {
    if (!currentStaff?.staffId || !onBehalfComment.trim()) return;
    setProcessingOnBehalf(true);
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
            action: "request_changes",
            actor_type: "staff",
            actor_id: currentStaff.staffId,
            comment: onBehalfComment.trim(),
            acting_on_behalf: true,
            staff_id: currentStaff.staffId,
          }),
        }
      );
      const data = await response.json();
      if (data.success) {
        toast.success("Change request submitted on behalf of customer");
        setShowChangesOnBehalfModal(null);
        setOnBehalfComment("");
        await fetchOrderFiles();
      } else {
        toast.error(data.error || "Failed to submit changes");
      }
    } catch (err) {
      console.error("Request changes on behalf error:", err);
      toast.error("Failed to submit change request");
    } finally {
      setProcessingOnBehalf(false);
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

  const getBucketForFile = (file: any) => {
    if (file.file_category_id === REFERENCE_CATEGORY_ID) return "quote-reference-files";
    // OCR chunk files are uploaded to ocr-uploads with flat paths (no /),
    // while quote-files paths have directories (e.g. "{quoteId}/filename.pdf")
    if (file.storage_path && !file.storage_path.includes('/')) return "ocr-uploads";
    return "quote-files";
  };

  // Merge multiple chunk PDFs into a single PDF blob
  const mergeChunkPdfs = async (file: any): Promise<Blob> => {
    const bucket = getBucketForFile(file);
    const mergedPdf = await PDFDocument.create();
    for (const path of file._chunk_paths) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`Failed to download chunk: ${path}`);
      const chunkBytes = await data.arrayBuffer();
      const chunkPdf = await PDFDocument.load(chunkBytes, { ignoreEncryption: true });
      const pages = await mergedPdf.copyPages(chunkPdf, chunkPdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }
    const mergedBytes = await mergedPdf.save();
    return new Blob([mergedBytes], { type: 'application/pdf' });
  };

  // Only PDFs get merged as chunks. Other types (images, etc.) can share an
  // original_filename across rows without being mergable — treat each row as
  // a standalone file and use the representative storage_path.
  const isPdfFile = (file: any) =>
    (file.mime_type || "").toLowerCase() === "application/pdf" ||
    (file.storage_path || "").toLowerCase().endsWith(".pdf");

  const handlePreviewFile = async (file: any) => {
    try {
      if (file._chunk_count > 1 && isPdfFile(file)) {
        const blob = await mergeChunkPdfs(file);
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      } else {
        const { data } = await supabase.storage
          .from(getBucketForFile(file))
          .createSignedUrl(file.storage_path, 3600);
        if (data?.signedUrl) {
          window.open(data.signedUrl, "_blank");
        }
      }
    } catch (err) {
      console.error("Preview error:", err);
    }
  };

  const handleDownloadFile = async (file: any) => {
    try {
      let blob: Blob;
      if (file._chunk_count > 1 && isPdfFile(file)) {
        blob = await mergeChunkPdfs(file);
      } else {
        const { data } = await supabase.storage
          .from(getBucketForFile(file))
          .download(file.storage_path);
        if (!data) return;
        blob = data;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.original_filename;
      a.click();
      URL.revokeObjectURL(url);
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

  const fetchActivityTimeline = async (orderData: OrderDetail) => {
    setTimelineLoading(true);
    try {
      const [quoteActivityResult, staffActivityResult, invoicesResult, refundsResult, paymentIntentsResult] =
        await Promise.all([
          // 1. quote_activity_log
          orderData.quote_id
            ? supabase
                .from("quote_activity_log")
                .select("id, action_type, details, staff_id, created_at, staff_users(full_name)")
                .eq("quote_id", orderData.quote_id)
                .order("created_at", { ascending: true })
            : Promise.resolve({ data: [] }),
          // 2. staff_activity_log
          orderData.quote_id
            ? supabase
                .from("staff_activity_log")
                .select("id, action_type, entity_type, details, staff_id, created_at, staff_users(full_name)")
                .or(`entity_id.eq.${orderData.id},entity_id.eq.${orderData.quote_id}`)
                .order("created_at", { ascending: true })
                .limit(100)
            : supabase
                .from("staff_activity_log")
                .select("id, action_type, entity_type, details, staff_id, created_at, staff_users(full_name)")
                .eq("entity_id", orderData.id)
                .order("created_at", { ascending: true })
                .limit(100),
          // 3. customer_invoices
          supabase
            .from("customer_invoices")
            .select("id, invoice_number, total_amount, status, invoice_date, created_at")
            .eq("order_id", orderData.id)
            .order("created_at", { ascending: true }),
          // 4. refunds
          supabase
            .from("refunds")
            .select("id, amount, refund_method, status, reason, stripe_refund_id, processed_at, created_at, created_by_staff:staff_users!refunds_created_by_staff_id_fkey(full_name)")
            .eq("order_id", orderData.id)
            .order("created_at", { ascending: true }),
          // 5. customer_payment_intents (within ±24h of order creation)
          orderData.customer_id
            ? supabase
                .from("customer_payment_intents")
                .select("id, total_amount, payment_method, stripe_payment_intent_id, status, completed_at, created_at")
                .eq("customer_id", orderData.customer_id)
                .eq("status", "completed")
                .gte("created_at", new Date(new Date(orderData.created_at).getTime() - 86400000).toISOString())
                .lte("created_at", new Date(new Date(orderData.created_at).getTime() + 86400000).toISOString())
                .limit(3)
            : Promise.resolve({ data: [] }),
        ]);

      const events: any[] = [];

      // Synthetic: order created
      events.push({
        id: "order-created",
        timestamp: new Date(orderData.created_at),
        icon: "ShoppingCart",
        color: "green",
        label: "Order created",
        detail: `Order ${orderData.order_number}`,
      });

      // quote_activity_log entries
      (quoteActivityResult.data || []).forEach((entry: any) => {
        const staffName = (entry.staff_users as any)?.full_name;
        const d = entry.details || {};
        let label = "";
        let icon = "RefreshCw";
        let color = "blue";
        let detail = staffName ? `by ${staffName}` : undefined;

        switch (entry.action_type) {
          case "status_changed":
            label = `Status changed to ${d.new_status || "unknown"}`;
            icon = "RefreshCw";
            color = "blue";
            break;
          case "payment_link_sent":
            label = "Payment link sent";
            icon = "Send";
            color = "teal";
            break;
          case "quote_link_sent":
            label = "Quote link sent";
            icon = "Send";
            color = "teal";
            break;
          case "manual_payment_recorded":
            label = `Manual payment recorded — $${d.amount || ""}`;
            icon = "DollarSign";
            color = "green";
            break;
          case "message_sent":
            label = "Message sent";
            icon = "MessageSquare";
            color = "gray";
            break;
          default:
            label = entry.action_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Activity";
            break;
        }

        events.push({
          id: `qa-${entry.id}`,
          timestamp: new Date(entry.created_at),
          icon,
          color,
          label,
          detail,
        });
      });

      // staff_activity_log entries
      (staffActivityResult.data || []).forEach((entry: any) => {
        const staffName = (entry.staff_users as any)?.full_name;
        let label = "";
        let icon = "Clock";
        let color = "blue";
        let detail = staffName ? `by ${staffName}` : undefined;

        switch (entry.action_type) {
          case "deliver_final":
            label = "Final files delivered";
            icon = "Package";
            color = "green";
            break;
          case "manual_payment":
            label = "Manual payment recorded";
            icon = "DollarSign";
            color = "green";
            break;
          case "cancel_order":
            label = "Order cancelled";
            icon = "XCircle";
            color = "red";
            break;
          case "send_delivery_email":
            label = "Delivery email sent";
            icon = "Mail";
            color = "teal";
            break;
          default:
            label = entry.action_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Activity";
            break;
        }

        events.push({
          id: `sa-${entry.id}`,
          timestamp: new Date(entry.created_at),
          icon,
          color,
          label,
          detail,
        });
      });

      // customer_invoices
      (invoicesResult.data || []).forEach((inv: any) => {
        events.push({
          id: `inv-${inv.id}`,
          timestamp: new Date(inv.created_at),
          icon: "FileText",
          color: "purple",
          label: `Invoice #${inv.invoice_number} generated — $${Number(inv.total_amount).toFixed(2)}`,
          detail: inv.status ? `Status: ${inv.status}` : undefined,
        });
      });

      // customer_payment_intents
      (paymentIntentsResult.data || []).forEach((pi: any) => {
        if (pi.status === "completed") {
          const stripeId = pi.stripe_payment_intent_id || "";
          events.push({
            id: `pi-${pi.id}`,
            timestamp: new Date(pi.completed_at || pi.created_at),
            icon: "CreditCard",
            color: "green",
            label: `Payment received — $${Number(pi.total_amount).toFixed(2)} via ${pi.payment_method || "card"}`,
            detail: stripeId
              ? stripeId.length > 24 ? `${stripeId.substring(0, 24)}...` : stripeId
              : undefined,
            mono: !!stripeId,
          });
        }
      });

      // refunds
      (refundsResult.data || []).forEach((ref: any) => {
        const staffName = (ref.created_by_staff as any)?.full_name;
        const parts: string[] = [];
        if (staffName) parts.push(`by ${staffName}`);
        if (ref.reason) parts.push(ref.reason);
        if (ref.stripe_refund_id) parts.push(ref.stripe_refund_id);
        events.push({
          id: `ref-${ref.id}`,
          timestamp: new Date(ref.processed_at || ref.created_at),
          icon: "RotateCcw",
          color: "red",
          label: `Refund issued — $${Number(ref.amount).toFixed(2)} (${ref.refund_method || "unknown"})`,
          detail: parts.join(" • ") || undefined,
          mono: !!ref.stripe_refund_id && !staffName && !ref.reason,
        });
      });

      // Sort oldest first
      events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      setTimelineEvents(events);
    } catch (err) {
      console.error("Failed to fetch activity timeline:", err);
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleConfirmSend = async () => {
    if (isSendingEmail || !order || !currentStaff?.staffId) return;
    setIsSendingEmail(true);

    try {
      if (sendModalType === "draft") {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-draft-file`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              action: "submit_for_review",
              file_ids: selectedDraftFileIds,
              actor_type: "staff",
              actor_id: currentStaff.staffId,
              staff_notes: sendModalNotes.trim() || null,
              skip_notification: false,
            }),
          }
        );
        const data = await response.json();

        if (!response.ok || !data?.success) {
          toast.error(data?.error || "Failed to send draft review email");
          return;
        }

        toast.success(`Draft review email sent with ${data.files_in_email} file(s)`);
        setSelectedDraftFileIds([]);
        await fetchOrderFiles();

      } else if (sendModalType === "final") {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-draft-file`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              action: "send_delivery_email",
              order_id: order.id,
              file_ids: selectedFinalFileIds.length > 0
                ? selectedFinalFileIds
                : undefined,
              actor_type: "staff",
              actor_id: currentStaff.staffId,
              staff_notes: sendModalNotes.trim() || null,
            }),
          }
        );
        const data = await response.json();

        if (!response.ok || !data?.success) {
          toast.error(data?.error || "Failed to send delivery email");
          return;
        }

        toast.success(`Delivery email sent with ${data.files_sent} file(s)`);
        setSelectedFinalFileIds([]);
        await fetchOrderDetails();
      }

      setSendModalOpen(false);
      setSendModalNotes("");

    } catch (err: any) {
      toast.error("Failed to send email");
      console.error("handleConfirmSend error:", err);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const fetchOrderDetails = async () => {
    setLoading(true);
    setError("");

    try {
      // ── Phase 1: Fire independent queries in parallel ──
      // Order fetch and adjustments only need the route param `id`
      const [orderResult, adjustmentsResult] = await Promise.all([
        // 1. Main order with customer + quote joins
        supabase
          .from("orders")
          .select(`
            *,
            customer:customers(*),
            quote:quotes(
              quote_number, promised_delivery_date, country_of_issue,
              special_instructions, turnaround_type, is_rush,
              physical_delivery_option_id, digital_delivery_options,
              selected_pickup_location_id, shipping_address, delivery_fee,
              calculated_totals,
              source_language:languages!source_language_id(id, code, name),
              target_language:languages!target_language_id(id, code, name),
              intended_use:intended_uses!intended_use_id(
                id, name,
                default_certification_type:certification_types!default_certification_type_id(
                  id, code, name, price
                )
              )
            )
          `)
          .eq("id", id)
          .single(),
        // 2. Adjustments
        supabase.from("adjustments").select(`
          *, created_by:staff_users!adjustments_created_by_fkey(full_name)
        `).eq("order_id", id).order("created_at", { ascending: false }),
      ]);

      const { data: orderData, error: orderError } = orderResult;
      if (orderError) throw orderError;
      setOrder(orderData as OrderDetail);

      // Payment history: invoices → allocations → customer_payments, plus payment_requests
      const { data: invoiceData } = await supabase
        .from("customer_invoices")
        .select(`
          id, invoice_number, total_amount, amount_paid,
          balance_due, status, paid_at, created_at,
          quotes (
            payment_method_id,
            payment_methods ( name, code )
          )
        `)
        .eq("order_id", orderData.id)
        .order("created_at", { ascending: false });
      setInvoices(invoiceData || []);

      let allocationsData: PaymentAllocation[] = [];
      if (invoiceData && invoiceData.length > 0) {
        const invoiceIds = invoiceData.map((i: any) => i.id);
        const { data: allocs } = await supabase
          .from("customer_payment_allocations")
          .select(`
            allocated_amount,
            created_at,
            customer_payments (
              id,
              amount,
              payment_method_name,
              payment_date,
              reference_number,
              status,
              notes
            )
          `)
          .in("invoice_id", invoiceIds);
        allocationsData = allocs || [];
      }
      setPaymentAllocations(allocationsData);

      const { data: prData } = await supabase
        .from("payment_requests")
        .select("id, amount, status, paid_at, created_at, stripe_payment_link_url")
        .eq("order_id", orderData.id)
        .order("created_at", { ascending: false });
      setPaymentRequests(prData || []);

      // Refunds for Finance section
      const { data: refundsData } = await supabase
        .from("refunds")
        .select("*")
        .eq("order_id", orderData.id)
        .order("created_at", { ascending: false });
      setRefunds(refundsData || []);

      setAdjustments(
        (adjustmentsResult.data || []).map((adjustment: any) => ({
          ...adjustment,
          created_by_name: adjustment.created_by?.full_name || "System",
        })),
      );

      // ── Phase 2: Queries that depend on orderData (run in parallel) ──
      const quote = orderData.quote;
      const phase2Promises: Promise<any>[] = [];

      // 4. AI analysis results (needs quote_id)
      phase2Promises.push(
        orderData.quote_id
          ? supabase.from("ai_analysis_results").select(`
              id, quote_file_id, detected_language, detected_document_type, word_count,
              page_count, country_of_issue,
              quote_file:quote_files!ai_analysis_results_quote_file_id_fkey(id, original_filename, storage_path, file_size, mime_type)
            `).eq("quote_id", orderData.quote_id).is("deleted_at", null).order("created_at")
          : Promise.resolve({ data: null })
      );

      // 5. Quote turnaround/delivery option IDs (needs quote_id)
      phase2Promises.push(
        orderData.quote_id
          ? supabase.from("quotes").select("turnaround_option_id, physical_delivery_option_id")
              .eq("id", orderData.quote_id).single()
          : Promise.resolve({ data: null })
      );

      // 6. Physical delivery option (needs quote.physical_delivery_option_id)
      phase2Promises.push(
        quote?.physical_delivery_option_id
          ? supabase.from("delivery_options").select("id, name, code, price, delivery_type")
              .eq("id", quote.physical_delivery_option_id).single()
          : Promise.resolve({ data: null })
      );

      // 7. Digital delivery options (needs quote.digital_delivery_options)
      phase2Promises.push(
        quote?.digital_delivery_options?.length > 0
          ? supabase.from("delivery_options").select("id, name, code, price")
              .in("id", quote.digital_delivery_options)
          : Promise.resolve({ data: [] })
      );

      // 8. Pickup location (needs quote.selected_pickup_location_id)
      phase2Promises.push(
        quote?.selected_pickup_location_id
          ? supabase.from("pickup_locations")
              .select("id, name, address_line1, city, state, postal_code, phone, hours")
              .eq("id", quote.selected_pickup_location_id).single()
          : Promise.resolve({ data: null })
      );

      // 9. Cancellation data (conditional on status)
      phase2Promises.push(
        orderData.status === 'cancelled'
          ? supabase.from('order_cancellations').select('*').eq('order_id', id)
              .order('created_at', { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null })
      );

      // 10. Activity log (needs order.id and order.quote_id)
      phase2Promises.push(
        fetchActivityLog(orderData.id, orderData.quote_id)
      );

      const [
        analysisResult,
        quoteOptionsResult,
        physDelResult,
        digDelsResult,
        pickupResult,
        cancellationResult,
        // activityLog result handled by fetchActivityLog internally
      ] = await Promise.all(phase2Promises);

      // ── Unpack Phase 2 results ──
      if (analysisResult.data) {
        setDocumentAnalysis(analysisResult.data);
      }

      if (quoteOptionsResult.data) {
        setSelectedTurnaroundId(quoteOptionsResult.data.turnaround_option_id || "");
        setSelectedDeliveryId(quoteOptionsResult.data.physical_delivery_option_id || "");
      }

      setPhysicalDelivery(physDelResult.data || null);
      setDigitalDeliveries(digDelsResult.data || []);
      setPickupLocation(pickupResult.data || null);
      setCancellation(cancellationResult.data || null);

      // Fetch document line items
      if (orderData.quote_id) {
        const { data: lineItems } = await supabase
          .from('quote_document_groups')
          .select('id, group_label, document_type, detected_language_name, billable_pages, base_rate, line_total, certification_price')
          .eq('quote_id', orderData.quote_id)
          .order('created_at', { ascending: true });
        setDocumentLineItems(lineItems ?? []);

        // Fetch adjustments (discounts, surcharges)
        const { data: quoteAdjustments } = await supabase
          .from('quote_adjustments')
          .select('id, adjustment_type, value_type, value, calculated_amount, reason')
          .eq('quote_id', orderData.quote_id)
          .order('created_at', { ascending: true });
        setOrderAdjustments(quoteAdjustments ?? []);
      }

      // Set promised delivery date from quote, fallback to order's estimated date
      setPromisedDeliveryDate(
        orderData.quote?.promised_delivery_date || orderData.estimated_delivery_date || ""
      );
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

  const handleProcessRefund = async () => {
    if (!order || processingRefund) return;
    const amount = parseFloat(refundAmount);
    if (!amount || amount <= 0) return;
    setProcessingRefund(true);
    setRefundMessage(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/process-refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ order_id: order.id, staff_id: currentStaff?.staffId || null, amount, reason: refundReason || 'Overpayment refund' }),
      });
      const result = await res.json();
      if (result.success) {
        setRefundMessage({ type: 'success', text: result.message });
        setShowRefundModal(false);
        setRefundAmount('');
        setRefundReason('');
        await fetchOrderDetails();
      } else {
        setRefundMessage({ type: 'error', text: result.error ?? 'Refund failed' });
      }
    } catch (err: any) {
      setRefundMessage({ type: 'error', text: err.message ?? 'Request failed' });
    } finally {
      setProcessingRefund(false);
    }
  };

  const handleRequestBalancePaymentV2 = async () => {
    if (!order || requestingBalance) return;
    setRequestingBalance(true);
    setBalanceMessage(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/request-balance-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ order_id: order.id, staff_id: currentStaff?.staffId || null, reason: 'Balance due' }),
      });
      const result = await res.json();
      if (result.success) {
        setBalanceMessage({ type: 'success', text: `Payment link sent to customer${result.email_sent ? ' via email' : ''}. Amount: $${result.amount?.toFixed(2)}` });
        await fetchOrderDetails();
      } else {
        setBalanceMessage({ type: 'error', text: result.error ?? 'Failed to create payment link' });
      }
    } catch (err: any) {
      setBalanceMessage({ type: 'error', text: err.message ?? 'Request failed' });
    } finally {
      setRequestingBalance(false);
    }
  };

  const handleLinkXtrfProject = async () => {
    if (!order || !xtrfLinkNumber.trim() || linkingXtrfProject) return;
    setLinkingXtrfProject(true);
    setXtrfLinkMessage(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/xtrf-link-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          order_id: order.id,
          xtrf_project_number: xtrfLinkNumber.trim(),
          staff_id: currentStaff?.staffId || null,
        }),
      });
      const result = await response.json();

      if (result.success) {
        const originalNote = result.original_project_number
          ? ` (was ${result.original_project_number})`
          : '';
        setXtrfLinkMessage({ type: 'success', text: `Linked to ${result.xtrf_project_number}${originalNote}` });
        setShowXtrfLinkInput(false);
        setXtrfLinkNumber("");
        await fetchOrderDetails();
      } else {
        setXtrfLinkMessage({ type: 'error', text: result.error ?? 'Linking failed' });
      }
    } catch (err: any) {
      setXtrfLinkMessage({ type: 'error', text: err.message ?? 'Request failed' });
    } finally {
      setLinkingXtrfProject(false);
    }
  };

  const handleRefreshXtrfInvoice = async () => {
    if (!order || refreshingXtrfInvoice) return;
    setRefreshingXtrfInvoice(true);
    setXtrfRefreshMessage(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/xtrf-refresh-order-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ order_id: order.id }),
      });
      const result = await response.json();
      if (result.success) {
        setXtrfRefreshMessage(result.message);
        if (result.changed) {
          await fetchOrderDetails();
        }
      } else {
        setXtrfRefreshMessage(`❌ ${result.error ?? 'Refresh failed'}`);
      }
    } catch (err: any) {
      setXtrfRefreshMessage(`❌ ${err.message ?? 'Request failed'}`);
    } finally {
      setRefreshingXtrfInvoice(false);
    }
  };

  const handleCreateXtrfInvoice = async () => {
    if (!order || creatingXtrfInvoice) return;
    setCreatingXtrfInvoice(true);
    setXtrfInvoiceMessage(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/xtrf-create-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ order_id: order.id, staff_id: currentStaff?.staffId || null }),
      });
      const result = await response.json();

      if (result.success) {
        const warningText = result.warning ? ` \u26a0\ufe0f ${result.warning}` : '';
        setXtrfInvoiceMessage({
          type: result.warning ? 'warning' : 'success',
          text: `\u2705 Invoice ${result.xtrf_invoice_number ?? result.xtrf_invoice_id} created in XTRF.${warningText}`,
        });
        await fetchOrderDetails();
      } else if (result.skipped) {
        setXtrfInvoiceMessage({ type: 'info', text: `\u2139\ufe0f ${result.message}` });
        await fetchOrderDetails();
      } else {
        setXtrfInvoiceMessage({ type: 'error', text: `\u274c ${result.error ?? 'Invoice creation failed'}` });
      }
    } catch (err: any) {
      setXtrfInvoiceMessage({ type: 'error', text: `\u274c ${err.message ?? 'Request failed'}` });
    } finally {
      setCreatingXtrfInvoice(false);
    }
  };

  // ── XTRF Action Buttons handlers ──
  const fetchXtrfPushLogs = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("xtrf_push_log")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (data) setXtrfPushLogs(data);
  };

  useEffect(() => {
    if (order?.id) {
      fetchXtrfPushLogs();
    }
  }, [order?.id]);

  const handleRetryXtrfPush = async () => {
    if (!order || retryingXtrfPush) return;
    if (!window.confirm("This will attempt to create a new XTRF project and link it to this order. Continue?")) return;
    setRetryingXtrfPush(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xtrf-push-project`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            order_id: order.id,
            triggered_by: "manual_retry",
          }),
        }
      );
      const result = await response.json();
      if (result.success) {
        toast.success(`XTRF project ${result.xtrf_project_number} created successfully`);
        await fetchOrderDetails();
        await fetchXtrfPushLogs();
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(`Failed: ${err.message ?? "Request failed"}`);
    } finally {
      setRetryingXtrfPush(false);
    }
  };

  const handlePushReceivable = async () => {
    if (!order || pushingReceivable) return;
    if (!window.confirm("This will push the receivable (pre-tax total) and payment notes to the linked XTRF project. This is safe to run multiple times — it won't create duplicate receivables. Continue?")) return;
    setPushingReceivable(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xtrf-push-receivable`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ order_id: order.id }),
        }
      );
      const result = await response.json();
      if (result.success) {
        if (result.receivable === "created") {
          toast.success(`Receivable ($${result.amount?.toFixed(2) ?? "XX.XX"}) and notes pushed to XTRF project ${result.xtrf_project_number}`);
        } else if (result.receivable === "already_exists") {
          toast.info("Receivable already exists on XTRF project. Notes were updated.");
        } else {
          toast.success("Receivable pushed to XTRF successfully.");
        }
        await fetchXtrfPushLogs();
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(`Failed: ${err.message ?? "Request failed"}`);
    } finally {
      setPushingReceivable(false);
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

      // Step 1: Fetch order messages, quote messages, and conversation ID in parallel
      const [orderMsgResult, quoteMsgResult, convResult] = await Promise.all([
        orderId
          ? supabase.from("conversation_messages").select(messageSelectFields)
              .eq("order_id", orderId).order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        quoteId
          ? supabase.from("conversation_messages").select(messageSelectFields)
              .eq("quote_id", quoteId).order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        customerId
          ? supabase.from("customer_conversations").select("id")
              .eq("customer_id", customerId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const orderMessages = !orderMsgResult.error ? (orderMsgResult.data || []) : [];
      const quoteMessages = !quoteMsgResult.error ? (quoteMsgResult.data || []) : [];

      // Step 2: Fetch conversation messages if conversation was found
      let convMessages: any[] = [];
      let resolvedConvId: string | null = convResult.data?.id || null;

      if (resolvedConvId) {
        const { data: cm } = await supabase
          .from("conversation_messages")
          .select(messageSelectFields)
          .eq("conversation_id", resolvedConvId)
          .order("created_at", { ascending: true });
        convMessages = cm || [];
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
            order_id: id,
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
        if (messageInputRef.current) messageInputRef.current.style.height = '38px';
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

  const overpaymentAmount = order
    ? Math.max(0, parseFloat(String(order.amount_paid || 0)) - parseFloat(String(order.total_amount || 0)) - parseFloat(String(order.refund_amount || 0)))
    : 0;
  const underpaymentAmount = order
    ? Math.max(0, parseFloat(String(order.balance_due || 0)))
    : 0;
  const hasOverpayment = overpaymentAmount > 0.01;
  const hasUnderpayment = underpaymentAmount > 0.01;

  const handleSavePO = async () => {
    if (!id) return;
    setSavingPO(true);
    try {
      const { error: err } = await supabase.from("orders").update({ po_number: poValue || null }).eq("id", id);
      if (err) throw err;
      setOrder((prev) => prev ? { ...prev, po_number: poValue || null } : prev);
      setEditingPO(false);
      toast.success("PO number updated");
    } catch {
      toast.error("Failed to update PO number");
    }
    setSavingPO(false);
  };

  const handleSaveProject = async () => {
    if (!id) return;
    setSavingProject(true);
    try {
      const { error: err } = await supabase.from("orders").update({ client_project_number: projectValue || null }).eq("id", id);
      if (err) throw err;
      setOrder((prev) => prev ? { ...prev, client_project_number: projectValue || null } : prev);
      setEditingProject(false);
      toast.success("Project number updated");
    } catch {
      toast.error("Failed to update project number");
    }
    setSavingProject(false);
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link
          to="/admin/orders"
          className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Orders
        </Link>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {order.order_number}
            </h1>
            {/* Status Dropdowns */}
            <div className="flex flex-wrap gap-3 sm:gap-4 mt-2">
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

              {/* Invoice Status Badge */}
              {order.invoice_status && (
                <div className="flex items-center gap-2 pb-1">
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      order.invoice_status === "paid"
                        ? "bg-green-100 text-green-700"
                        : order.invoice_status === "invoiced"
                        ? "bg-blue-100 text-blue-700"
                        : order.invoice_status === "draft"
                        ? "bg-yellow-100 text-yellow-700"
                        : order.invoice_status === "unbilled"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {order.invoice_status === "paid"
                      ? "Invoice Paid"
                      : order.invoice_status === "invoiced"
                      ? "Invoiced"
                      : order.invoice_status === "draft"
                      ? "Invoice Draft"
                      : order.invoice_status === "unbilled"
                      ? "Unbilled"
                      : order.invoice_status.charAt(0).toUpperCase() + order.invoice_status.slice(1)}
                  </span>
                  {order.invoice_status !== "paid" && order.invoice_status !== "unbilled" && order.invoice_status !== "draft" && order.balance_due > 0 && (
                    <span className="text-xs text-amber-700 font-medium">
                      Balance: ${order.balance_due.toFixed(2)}
                    </span>
                  )}
                  {order.invoice_status !== "paid" && order.invoice_status !== "unbilled" && order.invoice_status !== "draft" && order.balance_due > 0 && (
                    <Link
                      to={`/admin/payments?search=${encodeURIComponent(order.customer?.full_name || "")}`}
                      className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                    >
                      Record Payment
                    </Link>
                  )}
                </div>
              )}

              {/* Direct Order + Progress-Invoice Badges (non-cert projects) */}
              {(order as any).is_direct_order && (
                <div className="flex items-center gap-2 pb-1">
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
                    Direct Order
                  </span>
                </div>
              )}
              {(() => {
                const invTotal = parseFloat(String((order as any).invoiced_total ?? 0)) || 0;
                const total = parseFloat(String(order.total_amount ?? 0)) || 0;
                if (invTotal <= 0 || invTotal >= total) return null;
                const remaining = Math.max(0, total - invTotal);
                return (
                  <div className="flex items-center gap-2 pb-1">
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700">
                      Progress invoiced: ${invTotal.toFixed(2)} of ${total.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-500">${remaining.toFixed(2)} remaining</span>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="grid grid-cols-2 md:flex md:items-center gap-2 md:gap-3">
            {order.quote_id && (
              <Link
                to={`/admin/quotes/${order.quote_id}`}
                className="col-span-2 inline-flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm"
              >
                <span className="sm:hidden">View Quote</span>
                <span className="hidden sm:inline">View Quote ({order.quote?.quote_number})</span>
                <ExternalLink className="w-4 h-4 flex-shrink-0" />
              </Link>
            )}

            {/* Edit Order Button */}
            {order.status !== "cancelled" && order.status !== "refunded" && (
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors text-sm whitespace-nowrap"
              >
                <Edit2 className="w-4 h-4 flex-shrink-0" />
                Edit Order
              </button>
            )}

            {/* Cancel Order Button */}
            {order.status !== "cancelled" && order.status !== "refunded" && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 text-sm font-medium whitespace-nowrap"
              >
                <XCircle className="w-4 h-4 flex-shrink-0" />
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

      {/* XTRF Action Buttons Section */}
      {!order.xtrf_project_id ? (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-800">XTRF Project Not Created</p>
              <p className="text-sm text-amber-700 mt-1">
                The automatic project creation failed for this order. You can retry the automatic push, or create it manually in XTRF and link it below.
              </p>
              <button
                onClick={handleRetryXtrfPush}
                disabled={retryingXtrfPush}
                className="mt-3 inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {retryingXtrfPush ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Retry XTRF Project Push
              </button>
            </div>
          </div>

          {/* Push Log History */}
          {xtrfPushLogs.length > 0 && (
            <div className="mt-3 border-t border-amber-200 pt-3">
              <button
                onClick={() => setShowPushLogHistory(!showPushLogHistory)}
                className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900"
              >
                {showPushLogHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Show push history ({xtrfPushLogs.length})
              </button>
              {showPushLogHistory && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-amber-700">
                        <th className="pb-1 pr-3 font-medium">Timestamp</th>
                        <th className="pb-1 pr-3 font-medium">Result</th>
                        <th className="pb-1 pr-3 font-medium">Triggered By</th>
                        <th className="pb-1 font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {xtrfPushLogs.map((log: any) => (
                        <tr key={log.id} className="border-t border-amber-100">
                          <td className="py-1 pr-3 text-gray-600 whitespace-nowrap">
                            {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                          </td>
                          <td className="py-1 pr-3">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${log.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {log.success ? "Success" : "Failed"}
                            </span>
                          </td>
                          <td className="py-1 pr-3 text-gray-600">{log.triggered_by || "—"}</td>
                          <td className="py-1 text-red-600 max-w-xs truncate">{log.error_message || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div>
                <span className="font-medium text-blue-900">
                  XTRF Project: {order.xtrf_project_number}
                </span>
                {order.xtrf_status && (
                  <span className="ml-2 text-sm text-blue-600">(Status: {order.xtrf_status})</span>
                )}
                {order.xtrf_last_synced_at && (
                  <p className="text-xs text-blue-500 mt-0.5">
                    Last synced: {format(new Date(order.xtrf_last_synced_at), "yyyy-MM-dd HH:mm")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`https://automations.cethos.com/gui2/#/projectDetails?projectNum=${order.xtrf_project_number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Open in XTRF
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={handlePushReceivable}
                disabled={pushingReceivable}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {pushingReceivable ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Push Receivable & Notes to XTRF
              </button>
            </div>
          </div>

          {/* Push Log History */}
          {xtrfPushLogs.length > 0 && (
            <div className="mt-3 border-t border-blue-200 pt-3">
              <button
                onClick={() => setShowPushLogHistory(!showPushLogHistory)}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                {showPushLogHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Show push history ({xtrfPushLogs.length})
              </button>
              {showPushLogHistory && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-blue-700">
                        <th className="pb-1 pr-3 font-medium">Timestamp</th>
                        <th className="pb-1 pr-3 font-medium">Result</th>
                        <th className="pb-1 pr-3 font-medium">Triggered By</th>
                        <th className="pb-1 font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {xtrfPushLogs.map((log: any) => (
                        <tr key={log.id} className="border-t border-blue-100">
                          <td className="py-1 pr-3 text-gray-600 whitespace-nowrap">
                            {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                          </td>
                          <td className="py-1 pr-3">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${log.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {log.success ? "Success" : "Failed"}
                            </span>
                          </td>
                          <td className="py-1 pr-3 text-gray-600">{log.triggered_by || "—"}</td>
                          <td className="py-1 text-red-600 max-w-xs truncate">{log.error_message || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* XTRF Project & Invoice Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">XTRF Project</p>

        {/* Project number + link */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">Project</span>
          <div className="flex items-center gap-2">
            {order.xtrf_project_number ? (
              <>
                <span className="text-sm font-mono text-gray-900">{order.xtrf_project_number}</span>
                <XtrfProjectStatusBadge status={order.xtrf_project_status} />
                <a
                  href={`https://cethos.s.xtrf.us/xtrf/faces/projectAssistant/projects/project.seam?assistedProjectId=${order.xtrf_project_id}#/project`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Open ↗
                </a>
                <button
                  onClick={() => { setShowXtrfLinkInput(true); setXtrfLinkNumber(order.xtrf_project_number ?? ""); setXtrfLinkMessage(null); }}
                  className="text-xs text-gray-500 hover:text-blue-600 underline"
                >
                  Change
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-gray-400 italic">Not linked</span>
                <button
                  onClick={() => { setShowXtrfLinkInput(true); setXtrfLinkNumber(""); setXtrfLinkMessage(null); }}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Link Project
                </button>
              </>
            )}
          </div>
        </div>

        {/* Link / Change input */}
        {showXtrfLinkInput && (
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={xtrfLinkNumber}
              onChange={(e) => setXtrfLinkNumber(e.target.value)}
              placeholder="e.g. 2026/840"
              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleLinkXtrfProject}
              disabled={linkingXtrfProject || !xtrfLinkNumber.trim()}
              className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
            >
              {linkingXtrfProject ? 'Linking…' : 'Save'}
            </button>
            <button
              onClick={() => { setShowXtrfLinkInput(false); setXtrfLinkMessage(null); }}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Link feedback */}
        {xtrfLinkMessage && (
          <div className={`mb-2 text-xs rounded-lg px-3 py-2 ${
            xtrfLinkMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
            'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {xtrfLinkMessage.text}
          </div>
        )}

        {/* Original project number note */}
        {order.xtrf_project_original_number && (
          <div className="text-xs text-gray-500 mb-2">
            Originally linked to <span className="font-mono">{order.xtrf_project_original_number}</span>
          </div>
        )}

          {/* Project cost — only show if data available */}
          {order.xtrf_project_total_agreed != null && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">Client Total</span>
              <span className="text-sm font-medium text-gray-900">
                {order.xtrf_project_total_agreed.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
              </span>
            </div>
          )}
          {order.xtrf_project_total_cost != null && order.xtrf_project_total_cost > 0 && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">Vendor Cost</span>
              <span className="text-sm text-gray-700">
                {order.xtrf_project_total_cost.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
              </span>
            </div>
          )}
          {order.xtrf_project_total_agreed != null && order.xtrf_project_total_cost != null && order.xtrf_project_total_cost > 0 && (() => {
            const profit = order.xtrf_project_total_agreed - order.xtrf_project_total_cost;
            const roi = (profit / order.xtrf_project_total_cost) * 100;
            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Profit</span>
                  <span className={`text-sm font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {profit.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">ROI</span>
                  <span className={`text-sm font-medium ${roi >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {roi.toFixed(1)}%
                  </span>
                </div>
              </>
            );
          })()}

          {order.xtrf_project_id && (
          <div>
          <div className="border-t border-blue-200 my-3" />

          {/* XTRF Invoice */}
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">XTRF Invoice</p>

          {order.xtrf_invoice_number ? (
            /* Invoice exists */
            <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Invoice</span>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="text-sm font-mono text-gray-900">{order.xtrf_invoice_number}</span>
                <XtrfInvoiceStatusBadge status={order.xtrf_invoice_status} />
                <XtrfPaymentStatusBadge status={order.xtrf_invoice_payment_status} />
                <a
                  href={`https://cethos.s.xtrf.us/xtrf/faces/customerInvoice/form.seam?action=edit&id=${order.xtrf_invoice_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Open ↗
                </a>
                <button
                  onClick={handleRefreshXtrfInvoice}
                  disabled={refreshingXtrfInvoice}
                  title="Fetch latest invoice status from XTRF"
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-1"
                >
                  {refreshingXtrfInvoice ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {xtrfRefreshMessage && (
              <p className="mt-1 text-xs text-gray-500 text-right">{xtrfRefreshMessage}</p>
            )}
            </>
          ) : (
            /* No invoice yet */
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Invoice</span>
              <span className="text-sm text-gray-400 italic">Not created</span>
            </div>
          )}

          {/* Create Invoice button — show when no invoice exists */}
          {!order.xtrf_invoice_number && (
            <div className="mt-3">
              {/* Open project warning */}
              {order.xtrf_project_status === 'OPENED' && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                  ⚠️ Project is still <strong>Open</strong> in XTRF. Best practice is to close it before invoicing. You can still proceed.
                </p>
              )}
              <button
                onClick={handleCreateXtrfInvoice}
                disabled={creatingXtrfInvoice}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {creatingXtrfInvoice ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Syncing & Creating…
                  </>
                ) : (
                  'Create XTRF Invoice'
                )}
              </button>
              {order.xtrf_invoice_id && !order.xtrf_invoice_number && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={handleRefreshXtrfInvoice}
                    disabled={refreshingXtrfInvoice}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    {refreshingXtrfInvoice ? (
                      <>
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Checking XTRF…
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Check if Ready
                      </>
                    )}
                  </button>
                  <span className="text-xs text-gray-400">Invoice created in XTRF, awaiting accountant approval</span>
                </div>
              )}
              {xtrfRefreshMessage && !order.xtrf_invoice_number && (
                <p className="mt-1 text-xs text-gray-500">{xtrfRefreshMessage}</p>
              )}
            </div>
          )}

          {/* Feedback message */}
          {xtrfInvoiceMessage && (
            <div className={`mt-2 text-xs rounded-lg px-3 py-2 ${
              xtrfInvoiceMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
              xtrfInvoiceMessage.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
              xtrfInvoiceMessage.type === 'error'   ? 'bg-red-50 text-red-700 border border-red-200' :
              'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {xtrfInvoiceMessage.text}
            </div>
          )}
          </div>)}
      </div>

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

          {/* PO & Project Number */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-400" />
              PO & Project Reference
            </h2>

            <div className="grid grid-cols-2 gap-4">
              {/* PO Number */}
              <div>
                <p className="text-sm text-gray-500 mb-1">PO Number</p>
                {editingPO ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={poValue}
                      onChange={(e) => setPoValue(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter PO number"
                      autoFocus
                    />
                    <button
                      onClick={handleSavePO}
                      disabled={savingPO}
                      className="text-green-600 hover:text-green-800 text-sm font-medium"
                    >
                      {savingPO ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingPO(false)}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {order.po_number ? (
                      <p className="font-medium">{order.po_number}</p>
                    ) : (order.customer as any)?.requires_po ? (
                      <span className="text-amber-600 text-sm flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        PO required for invoicing
                      </span>
                    ) : (
                      <p className="text-gray-400 text-sm">Not set</p>
                    )}
                    <button
                      onClick={() => {
                        setPoValue(order.po_number || "");
                        setEditingPO(true);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                      title="Edit PO number"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Project Number */}
              <div>
                <p className="text-sm text-gray-500 mb-1">Project #</p>
                {editingProject ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={projectValue}
                      onChange={(e) => setProjectValue(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter project number"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveProject}
                      disabled={savingProject}
                      className="text-green-600 hover:text-green-800 text-sm font-medium"
                    >
                      {savingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingProject(false)}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {order.client_project_number ? (
                      <p className="font-medium">{order.client_project_number}</p>
                    ) : (order.customer as any)?.requires_client_project_number ? (
                      <span className="text-amber-600 text-sm flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Project # required for invoicing
                      </span>
                    ) : (
                      <p className="text-gray-400 text-sm">Not set</p>
                    )}
                    <button
                      onClick={() => {
                        setProjectValue(order.client_project_number || "");
                        setEditingProject(true);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                      title="Edit project number"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
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
              <div>
                <p className="text-sm text-gray-500">Intended Use</p>
                <p className="font-medium">{order.quote?.intended_use?.name || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Certification Type</p>
                <p className="font-medium">
                  {order.quote?.intended_use?.default_certification_type?.name || "—"}
                </p>
              </div>
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
                      {doc.quote_file?.storage_path && (
                        <button
                          onClick={() => handleDownloadFile(doc.quote_file)}
                          className="ml-2 p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors flex-shrink-0"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
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
                                {file._chunk_count > 1 &&
                                  ` • ${file._chunk_count} ${isPdfFile(file) ? "chunks" : "parts"}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {file.is_combined && sourceFileMap[file.id]?.length > 0 && (
                              <button
                                onClick={() => setOriginalsModalFile(file)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-700 border border-purple-300 rounded hover:bg-purple-50 transition-colors"
                                title="View original source files"
                              >
                                <Layers className="w-3.5 h-3.5" />
                                View {file.combined_from_count || sourceFileMap[file.id].length} originals
                              </button>
                            )}
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
                          <div key={file.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200 overflow-hidden">
                            <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto overflow-hidden">
                              {file.review_status === "pending_review" && (
                                <input
                                  type="checkbox"
                                  checked={selectedDraftFileIds.includes(file.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedDraftFileIds(prev => [...prev, file.id]);
                                    } else {
                                      setSelectedDraftFileIds(prev => prev.filter(id => id !== file.id));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 flex-shrink-0"
                                />
                              )}
                              <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <FileText className="w-4 h-4 text-amber-700" />
                              </div>
                              <div className="min-w-0 overflow-hidden">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.original_filename}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap min-w-0">
                                  {file.review_version && (
                                    <span className="text-xs text-gray-500">v{file.review_version}</span>
                                  )}
                                  <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded-full whitespace-nowrap flex-shrink-0 ${
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
                                  <span className="text-xs text-gray-400 whitespace-nowrap">
                                    {format(new Date(file.created_at), "MMM d, h:mm a")}
                                  </span>
                                </div>
                                {file.review_comment && (
                                  <p className="text-xs text-red-600 mt-1 italic break-words w-full">"{file.review_comment}"</p>
                                )}
                                {file.staff_notes && (
                                  <p className="text-xs text-blue-600 mt-1 break-words w-full">Staff note: {file.staff_notes}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
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
                                <>
                                  <button
                                    onClick={() => setShowApproveOnBehalfModal(file.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
                                    title="Approve on behalf of customer"
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => setShowChangesOnBehalfModal(file.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-md hover:bg-amber-200 transition-colors"
                                    title="Request changes on behalf of customer"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    Changes
                                  </button>
                                  <button
                                    onClick={() => handleRemindCustomer(file.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                                    title="Resend review notification"
                                  >
                                    <Send className="w-3 h-3" />
                                    Remind
                                  </button>
                                </>
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

                {/* Send Selected Drafts to Customer Button */}
                {orderFiles.some(f => f.category_slug === "draft_translation" && f.is_staff_created && f.review_status === "pending_review") && (
                  <div className="pt-1">
                    <button
                      onClick={() => {
                        setSendModalType("draft");
                        setSendModalNotes("");
                        setSendModalOpen(true);
                      }}
                      disabled={selectedDraftFileIds.length === 0}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        selectedDraftFileIds.length === 0
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-teal-600 text-white hover:bg-teal-700"
                      }`}
                    >
                      <Send className="w-4 h-4" />
                      {selectedDraftFileIds.length > 0
                        ? `Send ${selectedDraftFileIds.length} Selected to Customer`
                        : "Send Selected to Customer"}
                    </button>
                  </div>
                )}

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
                              <input
                                type="checkbox"
                                checked={selectedFinalFileIds.includes(file.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedFinalFileIds(prev => [...prev, file.id]);
                                  } else {
                                    setSelectedFinalFileIds(prev => prev.filter(id => id !== file.id));
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 flex-shrink-0"
                              />
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
                      {/* Send Files to Customer Button */}
                      <div style={{ marginTop: "12px" }}>
                        <button
                          onClick={() => {
                            setSendModalType("final");
                            setSendModalNotes("");
                            setSendModalOpen(true);
                          }}
                          disabled={isSendingEmail}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                          {selectedFinalFileIds.length > 0
                            ? `Send ${selectedFinalFileIds.length} Selected File(s) to Customer`
                            : "Send All Files to Customer"}
                        </button>
                        {order.delivery_email_sent_at && (
                          <p className="text-xs text-gray-400 text-center mt-1.5">
                            Last sent: {format(new Date(order.delivery_email_sent_at), "MMM d, yyyy h:mm a")}
                          </p>
                        )}
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

          {/* Workflow / Finance Tab Bar */}
          <div className="bg-white rounded-lg border">
            <div className="flex border-b border-gray-200 px-2">
              {([
                { key: "workflow" as const, label: "Workflow" },
                { key: "finance" as const, label: "Finance" },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveMainTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeMainTab === tab.key
                      ? "border-blue-600 text-blue-600 font-semibold"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content: Finance */}
          {activeMainTab === "finance" && (
            <>
              <OrderFinanceTab workflowData={workflowData} onRefresh={() => setWorkflowRefreshKey(k => k + 1)} />
              {id && order?.customer_id && currentStaff?.staffId && (
                <div className="mt-4">
                  <OrderInvoiceCard
                    orderId={id}
                    customerId={order.customer_id}
                    staffId={currentStaff.staffId}
                  />
                </div>
              )}
            </>
          )}

          {/* Tab Content: Workflow (also renders when finance tab is active but hidden, to keep data loaded) */}
          <div className={activeMainTab !== "workflow" ? "hidden" : ""}>
            {id && <OrderWorkflowSection orderId={id} onWorkflowLoaded={setWorkflowData} refreshKey={workflowRefreshKey} />}
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
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                    // Enter without modifier = normal newline (no preventDefault)
                  }}
                  placeholder={order?.customer?.full_name ? `Message ${order.customer.full_name}...` : "Type a message..."}
                  rows={1}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3.5 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none overflow-hidden bg-gray-50 focus:bg-white transition-colors placeholder:text-gray-400"
                  style={{ minHeight: "38px", maxHeight: "160px" }}
                />

                {/* Send button */}
                <button
                  onClick={handleSendMessage}
                  disabled={(!newMessage.trim() && !attachmentFile) || sendingMessage}
                  className="flex-shrink-0 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                  title="Send (Ctrl+Enter)"
                >
                  {sendingMessage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>

              <p className="text-[11px] text-gray-400 mt-1.5 px-1 text-right">
                {typeof navigator !== 'undefined' && (navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac')) ? '⌘' : 'Ctrl'}+Enter to send · Customer receives an email notification
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Truck className="h-5 w-5 text-gray-400" /> Delivery
              </h2>
              <button
                onClick={() => setIsDeliveryEditing(!isDeliveryEditing)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                title={isDeliveryEditing ? "Lock" : "Edit"}
              >
                {isDeliveryEditing ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              </button>
            </div>

            {!isDeliveryEditing ? (
              /* ── Read-only display ── */
              <div className="space-y-3">
                {/* Turnaround Speed */}
                <div>
                  <p className="text-sm text-gray-500">Turnaround Speed</p>
                  <p className="font-medium text-gray-900 flex items-center gap-2">
                    {(() => {
                      const tt = order.quote?.turnaround_type;
                      const rush = order.quote?.is_rush ?? order.is_rush;
                      if (tt === "same_day") return "Same-Day (2.0×)";
                      if (tt === "rush" || rush) return "Rush (1.3×)";
                      return "Standard";
                    })()}
                    {(order.quote?.turnaround_type === "rush" || order.quote?.turnaround_type === "same_day" || order.quote?.is_rush || order.is_rush) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <Zap className="w-3 h-3" /> Rush
                      </span>
                    )}
                  </p>
                </div>

                {/* Physical Delivery */}
                <div>
                  <p className="text-sm text-gray-500">Physical Delivery</p>
                  <p className="font-medium text-gray-900">{physicalDelivery?.name || "—"}</p>
                </div>

                {/* Digital Delivery */}
                <div>
                  <p className="text-sm text-gray-500">Digital Delivery</p>
                  <p className="font-medium text-gray-900">
                    {digitalDeliveries.length > 0
                      ? digitalDeliveries.map((d: any) => d.name).join(", ")
                      : "None selected"}
                  </p>
                </div>

                {/* Pickup Location (if physical delivery is Pickup) */}
                {(physicalDelivery?.code === "pickup" || physicalDelivery?.name?.toLowerCase() === "pickup") && pickupLocation && (
                  <div>
                    <p className="text-sm text-gray-500">Pickup Location</p>
                    <div className="font-medium text-gray-900 space-y-0.5">
                      <p>{pickupLocation.name}</p>
                      <p className="text-sm text-gray-600">{pickupLocation.address_line1}</p>
                      <p className="text-sm text-gray-600">
                        {pickupLocation.city}, {pickupLocation.state} {pickupLocation.postal_code}
                      </p>
                      {pickupLocation.phone && (
                        <p className="text-sm text-gray-600 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {pickupLocation.phone}
                        </p>
                      )}
                      {pickupLocation.hours && (
                        <p className="text-sm text-gray-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {pickupLocation.hours}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Shipping Address (JSONB) */}
                {order.quote?.shipping_address && (
                  <div>
                    <p className="text-sm text-gray-500">Shipping Address</p>
                    <div className="font-medium text-gray-900 space-y-0.5">
                      {order.quote.shipping_address.line1 && (
                        <p className="text-sm text-gray-600">{order.quote.shipping_address.line1}</p>
                      )}
                      {order.quote.shipping_address.line2 && (
                        <p className="text-sm text-gray-600">{order.quote.shipping_address.line2}</p>
                      )}
                      <p className="text-sm text-gray-600">
                        {[
                          order.quote.shipping_address.city,
                          order.quote.shipping_address.state,
                          order.quote.shipping_address.postal_code,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Delivery Fee */}
                <div>
                  <p className="text-sm text-gray-500">Delivery Fee</p>
                  <p className="font-medium text-gray-900">
                    ${Number(order.quote?.delivery_fee ?? order.delivery_fee ?? 0).toFixed(2)}
                  </p>
                </div>

                {/* Promised Delivery */}
                <div>
                  <p className="text-sm text-gray-500">Promised Delivery</p>
                  <p className="font-medium text-gray-900">
                    {promisedDeliveryDate
                      ? format(new Date(promisedDeliveryDate + "T00:00:00"), "MMMM d, yyyy")
                      : "—"}
                  </p>
                </div>

                {/* Actual Delivery */}
                <div>
                  <p className="text-sm text-gray-500">Actual Delivery</p>
                  {order.actual_delivery_date ? (
                    <p className="font-medium text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      {format(new Date(order.actual_delivery_date), "MMMM d, yyyy")}
                    </p>
                  ) : (
                    <p className="font-medium text-gray-900">—</p>
                  )}
                </div>
              </div>
            ) : (
              /* ── Edit mode ── */
              <div className="space-y-3">
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

                {/* Promised Delivery Date */}
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

                {/* Actual Delivery Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Actual Delivery Date
                  </label>
                  <input
                    type="date"
                    value={order.actual_delivery_date || ""}
                    disabled
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50"
                  />
                </div>

                {/* Tracking Number */}
                {order.tracking_number !== undefined && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tracking Number
                    </label>
                    <input
                      type="text"
                      value={order.tracking_number || ""}
                      disabled
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50"
                    />
                  </div>
                )}

                {/* Close edit mode button */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setIsDeliveryEditing(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
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
                const activityLabelMap: Record<string, string> = {
                  deliver_final: "Final files uploaded",
                  send_delivery_email: "Delivery email sent to customer",
                  send_message: "Message sent to customer",
                  payment_recorded: "Payment recorded",
                  send_quote_link_email: "Quote link sent to customer",
                  send_payment_email: "Payment link sent to customer",
                  submit_for_review: "Draft sent for customer review",
                  draft_approved_on_behalf: "Draft approved by customer",
                  changes_requested_on_behalf: "Changes requested by customer",
                  order_status_changed: "Order status changed",
                  order_work_status_changed: "Work status changed",
                  order_payment_recorded: "Payment recorded",
                  delivery_date_updated: "Delivery date updated",
                  file_uploaded: "File uploaded",
                };

                activityLog.forEach((entry) => {
                  const actionType = entry.activity_type || entry.action_type || "";
                  const label = activityLabelMap[actionType]
                    || actionType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                    || "Activity";

                  let detailsStr: string | undefined;
                  const d = entry.details || {};

                  switch (actionType) {
                    case "deliver_final": {
                      const parts: string[] = [];
                      if (d.order_number) parts.push(`Order: ${d.order_number}`);
                      if (d.invoice_number) parts.push(`Invoice: ${d.invoice_number}`);
                      detailsStr = parts.length > 0 ? parts.join("\n") : undefined;
                      break;
                    }
                    case "send_delivery_email": {
                      const parts: string[] = [];
                      if (d.files_sent) parts.push(`Files sent: ${d.files_sent}`);
                      if (d.customer_email) parts.push(`Sent to: ${d.customer_email}`);
                      detailsStr = parts.length > 0 ? parts.join("\n") : undefined;
                      break;
                    }
                    case "send_message": {
                      if (d.message_preview) {
                        const preview = String(d.message_preview);
                        detailsStr = preview.length > 80 ? preview.substring(0, 80) + "..." : preview;
                      }
                      break;
                    }
                    case "payment_recorded": {
                      const parts: string[] = [];
                      if (d.order_number) parts.push(`Order: ${d.order_number}`);
                      if (d.amount_paid != null) parts.push(`Amount paid: $${d.amount_paid}`);
                      if (d.balance_due != null) parts.push(`Balance due: $${d.balance_due}`);
                      detailsStr = parts.length > 0 ? parts.join("\n") : undefined;
                      break;
                    }
                    case "send_quote_link_email":
                    case "send_payment_email": {
                      const parts: string[] = [];
                      if (d.quote_number) parts.push(`Quote: ${d.quote_number}`);
                      if (d.customer_email) parts.push(`Sent to: ${d.customer_email}`);
                      detailsStr = parts.length > 0 ? parts.join("\n") : undefined;
                      break;
                    }
                    case "submit_for_review": {
                      if (d.files_in_email) {
                        detailsStr = `Files in email: ${d.files_in_email}`;
                      }
                      break;
                    }
                    case "draft_approved_on_behalf":
                    case "changes_requested_on_behalf":
                      break;
                    default: {
                      if (entry.details && typeof entry.details === "object") {
                        const parts: string[] = [];
                        for (const [key, val] of Object.entries(entry.details)) {
                          if (key.endsWith("_id") || key.endsWith("_ids")) continue;
                          if (val == null || typeof val === "boolean" || val === "") continue;
                          parts.push(`${key.replace(/_/g, " ")}: ${val}`);
                        }
                        detailsStr = parts.length > 0 ? parts.join("\n") : undefined;
                      }
                      break;
                    }
                  }

                  entries.push({
                    id: `activity-${entry.id}`,
                    date: new Date(entry.created_at),
                    label,
                    detail: entry.staff_users?.full_name || "Staff",
                    detailsJson: detailsStr,
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

      {/* Activity Timeline */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-400" />
          Activity Timeline
        </h2>

        {timelineLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-4 animate-pulse">
                <div className="w-3 h-3 rounded-full bg-gray-200 mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
                <div className="h-3 bg-gray-100 rounded w-24" />
              </div>
            ))}
          </div>
        ) : timelineEvents.length === 0 ? (
          <p className="text-sm text-gray-500">No activity recorded yet</p>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[5px] top-3 bottom-3 w-px bg-gray-200" />

            <div className="space-y-0">
              {timelineEvents.map((event) => {
                const iconColor: Record<string, string> = {
                  green: "text-green-500",
                  blue: "text-blue-500",
                  teal: "text-teal-500",
                  red: "text-red-500",
                  purple: "text-purple-500",
                  gray: "text-gray-400",
                };
                const dotColor: Record<string, string> = {
                  green: "bg-green-500",
                  blue: "bg-blue-500",
                  teal: "bg-teal-500",
                  red: "bg-red-500",
                  purple: "bg-purple-500",
                  gray: "bg-gray-400",
                };
                const IconMap: Record<string, any> = {
                  ShoppingCart,
                  RefreshCw,
                  Send,
                  DollarSign,
                  MessageSquare,
                  Package,
                  XCircle,
                  Mail,
                  FileText,
                  CreditCard,
                  RotateCcw,
                  Clock,
                };
                const IconComponent = IconMap[event.icon] || Clock;

                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 py-2.5 relative text-sm"
                  >
                    <div
                      className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 z-10 ${
                        dotColor[event.color] || "bg-gray-400"
                      }`}
                    />
                    <div className="min-w-0 flex-1 flex items-start gap-2">
                      <IconComponent
                        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                          iconColor[event.color] || "text-gray-400"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{event.label}</p>
                        {event.detail && (
                          <p
                            className={`text-xs text-gray-500 mt-0.5 ${
                              event.mono ? "font-mono" : ""
                            }`}
                          >
                            {event.detail}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                      {format(event.timestamp, "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
              // Refresh order data first, then show balance resolution modal only if actual payment difference exists
              fetchOrderDetails().then(() => {
                // Check actual difference between amount paid and new total
                const amountPaid = order.amount_paid || 0;
                const actualDiff = Math.abs(amountPaid - newTotal);
                if (actualDiff > 0.01) {
                  setShowBalanceResolutionModal(true);
                }
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

      {/* Send Confirmation Modal */}
      {sendModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onClick={() => !isSendingEmail && (setSendModalOpen(false), setSendModalNotes(""))}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[90vw] p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {sendModalType === "draft"
                ? "Send Draft Files to Customer"
                : "Send Certified Translation to Customer"}
            </h3>

            {/* Files to send */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Files to send:</p>
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 max-h-[160px] overflow-y-auto">
                {sendModalType === "draft" ? (
                  <ul className="space-y-1">
                    {selectedDraftFileIds.map(fid => {
                      const file = orderFiles.find(f => f.id === fid);
                      return (
                        <li key={fid} className="flex items-center gap-2 text-sm text-gray-700">
                          <FileText className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          <span className="truncate">{file?.original_filename || fid}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : selectedFinalFileIds.length > 0 ? (
                  <ul className="space-y-1">
                    {selectedFinalFileIds.map(fid => {
                      const file = orderFiles.find(f => f.id === fid);
                      return (
                        <li key={fid} className="flex items-center gap-2 text-sm text-gray-700">
                          <FileText className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                          <span className="truncate">{file?.original_filename || fid}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 italic">All final delivery files</p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="mb-4">
              <textarea
                placeholder="Add a note to the customer (optional)"
                value={sendModalNotes}
                onChange={(e) => setSendModalNotes(e.target.value)}
                rows={3}
                style={{ width: "100%", resize: "vertical" }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">This note will appear in the email.</p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { if (!isSendingEmail) { setSendModalOpen(false); setSendModalNotes(""); } }}
                disabled={isSendingEmail}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSend}
                disabled={isSendingEmail}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {isSendingEmail ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Upload Modal */}
      {showUploadModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onClick={() => !uploading && !isDelivering && setShowUploadModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-[520px] max-w-[90vw] p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {uploadType === "draft" ? "Upload Draft Translation" :
               uploadType === "final" ? "Upload Final Deliverable" : "Upload File"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {uploadType === "draft"
                ? "Upload drafts for customer review. Customer will be notified via email."
                : uploadType === "final"
                ? "Upload the certified final translations for customer download."
                : "Upload supporting files for this order."}
            </p>

            {/* File drop zone */}
            <label
              className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-6 cursor-pointer mb-4 transition-colors hover:border-blue-400"
              style={{ background: uploadFiles.length > 0 ? "rgba(79,140,255,0.04)" : "#f9fafb" }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const droppedFiles = Array.from(e.dataTransfer.files);
                setUploadFiles(prev => [
                  ...prev,
                  ...droppedFiles.map(f => ({ file: f, status: "pending" as const })),
                ]);
              }}
            >
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
                multiple
                onChange={e => {
                  const selected = Array.from(e.target.files || []);
                  setUploadFiles(prev => [
                    ...prev,
                    ...selected.map(f => ({ file: f, status: "pending" as const })),
                  ]);
                  e.target.value = "";
                }}
              />
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <p className="text-sm font-semibold text-gray-900">Drop files here or click to browse</p>
              <p className="text-xs text-gray-500 mt-1">PDF, DOCX, JPG, PNG — Max 10 MB each</p>
            </label>

            {/* Selected file list */}
            {uploadFiles.length > 0 && (
              <div className="mb-4 max-h-[180px] overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {uploadFiles.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.status === "uploading" ? (
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
                      ) : item.status === "done" ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : item.status === "failed" ? (
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      <span className="text-sm text-gray-900 truncate">{item.file.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {(item.file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                    {item.status === "pending" && !uploading && (
                      <button
                        onClick={() => setUploadFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {item.status === "failed" && (
                      <span className="text-xs text-red-500 flex-shrink-0">Failed</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Draft notification callout */}
            {uploadType === "draft" && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 mb-4">
                <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>This will set each file to <strong>Pending Review</strong>. Use the "Send Selected to Customer" button to notify the customer via email.</span>
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
                onClick={() => { setShowUploadModal(false); setUploadFiles([]); setUploadStaffNotes(""); }}
                disabled={uploading || isDelivering}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleFileUpload}
                disabled={uploading || isDelivering || uploadFiles.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isDelivering
                  ? "Delivering..."
                  : uploading
                  ? "Uploading..."
                  : uploadType === "draft"
                  ? `Upload Draft${uploadFiles.length > 1 ? ` (${uploadFiles.length})` : ""}`
                  : `Upload${uploadFiles.length > 1 ? ` (${uploadFiles.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve on Behalf Modal */}
      {showApproveOnBehalfModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onClick={() => !processingOnBehalf && setShowApproveOnBehalfModal(null)}
        >
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-[440px] max-w-[90vw] p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Approve on Behalf of Customer</h3>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 mb-4">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Confirm you have received customer approval via phone or email before proceeding.</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowApproveOnBehalfModal(null)}
                disabled={processingOnBehalf}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApproveOnBehalf(showApproveOnBehalfModal)}
                disabled={processingOnBehalf}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {processingOnBehalf ? "Processing..." : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Changes on Behalf Modal */}
      {showChangesOnBehalfModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onClick={() => !processingOnBehalf && setShowChangesOnBehalfModal(null)}
        >
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[90vw] p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Request Changes on Behalf of Customer</h3>
            <p className="text-sm text-gray-500 mb-4">Enter the customer's feedback or change request below.</p>
            <textarea
              value={onBehalfComment}
              onChange={e => setOnBehalfComment(e.target.value)}
              placeholder="Describe the changes requested by the customer..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none mb-4"
              rows={4}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowChangesOnBehalfModal(null); setOnBehalfComment(""); }}
                disabled={processingOnBehalf}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRequestChangesOnBehalf(showChangesOnBehalfModal)}
                disabled={processingOnBehalf || !onBehalfComment.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {processingOnBehalf ? "Processing..." : "Submit Change Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Process Refund</h3>
              <p className="text-sm text-gray-500 mb-4">
                Refund to customer for order {order?.order_number}.
                Available: <span className="font-semibold text-amber-600">${overpaymentAmount.toFixed(2)} CAD</span>
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Refund Amount (CAD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      step="0.01"
                      min="0.01"
                      max={overpaymentAmount}
                      className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <input
                    type="text"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Overpayment refund"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {refundMessage && (
                <div className={`mt-3 text-xs rounded-lg px-3 py-2 ${refundMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {refundMessage.text}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-100">
              <button
                onClick={() => { setShowRefundModal(false); setRefundMessage(null); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessRefund}
                disabled={processingRefund || !refundAmount || parseFloat(refundAmount) <= 0 || parseFloat(refundAmount) > overpaymentAmount + 0.01}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {processingRefund ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Processing…
                  </span>
                ) : `Refund $${parseFloat(refundAmount || '0').toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Originals Modal for combined files */}
      {originalsModalFile && order?.quote_id && (
        <OriginalsModal
          isOpen={!!originalsModalFile}
          onClose={() => setOriginalsModalFile(null)}
          combinedFileName={originalsModalFile.original_filename}
          sourceFiles={sourceFileMap[originalsModalFile.id] || []}
          quoteId={order.quote_id}
        />
      )}
    </div>
  );
}

function XtrfInvoiceStatusBadge({ status }: { status?: string | null }) {
  const styles: Record<string, string> = {
    SENT:      "bg-green-100 text-green-700",
    READY:     "bg-blue-100 text-blue-700",
    NOT_READY: "bg-gray-100 text-gray-500",
    DRAFT:     "bg-yellow-100 text-yellow-700",
  };
  if (!status) return null;
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${styles[status] || "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

function XtrfPaymentStatusBadge({ status }: { status?: string | null }) {
  const styles: Record<string, string> = {
    FULLY_PAID:     "bg-green-100 text-green-700",
    PARTIALLY_PAID: "bg-amber-100 text-amber-700",
    NOT_PAID:       "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    FULLY_PAID:     "Paid",
    PARTIALLY_PAID: "Partial",
    NOT_PAID:       "Unpaid",
  };
  if (!status) return null;
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${styles[status] || "bg-gray-100 text-gray-500"}`}>
      {labels[status] || status}
    </span>
  );
}

function XtrfProjectStatusBadge({ status }: { status?: string | null }) {
  const cfg: Record<string, { style: string; label: string }> = {
    OPENED:    { style: 'bg-blue-100 text-blue-700',   label: 'Open' },
    CLOSED:    { style: 'bg-green-100 text-green-700', label: 'Closed' },
    CANCELLED: { style: 'bg-red-100 text-red-700',     label: 'Cancelled' },
  };
  if (!status) return null;
  const { style, label } = cfg[status] ?? { style: 'bg-gray-100 text-gray-500', label: status };
  return <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${style}`}>{label}</span>;
}
