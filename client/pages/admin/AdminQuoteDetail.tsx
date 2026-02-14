import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Award,
  Building,
  Calculator,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Languages,
  Mail,
  MapPin,
  MessageSquare,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Truck,
  User,
  X,
  Zap,
  FileSearch,
  Paperclip,
  LinkIcon,
  UserCheck,
  CheckCircle,
  Percent,
  Activity,
  StickyNote,
  HelpCircle,
  FileEdit,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import MessageCustomerModal from "../../components/admin/MessageCustomerModal";
import OcrAnalysisModal from "../../components/admin/OcrAnalysisModal";
import { logQuoteActivity } from "../../utils/quoteActivityLog";

interface QuoteDetail {
  id: string;
  quote_number: string;
  status: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  customer_id: string;
  customer?: {
    id: string;
    email: string;
    full_name: string;
    phone: string;
    customer_type: string;
    company_name: string;
  };
  quote_source?: { id: string; code: string; name: string };
  source_language?: { id: string; name: string; code: string };
  target_language?: { id: string; name: string; code: string };
  country_of_issue: string;
  special_instructions: string;
  subtotal: number;
  certification_total: number;
  rush_fee: number;
  delivery_fee: number;
  tax_rate_id: string | null;
  tax_amount: number;
  tax_rate: number;
  total: number;
  is_rush: boolean;
  delivery_option?: {
    id: string;
    name: string;
    price?: number;
    description?: string;
  };
  physical_delivery_option?: { id: string; name: string; price?: number };
  estimated_delivery_date: string;
  turnaround_days: number;
  hitl_required: boolean;
  hitl_reason: string;
  turnaround_type: string | null;
  turnaround_option_id: string | null;
  promised_delivery_date: string | null;
  physical_delivery_option_id: string | null;
  shipping_address: any;
  billing_address: any;
  service_province: string;
  digital_delivery_options?: string[] | null;
  intended_use?: { id: string; name: string } | null;
  pickup_location?: {
    id: string;
    name: string;
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    phone?: string;
    hours?: string;
  } | null;
  payment_method?: { id: string; name: string; code: string } | null;
  payment_confirmed_by?: { id: string; full_name: string } | null;
  payment_confirmed_at?: string | null;
  processing_status?: string;
  review_required_reasons?: string[];
  customer_note?: string;
  manual_quote_notes?: string;
  calculated_totals?: {
    translation_total?: number;
    doc_certification_total?: number;
    quote_certification_total?: number;
    certification_total?: number;
    subtotal?: number;
    adjustments_total?: number;
    surcharge_total?: number;
    discount_total?: number;
    rush_fee?: number;
    delivery_fee?: number;
    tax_rate?: number;
    tax_amount?: number;
    total?: number;
  };
}

interface QuoteFile {
  id: string;
  original_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  upload_status: string;
  created_at: string;
}

interface NormalizedFile {
  id: string;
  displayName: string;
  storagePath: string;
  bucket: string;
  bucketPath: string;
  fileSize: number;
  mimeType: string;
  source: 'quote' | 'ocr';
  categoryId?: string | null;
}

interface AIAnalysis {
  id: string;
  quote_file_id: string;
  detected_document_type: string | null;
  detected_language: string | null;
  word_count: number | null;
  page_count: number | null;
  assessed_complexity: string | null;
  ocr_confidence: number | null;
  document_type_confidence: number | null;
  language_confidence: number | null;
  complexity_confidence: number | null;
  complexity_multiplier: number | null;
  billable_pages: number | null;
  base_rate: number | null;
  line_total: number | null;
  translation_cost: number | null;
  certification_cost: number | null;
}

interface HITLReview {
  id: string;
  status: string;
  trigger_reasons: string[];
  is_customer_requested: boolean;
  customer_note: string;
  assigned_to_id?: string | null;
  assigned_to_name: string;
  created_at: string;
  completed_at: string;
  resolution_notes: string;
  internal_notes?: string;
  escalation_reason?: string;
}

interface Message {
  id: string;
  sender_type: string;
  message_text: string;
  created_at: string;
  sender_name: string;
  read_by_customer_at?: string | null;
  read_by_staff_at?: string | null;
  staff_sender?: { full_name: string } | null;
  sender_customer?: { full_name: string } | null;
}

interface ActivityLogEntry {
  id: string;
  quote_id: string;
  staff_id: string | null;
  action_type: string;
  details: Record<string, any>;
  created_at: string;
  staff?: { full_name: string } | null;
}

interface DocumentCertification {
  id: string;
  quote_file_id: string;
  certification_type_id: string;
  is_primary: boolean;
  price: number;
  certification_types?: {
    id: string;
    code: string;
    name: string;
    price: number;
  };
}

interface QuoteCertificationItem {
  id: string;
  certification_type_id: string;
  price: number;
  quantity: number;
  name: string;
  code: string;
}

interface CertType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface QuoteAddress {
  id: string;
  quote_id: string;
  address_type: "billing" | "shipping";
  full_name: string;
  company_name?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  phone?: string;
}

interface QuoteAdjustment {
  id: string;
  quote_id: string;
  adjustment_type: "discount" | "surcharge";
  value_type: "fixed" | "percentage";
  value: number;
  calculated_amount: number;
  reason?: string;
  created_at: string;
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

interface DeliveryOptionItem {
  id: string;
  code: string;
  name: string;
  price: number;
  delivery_group: string;
  requires_address: boolean;
  is_always_selected: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  details_pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  quote_ready: "bg-green-100 text-green-700",
  in_review: "bg-amber-100 text-amber-700",
  revision_needed: "bg-orange-100 text-orange-700",
  awaiting_payment: "bg-teal-100 text-teal-700",
  expired: "bg-red-100 text-red-700",
  converted: "bg-purple-100 text-purple-700",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  details_pending: "Details Pending",
  processing: "Processing",
  quote_ready: "Quote Ready",
  in_review: "In Review",
  revision_needed: "Revision Needed",
  awaiting_payment: "Awaiting Payment",
  expired: "Expired",
  converted: "Converted",
};

// Helper function for expiry badge
const getExpiryBadge = (expiresAt: string | null) => {
  if (!expiresAt) return null;

  const expiry = new Date(expiresAt);
  const now = new Date();
  const daysUntil = Math.ceil(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysUntil < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
        <Clock className="w-3 h-3" />
        Expired
      </span>
    );
  } else if (daysUntil <= 7) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
        <Clock className="w-3 h-3" />
        {daysUntil}d left
      </span>
    );
  } else {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
        <Clock className="w-3 h-3" />
        {daysUntil}d left
      </span>
    );
  }
};

// Helper: extract clean filename from storage_path by stripping timestamp prefix
const extractFilename = (storagePath: string): string => {
  if (!storagePath) return 'Unknown file';
  const match = storagePath.match(/^\d+-[a-z0-9]+-(.+)$/);
  return match ? match[1].replace(/_/g, ' ') : storagePath;
};

interface NormalizedAddress {
  fullName: string;
  company: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone: string;
}

const normalizeAddress = (raw: any): NormalizedAddress | null => {
  if (!raw || typeof raw !== 'object') return null;

  // Name: Format A has firstName+lastName, Format B has full_name
  let fullName = '';
  if (raw.firstName || raw.lastName) {
    fullName = [raw.firstName, raw.lastName].filter(Boolean).join(' ');
  } else {
    fullName = raw.full_name || raw.name || '';
  }

  return {
    fullName,
    company: raw.company || raw.company_name || '',
    line1: raw.addressLine1 || raw.street_address || raw.address_line1 || raw.line1 || '',
    line2: raw.addressLine2 || raw.address_line2 || raw.line2 || '',
    city: raw.city || '',
    province: raw.state || raw.province || '',
    postalCode: raw.postalCode || raw.postal_code || '',
    country: raw.country || '',
    phone: raw.phone || '',
  };
};

const REFERENCE_CATEGORY_ID = "f1aed462-a25f-4dd0-96c0-f952c3a72950";

const REVIEW_REASON_LABELS: Record<string, { label: string; description: string; severity: 'error' | 'warning' }> = {
  ocr_failed: {
    label: "OCR Failed",
    description: "Document text extraction failed. The document may be corrupted, password-protected, or contain only images that couldn't be processed.",
    severity: "error",
  },
  ai_analysis_failed: {
    label: "AI Analysis Failed",
    description: "The AI could not classify this document. Manual review of document type, language, and complexity is required.",
    severity: "error",
  },
  low_ocr_confidence: {
    label: "Low OCR Confidence",
    description: "Text was extracted but with low confidence. The document may have poor image quality, handwriting, or unusual formatting. Word counts may be inaccurate.",
    severity: "warning",
  },
  low_ai_confidence: {
    label: "Low AI Confidence",
    description: "The AI classified this document but with low confidence. Please verify the document type, language, and complexity are correct.",
    severity: "warning",
  },
  multi_language_document: {
    label: "Multi-Language Document",
    description: "This document contains significant text in multiple languages. Verify which language content needs translation and check that word counts are correct.",
    severity: "warning",
  },
  file_too_large: {
    label: "File Too Large",
    description: "One or more pages were too large to process. The document may need to be split or rescanned at lower resolution.",
    severity: "error",
  },
  file_unreadable: {
    label: "File Unreadable",
    description: "The document could not be opened. It may be encrypted, password-protected, or corrupted.",
    severity: "error",
  },
  unsupported_format: {
    label: "Unsupported Format",
    description: "One or more files are in an unsupported format and could not be processed.",
    severity: "error",
  },
  processing_error: {
    label: "Processing Error",
    description: "An unexpected error occurred during processing. The document may need to be reprocessed or manually reviewed.",
    severity: "error",
  },
};

