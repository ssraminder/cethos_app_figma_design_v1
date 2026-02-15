import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/CustomerAuthContext";
import CustomerLayout from "../../components/layouts/CustomerLayout";
import MessageComposer from "../../components/messaging/MessageComposer";
import FileAttachment from "../../components/messaging/FileAttachment";
import {
  Calendar,
  DollarSign,
  ArrowLeft,
  CreditCard,
  XCircle,
  RotateCcw,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  valid_until: string;
  source_language: string;
  target_language: string;
  country_of_issue: string;
  delivery_method: string;
  estimated_delivery_date: string;
  stripe_session_id: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  awaiting_payment: "bg-yellow-100 text-yellow-800",
  quote_ready: "bg-green-100 text-green-800",
  // DEPRECATED: HITL removed — replaced by review_required tag
  // hitl_pending: "bg-blue-100 text-blue-800",
  review_required: "bg-blue-100 text-blue-800",
  ai_processing: "bg-purple-100 text-purple-800",
  quote_expired: "bg-gray-100 text-gray-800",
  quote_cancelled: "bg-red-100 text-red-800",
  cancelled: "bg-orange-100 text-orange-800",
  paid: "bg-teal-100 text-teal-800",
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pending Payment",
  awaiting_payment: "Awaiting Payment",
  quote_ready: "Ready",
  // DEPRECATED: HITL removed — replaced by review_required tag
  // hitl_pending: "Under Review",
  review_required: "Under Review",
  ai_processing: "Processing",
  quote_expired: "Expired",
  quote_cancelled: "Cancelled",
  cancelled: "Cancelled",
  paid: "Paid",
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

export default function CustomerQuoteDetail() {
  const { id } = useParams();
  const { customer } = useAuth();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Files state
  const [quoteFiles, setQuoteFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // Messaging state
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [quoteMessages, setQuoteMessages] = useState<any[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageFilter, setMessageFilter] = useState<"quote" | "all">("quote");
  const [composerSending, setComposerSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filtered messages
  const filteredMessages =
    messageFilter === "quote"
      ? quoteMessages.filter((msg: any) => msg.quote_id === id)
      : quoteMessages;
  const quoteOnlyCount = quoteMessages.filter((msg: any) => msg.quote_id === id).length;

  useEffect(() => {
    if (id && customer?.id) {
      loadQuote();
    }
  }, [id, customer?.id]);

  useEffect(() => {
    if (!customer?.id || !id) return;

    const fetchFiles = async () => {
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
              customer_id: customer.id,
              context: "quote",
              quote_id: id,
            }),
          },
        );
        const data = await response.json();
        if (data.success) {
          setQuoteFiles(data.files || []);
        }
      } catch (err) {
        console.error("Error fetching quote files:", err);
      } finally {
        setFilesLoading(false);
      }
    };

    fetchFiles();
  }, [customer?.id, id]);

  const loadQuote = async () => {
    try {
      setLoading(true);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-customer-quote-detail?quote_id=${id}&customer_id=${customer?.id}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load quote");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to load quote");
      }

      setQuote(result.data);
    } catch (err) {
      console.error("Failed to load quote:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleMessages = () => {
    const willOpen = !messagesOpen;
    setMessagesOpen(willOpen);
    if (willOpen && !messagesLoaded) {
      fetchQuoteMessages();
    }
  };

  const fetchQuoteMessages = async () => {
    setMessagesLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-quote-messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ quote_id: id }),
        },
      );
      const result = await response.json();
      if (result.success) {
        setQuoteMessages(result.messages || []);
      }
      setMessagesLoaded(true);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleMessageSent = () => {
    setMessagesLoaded(false);
    fetchQuoteMessages();
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
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handlePayment = () => {
    if (quote?.id) {
      // Navigate to quote flow step 5 (delivery options)
      navigate(`/quote?quote_id=${quote.id}&step=5`);
    }
  };

  const handleDecline = async () => {
    if (!quote?.id || !customer?.id) return;

    const confirmed = window.confirm(
      "Are you sure you want to decline this quote? You can reopen it later if needed.",
    );

    if (!confirmed) return;

    setIsUpdating(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/update-quote-status?quote_id=${quote.id}&customer_id=${customer.id}&status=cancelled`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        },
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to decline quote");
      }

      toast({
        title: "Quote Cancelled",
        description: "The quote has been cancelled successfully.",
      });

      // Reload quote to show updated status
      loadQuote();
    } catch (error) {
      console.error("Failed to decline quote:", error);
      toast({
        title: "Error",
        description: "Failed to decline quote. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReopen = async () => {
    if (!quote?.id || !customer?.id) return;

    setIsUpdating(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/update-quote-status?quote_id=${quote.id}&customer_id=${customer.id}&status=quote_ready`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        },
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to reopen quote");
      }

      toast({
        title: "Quote Reopened",
        description: "The quote has been reopened and is now ready.",
      });

      // Reload quote to show updated status
      loadQuote();
    } catch (error) {
      console.error("Failed to reopen quote:", error);
      toast({
        title: "Error",
        description: "Failed to reopen quote. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

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

  if (!quote) {
    return (
      <CustomerLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">Quote not found</p>
            <Link
              to="/dashboard/quotes"
              className="text-red-600 hover:text-red-700 text-sm mt-2 inline-block"
            >
              ← Back to quotes
            </Link>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link
          to="/dashboard/quotes"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quotes
        </Link>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {quote.quote_number}
              </h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Created: {new Date(quote.created_at).toLocaleDateString()}
                </div>
                {quote.valid_until && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Valid until:{" "}
                    {new Date(quote.valid_until).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
            <span
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                STATUS_COLORS[quote.status] || "bg-gray-100 text-gray-800"
              }`}
            >
              {STATUS_LABELS[quote.status] || quote.status}
            </span>
          </div>
        </div>

        {/* Quote Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Quote Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Source Language</p>
              <p className="font-medium text-gray-900">
                {quote.source_language}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Target Language</p>
              <p className="font-medium text-gray-900">
                {quote.target_language}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Country of Issue</p>
              <p className="font-medium text-gray-900">
                {quote.country_of_issue}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Delivery Method</p>
              <p className="font-medium text-gray-900">
                {quote.delivery_method || "N/A"}
              </p>
            </div>
            {quote.estimated_delivery_date && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Estimated Delivery</p>
                <p className="font-medium text-gray-900">
                  {new Date(quote.estimated_delivery_date).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Pricing</h2>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-teal-600" />
              <span className="text-2xl font-bold text-gray-900">
                ${(quote.total_amount ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            All prices include applicable taxes and fees
          </p>
        </div>

        {/* Actions */}
        {(quote.status === "quote_ready" ||
          quote.status === "awaiting_payment") && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-6">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-semibold text-teal-900 mb-1">
                  Quote Ready
                </h3>
                <p className="text-sm text-teal-700">
                  Your quote is ready. Choose to proceed with payment or decline
                  if you're no longer interested.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handlePayment}
                  disabled={isUpdating}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CreditCard className="w-5 h-5" />
                  Pay Now
                </button>
                <button
                  onClick={handleDecline}
                  disabled={isUpdating}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle className="w-5 h-5" />
                  Decline Quote
                </button>
              </div>
            </div>
          </div>
        )}

        {quote.status === "pending_payment" && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-6">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-semibold text-teal-900 mb-1">
                  Pending Payment
                </h3>
                <p className="text-sm text-teal-700">
                  This quote is ready for payment. Click the button to proceed
                  to select delivery options and checkout.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handlePayment}
                  disabled={isUpdating}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CreditCard className="w-5 h-5" />
                  Pay Now
                </button>
                <button
                  onClick={handleDecline}
                  disabled={isUpdating}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle className="w-5 h-5" />
                  Decline Quote
                </button>
              </div>
            </div>
          </div>
        )}

        {quote.status === "cancelled" && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-orange-900 mb-1">
                    Quote Declined
                  </h3>
                  <p className="text-sm text-orange-700">
                    You have declined this quote. If you change your mind, you
                    can reopen it below.
                  </p>
                </div>
              </div>
              <button
                onClick={handleReopen}
                disabled={isUpdating}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-5 h-5" />
                {isUpdating ? "Reopening..." : "Reopen Quote"}
              </button>
            </div>
          </div>
        )}

        {quote.status === "paid" && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-green-900">
                  Payment Received
                </h3>
                <p className="text-sm text-green-700">
                  Your payment has been received and your order is being
                  processed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============ DOCUMENTS SECTION ============ */}
        {(() => {
          const sourceFiles = quoteFiles.filter(
            (f) => f.display_category === "source",
          );
          const referenceFiles = quoteFiles.filter(
            (f) => f.display_category === "reference",
          );

          return (
            <>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  marginBottom: 12,
                  marginTop: 24,
                }}
              >
                Documents
              </h3>

              {filesLoading ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "#9ca3af",
                  }}
                >
                  Loading files...
                </div>
              ) : quoteFiles.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "#9ca3af",
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    marginBottom: 16,
                  }}
                >
                  <p style={{ fontSize: 13, marginBottom: 4 }}>
                    No documents uploaded yet for this quote.
                  </p>
                </div>
              ) : (
                <>
                  <FileSection
                    title="Your Uploaded Documents"
                    icon="📁"
                    files={sourceFiles}
                    emptyText="No documents uploaded yet"
                  />
                  {referenceFiles.length > 0 && (
                    <FileSection
                      title="Reference Files"
                      icon="📎"
                      files={referenceFiles}
                    />
                  )}
                </>
              )}
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: "rgba(79,140,255,0.06)",
                  border: "1px solid rgba(79,140,255,0.15)",
                  fontSize: 12,
                  color: "#4F8CFF",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <span>ℹ️</span>
                <span>
                  Staff files and completed translations will appear on your{" "}
                  <strong>Order Details</strong> page after payment.
                </span>
              </div>
            </>
          );
        })()}

        {/* ============ MESSAGES SECTION ============ */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
          <button
            onClick={toggleMessages}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-semibold text-gray-900">
                Messages
              </h3>
              {quoteMessages.length > 0 && (
                <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  {messageFilter === "quote" && quoteMessages.length !== quoteOnlyCount
                    ? `${quoteOnlyCount} of ${quoteMessages.length}`
                    : filteredMessages.length}
                </span>
              )}
            </div>
            {messagesOpen ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {messagesOpen && (
            <div className="border-t border-gray-100">
              {/* Filter toggle */}
              {quoteMessages.length > 0 && (
                <div className="px-6 pt-3 pb-1 flex items-center">
                  <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setMessageFilter("quote")}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        messageFilter === "quote"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      This Quote ({quoteOnlyCount})
                    </button>
                    <button
                      onClick={() => setMessageFilter("all")}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        messageFilter === "all"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      All ({quoteMessages.length})
                    </button>
                  </div>
                </div>
              )}

              {/* Message thread */}
              <div className="px-6 py-4 max-h-96 overflow-y-auto space-y-3">
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : filteredMessages.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-400">
                      {messageFilter === "quote" && quoteMessages.length > 0
                        ? "No messages for this quote."
                        : "No messages yet"}
                    </p>
                    {messageFilter === "quote" && quoteMessages.length > 0 && (
                      <button
                        onClick={() => setMessageFilter("all")}
                        className="text-sm text-blue-600 hover:text-blue-700 mt-1"
                      >
                        View all {quoteMessages.length} messages
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {filteredMessages.map((msg: any) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender_type === "customer" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-xl px-4 py-3 ${
                            msg.sender_type === "customer"
                              ? "bg-blue-600 text-white"
                              : msg.sender_type === "system"
                                ? "bg-gray-50 text-gray-500 italic text-sm"
                                : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-xs font-medium ${
                                msg.sender_type === "customer"
                                  ? "text-blue-100"
                                  : "text-gray-500"
                              }`}
                            >
                              {msg.sender_name}
                            </span>
                            <span
                              className={`text-xs ${
                                msg.sender_type === "customer"
                                  ? "text-blue-200"
                                  : "text-gray-400"
                              }`}
                            >
                              {formatRelativeTime(msg.created_at)}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">
                            {msg.message_text}
                          </p>
                          {/* Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {msg.attachments.map((att: any) => (
                                <FileAttachment
                                  key={att.id}
                                  attachment={att}
                                  isOwn={msg.sender_type === "customer"}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Composer */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                <MessageComposer
                  customerId={customer?.id}
                  quoteId={id}
                  onMessageSent={handleMessageSent}
                  isSending={composerSending}
                  placeholder="Type a message..."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </CustomerLayout>
  );
}
