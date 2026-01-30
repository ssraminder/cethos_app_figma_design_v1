import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  AlertCircle,
  ArrowLeft,
  Building,
  Clock,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  Languages,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  Trash2,
  Truck,
  User,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import MessageCustomerModal from "../../components/admin/MessageCustomerModal";

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
  source_language?: { id: string; name: string; code: string };
  target_language?: { id: string; name: string; code: string };
  country_of_issue: string;
  special_instructions: string;
  subtotal: number;
  certification_total: number;
  rush_fee: number;
  delivery_fee: number;
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
}

interface QuoteFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_path: string;
  upload_status: string;
  created_at: string;
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
}

interface Message {
  id: string;
  sender_type: string;
  message_text: string;
  created_at: string;
  sender_name: string;
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

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  details_pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  quote_ready: "bg-green-100 text-green-700",
  hitl_pending: "bg-amber-100 text-amber-700",
  hitl_in_review: "bg-amber-100 text-amber-700",
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
  hitl_pending: "HITL Pending",
  hitl_in_review: "HITL In Review",
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

export default function AdminQuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [files, setFiles] = useState<QuoteFile[]>([]);
  const [analysis, setAnalysis] = useState<AIAnalysis[]>([]);
  const [hitlReviews, setHitlReviews] = useState<HITLReview[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [certifications, setCertifications] = useState<DocumentCertification[]>([]);
  const [addresses, setAddresses] = useState<QuoteAddress[]>([]);
  const [adjustments, setAdjustments] = useState<QuoteAdjustment[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showResendModal, setShowResendModal] = useState(false);
  const [resendCustomMessage, setResendCustomMessage] = useState("");
  const [isResending, setIsResending] = useState(false);

  const { session: currentStaff } = useAdminAuthContext();

  useEffect(() => {
    if (id) {
      fetchQuoteDetails();
    }
  }, [id]);

  const fetchQuoteDetails = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(
          `
          *,
          customer:customers(id, full_name, email, phone, customer_type),
          source_language:languages!source_language_id(id, name, code),
          target_language:languages!target_language_id(id, name, code),
          delivery_option:delivery_options!delivery_option_id(id, name, price, description),
          physical_delivery_option:delivery_options!physical_delivery_option_id(id, name, price)
        `,
        )
        .eq("id", id)
        .single();

      if (quoteError) throw quoteError;
      setQuote(quoteData as QuoteDetail);

      const { data: filesData } = await supabase
        .from("quote_files")
        .select("*")
        .eq("quote_id", id)
        .order("sort_order");
      setFiles(filesData || []);

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

      // Fetch document certifications
      const { data: certificationsData } = await supabase
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
        .eq("quote_id", id);
      setCertifications(certificationsData || []);

      // Fetch addresses
      const { data: addressesData } = await supabase
        .from("quote_addresses")
        .select("*")
        .eq("quote_id", id);
      setAddresses(addressesData || []);

      // Fetch quote adjustments
      const { data: adjustmentsData } = await supabase
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", id)
        .order("created_at");
      setAdjustments(adjustmentsData || []);

      if (quoteData?.status === "converted") {
        const { data: orderData } = await supabase
          .from("orders")
          .select("id")
          .eq("quote_id", id)
          .single();
        setOrderId(orderData?.id || null);
      }
    } catch (err: any) {
      console.error("Error fetching quote:", err);
      setError(err.message || "Failed to load quote");
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
          status: "hitl_in_review",
          processing_status: "hitl_in_review",
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
          status: "hitl_in_review",
          processing_status: "hitl_in_review",
        })
        .eq("id", id);

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

      setShowResendModal(false);
      setResendCustomMessage("");
    } catch (error) {
      console.error("Failed to resend quote:", error);
      alert("Failed to resend quote email: " + (error as Error).message);
    } finally {
      setIsResending(false);
    }
  };

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
        <Link
          to="/admin/quotes"
          className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quotes
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {quote.quote_number}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span
                className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                  STATUS_STYLES[quote.status] || "bg-gray-100 text-gray-700"
                }`}
              >
                {STATUS_LABELS[quote.status] || quote.status}
              </span>
              <span className="text-gray-500 text-sm">
                Created{" "}
                {format(new Date(quote.created_at), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {orderId && (
              <Link
                to={`/admin/orders/${orderId}`}
                className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-200"
              >
                View Order
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}

            {/* Send Quote Again Button - show for quote_ready status */}
            {quote.status === "quote_ready" && (
              <button
                onClick={() => setShowResendModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Send className="w-4 h-4" />
                Send Quote Again
              </button>
            )}

            {/* Delete Quote Button */}
            {!orderId && !["paid", "converted"].includes(quote.status) ? (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Quote
              </button>
            ) : (
              orderId && (
                <button
                  disabled
                  className="flex items-center gap-2 px-4 py-2 text-gray-400 border border-gray-200 rounded-lg cursor-not-allowed"
                  title="Cannot delete - converted to order"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Quote
                </button>
              )
            )}
          </div>
        </div>
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
                <p className="text-sm text-gray-500">Turnaround</p>
                <p className="font-medium">
                  {quote.turnaround_days} business day
                  {quote.turnaround_days !== 1 ? "s" : ""}
                </p>
              </div>
              {quote.special_instructions && (
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">Special Instructions</p>
                  <p className="font-medium">{quote.special_instructions}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-400" />
              Uploaded Files ({files.length})
            </h2>

            {files.length > 0 ? (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-sm">{file.file_name}</p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.file_size)} • {file.mime_type}
                        </p>
                      </div>
                    </div>
                    <a
                      href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${file.file_path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-600 hover:text-teal-700"
                    >
                      <Download className="w-5 h-5" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No files uploaded</p>
            )}
          </div>

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
                    const file = files.find((f) => f.id === item.quote_file_id);
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
                        {file?.file_name || `Document ${index + 1}`}
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
                          <span className="text-gray-500">Base Rate:</span>
                          <span className="font-medium">
                            $
                            {Number(currentAnalysis.base_rate || 65).toFixed(2)}
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

          {messages.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-gray-400" />
                Messages ({messages.length})
              </h2>

              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-lg ${
                      msg.sender_type === "staff"
                        ? "bg-teal-50 ml-8"
                        : msg.sender_type === "customer"
                          ? "bg-gray-50 mr-8"
                          : "bg-blue-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {msg.sender_name}
                        <span className="text-gray-400 font-normal ml-1">
                          ({msg.sender_type})
                        </span>
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(msg.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{msg.message_text}</p>
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
              Pricing Summary
            </h2>

            <div className="space-y-4">
              {/* Per-Document Breakdown */}
              {analysis.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Documents
                  </p>
                  {analysis.map((item, index) => {
                    const file = files.find(
                      (f) => f.id === item.quote_file_id,
                    );
                    return (
                      <div
                        key={item.id}
                        className="flex justify-between text-sm py-1"
                      >
                        <span
                          className="text-gray-600 truncate max-w-[60%]"
                          title={file?.file_name}
                        >
                          {file?.file_name || `Document ${index + 1}`}
                        </span>
                        <span className="font-medium">
                          ${Number(item.line_total || 0).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-sm pt-1 border-t">
                    <span className="text-gray-700 font-medium">Subtotal</span>
                    <span className="font-medium">
                      ${quote.subtotal?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                </div>
              )}

              {/* Certifications Total */}
              {quote.certification_total > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Certification Total</span>
                  <span>
                    ${quote.certification_total?.toFixed(2) || "0.00"}
                  </span>
                </div>
              )}

              {/* Adjustments */}
              {adjustments.length > 0 && (
                <div className="space-y-1 py-2 border-t border-b">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Adjustments
                  </p>
                  {adjustments.map((adj) => (
                    <div key={adj.id} className="flex justify-between text-sm">
                      <span
                        className={
                          adj.adjustment_type === "discount"
                            ? "text-green-600"
                            : "text-orange-600"
                        }
                      >
                        {adj.adjustment_type === "discount"
                          ? "Discount"
                          : "Surcharge"}
                        {adj.reason && (
                          <span className="text-gray-400 text-xs ml-1">
                            ({adj.reason})
                          </span>
                        )}
                      </span>
                      <span
                        className={
                          adj.adjustment_type === "discount"
                            ? "text-green-600"
                            : "text-orange-600"
                        }
                      >
                        {adj.adjustment_type === "discount" ? "-" : "+"}$
                        {Math.abs(adj.calculated_amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Rush Fee */}
              {quote.is_rush && quote.rush_fee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-500" />
                    Rush Fee
                  </span>
                  <span>${quote.rush_fee?.toFixed(2) || "0.00"}</span>
                </div>
              )}

              {/* Delivery Fee */}
              {quote.delivery_fee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Delivery ({quote.delivery_option?.name || "Standard"})
                  </span>
                  <span>${quote.delivery_fee?.toFixed(2) || "0.00"}</span>
                </div>
              )}

              {/* Tax */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">
                  Tax ({((quote.tax_rate || 0) * 100).toFixed(0)}%)
                </span>
                <span>${quote.tax_amount?.toFixed(2) || "0.00"}</span>
              </div>

              {/* Total */}
              <div className="border-t pt-3 mt-3 flex justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-xl font-bold text-teal-600">
                  ${quote.total?.toFixed(2) || "0.00"} CAD
                </span>
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

              <div>
                <p className="text-sm text-gray-500">Method</p>
                <p className="font-medium">
                  {quote.delivery_option?.name || "—"}
                </p>
                {quote.delivery_option?.description && (
                  <p className="text-xs text-gray-500 mt-1">
                    {quote.delivery_option.description}
                  </p>
                )}
              </div>

              {quote.physical_delivery_option && (
                <div>
                  <p className="text-sm text-gray-500">Physical Delivery</p>
                  <p className="font-medium">
                    {quote.physical_delivery_option.name}
                  </p>
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
        </div>
      </div>

      <div className="mt-8 bg-white border rounded-lg p-6 flex flex-wrap items-center gap-3">
        {!hitlReview && (
          <button
            onClick={startReview}
            disabled={actionLoading || !currentStaff}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Start Review
          </button>
        )}
        {["processing", "hitl_pending"].includes(quote.status) && (
          <>
            <button
              onClick={approveQuote}
              disabled={actionLoading || !currentStaff}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Approve Quote
            </button>
            <button
              onClick={requestBetterScan}
              disabled={actionLoading || !currentStaff}
              className="px-4 py-2 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50"
            >
              Request Better Scan
            </button>
          </>
        )}
        <button
          onClick={() => setShowMessageModal(true)}
          disabled={!currentStaff}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Message Customer
        </button>
      </div>

      <MessageCustomerModal
        isOpen={showMessageModal}
        onClose={() => setShowMessageModal(false)}
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
    </div>
  );
}

