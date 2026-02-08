import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  AlertCircle,
  ArrowLeft,
  Building,
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
  const [previewFile, setPreviewFile] = useState<QuoteFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
          quote_source:quote_sources(id, code, name),
          source_language:languages!source_language_id(id, name, code, price_multiplier),
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
      // Parse billing_address and shipping_address from quote data
      const addressesFromQuote: QuoteAddress[] = [];
      if (quoteData?.billing_address) {
        const billing = quoteData.billing_address;
        addressesFromQuote.push({
          id: 'billing',
          quote_id: id!,
          address_type: 'billing',
          full_name: billing.name || billing.full_name || '',
          company_name: billing.company_name,
          address_line1: billing.address_line1 || '',
          address_line2: billing.address_line2,
          city: billing.city || '',
          province: billing.province || billing.state || '',
          postal_code: billing.postal_code || '',
          country: billing.country || 'Canada',
          phone: billing.phone,
        });
      }
      if (quoteData?.shipping_address) {
        const shipping = quoteData.shipping_address;
        addressesFromQuote.push({
          id: 'shipping',
          quote_id: id!,
          address_type: 'shipping',
          full_name: shipping.name || shipping.full_name || '',
          company_name: shipping.company_name,
          address_line1: shipping.address_line1 || '',
          address_line2: shipping.address_line2,
          city: shipping.city || '',
          province: shipping.province || shipping.state || '',
          postal_code: shipping.postal_code || '',
          country: shipping.country || 'Canada',
          phone: shipping.phone,
        });
      }
      setAddresses(addressesFromQuote);

      // Fetch quote adjustments
      const { data: adjustmentsData } = await supabase
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", id)
        .order("created_at");
      setAdjustments(adjustmentsData || []);

      // Fetch active tax rates
      const { data: taxRatesData } = await supabase
        .from("tax_rates")
        .select("id, region_code, region_name, tax_name, rate")
        .eq("is_active", true)
        .order("region_name");
      setTaxRates(taxRatesData || []);

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

  const openPreview = async (file: QuoteFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('quote-files')
        .createSignedUrl(file.storage_path, 3600);
      if (error) throw error;
      setPreviewUrl(data.signedUrl);
      setPreviewFile(file);
    } catch (err) {
      console.error('Preview error:', err);
      alert('Failed to load file preview');
    }
  };

  const handleDownloadFile = async (file: QuoteFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('quote-files')
        .createSignedUrl(file.storage_path, 3600);
      if (error) throw error;
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = file.original_filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download file');
    }
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

      alert("Payment link sent to customer!");
      await fetchQuoteDetails();
    } catch (error) {
      console.error("Failed to send payment link:", error);
      alert("Failed to send payment link: " + (error as Error).message);
    } finally {
      setIsSendingLink(false);
    }
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

            {/* Send Quote Link & Send Payment Link - hidden when paid or converted */}
            {!isConvertedToOrder && (
              <>
                {/* Send Quote Link Button - purple outline */}
                <button
                  onClick={handleSendQuoteLink}
                  disabled={isSendingLink}
                  className="flex items-center gap-2 px-4 py-2 border border-purple-300 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  {isSendingLink ? "Sending..." : "Send Quote Link"}
                </button>

                {/* Send Payment Link Button - purple solid */}
                <button
                  onClick={handleSendPaymentLink}
                  disabled={isSendingLink}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  {isSendingLink ? "Sending..." : "Send Payment Link"}
                </button>
              </>
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
                    className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg ${
                      file.mime_type === 'application/pdf' || file.mime_type.startsWith('image/')
                        ? 'cursor-pointer hover:bg-gray-100 transition-colors'
                        : ''
                    }`}
                    onClick={() => {
                      if (file.mime_type === 'application/pdf' || file.mime_type.startsWith('image/')) {
                        openPreview(file);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-sm">{file.original_filename}</p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.file_size)} • {file.mime_type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {(file.mime_type === 'application/pdf' || file.mime_type.startsWith('image/')) && (
                        <button
                          onClick={() => openPreview(file)}
                          className="text-blue-600 hover:text-blue-700"
                          title="Preview"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDownloadFile(file)}
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
                        {file?.original_filename || `Document ${index + 1}`}
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
                              const baseRate = Number(currentAnalysis.base_rate || 65);
                              const langMult = (quote as any).source_language?.price_multiplier || 1.0;
                              return (Math.ceil(baseRate * langMult / 2.5) * 2.5).toFixed(2);
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
                          title={file?.original_filename}
                        >
                          {file?.original_filename || `Document ${index + 1}`}
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

              {/* Tax — editable dropdown */}
              <div className="flex justify-between items-center text-sm">
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

      {/* File Preview Modal */}
      {previewFile && previewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[90vw] h-[90vh] max-w-5xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-400" />
                <h3 className="font-medium text-gray-900 truncate max-w-md">
                  {previewFile.original_filename}
                </h3>
                <span className="text-xs text-gray-500">
                  ({formatFileSize(previewFile.file_size)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadFile(previewFile)}
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
              {previewFile.mime_type === 'application/pdf' ? (
                <iframe
                  src={`${previewUrl}#toolbar=1`}
                  className="w-full h-full rounded"
                  title={previewFile.original_filename}
                />
              ) : previewFile.mime_type.startsWith('image/') ? (
                <div className="flex items-center justify-center h-full">
                  <img
                    src={previewUrl}
                    alt={previewFile.original_filename}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Preview not available for this file type
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

