import { useEffect, useState } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
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
  MessageSquare,
  Phone,
  RefreshCw,
  Truck,
  User,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import MessagePanel from "../../components/messaging/MessagePanel";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

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
  delivery_option?: { id: string; name: string; price?: number };
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
  document_type: string;
  detected_language: string;
  word_count: number;
  page_count: number;
  complexity: string;
  overall_confidence: number;
  translation_cost: number;
  certification_cost: number;
}

interface DocumentTypeOption {
  id: string;
  name: string;
  code: string;
}

interface LanguageOption {
  id: string;
  name: string;
  code: string;
}

type EditField = "document_type" | "language" | "complexity" | "word_count";

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

export default function AdminQuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [files, setFiles] = useState<QuoteFile[]>([]);
  const [analysis, setAnalysis] = useState<AIAnalysis[]>([]);
  const [hitlReviews, setHitlReviews] = useState<HITLReview[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [editModal, setEditModal] = useState<{
    field: EditField;
    currentValue: string | number;
    analysisId: string;
    aiValue: string | number;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);

  const { session: currentStaff } = useAdminAuthContext();

  useEffect(() => {
    if (id) {
      fetchQuoteDetails();
      fetchReferenceData();
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
          customer:customers(*),
          source_language:languages!source_language_id(id, name, code),
          target_language:languages!target_language_id(id, name, code),
          delivery_option:delivery_options!delivery_option_id(id, name, price)
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
          assigned_to:staff_users!hitl_reviews_assigned_to_fkey(full_name)
        `,
        )
        .eq("quote_id", id)
        .order("created_at", { ascending: false });

      setHitlReviews(
        (hitlData || []).map((review: any) => ({
          ...review,
          assigned_to_name: review.assigned_to?.full_name || "Unassigned",
        })),
      );

      const { data: messagesData } = await supabase
        .from("quote_messages")
        .select(
          `
          *,
          sender_staff:staff_users!quote_messages_sender_staff_id_fkey(full_name),
          sender_customer:customers!quote_messages_sender_customer_id_fkey(full_name)
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

          {orderId && (
            <Link
              to={`/admin/orders/${orderId}`}
              className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-200"
            >
              View Order
              <ExternalLink className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

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
                AI Analysis
              </h2>

              <div className="space-y-4">
                {analysis.map((item, index) => (
                  <div key={item.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Document {index + 1}</span>
                      <span className="text-sm text-gray-500">
                        Confidence: {(item.overall_confidence * 100).toFixed(0)}
                        %
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Type</p>
                        <p className="font-medium">
                          {item.document_type || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Language</p>
                        <p className="font-medium">
                          {item.detected_language || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Words</p>
                        <p className="font-medium">
                          {item.word_count?.toLocaleString() || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Complexity</p>
                        <p className="font-medium capitalize">
                          {item.complexity || "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
              Pricing
            </h2>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>${quote.subtotal?.toFixed(2) || "0.00"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Certification</span>
                <span>${quote.certification_total?.toFixed(2) || "0.00"}</span>
              </div>
              {quote.is_rush && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-500" />
                    Rush Fee
                  </span>
                  <span>${quote.rush_fee?.toFixed(2) || "0.00"}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery</span>
                <span>${quote.delivery_fee?.toFixed(2) || "0.00"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">
                  Tax ({((quote.tax_rate || 0) * 100).toFixed(0)}%)
                </span>
                <span>${quote.tax_amount?.toFixed(2) || "0.00"}</span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span className="text-lg">
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
              </div>

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
              <div className="flex justify-between">
                <span className="text-gray-500">Expires</span>
                <span>
                  {quote.expires_at
                    ? format(new Date(quote.expires_at), "MMM d, yyyy")
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
