import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/CustomerAuthContext";
import CustomerLayout from "../../components/layouts/CustomerLayout";
import {
  FileText,
  Search,
  Calendar,
  DollarSign,
  Eye,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  valid_until: string;
  source_language: string;
  target_language: string;
  document_count: number;
}

// Statuses that should never appear in the quotes list (they belong in Orders)
const EXCLUDED_STATUSES = ["paid", "converted"];

const STATUS_COLORS: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  awaiting_payment: "bg-yellow-100 text-yellow-800",
  quote_ready: "bg-green-100 text-green-800",
  review_required: "bg-blue-100 text-blue-800",
  ai_processing: "bg-purple-100 text-purple-800",
  quote_expired: "bg-orange-100 text-orange-800",
  expired: "bg-orange-100 text-orange-800",
  quote_cancelled: "bg-red-100 text-red-800",
  cancelled: "bg-red-100 text-red-800",
  lead: "bg-gray-100 text-gray-800",
  draft: "bg-gray-100 text-gray-800",
  pending_review: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pending Payment",
  awaiting_payment: "Awaiting Payment",
  quote_ready: "Ready",
  review_required: "Under Review",
  ai_processing: "Processing",
  quote_expired: "Expired",
  expired: "Expired",
  quote_cancelled: "Cancelled",
  cancelled: "Cancelled",
  lead: "Lead",
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const EXPIRED_STATUSES = ["quote_expired", "expired"];
const CANCELLED_STATUSES = ["quote_cancelled", "cancelled"];

export default function CustomerQuotes() {
  const { customer } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => {
    if (customer?.id) {
      loadQuotes();
    }
  }, [customer?.id, statusFilter, searchTerm]);

  const loadQuotes = async () => {
    try {
      setLoading(true);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-customer-quotes?customer_id=${customer?.id}&status=${statusFilter}&search=${searchTerm}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load quotes");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to load quotes");
      }

      // Filter out paid/converted quotes — those belong in Orders
      const filtered = (result.data || []).filter(
        (q: Quote) => !EXCLUDED_STATUSES.includes(q.status),
      );
      setQuotes(filtered);
    } catch (err) {
      console.error("Failed to load quotes:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredQuotes = quotes.filter((quote) => {
    const matchesSearch = quote.quote_number
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || quote.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Separate active quotes from cancelled quotes
  const activeQuotes = filteredQuotes.filter(
    (q) => !CANCELLED_STATUSES.includes(q.status),
  );
  const cancelledQuotes = filteredQuotes.filter((q) =>
    CANCELLED_STATUSES.includes(q.status),
  );

  const isExpired = (quote: Quote) => EXPIRED_STATUSES.includes(quote.status);

  const renderQuoteCard = (quote: Quote) => {
    const expired = isExpired(quote);

    return (
      <div key={quote.id} className="relative">
        <Link
          to={`/dashboard/quotes/${quote.id}`}
          className={`block p-6 hover:bg-gray-50 transition-colors ${
            expired ? "bg-orange-50/50" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    expired ? "bg-orange-100" : "bg-blue-100"
                  }`}
                >
                  {expired ? (
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                  ) : (
                    <FileText className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {quote.quote_number}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {quote.source_language} → {quote.target_language}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 ml-13">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(quote.created_at).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  {quote.document_count} document
                  {quote.document_count !== 1 ? "s" : ""}
                </div>
                <div className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />${quote.total_amount.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  STATUS_COLORS[quote.status] || "bg-gray-100 text-gray-800"
                }`}
              >
                {STATUS_LABELS[quote.status] || quote.status}
              </span>
              <Eye className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </Link>

        {/* "Request New Quote" action for expired quotes */}
        {expired && (
          <div className="px-6 pb-4 pt-0 bg-orange-50/50">
            <div className="flex items-center gap-2 text-sm text-orange-700 mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span>This quote has expired</span>
            </div>
            <Link
              to="/quote"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Request New Quote
            </Link>
          </div>
        )}
      </div>
    );
  };

  return (
    <CustomerLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Quotes</h1>
          <p className="text-gray-600 mt-2">
            View and manage your translation quotes
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by quote number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter — excludes paid/converted since those are in Orders */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="quote_ready">Ready</option>
              <option value="awaiting_payment">Awaiting Payment</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="review_required">Under Review</option>
              <option value="ai_processing">Processing</option>
              <option value="approved">Approved</option>
              <option value="quote_expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Quotes List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="animate-pulse space-y-4">
              <div className="h-20 bg-gray-200 rounded"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
            </div>
          </div>
        ) : activeQuotes.length > 0 || cancelledQuotes.length > 0 ? (
          <>
            {/* Active Quotes */}
            {activeQuotes.length > 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
                {activeQuotes.map((quote) => renderQuoteCard(quote))}
              </div>
            ) : statusFilter === "all" ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No active quotes
                </h3>
                <p className="text-gray-500 mb-6">
                  You have no active quotes right now.
                </p>
                <Link
                  to="/quote"
                  className="inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  Start New Quote
                </Link>
              </div>
            ) : null}

            {/* Cancelled Quotes — collapsed section */}
            {cancelledQuotes.length > 0 &&
              (statusFilter === "all" || CANCELLED_STATUSES.includes(statusFilter)) && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowCancelled(!showCancelled)}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-2 transition-colors"
                  >
                    {showCancelled ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    {showCancelled ? "Hide" : "Show"} cancelled quotes (
                    {cancelledQuotes.length})
                  </button>
                  {showCancelled && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200 opacity-75">
                      {cancelledQuotes.map((quote) => renderQuoteCard(quote))}
                    </div>
                  )}
                </div>
              )}
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || statusFilter !== "all"
                ? "No quotes found"
                : "No active quotes"}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Get started by creating your first quote"}
            </p>
            <Link
              to="/quote"
              className="inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Start New Quote
            </Link>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