export default function AdminQuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [files, setFiles] = useState<QuoteFile[]>([]);
  const [normalizedFiles, setNormalizedFiles] = useState<NormalizedFile[]>([]);
  const [analysis, setAnalysis] = useState<AIAnalysis[]>([]);
  const [hitlReviews, setHitlReviews] = useState<HITLReview[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationMessages, setConversationMessages] = useState<any[]>([]);
  const [certifications, setCertifications] = useState<DocumentCertification[]>([]);
  const [addresses, setAddresses] = useState<QuoteAddress[]>([]);
  const [adjustments, setAdjustments] = useState<QuoteAdjustment[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [unreadStaffCount, setUnreadStaffCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showResendModal, setShowResendModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<NormalizedFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [resendCustomMessage, setResendCustomMessage] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [taxRates, setTaxRates] = useState<Array<{
    id: string;
    region_code: string;
    region_name: string;
    tax_name: string;
    rate: number;
  }>>([]);
  const [isSavingTax, setIsSavingTax] = useState(false);
  const [turnaroundOptions, setTurnaroundOptions] = useState<TurnaroundOption[]>([]);
  const [isSavingTurnaround, setIsSavingTurnaround] = useState(false);
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState("");
  const [isSavingPromisedDate, setIsSavingPromisedDate] = useState(false);
  const [deliveryOptionsList, setDeliveryOptionsList] = useState<DeliveryOptionItem[]>([]);
  const [selectedDeliveryOptionId, setSelectedDeliveryOptionId] = useState("");
  const [isSavingDelivery, setIsSavingDelivery] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<{
    line1: string; line2: string; city: string; province: string; postal_code: string; country: string;
  }>({ line1: "", line2: "", city: "", province: "", postal_code: "", country: "Canada" });
  const [isSavingShippingAddress, setIsSavingShippingAddress] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState<{
    type: 'surcharge' | 'discount';
    valueType: 'percentage' | 'fixed';
    value: string;
    reason: string;
  } | null>(null);
  const [isAddingAdjustment, setIsAddingAdjustment] = useState(false);
  const [removingAdjustmentId, setRemovingAdjustmentId] = useState<string | null>(null);

  // Quote Certifications state
  const [quoteCertifications, setQuoteCertifications] = useState<QuoteCertificationItem[]>([]);
  const [certTypes, setCertTypes] = useState<CertType[]>([]);
  const [quoteCertsExpanded, setQuoteCertsExpanded] = useState(true);
  const [addingCertId, setAddingCertId] = useState<string | null>(null);
  const [removingCertId, setRemovingCertId] = useState<string | null>(null);
  const [updatingCertId, setUpdatingCertId] = useState<string | null>(null);

  const { session: currentStaff } = useAdminAuthContext();

  // OCR Analysis modal state
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [hasBatch, setHasBatch] = useState(false);

  // Receive Payment modal state
  const [showReceivePaymentModal, setShowReceivePaymentModal] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; name: string; code: string }[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [selectedPaymentMethodCode, setSelectedPaymentMethodCode] = useState("");
  const [rpAmountPaid, setRpAmountPaid] = useState("");
  const [rpRemarks, setRpRemarks] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Activity Log, Notes, and enhanced Messages state
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [activityLogLoaded, setActivityLogLoaded] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [filesWithUrls, setFilesWithUrls] = useState<(NormalizedFile & { downloadUrl: string | null })[]>([]);

  const fetchQuoteFiles = async (quoteId: string): Promise<NormalizedFile[]> => {
    // Try quote_files first (customer upload route)
    const { data: quoteFiles, error: qfError } = await supabase
      .from('quote_files')
      .select('id, original_filename, storage_path, file_size, mime_type, category_id')
      .eq('quote_id', quoteId);

    if (!qfError && quoteFiles && quoteFiles.length > 0) {
      return quoteFiles.map(f => ({
        id: f.id,
        displayName: f.original_filename || f.storage_path,
        storagePath: f.storage_path,
        bucket: f.category_id === REFERENCE_CATEGORY_ID ? 'quote-reference-files' : 'quote-files',
        bucketPath: f.storage_path,
        fileSize: f.file_size || 0,
        mimeType: f.mime_type || 'application/pdf',
        source: 'quote' as const,
        categoryId: f.category_id,
      }));
    }

    // Fallback: check ocr_batch_files via ocr_batches
    const { data: ocrFiles, error: ocrError } = await supabase
      .from('ocr_batch_files')
      .select(`
        id, filename, original_filename, storage_path, file_size, mime_type,
        ocr_batches!inner(quote_id)
      `)
      .eq('ocr_batches.quote_id', quoteId)
      .in('status', ['completed', 'pending', 'processing']);

    if (!ocrError && ocrFiles && ocrFiles.length > 0) {
      return ocrFiles.map((f: any) => ({
        id: f.id,
        displayName: f.filename || f.original_filename || extractFilename(f.storage_path),
        storagePath: f.storage_path,
        bucket: 'ocr-uploads',
        bucketPath: f.storage_path,
        fileSize: f.file_size || 0,
        mimeType: f.mime_type || 'application/pdf',
        source: 'ocr' as const,
      }));
    }

    return [];
  };

  useEffect(() => {
    if (id) {
      fetchQuoteDetails();
    }
  }, [id]);

  // Fetch conversation messages for preview card once quote is loaded
  useEffect(() => {
    if (quote?.customer_id) {
      fetchConversationMessages();
    }
  }, [quote?.customer_id]);

  // Check if an OCR batch exists for this quote
  useEffect(() => {
    if (!id) return;
    const checkBatch = async () => {
      const { data } = await supabase
        .from("ocr_batches")
        .select("id")
        .eq("quote_id", id)
        .limit(1)
        .maybeSingle();
      setHasBatch(!!data);
    };
    checkBatch();
  }, [id]);

  const QUOTE_SELECT = `
    *,
    customer:customers(id, full_name, email, phone, customer_type),
    quote_source:quote_sources(id, code, name),
    source_language:languages!source_language_id(id, name, code, price_multiplier),
    target_language:languages!target_language_id(id, name, code),
    delivery_option:delivery_options!delivery_option_id(id, name, price, description),
    physical_delivery_option:delivery_options!physical_delivery_option_id(id, name, price),
    pickup_location:pickup_locations!selected_pickup_location_id(id, name, address_line1, city, state, postal_code, phone, hours),
    intended_use:intended_uses!intended_use_id(id, name),
    payment_method:payment_methods!payment_method_id(id, name, code),
    payment_confirmed_by:staff_users!payment_confirmed_by_staff_id(id, full_name)
  `;

  const refetchQuote = async () => {
    const { data: refreshedQuote } = await supabase
      .from("quotes")
      .select(QUOTE_SELECT)
      .eq("id", id)
      .single();
    if (refreshedQuote) {
      setQuote(refreshedQuote as QuoteDetail);
    }
  };

  const fetchQuoteDetails = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(QUOTE_SELECT)
        .eq("id", id)
        .single();

      if (quoteError) throw quoteError;
      setQuote(quoteData as QuoteDetail);

      // Fetch raw quote_files for certifications and analysis lookups
      const { data: filesData } = await supabase
        .from("quote_files")
        .select("*")
        .eq("quote_id", id)
        .order("sort_order");
      setFiles(filesData || []);

      // Fetch normalized files from both sources for display/download
      const normalized = await fetchQuoteFiles(id!);
      setNormalizedFiles(normalized);

      const { data: analysisData } = await supabase
        .from("ai_analysis_results")
        .select("*")
        .eq("quote_id", id);
      setAnalysis(analysisData || []);

      const { data: hitlData } = await supabase
        .from("hitl_reviews")
        .select(
          `
          *,
          assigned_to:staff_users!hitl_reviews_assigned_to_fkey(id, full_name)
        `,
        )
        .eq("quote_id", id)
        .order("created_at", { ascending: false });

      setHitlReviews(
        (hitlData || []).map((review: any) => ({
          ...review,
          assigned_to_id: review.assigned_to?.id || null,
          assigned_to_name: review.assigned_to?.full_name || "Unassigned",
        })),
      );

      const { data: messagesData } = await supabase
        .from("conversation_messages")
        .select(
          `
          id,
          conversation_id,
          quote_id,
          order_id,
          sender_type,
          sender_customer_id,
          sender_staff_id,
          message_type,
          message_text,
          read_by_customer_at,
          read_by_staff_at,
          source,
          created_at,
          sender_staff:staff_users!conversation_messages_sender_staff_id_fkey(full_name),
          sender_customer:customers!conversation_messages_sender_customer_id_fkey(full_name)
        `,
        )
        .eq("quote_id", id)
        .order("created_at", { ascending: true });

      setMessages(
        (messagesData || []).map((message: any) => ({
          ...message,
          sender_name:
            message.sender_type === "staff"
              ? message.sender_staff?.full_name || "Staff"
              : message.sender_type === "customer"
                ? message.sender_customer?.full_name || "Customer"
                : "System",
        })),
      );

      // Count unread messages (customer messages not yet read by staff)
      const { count: unread } = await supabase
        .from("conversation_messages")
        .select("id", { count: "exact", head: true })
        .eq("quote_id", id)
        .eq("sender_type", "customer")
        .is("read_by_staff_at", null);

      setUnreadStaffCount(unread || 0);

      // Fetch document certifications by quote_file_id (document_certifications doesn't have quote_id column)
      const fileIds = (filesData || []).map((f: any) => f.id);
      let certificationsData: any[] = [];
      if (fileIds.length > 0) {
        const { data } = await supabase
          .from("document_certifications")
          .select(
            `
            id,
            quote_file_id,
            certification_type_id,
            is_primary,
            price,
            certification_types(id, code, name, price)
          `,
          )
          .in("quote_file_id", fileIds);
        certificationsData = data || [];
      }
      setCertifications(certificationsData);

      // Addresses are stored as JSONB columns in quotes table, not in a separate table
      // Parse billing_address and shipping_address from quote data using normalizeAddress
      const addressesFromQuote: QuoteAddress[] = [];
      if (quoteData?.billing_address) {
        const norm = normalizeAddress(quoteData.billing_address);
        if (norm) {
          addressesFromQuote.push({
            id: 'billing',
            quote_id: id!,
            address_type: 'billing',
            full_name: norm.fullName,
            company_name: norm.company,
            address_line1: norm.line1,
            address_line2: norm.line2,
            city: norm.city,
            province: norm.province,
            postal_code: norm.postalCode,
            country: norm.country || 'Canada',
            phone: norm.phone,
          });
        }
      }
      if (quoteData?.shipping_address) {
        const norm = normalizeAddress(quoteData.shipping_address);
        if (norm) {
          addressesFromQuote.push({
            id: 'shipping',
            quote_id: id!,
            address_type: 'shipping',
            full_name: norm.fullName,
            company_name: norm.company,
            address_line1: norm.line1,
            address_line2: norm.line2,
            city: norm.city,
            province: norm.province,
            postal_code: norm.postalCode,
            country: norm.country || 'Canada',
            phone: norm.phone,
          });
        }
      }
      setAddresses(addressesFromQuote);

      // Fetch quote adjustments
      const { data: adjustmentsData } = await supabase
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", id)
        .order("created_at");
      setAdjustments(adjustmentsData || []);

      // Fetch quote-level certifications
      const { data: quoteCertsData } = await supabase
        .from("quote_certifications")
        .select(`
          id,
          certification_type_id,
          price,
          quantity,
          certification_types (name, code)
        `)
        .eq("quote_id", id);

      setQuoteCertifications(
        (quoteCertsData || []).map((qc: any) => ({
          id: qc.id,
          certification_type_id: qc.certification_type_id,
          price: qc.price,
          quantity: qc.quantity,
          name: qc.certification_types?.name || "Unknown",
          code: qc.certification_types?.code || "",
        }))
      );

      // Fetch certification types for dropdown
      const { data: certTypesData } = await supabase
        .from("certification_types")
        .select("id, code, name, price")
        .eq("is_active", true)
        .order("sort_order");
      setCertTypes(certTypesData || []);

      // Fetch active tax rates
      const { data: taxRatesData } = await supabase
        .from("tax_rates")
        .select("id, region_code, region_name, tax_name, rate")
        .eq("is_active", true)
        .order("region_name");
      setTaxRates(taxRatesData || []);

      // Fetch turnaround options from turnaround_options table
      const { data: turnaroundData } = await supabase
        .from("turnaround_options")
        .select("id, code, name, multiplier, fee_type, fee_value, estimated_days, is_default, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      setTurnaroundOptions(turnaroundData || []);

      // Fetch all active delivery options (digital + physical) for display and resolution
      const { data: deliveryData } = await supabase
        .from("delivery_options")
        .select("id, code, name, price, delivery_group, requires_address, is_always_selected")
        .eq("is_active", true)
        .order("sort_order");
      setDeliveryOptionsList(deliveryData || []);

      // Initialize promised delivery date — auto-populate from system estimate if not set
      setPromisedDeliveryDate(quoteData?.promised_delivery_date || quoteData?.estimated_delivery_date || "");

      // Initialize delivery option
      if (quoteData?.physical_delivery_option_id) {
        setSelectedDeliveryOptionId(quoteData.physical_delivery_option_id);
      } else {
        const defaultDelivery = (deliveryData || []).find((d: any) => d.is_always_selected);
        setSelectedDeliveryOptionId(defaultDelivery?.id || "");
      }

      // Initialize shipping address from normalized data
      if (quoteData?.shipping_address) {
        const norm = normalizeAddress(quoteData.shipping_address);
        if (norm) {
          setShippingAddress({
            line1: norm.line1,
            line2: norm.line2,
            city: norm.city,
            province: norm.province,
            postal_code: norm.postalCode,
            country: norm.country || "Canada",
          });
        }
      }

      if (quoteData?.status === "converted") {
        const { data: orderData } = await supabase
          .from("orders")
          .select("id")
          .eq("quote_id", id)
          .single();
        setOrderId(orderData?.id || null);
      }

      // Generate signed URLs for files
      const urlFiles = await Promise.all(
        normalized.map(async (file) => {
          const { data: signedUrl } = await supabase.storage
            .from(file.bucket)
            .createSignedUrl(file.bucketPath, 3600);
          return { ...file, downloadUrl: signedUrl?.signedUrl || null };
        })
      );
      setFilesWithUrls(urlFiles);
    } catch (err: any) {
      console.error("Error fetching quote:", err);
      setError(err.message || "Failed to load quote");
    } finally {
      setLoading(false);
    }
  };

  // Fetch all conversation messages for preview card (not filtered by quote_id)
  const fetchConversationMessages = async () => {
    if (!quote?.customer_id) return;

    try {
      const { data: conv } = await supabase
        .from("customer_conversations")
        .select("id")
        .eq("customer_id", quote.customer_id)
        .maybeSingle();

      if (!conv?.id) {
        setConversationMessages([]);
        return;
      }

      const { data: messages } = await supabase
        .from("conversation_messages")
        .select(`
          id, conversation_id, quote_id, sender_type, message_text,
          message_type, source, created_at, read_by_staff_at,
          metadata,
          staff_users:sender_staff_id(full_name),
          customers:sender_customer_id(full_name)
        `)
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });

      setConversationMessages(messages || []);

      const unread = (messages || []).filter(
        (m: any) => m.sender_type === "customer" && !m.read_by_staff_at
      ).length;
      setUnreadStaffCount(unread);
    } catch (err) {
      console.error("Failed to fetch conversation messages:", err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getSignedUrl = async (file: NormalizedFile): Promise<string | null> => {
    if (!file.bucketPath) {
      console.warn(`No storage_path for file: ${file.displayName}`);
      return null;
    }
    const { data, error } = await supabase.storage
      .from(file.bucket)
      .createSignedUrl(file.bucketPath, 3600);

    if (error) {
      console.error('Signed URL error:', error, 'bucket:', file.bucket, 'path:', file.bucketPath);
      return null;
    }
    return data?.signedUrl || null;
  };

  const handleDownload = async (file: NormalizedFile) => {
    const url = await getSignedUrl(file);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.download = file.displayName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert('Failed to generate download URL');
    }
  };

  const handleRefFileDownload = async (storagePath: string) => {
    if (!supabase || !storagePath) return;
    const { data, error } = await supabase.storage
      .from("quote-reference-files")
      .createSignedUrl(storagePath, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      console.error("Failed to generate signed URL for reference file:", error);
    }
  };

  const handlePreview = async (file: NormalizedFile) => {
    setPreviewFile(file);
    setPreviewLoading(true);
    const url = await getSignedUrl(file);
    setPreviewUrl(url);
    setPreviewLoading(false);
  };

  const hitlReview = hitlReviews[0] || null;

  const formatLabel = (value?: string | null) => {
    if (!value) return "—";
    return value
      .split("_")
      .map((segment) =>
        segment.length > 0
          ? `${segment[0].toUpperCase()}${segment.slice(1)}`
          : segment,
      )
      .join(" ");
  };

  const handleTaxRateChange = async (newTaxRateId: string) => {
    if (!quote || !id) return;

    const selectedRate = taxRates.find(t => t.id === newTaxRateId);
    if (!selectedRate) return;

    setIsSavingTax(true);

    try {
      // Tax is applied to subtotal + rush_fee + delivery_fee (not certification_total)
      const baseForTax = (quote.subtotal || 0) + (quote.rush_fee || 0) + (quote.delivery_fee || 0);
      const newTaxAmount = parseFloat((baseForTax * selectedRate.rate).toFixed(2));
      const newTotal = parseFloat(
        ((quote.subtotal || 0) + (quote.certification_total || 0) + (quote.rush_fee || 0) + (quote.delivery_fee || 0) + newTaxAmount).toFixed(2)
      );

      const { error } = await supabase
        .from("quotes")
        .update({
          tax_rate_id: selectedRate.id,
          tax_rate: selectedRate.rate,
          tax_amount: newTaxAmount,
          total: newTotal,
        })
        .eq("id", id);

      if (error) throw error;

      await logQuoteActivity(id, currentStaff?.staffId || "", "tax_rate_changed", {
        from_rate: quote.tax_rate,
        to_rate: selectedRate.rate,
      });
      setActivityLogLoaded(false);

      // Update local state immediately
      setQuote(prev => prev ? {
        ...prev,
        tax_rate_id: selectedRate.id,
        tax_rate: selectedRate.rate,
        tax_amount: newTaxAmount,
        total: newTotal,
      } : null);
    } catch (err) {
      console.error("Failed to update tax rate:", err);
      alert("Failed to update tax rate");
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleTurnaroundChange = async (optionId: string) => {
    if (!quote || !id) return;

    const selectedOption = turnaroundOptions.find(o => o.id === optionId);
    if (!selectedOption) return;

    setIsSavingTurnaround(true);

    try {
      // Update quote turnaround_option_id and turnaround_type
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          turnaround_option_id: selectedOption.id,
          turnaround_type: selectedOption.code,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateError) throw updateError;

      await logQuoteActivity(id, currentStaff?.staffId || "", "turnaround_changed", {
        from: quote.turnaround_type,
        to: selectedOption.code,
      });
      setActivityLogLoaded(false);

      // Call recalculate-quote-pricing edge function and re-fetch quote
      await callRecalculatePricing();
    } catch (err) {
      console.error("Failed to update turnaround:", err);
      toast.error("Failed to update turnaround speed");
      await fetchQuoteDetails();
    } finally {
      setIsSavingTurnaround(false);
    }
  };

  const handlePromisedDateChange = async (date: string) => {
    if (!id) return;
    setIsSavingPromisedDate(true);
    try {
      const { error } = await supabase
        .from("quotes")
        .update({
          promised_delivery_date: date || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      setPromisedDeliveryDate(date);
      setQuote(prev => prev ? { ...prev, promised_delivery_date: date || null } : null);
    } catch (err) {
      console.error("Failed to update promised delivery date:", err);
      toast.error("Failed to update delivery date");
    } finally {
      setIsSavingPromisedDate(false);
    }
  };

  const handleDeliveryOptionChange = async (optionId: string) => {
    if (!id || !quote) return;

    const selectedOption = deliveryOptionsList.find(o => o.id === optionId);
    if (!selectedOption) return;

    setIsSavingDelivery(true);
    setSelectedDeliveryOptionId(optionId);

    try {
      const updateData: any = {
        physical_delivery_option_id: selectedOption.id,
        updated_at: new Date().toISOString(),
      };

      // Clear shipping address if option doesn't require it
      if (!selectedOption.requires_address) {
        updateData.shipping_address = null;
      }

      const { error: updateError } = await supabase
        .from("quotes")
        .update(updateData)
        .eq("id", id);

      if (updateError) throw updateError;

      const previousOption = deliveryOptionsList.find(o => o.id === quote.physical_delivery_option_id);
      await logQuoteActivity(id, currentStaff?.staffId || "", "delivery_changed", {
        from: previousOption?.name || quote.physical_delivery_option_id,
        to: selectedOption.name,
      });
      setActivityLogLoaded(false);

      // Call recalculate-quote-pricing
      await callRecalculatePricing();

      if (!selectedOption.requires_address) {
        setShippingAddress({ line1: "", line2: "", city: "", province: "", postal_code: "", country: "Canada" });
      }
    } catch (err) {
      console.error("Failed to update delivery option:", err);
      toast.error("Failed to update delivery method");
      await fetchQuoteDetails();
    } finally {
      setIsSavingDelivery(false);
    }
  };

  const handleSaveShippingAddress = async () => {
    if (!id) return;
    setIsSavingShippingAddress(true);
    try {
      // Save in Format A (camelCase) to match customer checkout format
      const addressPayload = {
        firstName: '',
        lastName: '',
        company: '',
        addressLine1: shippingAddress.line1,
        addressLine2: shippingAddress.line2,
        city: shippingAddress.city,
        state: shippingAddress.province,
        postalCode: shippingAddress.postal_code,
        country: shippingAddress.country,
        phone: '',
      };

      const { error } = await supabase
        .from("quotes")
        .update({
          shipping_address: addressPayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Shipping address saved");
    } catch (err) {
      console.error("Failed to save shipping address:", err);
      toast.error("Failed to save shipping address");
    } finally {
      setIsSavingShippingAddress(false);
    }
  };

  const callRecalculatePricing = async () => {
    const { error } = await supabase.functions.invoke('recalculate-quote-pricing', {
      body: { quoteId: id },
    });
    if (error) throw error;
    await refetchQuote();
  };

  const handleRecalculateTotals = async () => {
    if (!id) return;
    setIsRecalculating(true);
    const oldTotal = quote?.total;
    try {
      await callRecalculatePricing();
      await logQuoteActivity(id, currentStaff?.staffId || "", "totals_recalculated", {
        old_total: oldTotal,
        new_total: quote?.total,
      });
      setActivityLogLoaded(false);
      toast.success("Totals recalculated");
    } catch (err) {
      console.error("Failed to recalculate totals:", err);
      toast.error("Failed to recalculate totals");
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleAddAdjustment = async () => {
    if (!adjustmentForm || !id) return;
    const numValue = parseFloat(adjustmentForm.value);
    if (isNaN(numValue) || numValue <= 0 || !adjustmentForm.reason.trim()) return;

    setIsAddingAdjustment(true);
    try {
      const baseSubtotal = (quote?.subtotal || 0) + (quote?.certification_total || 0);
      const calculatedAmount =
        adjustmentForm.valueType === "percentage"
          ? parseFloat((baseSubtotal * (numValue / 100)).toFixed(2))
          : numValue;

      const { error: insertError } = await supabase
        .from("quote_adjustments")
        .insert({
          quote_id: id,
          adjustment_type: adjustmentForm.type,
          value_type: adjustmentForm.valueType,
          value: numValue,
          calculated_amount: calculatedAmount,
          reason: adjustmentForm.reason.trim(),
          created_by_staff_id: currentStaff?.staffId || null,
        });

      if (insertError) throw insertError;

      await callRecalculatePricing();

      await logQuoteActivity(id, currentStaff?.staffId || "", "adjustment_added", {
        type: adjustmentForm.type,
        amount: calculatedAmount,
        reason: adjustmentForm.reason.trim(),
      });
      setActivityLogLoaded(false);

      const { data: adjData } = await supabase
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", id)
        .order("created_at");
      setAdjustments(adjData || []);
      setAdjustmentForm(null);
    } catch (err) {
      console.error("Failed to add adjustment:", err);
      alert("Failed to add adjustment");
    } finally {
      setIsAddingAdjustment(false);
    }
  };

  const handleRemoveAdjustment = async (adjustmentId: string) => {
    if (!id) return;
    const removedAdj = adjustments.find(a => a.id === adjustmentId);
    setRemovingAdjustmentId(adjustmentId);
    try {
      const { error: deleteError } = await supabase
        .from("quote_adjustments")
        .delete()
        .eq("id", adjustmentId);

      if (deleteError) throw deleteError;

      await callRecalculatePricing();

      await logQuoteActivity(id, currentStaff?.staffId || "", "adjustment_removed", {
        adjustment_id: adjustmentId,
        type: removedAdj?.adjustment_type,
        amount: removedAdj?.calculated_amount,
      });
      setActivityLogLoaded(false);

      const { data: adjData } = await supabase
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", id)
        .order("created_at");
      setAdjustments(adjData || []);
    } catch (err) {
      console.error("Failed to remove adjustment:", err);
      alert("Failed to remove adjustment");
      await fetchQuoteDetails();
    } finally {
      setRemovingAdjustmentId(null);
    }
  };

  // --- Quote Certifications handlers ---
  const refreshQuoteCerts = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("quote_certifications")
      .select(`
        id,
        certification_type_id,
        price,
        quantity,
        certification_types (name, code)
      `)
      .eq("quote_id", id);

    setQuoteCertifications(
      (data || []).map((qc: any) => ({
        id: qc.id,
        certification_type_id: qc.certification_type_id,
        price: qc.price,
        quantity: qc.quantity,
        name: qc.certification_types?.name || "Unknown",
        code: qc.certification_types?.code || "",
      }))
    );
  };

  const handleAddQuoteCert = async (certTypeId: string) => {
    if (!id) return;
    const certType = certTypes.find((c) => c.id === certTypeId);
    if (!certType) return;

    setAddingCertId(certTypeId);
    try {
      const { error: insertError } = await supabase
        .from("quote_certifications")
        .insert({
          quote_id: id,
          certification_type_id: certTypeId,
          price: certType.price,
          quantity: 1,
          added_by: currentStaff?.staffId || null,
        });

      if (insertError) throw insertError;

      await callRecalculatePricing();
      await refreshQuoteCerts();
    } catch (err) {
      console.error("Failed to add quote certification:", err);
      alert("Failed to add certification");
    } finally {
      setAddingCertId(null);
    }
  };

  const handleRemoveQuoteCert = async (certId: string) => {
    if (!id) return;
    setRemovingCertId(certId);
    try {
      const { error: deleteError } = await supabase
        .from("quote_certifications")
        .delete()
        .eq("id", certId);

      if (deleteError) throw deleteError;

      await callRecalculatePricing();
      await refreshQuoteCerts();
    } catch (err) {
      console.error("Failed to remove quote certification:", err);
      alert("Failed to remove certification");
    } finally {
      setRemovingCertId(null);
    }
  };

  const handleUpdateCertQty = async (certId: string, newQty: number) => {
    if (!id) return;

    if (newQty <= 0) {
      await handleRemoveQuoteCert(certId);
      return;
    }

    setUpdatingCertId(certId);
    try {
      const { error: updateError } = await supabase
        .from("quote_certifications")
        .update({ quantity: newQty })
        .eq("id", certId);

      if (updateError) throw updateError;

      await callRecalculatePricing();
      await refreshQuoteCerts();
    } catch (err) {
      console.error("Failed to update certification quantity:", err);
      alert("Failed to update quantity");
    } finally {
      setUpdatingCertId(null);
    }
  };

  // Available cert types not already added to this quote
  const availableCertTypes = certTypes.filter(
    (ct) => !quoteCertifications.some((qc) => qc.certification_type_id === ct.id)
  );

  const startReview = async () => {
    if (!currentStaff?.staffId || !id) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase
        .from("hitl_reviews")
        .insert({
          quote_id: id,
          status: "in_review",
          assigned_to: currentStaff.staffId,
        })
        .select("id")
        .single();

      if (error) throw error;

      await supabase
        .from("quotes")
        .update({
          status: "in_review",
        })
        .eq("id", id);

      await fetchQuoteDetails();

      if (data?.id) {
        navigate(`/admin/hitl/${data.id}`);
      }
    } catch (err) {
      console.error("Failed to start HITL review:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const claimReview = async () => {
    if (!currentStaff?.staffId || !hitlReview || !id) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("hitl_reviews")
        .update({ status: "in_review", assigned_to: currentStaff.staffId })
        .eq("id", hitlReview.id);

      if (error) throw error;

      await supabase
        .from("quotes")
        .update({
          status: "in_review",
        })
        .eq("id", id);

      await logQuoteActivity(id, currentStaff.staffId, "hitl_review_claimed", {
        review_id: hitlReview.id,
      });
      setActivityLogLoaded(false);

      await fetchQuoteDetails();
    } catch (err) {
      console.error("Failed to claim HITL review:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const approveQuote = async () => {
    if (!currentStaff?.staffId || !id) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ status: "awaiting_payment", processing_status: "complete" })
        .eq("id", id);

      if (error) throw error;

      if (hitlReview) {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-hitl-review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reviewId: hitlReview.id,
              staffId: currentStaff.staffId,
            }),
          },
        );
      }

      await logQuoteActivity(id, currentStaff.staffId, "hitl_review_approved", {
        review_id: hitlReview?.id,
      });
      await logQuoteActivity(id, currentStaff.staffId, "status_changed", {
        from_status: quote?.status,
        to_status: "awaiting_payment",
      });
      setActivityLogLoaded(false);

      await fetchQuoteDetails();
    } catch (err) {
      console.error("Failed to approve quote:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const requestBetterScan = async () => {
    if (!currentStaff?.staffId || !id) return;
    const reason = window.prompt("Enter reason for requesting a better scan:");
    if (!reason) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("quotes")
        .update({
          status: "revision_needed",
          processing_status: "revision_needed",
        })
        .eq("id", id);

      if (error) throw error;

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-staff-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quote_id: id,
            staff_id: currentStaff.staffId,
            message_text: `We need a clearer scan to proceed. ${reason}`,
          }),
        },
      );

      await logQuoteActivity(id, currentStaff.staffId, "revision_requested", {
        reason,
      });
      await logQuoteActivity(id, currentStaff.staffId, "status_changed", {
        from_status: quote?.status,
        to_status: "revision_needed",
      });
      setActivityLogLoaded(false);

      await fetchQuoteDetails();
    } catch (err) {
      console.error("Failed to request better scan:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteQuote = async () => {
    if (!currentStaff?.staffId || !id) return;
    setIsDeleting(true);

    try {
      // Log before deletion since the row will be soft-deleted
      await logQuoteActivity(id, currentStaff.staffId, "quote_deleted", {
        previous_status: quote?.status,
      });
      setActivityLogLoaded(false);

      const deletedAt = new Date().toISOString();

      // Soft delete quote (only set deleted_at, don't change status)
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          deleted_at: deletedAt,
        })
        .eq("id", id);

      if (quoteError) throw quoteError;

      // Log to audit
      await supabase.from("staff_activity_log").insert({
        staff_id: currentStaff.staffId,
        action_type: "delete_quote",
        entity_type: "quote",
        entity_id: id,
        details: {
          quote_number: quote?.quote_number,
          previous_status: quote?.status,
        },
      });

      // Cascade soft delete to related tables
      await Promise.all([
        supabase
          .from("quote_files")
          .update({ deleted_at: deletedAt })
          .eq("quote_id", id),
        supabase
          .from("ai_analysis_results")
          .update({ deleted_at: deletedAt })
          .eq("quote_id", id),
        supabase
          .from("hitl_reviews")
          .update({ deleted_at: deletedAt })
          .eq("quote_id", id),
      ]);

      // Navigate back to quotes list
      navigate("/admin/quotes");
    } catch (error) {
      console.error("Failed to delete quote:", error);
      alert("Failed to delete quote. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleResendQuote = async () => {
    if (!currentStaff?.staffId || !id) return;
    setIsResending(true);

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Call resend-quote-email Edge Function
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/resend-quote-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quoteId: id,
            staffId: currentStaff.staffId,
            customMessage: resendCustomMessage.trim() || undefined,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to resend quote email");
      }

      // Show success message
      alert(
        `✅ Quote email sent successfully!\n\n` +
          `Quote Number: ${result.quoteNumber}\n` +
          `Customer Email: ${result.customerEmail}\n` +
          `Email Sent: ${result.emailSent ? "Yes" : "No"}\n` +
          `Magic Link: ${result.magicLink}\n` +
          `Expires: ${new Date(result.expiresAt).toLocaleString()}`,
      );

      await logQuoteActivity(id, currentStaff.staffId, "quote_email_resent", {
        customer_email: quote?.customer?.email,
        custom_message: resendCustomMessage.trim() || undefined,
      });
      setActivityLogLoaded(false);

      setShowResendModal(false);
      setResendCustomMessage("");
    } catch (error) {
      console.error("Failed to resend quote:", error);
      alert("Failed to resend quote email: " + (error as Error).message);
    } finally {
      setIsResending(false);
    }
  };

  // Send Quote Link - sends email with quote review page link
  const handleSendQuoteLink = async () => {
    if (!currentStaff?.staffId || !id || !quote) return;

    const customerEmail = quote.customer?.email;
    if (!customerEmail) {
      alert("Customer email is required");
      return;
    }

    setIsSendingLink(true);

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Call send-quote-link-email Edge Function
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/send-quote-link-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quoteId: id,
            staffId: currentStaff.staffId,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to send quote link");
      }

      // Update quote status to awaiting_payment
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          status: "awaiting_payment",
          quote_sent_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (quoteError) throw quoteError;

      await logQuoteActivity(id, currentStaff.staffId, "quote_link_sent", {
        customer_email: quote.customer?.email,
      });
      await logQuoteActivity(id, currentStaff.staffId, "status_changed", {
        from_status: quote.status,
        to_status: "awaiting_payment",
      });
      setActivityLogLoaded(false);

      alert("Quote link sent to customer!");
      await fetchQuoteDetails();
    } catch (error) {
      console.error("Failed to send quote link:", error);
      alert("Failed to send quote link: " + (error as Error).message);
    } finally {
      setIsSendingLink(false);
    }
  };

  // Send Payment Link - creates Stripe checkout and sends direct payment link
  const handleSendPaymentLink = async () => {
    if (!currentStaff?.staffId || !id || !quote) return;

    const customerEmail = quote.customer?.email;
    if (!customerEmail) {
      alert("Customer email is required");
      return;
    }

    setIsSendingLink(true);

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // 1. Create Stripe payment link
      const paymentResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/create-payment-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quote_id: id,
            amount: quote.total,
            customer_email: customerEmail,
            customer_name: quote.customer?.full_name || "",
            quote_number: quote.quote_number,
          }),
        },
      );

      const paymentResult = await paymentResponse.json();

      if (!paymentResponse.ok || !paymentResult.url) {
        throw new Error(paymentResult.error || "Failed to create payment link");
      }

      // 2. Send payment email with Stripe URL
      const emailResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/send-payment-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quoteId: id,
            customerEmail: customerEmail,
            customerName: quote.customer?.full_name || "",
            quoteNumber: quote.quote_number,
            total: quote.total,
            paymentUrl: paymentResult.url,
          }),
        },
      );

      const emailResult = await emailResponse.json();

      if (!emailResponse.ok || !emailResult.success) {
        console.warn("Email send warning:", emailResult);
        // Continue anyway - payment link was created
      }

      // 3. Update quote status and store payment link
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          status: "awaiting_payment",
          payment_link: paymentResult.url,
          payment_link_sent_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (quoteError) throw quoteError;

      await logQuoteActivity(id, currentStaff.staffId, "payment_link_sent", {
        customer_email: quote.customer?.email,
        amount: quote.total,
      });
      await logQuoteActivity(id, currentStaff.staffId, "status_changed", {
        from_status: quote.status,
        to_status: "awaiting_payment",
      });
      setActivityLogLoaded(false);

      alert("Payment link sent to customer!");
      await fetchQuoteDetails();
    } catch (error) {
      console.error("Failed to send payment link:", error);
      alert("Failed to send payment link: " + (error as Error).message);
    } finally {
      setIsSendingLink(false);
    }
  };

  // Fetch active payment methods that require staff confirmation
  const fetchPaymentMethods = async () => {
    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id, name, code")
        .eq("is_active", true)
        .eq("requires_staff_confirmation", true)
        .order("display_order");

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (err) {
      console.error("Error loading payment methods:", err);
    }
  };

  const openReceivePaymentModal = () => {
    fetchPaymentMethods();
    setSelectedPaymentMethodId("");
    setSelectedPaymentMethodCode("");
    setRpAmountPaid(quote?.total?.toFixed(2) || "0.00");
    setRpRemarks("");
    setShowReceivePaymentModal(true);
  };

  const handlePaymentMethodChange = (methodId: string) => {
    setSelectedPaymentMethodId(methodId);
    const method = paymentMethods.find((pm) => pm.id === methodId);
    setSelectedPaymentMethodCode(method?.code || "");
  };

  const handleReceivePayment = async () => {
    if (!selectedPaymentMethodId) {
      toast.error("Please select a payment method");
      return;
    }

    const parsedAmountPaid = parseFloat(rpAmountPaid) || 0;
    const totalAmount = quote?.total || 0;

    if (parsedAmountPaid < 0) {
      toast.error("Amount paid cannot be negative");
      return;
    }

    if (parsedAmountPaid > totalAmount) {
      toast.error("Amount paid cannot exceed total amount");
      return;
    }

    if (!currentStaff?.staffId || !id) {
      toast.error("Missing required data. Please refresh the page.");
      return;
    }

    const methodName = paymentMethods.find((pm) => pm.id === selectedPaymentMethodId)?.name || "Unknown";

    const confirmMessage =
      `Are you sure? Quote ${quote?.quote_number} will be marked as PAID for $${parsedAmountPaid.toFixed(2)} via ${methodName}. This cannot be undone.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsProcessingPayment(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const payload = {
        quote_id: id,
        payment_method_id: selectedPaymentMethodId,
        payment_method_code: selectedPaymentMethodCode,
        amount_paid: parsedAmountPaid,
        total_amount: totalAmount,
        remarks: rpRemarks || undefined,
        staff_id: currentStaff.staffId,
        quote_data: {
          customer_id: quote?.customer_id || "",
          subtotal: quote?.subtotal || 0,
          certification_total: quote?.certification_total || 0,
          rush_fee: quote?.rush_fee || 0,
          delivery_fee: quote?.delivery_fee || 0,
          tax_rate: quote?.tax_rate || 0.05,
          tax_amount: quote?.tax_amount || 0,
          is_rush: quote?.is_rush || false,
          service_province: (quote as any)?.service_province || "AB",
        },
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-manual-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to process payment");
      }

      if (result.balance_due > 0) {
        toast.success(
          `Payment confirmed! Order ${result.order_number} created with $${result.balance_due.toFixed(2)} balance due.`,
        );
      } else {
        toast.success(
          `Payment confirmed! Order ${result.order_number} created.`,
        );
      }

      await logQuoteActivity(id, currentStaff.staffId, "manual_payment_recorded", {
        method: methodName,
        amount: parsedAmountPaid,
        remarks: rpRemarks || undefined,
      });
      setActivityLogLoaded(false);

      setShowReceivePaymentModal(false);
      setSelectedPaymentMethodId("");
      setSelectedPaymentMethodCode("");
      setRpRemarks("");
      setRpAmountPaid("");

      await fetchQuoteDetails();
    } catch (error: any) {
      console.error("Receive payment error:", error);
      toast.error(error.message || "Failed to process payment");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // --- Add Internal Note handler ---
  const handleAddNote = async () => {
    if (!newNote.trim() || !quote || !id || !currentStaff?.staffId) return;

    const existingNotes = (quote as any).manual_quote_notes || "";
    const timestamp = new Date().toISOString();
    const staffName = currentStaff?.staffName || "Staff";
    const appendedNote = existingNotes
      ? `${existingNotes}\n\n---\n[${staffName} — ${new Date(timestamp).toLocaleString()}]\n${newNote.trim()}`
      : `[${staffName} — ${new Date(timestamp).toLocaleString()}]\n${newNote.trim()}`;

    const { error } = await supabase
      .from("quotes")
      .update({ manual_quote_notes: appendedNote })
      .eq("id", quote.id);

    if (!error) {
      await logQuoteActivity(quote.id, currentStaff.staffId, "note_added", {
        note_preview: newNote.trim().substring(0, 100),
      });
      setActivityLogLoaded(false);
      setNewNote("");
      fetchQuoteDetails();
    }
  };

  // --- Activity Log lazy-fetch & accordion toggle ---
  const fetchActivityLog = async () => {
    if (activityLogLoaded || !quote?.id) return;
    setActivityLogLoading(true);
    try {
      const { data, error } = await supabase
        .from("quote_activity_log")
        .select("*, staff:staff_users(full_name)")
        .eq("quote_id", quote.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setActivityLog(data);
      }
      setActivityLogLoaded(true);
    } catch (err) {
      console.error("Failed to fetch activity log:", err);
    } finally {
      setActivityLogLoading(false);
    }
  };

  const toggleActivityLog = () => {
    const willOpen = !activityLogOpen;
    setActivityLogOpen(willOpen);
    if (willOpen && !activityLogLoaded) {
      fetchActivityLog();
    }
  };

  // --- Activity Log helper functions ---
  const getActivityIcon = (actionType: string) => {
    const icons: Record<string, JSX.Element> = {
      quote_link_sent: <LinkIcon className="w-3.5 h-3.5" />,
      payment_link_sent: <CreditCard className="w-3.5 h-3.5" />,
      quote_email_resent: <Mail className="w-3.5 h-3.5" />,
      status_changed: <RefreshCw className="w-3.5 h-3.5" />,
      hitl_review_claimed: <UserCheck className="w-3.5 h-3.5" />,
      hitl_review_approved: <CheckCircle className="w-3.5 h-3.5" />,
      revision_requested: <AlertTriangle className="w-3.5 h-3.5" />,
      adjustment_added: <Plus className="w-3.5 h-3.5" />,
      adjustment_removed: <Minus className="w-3.5 h-3.5" />,
      payment_recorded: <DollarSign className="w-3.5 h-3.5" />,
      manual_payment_recorded: <DollarSign className="w-3.5 h-3.5" />,
      turnaround_changed: <Clock className="w-3.5 h-3.5" />,
      delivery_changed: <Truck className="w-3.5 h-3.5" />,
      tax_rate_changed: <Percent className="w-3.5 h-3.5" />,
      quote_deleted: <Trash2 className="w-3.5 h-3.5" />,
      totals_recalculated: <Calculator className="w-3.5 h-3.5" />,
      message_sent: <MessageSquare className="w-3.5 h-3.5" />,
      note_added: <StickyNote className="w-3.5 h-3.5" />,
      escalation: <AlertCircle className="w-3.5 h-3.5" />,
      customer_hitl_requested: <HelpCircle className="w-3.5 h-3.5" />,
      quote_version_updated: <FileEdit className="w-3.5 h-3.5" />,
    };
    return icons[actionType] || <Activity className="w-3.5 h-3.5" />;
  };

  const getActivityIconStyle = (actionType: string): string => {
    const styles: Record<string, string> = {
      quote_link_sent: "bg-blue-100 text-blue-600",
      payment_link_sent: "bg-green-100 text-green-600",
      quote_email_resent: "bg-blue-100 text-blue-600",
      status_changed: "bg-purple-100 text-purple-600",
      hitl_review_approved: "bg-green-100 text-green-600",
      revision_requested: "bg-amber-100 text-amber-600",
      payment_recorded: "bg-green-100 text-green-600",
      manual_payment_recorded: "bg-green-100 text-green-600",
      quote_deleted: "bg-red-100 text-red-600",
      escalation: "bg-red-100 text-red-600",
      note_added: "bg-amber-100 text-amber-600",
    };
    return styles[actionType] || "bg-gray-100 text-gray-600";
  };

  const formatActivityDescription = (entry: ActivityLogEntry): string => {
    const d = entry.details || {};
    const descriptions: Record<string, string> = {
      quote_link_sent: `Quote link sent to ${d.customer_email || "customer"}`,
      payment_link_sent: `Payment link sent${d.amount ? ` ($${Number(d.amount).toFixed(2)})` : ""}`,
      quote_email_resent: `Quote email resent to ${d.customer_email || "customer"}`,
      status_changed: `Status changed: ${d.from_status || "?"} \u2192 ${d.to_status || "?"}`,
      hitl_review_claimed: "HITL review claimed",
      hitl_review_approved: "HITL review approved \u2014 quote ready for payment",
      revision_requested: `Better scan requested${d.reason ? `: ${d.reason}` : ""}`,
      adjustment_added: `${d.type || "Adjustment"} added: $${Number(d.amount || 0).toFixed(2)}${d.reason ? ` \u2014 ${d.reason}` : ""}`,
      adjustment_removed: `${d.type || "Adjustment"} removed: $${Number(d.amount || 0).toFixed(2)}`,
      payment_recorded: `Payment recorded: ${d.method || "unknown method"} \u2014 $${Number(d.amount || 0).toFixed(2)}`,
      manual_payment_recorded: `Manual payment: ${d.method || "unknown"} \u2014 $${Number(d.amount || 0).toFixed(2)}`,
      turnaround_changed: `Turnaround changed: ${d.from || "?"} \u2192 ${d.to || "?"}`,
      delivery_changed: `Delivery changed: ${d.from || "?"} \u2192 ${d.to || "?"}`,
      tax_rate_changed: `Tax rate changed: ${d.from_rate || "?"} \u2192 ${d.to_rate || "?"}`,
      quote_deleted: `Quote deleted (was ${d.previous_status || "unknown status"})`,
      totals_recalculated: `Totals recalculated${d.old_total && d.new_total ? `: $${Number(d.old_total).toFixed(2)} \u2192 $${Number(d.new_total).toFixed(2)}` : ""}`,
      message_sent: "Message sent to customer",
      note_added: `Note added${d.note_preview ? `: "${d.note_preview.substring(0, 60)}${d.note_preview.length > 60 ? "..." : ""}"` : ""}`,
      escalation: `Escalated${d.reason ? `: ${d.reason}` : ""}`,
      customer_hitl_requested: "Customer requested human review",
      quote_version_updated: `Quote updated${d.old_total && d.new_total ? `: $${Number(d.old_total).toFixed(2)} \u2192 $${Number(d.new_total).toFixed(2)}` : ""} & payment link sent`,
    };
    return descriptions[entry.action_type] || entry.action_type.replace(/_/g, " ");
  };

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const formatMessageDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffHours < 24) {
      return formatRelativeTime(dateString);
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  // Check if quote has been converted to an order (hide send buttons)
  const isConvertedToOrder = quote && ['paid', 'converted'].includes(quote.status);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Error loading quote</p>
            <p className="text-red-600 text-sm">{error || "Quote not found"}</p>
          </div>
        </div>
        <Link
          to="/admin/quotes"
          className="mt-4 inline-flex items-center gap-2 text-teal-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quotes
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        {/* Back link */}
        <Link
          to="/admin/quotes"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quotes
        </Link>

        {/* Quote number + status row */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {quote.quote_number}
            </h1>
            <span
              className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                STATUS_STYLES[quote.status] || "bg-gray-100 text-gray-700"
              }`}
            >
              {STATUS_LABELS[quote.status] || quote.status}
            </span>
          </div>

          {/* Meta info */}
          <p className="text-sm text-gray-500">
            Created{" "}
            {format(new Date(quote.created_at), "MMM d, yyyy 'at' h:mm a")}
          </p>
        </div>

        {/* Action buttons row — compact */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {orderId && (
            <Link
              to={`/admin/orders/${orderId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              View Order
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}

          {/* Send Quote Link & Send Payment Link - hidden when paid or converted */}
          {!isConvertedToOrder && (
            <>
              <button
                onClick={handleSendQuoteLink}
                disabled={isSendingLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5" />
                {isSendingLink ? "Sending..." : "Send Quote Link"}
              </button>

              <button
                onClick={handleSendPaymentLink}
                disabled={isSendingLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {isSendingLink ? "Sending..." : "Send Payment Link"}
              </button>
            </>
          )}

          {/* Receive Payment Button - visible when payment hasn't been received yet */}
          {["draft", "quote_ready", "awaiting_payment", "pending_payment", "checkout_started"].includes(quote.status) && (
            <button
              onClick={openReceivePaymentModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <DollarSign className="w-3.5 h-3.5" />
              Receive Payment
            </button>
          )}

          {/* Spacer to push destructive action right */}
          <div className="flex-1" />

          {/* Delete Quote Button */}
          {!orderId && !["paid", "converted"].includes(quote.status) ? (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          ) : (
            orderId && (
              <button
                disabled
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-gray-400 cursor-not-allowed"
                title="Cannot delete - converted to order"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )
          )}
        </div>

        {/* "Last sent" indicators — subtle, below buttons */}
        {!isConvertedToOrder && (
          <div className="flex items-center gap-4 mt-2">
            {(() => {
              const lastSent = activityLog.find(a => a.action_type === "quote_link_sent");
              return lastSent ? (
                <p className="text-xs text-gray-400">
                  Quote link last sent: {formatRelativeTime(lastSent.created_at)} by {lastSent.staff?.full_name || "staff"}
                </p>
              ) : null;
            })()}
            {(() => {
              const lastSent = activityLog.find(a => a.action_type === "payment_link_sent");
              return lastSent ? (
                <p className="text-xs text-gray-400">
                  Payment link last sent: {formatRelativeTime(lastSent.created_at)} by {lastSent.staff?.full_name || "staff"}
                </p>
              ) : null;
            })()}
          </div>
        )}
      </div>

      {hitlReview && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-amber-800">
              {hitlReview.assigned_to_id
                ? `In Review with: ${hitlReview.assigned_to_name}`
                : "HITL Pending - Unassigned"}
            </p>
            <div className="text-xs text-amber-700 mt-1">
              Review status: {hitlReview.status.replace(/_/g, " ")}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hitlReview.assigned_to_id ? (
              <Link
                to={`/admin/hitl/${hitlReview.id}`}
                className="bg-amber-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-amber-700"
              >
                View Review
              </Link>
            ) : (
              <>
                <Link
                  to={`/admin/hitl/${hitlReview.id}`}
                  className="text-sm text-amber-700 hover:underline"
                >
                  View review
                </Link>
                <button
                  onClick={claimReview}
                  disabled={actionLoading || !currentStaff}
                  className="bg-amber-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-amber-700 disabled:opacity-50"
                >
                  Claim
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {quote.processing_status === "review_required" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-5 mb-6">
              <h3 className="text-base font-semibold text-red-800 flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5" />
                Review Required
              </h3>

              {quote.review_required_reasons && Array.isArray(quote.review_required_reasons) && quote.review_required_reasons.length > 0 && (
                <div className="space-y-2.5 mb-4">
                  {quote.review_required_reasons.map((reason: string, idx: number) => {
                    const info = REVIEW_REASON_LABELS[reason] || {
                      label: reason.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
                      description: "This item requires manual review.",
                      severity: "warning" as const,
                    };
                    return (
                      <div
                        key={idx}
                        className={`rounded-md p-3 ${
                          info.severity === "error"
                            ? "bg-red-100 border border-red-200"
                            : "bg-amber-50 border border-amber-200"
                        }`}
                      >
                        <p className={`text-sm font-medium ${
                          info.severity === "error" ? "text-red-800" : "text-amber-800"
                        }`}>
                          {info.severity === "error" ? "❌" : "⚠️"} {info.label}
                        </p>
                        <p className={`text-xs mt-0.5 ${
                          info.severity === "error" ? "text-red-700" : "text-amber-700"
                        }`}>
                          {info.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {quote.customer_note && (
                <div className="bg-white border border-red-100 rounded-md p-3 mt-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Customer Note
                  </p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {quote.customer_note}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-gray-400" />
              Customer Information
            </h2>

            {quote.customer ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium">
                    {quote.customer.full_name || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium flex items-center gap-1">
                    <Mail className="w-4 h-4 text-gray-400" />
                    {quote.customer.email}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium flex items-center gap-1">
                    <Phone className="w-4 h-4 text-gray-400" />
                    {quote.customer.phone || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Type</p>
                  <p className="font-medium capitalize">
                    {quote.customer.customer_type || "Individual"}
                  </p>
                </div>
                {quote.customer.company_name && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">Company</p>
                    <p className="font-medium flex items-center gap-1">
                      <Building className="w-4 h-4 text-gray-400" />
                      {quote.customer.company_name}
                    </p>
                  </div>
                )}
                {quote.quote_source && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">Contact Method</p>
                    <p className="font-medium">
                      {quote.quote_source.name}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No customer information</p>
            )}
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Languages className="w-5 h-5 text-gray-400" />
              Translation Details
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Source Language</p>
                <p className="font-medium">
                  {quote.source_language?.name || "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Target Language</p>
                <p className="font-medium">
                  {quote.target_language?.name || "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Country of Issue</p>
                <p className="font-medium">{quote.country_of_issue || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Intended Use</p>
                <p className="font-medium">{quote.intended_use?.name || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Turnaround</p>
                <p className="font-medium">
                  {(() => {
                    const opt = turnaroundOptions.find(o =>
                      o.id === quote.turnaround_option_id ||
                      o.code === (quote.turnaround_type || 'standard')
                    );
                    const days = quote.turnaround_days || opt?.estimated_days;
                    const label = opt?.name || formatLabel(quote.turnaround_type);
                    return days
                      ? `${label} — ${days} business day${days !== 1 ? 's' : ''}`
                      : label || '—';
                  })()}
                </p>
              </div>
            </div>
          </div>

          {quote.special_instructions && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4" />
                Customer Instructions
              </h4>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">
                {quote.special_instructions}
              </p>
            </div>
          )}

          {(() => {
            const translateFiles = normalizedFiles.filter(f => f.categoryId !== REFERENCE_CATEGORY_ID);
            const referenceFiles = normalizedFiles.filter(f => f.categoryId === REFERENCE_CATEGORY_ID);

            return (
              <>
                <div className="bg-white rounded-lg border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-gray-400" />
                      Uploaded Files ({translateFiles.length})
                    </h2>
                    {hasBatch && (
                      <button
                        onClick={() => setShowOcrModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <FileSearch className="w-4 h-4" />
                        OCR & Analysis
                      </button>
                    )}
                  </div>

                  {translateFiles.length > 0 ? (
                    <div className="space-y-2">
                      {translateFiles.map((file) => (
                        <div
                          key={file.id}
                          className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg ${
                            file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/')
                              ? 'cursor-pointer hover:bg-gray-100 transition-colors'
                              : ''
                          }`}
                          onClick={() => {
                            if (file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/')) {
                              handlePreview(file);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="font-medium text-sm">{file.displayName}</p>
                              <p className="text-xs text-gray-500">
                                {file.fileSize > 0 ? formatFileSize(file.fileSize) : ''}
                                {file.fileSize > 0 && ' • '}{file.mimeType}
                                {file.source === 'ocr' && (
                                  <span className="ml-2 text-purple-600">via OCR</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {(file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/')) && (
                              <button
                                onClick={() => handlePreview(file)}
                                className="text-blue-600 hover:text-blue-700"
                                title="Preview"
                              >
                                <Eye className="w-5 h-5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDownload(file)}
                              className="text-teal-600 hover:text-teal-700"
                              title="Download"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No files uploaded</p>
                  )}
                </div>

                {referenceFiles.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
                      <Paperclip className="w-4 h-4 text-gray-400" />
                      Reference Files ({referenceFiles.length})
                    </h4>
                    <p className="text-xs text-gray-500 mb-3">
                      Supporting materials provided by the customer. Not counted toward pricing.
                    </p>
                    <div className="space-y-2">
                      {referenceFiles.map((rf) => (
                        <div key={rf.id} className="flex items-center gap-2.5 p-2.5 bg-white border border-gray-200 rounded-lg">
                          <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-700 truncate flex-1">{rf.displayName}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {rf.fileSize ? formatFileSize(rf.fileSize) : ''}
                          </span>
                          <button
                            onClick={() => handleRefFileDownload(rf.storagePath)}
                            className="text-xs text-teal-600 hover:underline flex-shrink-0"
                          >
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {analysis.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-gray-400" />
                Document Analysis
              </h2>

              {/* Document Tabs */}
              {analysis.length > 1 && (
                <div className="flex border-b mb-4 overflow-x-auto">
                  {analysis.map((item, index) => {
                    const nf = normalizedFiles.find((f) => f.id === item.quote_file_id);
                    const qf = files.find((f) => f.id === item.quote_file_id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedAnalysisId(item.id)}
                        className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                          (selectedAnalysisId || analysis[0]?.id) === item.id
                            ? "border-teal-600 text-teal-600"
                            : "border-transparent text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {nf?.displayName || qf?.original_filename || `Document ${index + 1}`}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Selected Document Analysis */}
              {(() => {
                const currentAnalysis =
                  analysis.find(
                    (a) => a.id === (selectedAnalysisId || analysis[0]?.id),
                  ) || analysis[0];
                if (!currentAnalysis) return null;

                const docCerts = certifications.filter(
                  (c) => c.quote_file_id === currentAnalysis.quote_file_id,
                );
                const primaryCert = docCerts.find((c) => c.is_primary);

                return (
                  <div className="space-y-4">
                    {/* Analysis Summary */}
                    <div className="border border-gray-200 rounded-lg">
                      <div className="px-4 py-3 bg-gray-50 border-b font-medium text-sm text-gray-700">
                        Analysis Summary
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 text-xs mb-1">
                              Detected Language
                            </p>
                            <p className="font-medium">
                              {currentAnalysis.detected_language || "—"}
                            </p>
                            {currentAnalysis.language_confidence && (
                              <p className="text-xs text-gray-400">
                                {Math.round(
                                  currentAnalysis.language_confidence * 100,
                                )}
                                % confidence
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="text-gray-500 text-xs mb-1">
                              Document Type
                            </p>
                            <p className="font-medium">
                              {formatLabel(
                                currentAnalysis.detected_document_type,
                              )}
                            </p>
                            {currentAnalysis.document_type_confidence && (
                              <p className="text-xs text-gray-400">
                                {Math.round(
                                  currentAnalysis.document_type_confidence * 100,
                                )}
                                % confidence
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="text-gray-500 text-xs mb-1">
                              Complexity
                            </p>
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                currentAnalysis.assessed_complexity === "easy"
                                  ? "bg-green-100 text-green-700"
                                  : currentAnalysis.assessed_complexity ===
                                      "medium"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : currentAnalysis.assessed_complexity ===
                                        "hard"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {formatLabel(currentAnalysis.assessed_complexity)}
                            </span>
                            {currentAnalysis.complexity_confidence && (
                              <p className="text-xs text-gray-400 mt-1">
                                {Math.round(
                                  currentAnalysis.complexity_confidence * 100,
                                )}
                                % confidence
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="text-gray-500 text-xs mb-1">
                              Multiplier
                            </p>
                            <p className="font-medium">
                              {currentAnalysis.complexity_multiplier?.toFixed(
                                2,
                              ) || "1.00"}
                              x
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-500 text-xs mb-1">
                              Word Count
                            </p>
                            <p className="font-medium">
                              {currentAnalysis.word_count?.toLocaleString() ||
                                "—"}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-500 text-xs mb-1">
                              Page Count
                            </p>
                            <p className="font-medium">
                              {currentAnalysis.page_count || "—"}
                            </p>
                          </div>

                          <div className="col-span-2 md:col-span-3 pt-2 border-t">
                            <p className="text-gray-500 text-xs mb-1">
                              Billable Pages
                            </p>
                            <p className="font-semibold text-lg">
                              {currentAnalysis.billable_pages?.toFixed(2) ||
                                "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Document Certification */}
                    <div className="border border-gray-200 rounded-lg">
                      <div className="px-4 py-3 bg-gray-50 border-b font-medium text-sm text-gray-700">
                        Certification
                      </div>
                      <div className="p-4">
                        {primaryCert ? (
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Type:</span>
                              <span className="font-medium">
                                {primaryCert.certification_types?.name || "—"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Code:</span>
                              <span className="font-medium">
                                {primaryCert.certification_types?.code || "—"}
                              </span>
                            </div>
                            <div className="flex justify-between border-t pt-2">
                              <span className="text-gray-700 font-medium">
                                Price:
                              </span>
                              <span className="font-semibold text-green-600">
                                ${Number(primaryCert.price || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500 text-sm">
                            No certification assigned
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Document Pricing */}
                    <div className="border border-gray-200 rounded-lg">
                      <div className="px-4 py-3 bg-gray-50 border-b font-medium text-sm text-gray-700">
                        Document Pricing
                      </div>
                      <div className="p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Per Page Rate:</span>
                          <span className="font-medium">
                            $
                            {(() => {
                              // base_rate in DB is the effective rate (already includes
                              // language multiplier + $2.50 rounding). Display directly.
                              // Fallback to system default $65 if no stored rate.
                              const effectiveRate = Number(currentAnalysis.base_rate || 65);
                              return effectiveRate.toFixed(2);
                            })()}
                            /page
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Billable Pages:</span>
                          <span className="font-medium">
                            {currentAnalysis.billable_pages?.toFixed(2) || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                          <span className="text-gray-700 font-medium">
                            Line Total:
                          </span>
                          <span className="font-semibold text-green-600">
                            $
                            {Number(currentAnalysis.line_total || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Quote Certifications Section */}
          <div className="bg-white rounded-lg border">
            <button
              onClick={() => setQuoteCertsExpanded(!quoteCertsExpanded)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-500" />
                Quote Certifications ({quoteCertifications.length})
              </h2>
              {quoteCertsExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {quoteCertsExpanded && (
              <div className="px-6 pb-6 space-y-4">
                {/* Existing certifications as chips */}
                {quoteCertifications.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {quoteCertifications.map((qc) => (
                      <div
                        key={qc.id}
                        className="inline-flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-full pl-3 pr-1 py-1"
                      >
                        <span className="text-sm text-purple-800 font-medium">
                          {qc.name} — ${Number(qc.price).toFixed(2)} × {qc.quantity}
                        </span>

                        {/* Quantity stepper */}
                        <div className="inline-flex items-center border border-purple-300 rounded-full bg-white">
                          <button
                            onClick={() => handleUpdateCertQty(qc.id, qc.quantity - 1)}
                            disabled={updatingCertId === qc.id || removingCertId === qc.id}
                            className="px-1.5 py-0.5 text-purple-600 hover:bg-purple-100 rounded-l-full disabled:opacity-50"
                            title="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-1.5 text-xs font-semibold text-purple-700 min-w-[1.25rem] text-center">
                            {qc.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateCertQty(qc.id, qc.quantity + 1)}
                            disabled={updatingCertId === qc.id || removingCertId === qc.id}
                            className="px-1.5 py-0.5 text-purple-600 hover:bg-purple-100 rounded-r-full disabled:opacity-50"
                            title="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={() => handleRemoveQuoteCert(qc.id)}
                          disabled={removingCertId === qc.id}
                          className="p-1 text-purple-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
                          title="Remove certification"
                        >
                          {removingCertId === qc.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <X className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    No quote-level certifications added
                  </p>
                )}

                {/* Add certification dropdown */}
                {availableCertTypes.length > 0 && (
                  <div>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleAddQuoteCert(e.target.value);
                      }}
                      disabled={addingCertId !== null}
                      className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:border-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                    >
                      <option value="">Add certification...</option>
                      {availableCertTypes.map((ct) => (
                        <option key={ct.id} value={ct.id}>
                          {ct.name} — ${Number(ct.price).toFixed(2)}
                        </option>
                      ))}
                    </select>
                    {addingCertId && (
                      <span className="ml-2 inline-flex items-center text-sm text-gray-500">
                        <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                        Adding...
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {hitlReviews.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-gray-400" />
                HITL Review History
              </h2>

              <div className="space-y-4">
                {hitlReviews.map((review) => (
                  <div key={review.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                          review.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : review.status === "rejected"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {review.status}
                      </span>
                      <span className="text-sm text-gray-500">
                        {format(new Date(review.created_at), "MMM d, yyyy")}
                      </span>
                    </div>

                    {review.is_customer_requested && (
                      <p className="text-sm text-blue-600 mb-2">
                        ★ Customer requested review
                      </p>
                    )}

                    {review.trigger_reasons?.length > 0 && (
                      <p className="text-sm text-gray-600 mb-2">
                        Triggers: {review.trigger_reasons.join(", ")}
                      </p>
                    )}

                    {review.customer_note && (
                      <p className="text-sm text-gray-600 mb-2">
                        Customer note: {review.customer_note}
                      </p>
                    )}

                    <p className="text-sm text-gray-500">
                      Assigned to: {review.assigned_to_name}
                    </p>

                    {review.resolution_notes && (
                      <p className="text-sm text-gray-600 mt-2">
                        Resolution: {review.resolution_notes}
                      </p>
                    )}

                    <Link
                      to={`/admin/hitl/${review.id}`}
                      className="mt-2 inline-flex items-center gap-1 text-sm text-teal-600 hover:underline"
                    >
                      View Details
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============ NOTES SECTION ============ */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-semibold text-gray-900">Notes</h3>
            </div>

            <div className="px-6 py-4 space-y-4">
              {quote?.special_instructions && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                    Customer Instructions
                  </p>
                  <p className="text-sm text-gray-800">{quote.special_instructions}</p>
                </div>
              )}

              {hitlReview?.customer_note && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-700 uppercase tracking-wide mb-1">
                    Customer Review Request Note
                  </p>
                  <p className="text-sm text-gray-800">{hitlReview.customer_note}</p>
                </div>
              )}

              {(quote as any)?.manual_quote_notes && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
                    Staff Notes (Quote Creation)
                  </p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{(quote as any).manual_quote_notes}</p>
                </div>
              )}

              {hitlReview?.internal_notes && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
                    HITL Review Notes
                  </p>
                  <p className="text-sm text-gray-800">{hitlReview.internal_notes}</p>
                </div>
              )}

              {hitlReview?.resolution_notes && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-1">
                    Resolution Notes
                  </p>
                  <p className="text-sm text-gray-800">{hitlReview.resolution_notes}</p>
                </div>
              )}

              {hitlReview?.escalation_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">
                    Escalation Reason
                  </p>
                  <p className="text-sm text-gray-800">{hitlReview.escalation_reason}</p>
                </div>
              )}

              {!quote?.special_instructions &&
               !(quote as any)?.manual_quote_notes &&
               !hitlReview?.internal_notes &&
               !hitlReview?.resolution_notes &&
               !hitlReview?.customer_note &&
               !hitlReview?.escalation_reason && (
                <p className="text-sm text-gray-400 text-center py-2">No notes</p>
              )}

              <div className="border-t border-gray-100 pt-4">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide block mb-2">
                  Add Internal Note
                </label>
                <div className="flex gap-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add an internal note visible only to staff..."
                    rows={2}
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="self-end px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ============ MESSAGES PREVIEW CARD ============ */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowMessageModal(true)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-base font-semibold text-gray-900 text-left">Messages</h3>
                  {conversationMessages.length > 0 ? (
                    <p className="text-sm text-gray-500 text-left mt-0.5 max-w-md truncate">
                      {conversationMessages[conversationMessages.length - 1]?.sender_type === "staff" ? "You" : "Customer"}
                      {": "}
                      {conversationMessages[conversationMessages.length - 1]?.message_text?.substring(0, 60)}
                      {(conversationMessages[conversationMessages.length - 1]?.message_text?.length || 0) > 60 ? "..." : ""}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 text-left mt-0.5">No messages yet — click to start a conversation</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {conversationMessages.length > 0 && (
                  <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                    {conversationMessages.length}
                  </span>
                )}
                {unreadStaffCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {unreadStaffCount}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </button>
          </div>

        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-gray-400" />
                Pricing Summary
              </h2>
              <button
                onClick={handleRecalculateTotals}
                disabled={isRecalculating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-800 transition-colors disabled:opacity-50"
                title="Recalculate totals"
              >
                {isRecalculating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Calculator className="w-3.5 h-3.5" />
                )}
                Recalculate
              </button>
            </div>

            <div className="space-y-0">
              {/* === Settings Section === */}
              <div className="space-y-4 pb-4">
                {/* Turnaround Speed */}
                {turnaroundOptions.length > 0 && (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Turnaround
                    </label>
                    <div className="flex items-center gap-1">
                      <select
                        value={quote.turnaround_option_id || turnaroundOptions.find(o => o.code === (quote.turnaround_type || "standard"))?.id || turnaroundOptions.find(o => o.is_default)?.id || ""}
                        onChange={(e) => handleTurnaroundChange(e.target.value)}
                        disabled={isSavingTurnaround}
                        className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 text-gray-700 bg-white hover:border-gray-400 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
                      >
                        {turnaroundOptions.map((opt) => {
                          let label = opt.name;
                          if (opt.fee_value === 0) {
                            label += " \u2014 No extra charge";
                          } else if (opt.fee_type === "percentage") {
                            const extra = (quote.subtotal || 0) * (opt.fee_value / 100);
                            label += ` (+${opt.fee_value}%) \u2014 +$${extra.toFixed(2)}`;
                          } else {
                            label += ` \u2014 +$${opt.fee_value.toFixed(2)}`;
                          }
                          return (
                            <option key={opt.id} value={opt.id}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                      {isSavingTurnaround && (
                        <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
                      )}
                    </div>
                    {(() => {
                      const currentOpt = turnaroundOptions.find(o =>
                        o.id === quote.turnaround_option_id ||
                        o.code === (quote.turnaround_type || "standard")
                      );
                      if (currentOpt?.estimated_days) {
                        return (
                          <p className="text-xs text-gray-400">
                            Estimated: {currentOpt.estimated_days} business day{currentOpt.estimated_days !== 1 ? "s" : ""} from today
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Promised Delivery Date */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Delivery Date
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={promisedDeliveryDate || quote.estimated_delivery_date || ''}
                      onChange={(e) => handlePromisedDateChange(e.target.value)}
                      disabled={isSavingPromisedDate}
                      className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 text-gray-700 bg-white hover:border-gray-400 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
                    />
                    {isSavingPromisedDate && (
                      <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Delivery Method */}
                {deliveryOptionsList.length > 0 && (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Delivery
                    </label>
                    <div className="flex items-center gap-1">
                      <select
                        value={selectedDeliveryOptionId}
                        onChange={(e) => handleDeliveryOptionChange(e.target.value)}
                        disabled={isSavingDelivery}
                        className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 text-gray-700 bg-white hover:border-gray-400 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
                      >
                        <option value="">Select delivery...</option>
                        {(() => {
                          const digital = deliveryOptionsList.filter(o => o.delivery_group === "digital");
                          const physical = deliveryOptionsList.filter(o => o.delivery_group === "physical");
                          return (
                            <>
                              {digital.length > 0 && (
                                <optgroup label="Digital">
                                  {digital.map(opt => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.name} {opt.price > 0 ? `\u2014 $${opt.price.toFixed(2)}` : "\u2014 Free"}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {physical.length > 0 && (
                                <optgroup label="Physical">
                                  {physical.map(opt => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.name} {opt.price > 0 ? `\u2014 $${opt.price.toFixed(2)}` : "\u2014 Free"}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </>
                          );
                        })()}
                      </select>
                      {isSavingDelivery && (
                        <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
                      )}
                    </div>

                    {/* Shipping Address Form — shown when delivery requires address */}
                  {(() => {
                    const selected = deliveryOptionsList.find(o => o.id === selectedDeliveryOptionId);
                    if (!selected?.requires_address) return null;
                    return (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2 border text-sm">
                        <p className="text-xs font-medium text-gray-700">Shipping Address</p>
                        <input
                          type="text"
                          placeholder="Address Line 1"
                          value={shippingAddress.line1}
                          onChange={(e) => setShippingAddress(prev => ({ ...prev, line1: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                        />
                        <input
                          type="text"
                          placeholder="Address Line 2 (optional)"
                          value={shippingAddress.line2}
                          onChange={(e) => setShippingAddress(prev => ({ ...prev, line2: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="City"
                            value={shippingAddress.city}
                            onChange={(e) => setShippingAddress(prev => ({ ...prev, city: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                          />
                          <input
                            type="text"
                            placeholder="Province"
                            value={shippingAddress.province}
                            onChange={(e) => setShippingAddress(prev => ({ ...prev, province: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Postal Code"
                            value={shippingAddress.postal_code}
                            onChange={(e) => setShippingAddress(prev => ({ ...prev, postal_code: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                          />
                          <input
                            type="text"
                            placeholder="Country"
                            value={shippingAddress.country}
                            onChange={(e) => setShippingAddress(prev => ({ ...prev, country: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                          />
                        </div>
                        <button
                          onClick={handleSaveShippingAddress}
                          disabled={isSavingShippingAddress || !shippingAddress.line1.trim()}
                          className="bg-teal-600 text-white text-xs px-3 py-1 rounded hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {isSavingShippingAddress && <RefreshCw className="w-3 h-3 animate-spin" />}
                          Save Address
                        </button>
                      </div>
                    );
                  })()}
                  </div>
                )}
              </div>

              {/* === Documents Section === */}
              <div className="py-4 border-t border-gray-100">
                {analysis.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Documents
                    </p>
                    {analysis.map((item, index) => {
                      const nf = normalizedFiles.find(
                        (f) => f.id === item.quote_file_id,
                      );
                      const qf = files.find(
                        (f) => f.id === item.quote_file_id,
                      );
                      const fileName = nf?.displayName || qf?.original_filename || `Document ${index + 1}`;
                      return (
                        <div
                          key={item.id}
                          className="flex justify-between text-sm"
                        >
                          <span
                            className="text-gray-600 truncate pr-3"
                            title={fileName}
                          >
                            {fileName}
                          </span>
                          <span className="flex-shrink-0 text-gray-600">
                            ${Number(item.line_total || 0).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                    {/* Translation Total — only show if multiple documents */}
                    {analysis.length > 1 && (
                      <div className="flex justify-between text-sm text-gray-500 pt-1.5 mt-1.5 border-t border-dashed border-gray-200">
                        <span>Translation Total</span>
                        <span>${quote.subtotal?.toFixed(2) || "0.00"}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Certification totals — only show if > 0 */}
                {(quote.calculated_totals?.doc_certification_total ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-gray-500 mt-1">
                    <span>Document Certifications</span>
                    <span>
                      ${Number(quote.calculated_totals?.doc_certification_total || 0).toFixed(2)}
                    </span>
                  </div>
                )}

                {(quote.calculated_totals?.quote_certification_total ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-gray-500 mt-1">
                    <span>Quote Certifications</span>
                    <span>
                      ${Number(quote.calculated_totals?.quote_certification_total || 0).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Subtotal (Translation + Certification) */}
                <div className="flex justify-between text-sm font-medium text-gray-700 pt-2 mt-2 border-t border-gray-200">
                  <span>Subtotal</span>
                  <span>
                    ${((quote.subtotal || 0) + (quote.certification_total || 0)).toFixed(2)}
                  </span>
                </div>

              {/* Surcharge lines */}
              {adjustments
                .filter((a) => a.adjustment_type === "surcharge")
                .map((adj) => (
                  <div
                    key={adj.id}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="text-orange-600">
                      + Surcharge: ${Math.abs(adj.calculated_amount).toFixed(2)}
                      {adj.reason && (
                        <span className="text-orange-400 text-xs ml-1">
                          ({adj.reason})
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => handleRemoveAdjustment(adj.id)}
                      disabled={removingAdjustmentId === adj.id}
                      className="text-gray-300 hover:text-red-500 p-0.5 disabled:opacity-50"
                      title="Remove adjustment"
                    >
                      {removingAdjustmentId === adj.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                ))}

              {/* Discount lines */}
              {adjustments
                .filter((a) => a.adjustment_type === "discount")
                .map((adj) => (
                  <div
                    key={adj.id}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="text-green-600">
                      - Discount: ${Math.abs(adj.calculated_amount).toFixed(2)}
                      {adj.reason && (
                        <span className="text-green-400 text-xs ml-1">
                          ({adj.reason})
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => handleRemoveAdjustment(adj.id)}
                      disabled={removingAdjustmentId === adj.id}
                      className="text-gray-300 hover:text-red-500 p-0.5 disabled:opacity-50"
                      title="Remove adjustment"
                    >
                      {removingAdjustmentId === adj.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                ))}

              {/* Add Surcharge / Add Discount buttons */}
              <div className="flex gap-3 text-xs">
                <button
                  onClick={() =>
                    setAdjustmentForm({
                      type: "surcharge",
                      valueType: "fixed",
                      value: "",
                      reason: "",
                    })
                  }
                  className="text-orange-600 hover:text-orange-700 font-medium"
                  disabled={adjustmentForm !== null}
                >
                  + Add Surcharge
                </button>
                <button
                  onClick={() =>
                    setAdjustmentForm({
                      type: "discount",
                      valueType: "fixed",
                      value: "",
                      reason: "",
                    })
                  }
                  className="text-green-600 hover:text-green-700 font-medium"
                  disabled={adjustmentForm !== null}
                >
                  + Add Discount
                </button>
              </div>

              {/* Inline Add Adjustment Form */}
              {adjustmentForm && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 border">
                  <p className="text-xs font-medium text-gray-700">
                    Add{" "}
                    {adjustmentForm.type === "surcharge"
                      ? "Surcharge"
                      : "Discount"}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex border rounded overflow-hidden text-xs">
                      <button
                        className={`px-2 py-1 ${
                          adjustmentForm.valueType === "fixed"
                            ? "bg-teal-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-100"
                        }`}
                        onClick={() =>
                          setAdjustmentForm({
                            ...adjustmentForm,
                            valueType: "fixed",
                          })
                        }
                      >
                        $
                      </button>
                      <button
                        className={`px-2 py-1 ${
                          adjustmentForm.valueType === "percentage"
                            ? "bg-teal-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-100"
                        }`}
                        onClick={() =>
                          setAdjustmentForm({
                            ...adjustmentForm,
                            valueType: "percentage",
                          })
                        }
                      >
                        %
                      </button>
                    </div>
                    <input
                      type="number"
                      placeholder={
                        adjustmentForm.valueType === "percentage"
                          ? "e.g. 10"
                          : "e.g. 50.00"
                      }
                      value={adjustmentForm.value}
                      onChange={(e) =>
                        setAdjustmentForm({
                          ...adjustmentForm,
                          value: e.target.value,
                        })
                      }
                      className="border rounded px-2 py-1 text-sm w-24 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Reason (required)"
                    value={adjustmentForm.reason}
                    onChange={(e) =>
                      setAdjustmentForm({
                        ...adjustmentForm,
                        reason: e.target.value,
                      })
                    }
                    className="border rounded px-2 py-1 text-sm w-full focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAddAdjustment}
                      disabled={
                        isAddingAdjustment ||
                        !adjustmentForm.value ||
                        !adjustmentForm.reason.trim()
                      }
                      className="bg-teal-600 text-white text-xs px-3 py-1 rounded hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {isAddingAdjustment && (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      )}
                      Add
                    </button>
                    <button
                      onClick={() => setAdjustmentForm(null)}
                      className="text-gray-500 text-xs hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              </div>

              {/* === Totals Section === */}
              <div className="space-y-2 pt-4 border-t border-gray-200">
                {/* Rush Fee — only if > 0 */}
                {quote.is_rush && quote.rush_fee > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      Rush Fee
                    </span>
                    <span>${quote.rush_fee?.toFixed(2) || "0.00"}</span>
                  </div>
                )}

                {/* Delivery Fee — only if > 0 */}
                {quote.delivery_fee > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>
                      Delivery ({quote.delivery_option?.name || "Standard"})
                    </span>
                    <span>${quote.delivery_fee?.toFixed(2) || "0.00"}</span>
                  </div>
                )}

                {/* Pre-tax Total */}
                <div className="flex justify-between text-sm font-medium text-gray-700 pt-2 border-t border-gray-100">
                  <span>Pre-tax Total</span>
                  <span>
                    ${((quote.total || 0) - (quote.tax_amount || 0)).toFixed(2)}
                  </span>
                </div>

                {/* Tax — editable dropdown */}
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <select
                      value={quote.tax_rate_id || taxRates.find(t => Math.abs(t.rate - (quote.tax_rate || 0)) < 0.001)?.id || ""}
                      onChange={(e) => handleTaxRateChange(e.target.value)}
                      disabled={isSavingTax}
                      className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-600 bg-white hover:border-gray-400 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50 max-w-[200px]"
                    >
                      {taxRates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.region_name} {t.tax_name} ({(t.rate * 100).toFixed(t.rate * 100 % 1 === 0 ? 0 : 2)}%)
                        </option>
                      ))}
                    </select>
                    {isSavingTax && (
                      <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
                    )}
                  </div>
                  <span>${quote.tax_amount?.toFixed(2) || "0.00"}</span>
                </div>

                {/* Grand Total */}
                <div className="flex justify-between text-base font-bold text-gray-900 pt-3 border-t border-gray-200">
                  <span>Total</span>
                  <span className="text-teal-700">
                    ${quote.total?.toFixed(2) || "0.00"} CAD
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Truck className="w-5 h-5 text-gray-400" />
              Delivery
            </h2>

            <div className="space-y-3">
              {quote.is_rush && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  <Zap className="w-4 h-4" />
                  <span className="font-medium">Rush Order</span>
                </div>
              )}

              {/* Digital Delivery Options */}
              {quote.digital_delivery_options && quote.digital_delivery_options.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500">Digital Delivery</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {quote.digital_delivery_options.map((optId: string) => {
                      const opt = deliveryOptionsList.find(o => o.id === optId);
                      return opt ? (
                        <span key={optId} className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                          {opt.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* Physical Delivery Method */}
              {quote.physical_delivery_option && (
                <div>
                  <p className="text-sm text-gray-500">Physical Delivery</p>
                  <p className="font-medium">
                    {quote.physical_delivery_option.name}
                  </p>
                </div>
              )}

              {/* Pickup Location */}
              {quote.pickup_location && (
                <div>
                  <p className="text-sm text-gray-500">Pickup Location</p>
                  <p className="font-medium">{quote.pickup_location.name}</p>
                  <p className="text-sm text-gray-600">
                    {[quote.pickup_location.address_line1, quote.pickup_location.city, quote.pickup_location.state, quote.pickup_location.postal_code].filter(Boolean).join(', ')}
                  </p>
                  {quote.pickup_location.hours && (
                    <p className="text-xs text-gray-500 mt-1">{quote.pickup_location.hours}</p>
                  )}
                </div>
              )}

              <div>
                <p className="text-sm text-gray-500">Estimated Delivery</p>
                <p className="font-medium">
                  {quote.estimated_delivery_date
                    ? format(
                        new Date(quote.estimated_delivery_date),
                        "MMMM d, yyyy",
                      )
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Addresses */}
          {addresses.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-gray-400" />
                Addresses
              </h2>

              <div className="space-y-4">
                {/* Billing Address */}
                {(() => {
                  const billing = addresses.find(
                    (a) => a.address_type === "billing",
                  );
                  if (!billing) return null;
                  return (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Billing Address
                      </p>
                      <div className="text-sm space-y-1">
                        <p className="font-medium">{billing.full_name}</p>
                        {billing.company_name && (
                          <p className="text-gray-600">{billing.company_name}</p>
                        )}
                        <p className="text-gray-600">{billing.address_line1}</p>
                        {billing.address_line2 && (
                          <p className="text-gray-600">{billing.address_line2}</p>
                        )}
                        <p className="text-gray-600">
                          {billing.city}, {billing.province} {billing.postal_code}
                        </p>
                        <p className="text-gray-600">{billing.country}</p>
                        {billing.phone && (
                          <p className="text-gray-500 text-xs mt-1">
                            {billing.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Shipping Address */}
                {(() => {
                  const shipping = addresses.find(
                    (a) => a.address_type === "shipping",
                  );
                  if (!shipping) return null;
                  return (
                    <div className="pt-4 border-t">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Shipping Address
                      </p>
                      <div className="text-sm space-y-1">
                        <p className="font-medium">{shipping.full_name}</p>
                        {shipping.company_name && (
                          <p className="text-gray-600">
                            {shipping.company_name}
                          </p>
                        )}
                        <p className="text-gray-600">{shipping.address_line1}</p>
                        {shipping.address_line2 && (
                          <p className="text-gray-600">
                            {shipping.address_line2}
                          </p>
                        )}
                        <p className="text-gray-600">
                          {shipping.city}, {shipping.province}{" "}
                          {shipping.postal_code}
                        </p>
                        <p className="text-gray-600">{shipping.country}</p>
                        {shipping.phone && (
                          <p className="text-gray-500 text-xs mt-1">
                            {shipping.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              Timeline
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span>
                  {format(new Date(quote.created_at), "MMM d, yyyy h:mm a")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last Updated</span>
                <span>
                  {format(new Date(quote.updated_at), "MMM d, yyyy h:mm a")}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Expires</span>
                <div className="flex items-center gap-2">
                  <span>
                    {quote.expires_at
                      ? format(new Date(quote.expires_at), "MMM d, yyyy")
                      : "—"}
                  </span>
                  {getExpiryBadge(quote.expires_at)}
                </div>
              </div>
            </div>
          </div>

          {/* ============ ACTIVITY LOG ACCORDION ============ */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Accordion Header — always visible */}
            <button
              onClick={toggleActivityLog}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-semibold text-gray-900">Activity Log</h3>
                {activityLogLoaded && activityLog.length > 0 && (
                  <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                    {activityLog.length}
                  </span>
                )}
              </div>
              {activityLogOpen ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {/* Accordion Body — only rendered when open */}
            {activityLogOpen && (
              <div className="px-6 pb-4 border-t border-gray-100">
                {activityLogLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    <span className="ml-2 text-sm text-gray-500">Loading activity...</span>
                  </div>
                ) : activityLog.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-400">No activity recorded yet</p>
                    <p className="text-xs text-gray-400 mt-1">Actions on this quote will appear here</p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-0">
                    {activityLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0"
                      >
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getActivityIconStyle(entry.action_type)}`}>
                          {getActivityIcon(entry.action_type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800">
                            {formatActivityDescription(entry)}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {entry.staff?.full_name || "System"} · {formatRelativeTime(entry.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment Info — visible only when quote is paid */}
          {['paid', 'converted'].includes(quote.status) && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-gray-400" />
                Payment Info
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Method</span>
                  <span className="font-medium">{quote.payment_method?.name || "Stripe"}</span>
                </div>
                {quote.payment_confirmed_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Confirmed</span>
                    <span>{format(new Date(quote.payment_confirmed_at), "MMM d, yyyy h:mm a")}</span>
                  </div>
                )}
                {quote.payment_confirmed_by && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Confirmed By</span>
                    <span className="font-medium">{quote.payment_confirmed_by.full_name}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={() => setShowMessageModal(true)}
          disabled={!currentStaff}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          <MessageSquare className="w-4 h-4" />
          Message Customer
        </button>
      </div>

      <MessageCustomerModal
        isOpen={showMessageModal}
        onClose={() => {
          setShowMessageModal(false);
          fetchConversationMessages();
        }}
        customerId={quote.customer_id}
        customerName={quote.customer?.full_name || "Customer"}
        customerEmail={quote.customer?.email || ""}
        quoteId={quote.id}
        staffId={currentStaff?.staffId || ""}
        staffName={currentStaff?.staffName || "Staff"}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Delete Quote
              </h3>
            </div>

            <p className="text-gray-600 mb-2">
              Are you sure you want to delete this quote?
            </p>

            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-gray-900">
                {quote?.quote_number}
              </p>
              <p className="text-sm text-gray-500">{quote?.customer?.email}</p>
            </div>

            <p className="text-sm text-gray-500 mb-6">
              This action will soft-delete the quote and all related data. The
              data will be permanently removed after 30 days.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteQuote}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Quote"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Quote Again Modal */}
      {showResendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Send className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Send Quote Again
                </h3>
                <p className="text-sm text-gray-500">{quote?.quote_number}</p>
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">This will:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Invalidate all previous magic links for this customer</li>
                  <li>Generate a fresh 30-day magic link</li>
                  <li>Send quote email to customer</li>
                  <li>Log this action in staff activity</li>
                </ul>
              </div>
            </div>

            {/* Customer Info */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-500 mb-2">
                Sending to:
              </p>
              <div className="text-sm">
                <p className="font-medium text-gray-900">
                  {quote?.customer?.full_name}
                </p>
                <p className="text-gray-600">{quote?.customer?.email}</p>
              </div>
            </div>

            {/* Custom Message (Optional) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Message (Optional)
              </label>
              <textarea
                value={resendCustomMessage}
                onChange={(e) => setResendCustomMessage(e.target.value)}
                placeholder="Add a personal note to the customer (e.g., 'We've updated your quote based on our conversation')..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                If provided, this message will be displayed prominently in the
                email to the customer.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResendModal(false);
                  setResendCustomMessage("");
                }}
                disabled={isResending}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResendQuote}
                disabled={isResending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {isResending ? "Sending..." : "Send Quote"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive Payment Modal */}
      {showReceivePaymentModal && quote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Receive Payment
                </h3>
                <p className="text-sm text-gray-500">
                  {quote.quote_number}
                </p>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="rounded-lg p-3 mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Important:</p>
                <p>
                  This will convert the quote to a paid order. Ensure payment has been received.
                </p>
              </div>
            </div>

            {/* Quote Summary */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-500 mb-2">
                Quote Summary
              </p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Customer:</span>
                  <span className="font-medium">
                    {quote.customer?.full_name || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium">
                    {quote.customer?.email || "—"}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="text-gray-600">Total Amount:</span>
                  <span className="font-bold text-lg text-violet-600">
                    ${quote.total?.toFixed(2) || "0.00"}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedPaymentMethodId}
                onChange={(e) => handlePaymentMethodChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={isProcessingPayment}
              >
                <option value="">Select payment method...</option>
                {paymentMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount Paid */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount Paid <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rpAmountPaid}
                  onChange={(e) => setRpAmountPaid(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                  disabled={isProcessingPayment}
                />
              </div>
            </div>

            {/* Balance Display */}
            {(() => {
              const totalAmount = quote.total || 0;
              const paid = parseFloat(rpAmountPaid) || 0;
              const balanceDue = Math.max(0, totalAmount - paid);
              const isPaidInFull = paid >= totalAmount;

              return (
                <div className={`mb-4 p-3 rounded-lg ${isPaidInFull ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${isPaidInFull ? "text-green-700" : "text-amber-700"}`}>
                      {isPaidInFull ? "Paid in Full" : "Balance Due:"}
                    </span>
                    <span className={`font-bold ${isPaidInFull ? "text-green-700" : "text-amber-700"}`}>
                      ${isPaidInFull ? paid.toFixed(2) : balanceDue.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Remarks */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Remarks (Optional)
              </label>
              <textarea
                value={rpRemarks}
                onChange={(e) => setRpRemarks(e.target.value)}
                placeholder="Payment reference, transaction ID, etc."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 resize-none"
                disabled={isProcessingPayment}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowReceivePaymentModal(false);
                  setSelectedPaymentMethodId("");
                  setSelectedPaymentMethodCode("");
                  setRpRemarks("");
                  setRpAmountPaid("");
                }}
                disabled={isProcessingPayment}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReceivePayment}
                disabled={
                  isProcessingPayment ||
                  !selectedPaymentMethodId ||
                  rpAmountPaid === "" ||
                  isNaN(parseFloat(rpAmountPaid)) ||
                  parseFloat(rpAmountPaid) < 0
                }
                className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {isProcessingPayment ? "Processing..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[90vw] h-[90vh] max-w-5xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <h3 className="font-medium text-gray-900 truncate">
                  {previewFile.displayName}
                </h3>
                {previewFile.fileSize > 0 && (
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    ({formatFileSize(previewFile.fileSize)})
                  </span>
                )}
                {previewFile.source === 'ocr' && (
                  <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded flex-shrink-0">
                    OCR
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleDownload(previewFile)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-teal-600 border border-teal-300 rounded-md hover:bg-teal-50"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={() => { setPreviewFile(null); setPreviewUrl(null); }}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-1 bg-gray-100">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                  <span className="ml-2 text-gray-500">Loading preview...</span>
                </div>
              ) : !previewUrl ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500">Failed to load preview. Try downloading instead.</p>
                </div>
              ) : previewFile.mimeType === 'application/pdf' ? (
                <iframe
                  src={`${previewUrl}#toolbar=1`}
                  className="w-full h-full rounded"
                  title={previewFile.displayName}
                />
              ) : previewFile.mimeType.startsWith('image/') ? (
                <div className="flex items-center justify-center h-full p-4">
                  <img
                    src={previewUrl}
                    alt={previewFile.displayName}
                    className="max-w-full max-h-full object-contain rounded shadow-lg"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500">Preview not available for this file type. Use download.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OCR & Analysis Modal */}
      {id && (
        <OcrAnalysisModal
          isOpen={showOcrModal}
          onClose={() => setShowOcrModal(false)}
          quoteId={id}
          quoteNumber={quote?.quote_number}
        />
      )}
    </div>
  );
}

