import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import {
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
  RefreshCw,
  Trash2,
  X,
  Clock,
  MoreVertical,
  Eye,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { formatEntryPoint, entryPointBadgeColor } from "../../utils/quoteUtils";

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  processing_status: string;
  review_required_reasons: string[] | null;
  total: number;
  is_rush: boolean;
  created_at: string;
  expires_at: string;
  customer_email: string;
  customer_name: string;
  source_language_name: string;
  target_language_name: string;
  file_count: number;
  converted_to_order_id?: string | null;
  entry_point: string | null;
}

const BUSINESS_STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "details_pending", label: "Incomplete" },
  { value: "lead", label: "New Lead" },
  { value: "pending_payment", label: "Pending Payment" },
  { value: "paid", label: "Paid" },
  { value: "in_review", label: "In Review" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

const PROCESSING_STATUS_OPTIONS = [
  { value: "", label: "All Processing" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "quote_ready", label: "Quote Ready" },
  { value: "review_required", label: "Review Required" },
];

const PAGE_SIZE = 25;

export default function AdminQuotesList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Bulk delete state
  const [selectedQuotes, setSelectedQuotes] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Attention count state
  const [reviewRequiredCount, setReviewRequiredCount] = useState(0);
  const [newLeadCount, setNewLeadCount] = useState(0);

  // Actions menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const { session: currentStaff } = useAdminAuthContext();

  // Filters from URL
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const processingStatus = searchParams.get("processing") || "";
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";
  const rushOnly = searchParams.get("rush") === "true";
  const page = parseInt(searchParams.get("page") || "1", 10);

  // Local filter state (for inputs before applying)
  const [searchInput, setSearchInput] = useState(search);
  const [showFilters, setShowFilters] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false); // Show quotes without customer info

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

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("quotes")
        .select(
          `
          id,
          quote_number,
          status,
          processing_status,
          review_required_reasons,
          total,
          is_rush,
          created_at,
          expires_at,
          converted_to_order_id,
          entry_point,
          customer:customers(id, full_name, email),
          source_language:languages!source_language_id(id, name, code),
          target_language:languages!target_language_id(id, name, code),
          quote_files(count)
        `,
          { count: "exact" },
        )
        .is("deleted_at", null);

      // Apply filters
      if (search) {
        query = query.or(
          `quote_number.ilike.%${search}%,customers.email.ilike.%${search}%,customers.full_name.ilike.%${search}%`,
        );
      }
      if (status) {
        query = query.eq("status", status);
      }
      if (processingStatus) {
        query = query.eq("processing_status", processingStatus);
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom);
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo + "T23:59:59");
      }
      if (rushOnly) {
        query = query.eq("is_rush", true);
      }

      // Filter expired quotes (unless showExpired is true)
      if (!showExpired) {
        query = query.or(
          `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`,
        );
      }

      // Filter incomplete quotes (status=details_pending) unless showIncomplete is true
      if (!showIncomplete && !status) {
        query = query.neq("status", "details_pending");
      }

      // Pagination
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;

      const transformedQuotes =
        (data || []).map((quote: any) => ({
          id: quote.id,
          quote_number: quote.quote_number,
          status: quote.status,
          processing_status: quote.processing_status || "pending",
          review_required_reasons: quote.review_required_reasons,
          total: quote.total,
          is_rush: quote.is_rush,
          created_at: quote.created_at,
          expires_at: quote.expires_at,
          converted_to_order_id: quote.converted_to_order_id,
          customer_email: quote.customer?.email || "",
          customer_name: quote.customer?.full_name || "",
          source_language_name: quote.source_language?.name || "",
          target_language_name: quote.target_language?.name || "",
          file_count: quote.quote_files?.[0]?.count ?? 0,
          entry_point: quote.entry_point ?? null,
        })) || [];

      setQuotes(transformedQuotes);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Failed to fetch quotes:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttentionCounts = async () => {
    try {
      const [reviewRes, leadRes] = await Promise.all([
        supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("processing_status", "review_required")
          .is("deleted_at", null),
        supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("status", "lead")
          .is("deleted_at", null),
      ]);
      setReviewRequiredCount(reviewRes.count || 0);
      setNewLeadCount(leadRes.count || 0);
    } catch {
      // Non-critical
    }
  };

  useEffect(() => {
    fetchQuotes();
    fetchAttentionCounts();
  }, [search, status, processingStatus, dateFrom, dateTo, rushOnly, showExpired, page]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1"); // Reset to page 1 on filter change
    setSearchParams(params);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter("search", searchInput);
  };

  const clearFilters = () => {
    setSearchParams({});
    setSearchInput("");
  };

  // Check if quote can be deleted
  const canDeleteQuote = (quote: Quote) => {
    return (
      !quote.converted_to_order_id &&
      !["paid", "converted"].includes(quote.status)
    );
  };

  // Toggle single selection
  const toggleQuoteSelection = (quoteId: string) => {
    setSelectedQuotes((prev) =>
      prev.includes(quoteId)
        ? prev.filter((id) => id !== quoteId)
        : [...prev, quoteId],
    );
  };

  // Toggle all (only deletable quotes)
  const toggleSelectAll = () => {
    const deletableQuotes = quotes.filter(canDeleteQuote);

    if (selectedQuotes.length === deletableQuotes.length) {
      setSelectedQuotes([]);
    } else {
      setSelectedQuotes(deletableQuotes.map((q) => q.id));
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (!currentStaff?.staffId) return;
    setIsBulkDeleting(true);
    const deletedAt = new Date().toISOString();

    try {
      // Process each quote individually to respect RLS policies
      for (const quoteId of selectedQuotes) {
        // Soft delete quote (only set deleted_at, don't change status)
        const { error: quoteError } = await supabase
          .from("quotes")
          .update({ deleted_at: deletedAt })
          .eq("id", quoteId);

        if (quoteError) {
          console.error(`Failed to delete quote ${quoteId}:`, quoteError);
          continue; // Continue with other quotes even if one fails
        }

        // Cascade to related tables for this quote
        await Promise.all([
          supabase
            .from("quote_files")
            .update({ deleted_at: deletedAt })
            .eq("quote_id", quoteId),
          supabase
            .from("ai_analysis_results")
            .update({ deleted_at: deletedAt })
            .eq("quote_id", quoteId),
          // DEPRECATED: HITL removed — replaced by review_required tag
          // supabase
          //   .from("hitl_reviews")
          //   .update({ deleted_at: deletedAt })
          //   .eq("quote_id", quoteId),
        ]);
      }

      // Log to audit (one entry for bulk action)
      await supabase.from("staff_activity_log").insert({
        staff_id: currentStaff.staffId,
        action_type: "bulk_delete_quotes",
        entity_type: "quote",
        entity_id: null,
        details: {
          quote_ids: selectedQuotes,
          count: selectedQuotes.length,
        },
      });

      // Refresh list
      await fetchQuotes();
      setSelectedQuotes([]);
    } catch (error) {
      console.error("Failed to delete quotes:", error);
      alert("Failed to delete quotes. Please try again.");
    } finally {
      setIsBulkDeleting(false);
      setShowBulkDeleteModal(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasActiveFilters = search || status || processingStatus || dateFrom || dateTo || rushOnly;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Quotes</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount.toLocaleString()} total quotes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { fetchQuotes(); fetchAttentionCounts(); }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
          <Link
            to="/admin/quotes/fast-create"
            className="flex items-center gap-2 px-4 py-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors"
          >
            <Zap className="w-4 h-4" />
            Fast Quote
          </Link>
        </div>
      </div>

      {(reviewRequiredCount > 0 || newLeadCount > 0) && (
        <div className="flex items-center gap-3 mb-4">
          {reviewRequiredCount > 0 && (
            <button
              onClick={() => {
                const params = new URLSearchParams();
                params.set("processing", "review_required");
                setSearchParams(params);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                processingStatus === "review_required"
                  ? "bg-red-100 text-red-800 ring-2 ring-red-300"
                  : "bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              {reviewRequiredCount} Needs Review
            </button>
          )}
          {newLeadCount > 0 && (
            <button
              onClick={() => {
                const params = new URLSearchParams();
                params.set("status", "lead");
                setSearchParams(params);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                status === "lead"
                  ? "bg-blue-100 text-blue-800 ring-2 ring-blue-300"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              <FileText className="w-4 h-4" />
              {newLeadCount} New Lead{newLeadCount !== 1 ? "s" : ""}
            </button>
          )}
          {(processingStatus || status) && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Show all
            </button>
          )}
        </div>
      )}

      <div>
        {/* Search & Filters Bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 md:max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search quotes..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </form>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                hasActiveFilters
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                  {
                    [search, status, processingStatus, dateFrom, dateTo, rushOnly].filter(Boolean)
                      .length
                  }
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
              />
            </button>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => updateFilter("status", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {BUSINESS_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Processing Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Processing
                </label>
                <select
                  value={processingStatus}
                  onChange={(e) => updateFilter("processing", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {PROCESSING_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => updateFilter("from", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => updateFilter("to", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Rush Only */}
              <div className="flex flex-col gap-2 items-start">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rushOnly}
                    onChange={(e) =>
                      updateFilter("rush", e.target.checked ? "true" : "")
                    }
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Rush orders only
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showExpired}
                    onChange={(e) => setShowExpired(e.target.checked)}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700">
                    Show expired quotes
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showIncomplete}
                    onChange={(e) => setShowIncomplete(e.target.checked)}
                    className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <span className="text-sm text-gray-700">
                    Show incomplete quotes
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Bulk Action Bar */}
        {selectedQuotes.length > 0 && (
          <div className="bg-gray-50 border rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {selectedQuotes.length} quote
              {selectedQuotes.length > 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedQuotes([])}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Clear selection
              </button>
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={
                        selectedQuotes.length > 0 &&
                        selectedQuotes.length ===
                          quotes.filter(canDeleteQuote).length
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quote Details
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date / Expiry
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                    </td>
                  </tr>
                ) : quotes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      No quotes found
                    </td>
                  </tr>
                ) : (
                  quotes.map((quote) => (
                    <tr
                      key={quote.id}
                      className={`hover:bg-gray-50 transition-colors ${
                        quote.processing_status === "review_required" ? "bg-red-50/40" : ""
                      }`}
                    >
                      <td className="px-3 py-3">
                        {canDeleteQuote(quote) ? (
                          <input
                            type="checkbox"
                            checked={selectedQuotes.includes(quote.id)}
                            onChange={() => toggleQuoteSelection(quote.id)}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            disabled
                            className="rounded border-gray-200 bg-gray-100 cursor-not-allowed"
                            title="Cannot delete - converted to order"
                          />
                        )}
                      </td>
                      {/* Combined Quote Details Column */}
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/quotes/${quote.id}`}
                          className="block group"
                        >
                          <p className="text-sm font-semibold text-gray-900 font-mono group-hover:text-teal-600">
                            {quote.quote_number}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {quote.file_count} file
                            {quote.file_count !== 1 ? "s" : ""} •{" "}
                            {quote.source_language_name || "—"} →{" "}
                            {quote.target_language_name || "English"}
                            {quote.is_rush && (
                              <span className="ml-1.5 text-amber-600 font-medium">
                                ⚡ Rush
                              </span>
                            )}
                          </p>
                        </Link>
                      </td>
                      {/* Combined Customer Column */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {quote.customer_name || "—"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {quote.customer_email || "—"}
                        </p>
                      </td>
                      {/* Source Column */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${entryPointBadgeColor(quote.entry_point)}`}>
                          {formatEntryPoint(quote.entry_point)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <BusinessStatusBadge status={quote.status} />
                          <ProcessingStatusBadge
                            status={quote.processing_status}
                            reasons={quote.review_required_reasons}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">
                          ${(quote.total || 0).toFixed(2)}
                        </p>
                      </td>
                      {/* Combined Date & Expiry Column */}
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">
                          {format(new Date(quote.created_at), "MMM d, yyyy")}
                        </p>
                        <div className="mt-1">
                          {getExpiryBadge(quote.expires_at)}
                        </div>
                      </td>
                      {/* Actions Meatball Menu */}
                      <td className="px-4 py-3 text-center relative">
                        <button
                          onClick={() =>
                            setOpenMenuId(
                              openMenuId === quote.id ? null : quote.id,
                            )
                          }
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          aria-label="Actions"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-600" />
                        </button>
                        {openMenuId === quote.id && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenMenuId(null)}
                            />
                            <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                              <Link
                                to={`/admin/quotes/${quote.id}`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <Eye className="w-4 h-4" />
                                View Details
                              </Link>
                              {canDeleteQuote(quote) && (
                                <button
                                  onClick={() => {
                                    setSelectedQuotes([quote.id]);
                                    setShowBulkDeleteModal(true);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                {Math.min(page * PAGE_SIZE, totalCount)} of{" "}
                {totalCount.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateFilter("page", String(page - 1))}
                  disabled={page <= 1}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => updateFilter("page", String(page + 1))}
                  disabled={page >= totalPages}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Delete {selectedQuotes.length} Quote
                {selectedQuotes.length > 1 ? "s" : ""}
              </h3>
            </div>

            <p className="text-gray-600 mb-4">
              Are you sure you want to delete {selectedQuotes.length} quote
              {selectedQuotes.length > 1 ? "s" : ""}?
            </p>

            <p className="text-sm text-gray-500 mb-6">
              This action will soft-delete the selected quotes and all related
              data. The data will be permanently removed after 30 days.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setSelectedQuotes([]);
                }}
                disabled={isBulkDeleting}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isBulkDeleting
                  ? "Deleting..."
                  : `Delete ${selectedQuotes.length} Quote${selectedQuotes.length > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Business Status Badge (quotes.status)
// ════════════════════════════════════════════════════════════════

function BusinessStatusBadge({ status }: { status?: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    draft:           { bg: "bg-gray-100",   text: "text-gray-700",  label: "Draft" },
    details_pending: { bg: "bg-amber-100",  text: "text-amber-700", label: "Incomplete" },
    lead:            { bg: "bg-blue-100",   text: "text-blue-700",  label: "New Lead" },
    pending_payment: { bg: "bg-amber-100",  text: "text-amber-700", label: "Pending Payment" },
    paid:            { bg: "bg-green-100",  text: "text-green-700", label: "Paid" },
    expired:         { bg: "bg-red-100",    text: "text-red-700",   label: "Expired" },
    in_review:       { bg: "bg-amber-100",  text: "text-amber-700", label: "In Review" },
    cancelled:       { bg: "bg-gray-100",   text: "text-gray-500",  label: "Cancelled" },
  };

  const c = config[status || ""] || {
    bg: "bg-gray-100",
    text: "text-gray-700",
    label: status
      ? status.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
      : "Unknown",
  };

  return (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════
// Processing Status Badge (quotes.processing_status)
// ════════════════════════════════════════════════════════════════

function ProcessingStatusBadge({
  status,
  reasons,
}: {
  status?: string;
  reasons?: string[] | null;
}) {
  if (!status || status === "pending") return null;

  const reasonMap: Record<string, string> = {
    low_ocr_confidence: "Low OCR quality",
    low_ai_confidence: "Low AI confidence",
    multi_language_document: "Multi-language",
    ai_analysis_failed: "AI analysis failed",
    ocr_failed: "OCR failed",
    file_too_large: "File too large",
    file_unreadable: "File unreadable",
    unsupported_format: "Unsupported format",
    processing_error: "Processing error",
    processing_timeout: "Timed out",
    high_page_count: "High page count",
  };

  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-600">
        <Loader2 className="w-3 h-3 animate-spin" />
        Processing
      </span>
    );
  }

  if (status === "quote_ready") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600">
        <CheckCircle2 className="w-3 h-3" />
        Quote Ready
      </span>
    );
  }

  if (status === "review_required") {
    const reasonText =
      reasons && reasons.length > 0
        ? reasons.map((r) => reasonMap[r] || r.replace(/_/g, " ")).join(", ")
        : "";

    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-red-600"
        title={reasonText || "Manual review required"}
      >
        <AlertTriangle className="w-3 h-3" />
        Review Required
      </span>
    );
  }

  return null;
}
