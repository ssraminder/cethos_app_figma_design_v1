import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

interface QuoteFile {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
}

interface AIAnalysisResult {
  id: string;
  quote_file_id: string;
  detected_document_type: string;
  document_type_confidence: number;
  detected_language: string;
  language_name: string;
  language_confidence: number;
  assessed_complexity: string;
  complexity_confidence: number;
  complexity_reasoning: string;
  word_count: number;
  page_count: number;
  billable_pages: number;
  complexity_multiplier: number;
  line_total: number;
  quote_file?: QuoteFile;
}

interface ReviewDetail {
  id: string;
  quote_id: string;
  quote_number: string;
  customer_name: string;
  customer_email: string;
  status: string;
  sla_deadline: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  source_language_name: string;
  target_language_name: string;
  intended_use_name: string | null;
  total: number;
}

interface StaffSession {
  email: string;
  staffId?: string;
  staffName?: string;
  staffRole?: string;
}

export default function HITLReviewDetail() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AIAnalysisResult[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // File accordion state
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  // Claim state
  const [claimedByMe, setClaimedByMe] = useState(false);

  // Local edits per file (not saved yet)
  const [localEdits, setLocalEdits] = useState<
    Record<
      string,
      {
        word_count?: number;
        page_count?: number;
        billable_pages?: number;
        complexity_multiplier?: number;
        line_total?: number;
        document_type?: string;
        complexity?: string;
      }
    >
  >({});

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Helper: Calculate time remaining for SLA
  const calculateTimeRemaining = (deadline: string | null) => {
    if (!deadline) return "N/A";
    const deadlineTime = new Date(deadline).getTime();
    if (isNaN(deadlineTime)) return "N/A";
    const diff = deadlineTime - Date.now();
    if (diff < 0) return "Overdue";
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  };

  // Get current value (local edit or original)
  const getValue = (fileId: string, field: string, original: any) => {
    return localEdits[fileId]?.[field] ?? original;
  };

  // Calculate line total based on edits
  const calculateLineTotal = (analysis: any, fileId: string) => {
    const billablePages =
      getValue(fileId, "billable_pages", analysis.billable_pages) || 1;
    const multiplier =
      getValue(fileId, "complexity_multiplier", analysis.complexity_multiplier) ||
      1;
    const baseRate = analysis.base_rate || 50; // default base rate
    return billablePages * baseRate * multiplier;
  };

  // Update local edit (doesn't save yet)
  const updateLocalEdit = (fileId: string, field: string, value: any) => {
    setLocalEdits((prev) => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        [field]: value,
      },
    }));
  };

  // Check if file has unsaved changes
  const hasChanges = (fileId: string, analysis: any) => {
    const edits = localEdits[fileId];
    if (!edits) return false;
    return Object.keys(edits).some((field) => {
      const original = analysis[field];
      return edits[field] !== undefined && edits[field] !== original;
    });
  };

  // Save with confirmation
  const saveFileCorrections = async (fileId: string, analysis: any) => {
    const edits = localEdits[fileId];
    if (!edits) return;

    const changes = Object.entries(edits)
      .filter(([field, value]) => value !== analysis[field])
      .map(
        ([field, value]) =>
          `${field.replace(/_/g, " ")}: ${analysis[field]} → ${value}`,
      )
      .join("\n");

    if (!changes) {
      alert("No changes to save");
      return;
    }

    const confirmed = window.confirm(
      `Save these corrections?\n\n${changes}\n\nThis will update the quote pricing.`,
    );

    if (!confirmed) return;

    // Save each changed field
    const session = JSON.parse(sessionStorage.getItem("staffSession") || "{}");

    for (const [field, value] of Object.entries(edits)) {
      if (value === analysis[field]) continue; // Skip unchanged

      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/save-hitl-correction`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              reviewId: reviewId,
              staffId: session.staffId,
              field: field,
              originalValue: String(analysis[field]),
              correctedValue: String(value),
              fileId: fileId,
            }),
          },
        );

        const result = await response.json();
        if (!result.success) {
          alert(`Failed to save ${field}: ${result.error}`);
          return;
        }
      } catch (error) {
        alert(`Error saving ${field}: ${error}`);
        return;
      }
    }

    alert("Corrections saved successfully!");

    // Clear local edits for this file
    setLocalEdits((prev) => {
      const newEdits = { ...prev };
      delete newEdits[fileId];
      return newEdits;
    });

    // Refresh data
    fetchReviewDetail();
  };

  // Cancel edits for a file
  const cancelFileEdits = (fileId: string) => {
    setLocalEdits((prev) => {
      const newEdits = { ...prev };
      delete newEdits[fileId];
      return newEdits;
    });
  };

  useEffect(() => {
    const checkSession = async () => {
      const stored = sessionStorage.getItem("staffSession");
      if (!stored) {
        navigate("/admin/login", { replace: true });
        return;
      }

      const parsedSession = JSON.parse(stored) as StaffSession;

      // Fetch staff user ID from staff_users table using email
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        setError("Configuration missing");
        setLoading(false);
        return;
      }

      try {
        const staffResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/staff_users?email=eq.${encodeURIComponent(parsedSession.email)}&select=id,email,full_name,role`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          },
        );

        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          if (staffData.length > 0) {
            setSession({
              ...parsedSession,
              staffId: staffData[0].id,
              staffName: staffData[0].full_name,
              staffRole: staffData[0].role,
            });
          }
        }
      } catch (err) {
        console.error("Error fetching staff data:", err);
      }

      fetchReviewDetail();
    };

    checkSession();
  }, [reviewId, navigate, SUPABASE_URL, SUPABASE_ANON_KEY]);

  // Track claim status
  useEffect(() => {
    const session = JSON.parse(sessionStorage.getItem("staffSession") || "{}");
    setClaimedByMe(review?.assigned_to === session.staffId);
  }, [review]);

  const fetchReviewDetail = async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !reviewId) {
      setError("Configuration or review ID missing");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch review detail from v_hitl_review_detail
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/v_hitl_review_detail?id=eq.${reviewId}&select=*`,
        {
          method: "GET",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Fetch error:", errorText);
        setError(`Failed to load review: ${response.status}`);
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        setError("Review not found");
        setLoading(false);
        return;
      }

      const reviewData = data[0];
      setReview(reviewData);

      // Fetch quote files
      const filesResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/quote_files?quote_id=eq.${reviewData.quote_id}&select=*`,
        {
          method: "GET",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        },
      );

      const filesData = filesResponse.ok ? await filesResponse.json() : [];

      // Fetch AI analysis results for each file with quote_file joined
      if (filesData.length > 0) {
        const fileIds = filesData.map((f: any) => f.id);

        const analysisResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/ai_analysis_results?quote_file_id=in.(${fileIds.join(",")})&processing_status=eq.complete&select=*`,
          {
            method: "GET",
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          },
        );

        if (analysisResponse.ok) {
          const analysisData = await analysisResponse.json();

          // Join quote_file data to each analysis result
          const enrichedAnalysis = analysisData.map((analysis: any) => ({
            ...analysis,
            quote_file: filesData.find(
              (f: any) => f.id === analysis.quote_file_id,
            ),
          }));

          setAnalysisResults(enrichedAnalysis);

          // Auto-expand first file
          if (enrichedAnalysis.length > 0) {
            setExpandedFile(enrichedAnalysis[0].id);
          }
        }
      }

      setLoading(false);
    } catch (err) {
      console.error("Fetch exception:", err);
      setError(`Error: ${err}`);
      setLoading(false);
    }
  };

  const claimReview = async () => {
    const stored = sessionStorage.getItem("staffSession");
    if (!stored) {
      alert("Session expired. Please login again.");
      navigate("/admin/login");
      return;
    }

    const sessionData = JSON.parse(stored);
    if (!sessionData.staffId) {
      alert("Session expired. Please login again.");
      navigate("/admin/login");
      return;
    }

    if (!reviewId) {
      alert("Review ID missing");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/claim-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: sessionData.staffId,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error("Claim failed:", result.error);
        alert(result.error || "Failed to claim review");
        return;
      }

      // Refresh the review data after claiming
      fetchReviewDetail();
    } catch (err) {
      console.error("Claim error:", err);
      alert("Error claiming review: " + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!review || !session?.staffId) return;
    if (!confirm("Are you sure you want to approve this quote?")) return;

    setSubmitting(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/approve-hitl-review`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reviewId: review.id,
            staffId: session.staffId,
            notes: "",
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to approve review");

      alert("Quote approved successfully!");
      navigate("/admin/hitl");
    } catch (err) {
      alert("Error approving review: " + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!review || !session?.staffId) return;

    const reason = prompt(
      "Please provide a reason for requesting a better scan:",
    );
    if (!reason) return;

    setSubmitting(true);
    try {
      const fileIds = analysisResults.map((a) => a.quote_file_id);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/reject-hitl-review`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reviewId: review.id,
            staffId: session.staffId,
            reason: reason,
            fileIds: fileIds,
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to reject review");

      alert("Better scan requested. Customer will be notified.");
      navigate("/admin/hitl");
    } catch (err) {
      alert("Error rejecting review: " + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEscalate = async () => {
    if (!review || !session?.staffId) return;
    if (!confirm("Are you sure you want to escalate this to an admin?")) return;

    setSubmitting(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/hitl_reviews?id=eq.${review.id}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            status: "escalated",
            resolution_notes: "Escalated by reviewer",
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to escalate review");

      alert("Review escalated to admin.");
      navigate("/admin/hitl");
    } catch (err) {
      alert("Error escalating review: " + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto">
          <a
            href="/admin/hitl"
            className="mb-4 text-blue-600 hover:underline inline-block"
          >
            ← Back to Queue
          </a>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-800">{error || "Review not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <a href="/admin/hitl" className="text-blue-600 hover:underline">
            ← Back to Queue
          </a>
          <h1 className="text-2xl font-bold mt-2">{review?.quote_number}</h1>
          <p className="text-gray-600">{review?.customer_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-gray-100 rounded">
            {calculateTimeRemaining(review?.sla_deadline)}
          </span>
          <span
            className={`px-3 py-1 rounded ${
              review?.status === "pending"
                ? "bg-yellow-100 text-yellow-800"
                : review?.status === "in_review"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100"
            }`}
          >
            {review?.status?.toUpperCase().replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Claim Banner - Show if not claimed */}
      {!review?.assigned_to && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-6 flex justify-between items-center">
          <span>This review is not claimed. Claim it to make corrections.</span>
          <button
            onClick={claimReview}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Claim Review
          </button>
        </div>
      )}

      {/* Claimed by someone else */}
      {review?.assigned_to && !claimedByMe && (
        <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg mb-6">
          <span>
            This review is claimed by <strong>{review.assigned_to_name}</strong>
          </span>
        </div>
      )}

      {/* Quote Summary Card */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <h3 className="font-semibold mb-3">Quote Summary</h3>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Customer</span>
            <p>{review?.customer_name}</p>
            <p className="text-gray-500">{review?.customer_email}</p>
          </div>
          <div>
            <span className="text-gray-500">Language Pair</span>
            <p>
              {review?.source_language_name} → {review?.target_language_name}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Intended Use</span>
            <p>{review?.intended_use_name || "N/A"}</p>
          </div>
          <div>
            <span className="text-gray-500">Total</span>
            <p className="text-lg font-semibold">
              ${review?.total?.toFixed(2) || "0.00"}
            </p>
          </div>
        </div>
      </div>

      {/* Files Accordion */}
      <div className="mb-6">
        <h3 className="font-semibold mb-3">
          Documents ({analysisResults.length} files)
        </h3>

        {analysisResults.map((analysis, index) => (
          <div
            key={analysis.id}
            className="border rounded-lg mb-3 overflow-hidden"
          >
            {/* File Header - Always Visible */}
            <button
              onClick={() =>
                setExpandedFile(
                  expandedFile === analysis.id ? null : analysis.id,
                )
              }
              className="w-full p-4 flex justify-between items-center bg-gray-50 hover:bg-gray-100 text-left"
            >
              <div className="flex items-center gap-4">
                <span className="text-lg font-medium">
                  {index + 1}.{" "}
                  {analysis.quote_file?.original_filename ||
                    `File ${index + 1}`}
                </span>
                <span className="text-sm text-gray-500">
                  {analysis.word_count} words • {analysis.page_count} page(s)
                </span>
              </div>
              <div className="flex items-center gap-3">
                {/* Confidence Badges */}
                <div className="flex gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      (analysis.document_type_confidence || 0) >= 0.9
                        ? "bg-green-100 text-green-800"
                        : (analysis.document_type_confidence || 0) >= 0.7
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    Type:{" "}
                    {((analysis.document_type_confidence || 0) * 100).toFixed(
                      0,
                    )}
                    %
                  </span>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      (analysis.language_confidence || 0) >= 0.9
                        ? "bg-green-100 text-green-800"
                        : (analysis.language_confidence || 0) >= 0.7
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    Lang:{" "}
                    {((analysis.language_confidence || 0) * 100).toFixed(0)}%
                  </span>
                </div>
                {/* Expand Icon */}
                <svg
                  className={`w-5 h-5 transition-transform ${
                    expandedFile === analysis.id ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </button>

            {/* File Content - Expanded */}
            {expandedFile === analysis.id && (
              <div className="p-4 border-t">
                <div className="grid grid-cols-2 gap-6">
                  {/* Left: Document Preview */}
                  <div>
                    <h4 className="font-semibold mb-3">Document Preview</h4>
                    <div className="border rounded-lg p-4 bg-gray-50 min-h-[300px] flex items-center justify-center">
                      {analysis.quote_file?.storage_path ? (
                        <img
                          src={`${SUPABASE_URL}/storage/v1/object/public/quote-files/${analysis.quote_file.storage_path}`}
                          alt={analysis.quote_file?.original_filename}
                          className="max-w-full max-h-[400px] object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            const sibling = e.currentTarget
                              .nextElementSibling as HTMLElement;
                            if (sibling) sibling.classList.remove("hidden");
                          }}
                        />
                      ) : null}
                      <div className="text-center text-gray-500 hidden">
                        <p>Preview not available</p>
                        <p className="text-sm">
                          {analysis.quote_file?.original_filename}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between items-center text-sm">
                      <span className="text-gray-500">
                        {(
                          (analysis.quote_file?.file_size || 0) /
                          1024 /
                          1024
                        ).toFixed(2)}{" "}
                        MB
                      </span>
                      <a
                        href={`${SUPABASE_URL}/storage/v1/object/public/quote-files/${analysis.quote_file?.storage_path}`}
                        target="_blank"
                        className="text-blue-600 hover:underline"
                      >
                        ↓ Download
                      </a>
                    </div>
                  </div>

                  {/* Right: AI Analysis + Corrections */}
                  <div>
                    <h4 className="font-semibold mb-3">
                      AI Analysis
                      {!claimedByMe && (
                        <span className="text-sm font-normal text-gray-500 ml-2">
                          (Claim to edit)
                        </span>
                      )}
                    </h4>

                    <div className="space-y-4">
                      {/* Document Type */}
                      <div className="bg-white border rounded p-3">
                        <label className="text-sm text-gray-500 block mb-1">
                          Document Type
                        </label>
                        <div className="flex items-center justify-between">
                          {claimedByMe ? (
                            <select
                              value={
                                getValue(
                                  analysis.quote_file_id,
                                  "document_type",
                                  analysis.detected_document_type,
                                ) || ""
                              }
                              onChange={(e) =>
                                updateLocalEdit(
                                  analysis.quote_file_id,
                                  "document_type",
                                  e.target.value,
                                )
                              }
                              className="border rounded px-3 py-2 flex-1 mr-2 focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Select...</option>
                              <option value="birth_certificate">
                                Birth Certificate
                              </option>
                              <option value="marriage_certificate">
                                Marriage Certificate
                              </option>
                              <option value="death_certificate">
                                Death Certificate
                              </option>
                              <option value="divorce_decree">
                                Divorce Decree
                              </option>
                              <option value="passport">Passport</option>
                              <option value="drivers_license">
                                Driver's License
                              </option>
                              <option value="national_id">National ID</option>
                              <option value="academic_transcript">
                                Academic Transcript
                              </option>
                              <option value="diploma">Diploma / Degree</option>
                              <option value="legal_document">
                                Legal Document
                              </option>
                              <option value="medical_document">
                                Medical Document
                              </option>
                              <option value="financial_document">
                                Financial Document
                              </option>
                              <option value="immigration_document">
                                Immigration Document
                              </option>
                              <option value="court_document">
                                Court Document
                              </option>
                              <option value="business_document">
                                Business Document
                              </option>
                              <option value="other">Other</option>
                            </select>
                          ) : (
                            <span className="capitalize">
                              {analysis.detected_document_type?.replace(
                                /_/g,
                                " ",
                              ) || "Unknown"}
                            </span>
                          )}
                          <span
                            className={`px-2 py-1 rounded text-sm ${
                              (analysis.document_type_confidence || 0) >= 0.9
                                ? "bg-green-100 text-green-800"
                                : (analysis.document_type_confidence || 0) >=
                                    0.7
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                            }`}
                          >
                            {(
                              (analysis.document_type_confidence || 0) * 100
                            ).toFixed(0)}
                            %
                          </span>
                        </div>
                      </div>

                      {/* Language */}
                      <div className="bg-white border rounded p-3">
                        <label className="text-sm text-gray-500 block mb-1">
                          Detected Language
                        </label>
                        <div className="flex items-center justify-between">
                          <span>
                            {analysis.language_name ||
                              analysis.detected_language ||
                              "Unknown"}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-sm ${
                              (analysis.language_confidence || 0) >= 0.9
                                ? "bg-green-100 text-green-800"
                                : (analysis.language_confidence || 0) >= 0.7
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                            }`}
                          >
                            {(
                              (analysis.language_confidence || 0) * 100
                            ).toFixed(0)}
                            %
                          </span>
                        </div>
                      </div>

                      {/* Complexity */}
                      <div className="bg-white border rounded p-3">
                        <label className="text-sm text-gray-500 block mb-1">
                          Complexity
                        </label>
                        <div className="flex items-center justify-between">
                          {claimedByMe ? (
                            <select
                              defaultValue={
                                analysis.assessed_complexity || "standard"
                              }
                              onChange={(e) =>
                                saveCorrection(
                                  analysis.quote_file_id,
                                  "complexity",
                                  analysis.assessed_complexity,
                                  e.target.value,
                                )
                              }
                              className="border rounded px-3 py-2 flex-1 mr-2"
                            >
                              <option value="standard">Standard</option>
                              <option value="complex">Complex</option>
                              <option value="highly_complex">
                                Highly Complex
                              </option>
                            </select>
                          ) : (
                            <span className="capitalize">
                              {analysis.assessed_complexity?.replace(
                                /_/g,
                                " ",
                              ) || "Standard"}
                            </span>
                          )}
                          <span
                            className={`px-2 py-1 rounded text-sm ${
                              (analysis.complexity_confidence || 0) >= 0.9
                                ? "bg-green-100 text-green-800"
                                : (analysis.complexity_confidence || 0) >= 0.7
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                            }`}
                          >
                            {(
                              (analysis.complexity_confidence || 0) * 100
                            ).toFixed(0)}
                            %
                          </span>
                        </div>
                        {analysis.complexity_reasoning && (
                          <p className="text-sm text-gray-500 mt-2">
                            {analysis.complexity_reasoning}
                          </p>
                        )}
                      </div>

                      {/* Metrics Grid - Editable when claimed */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 p-3 rounded text-center">
                          {claimedByMe ? (
                            <>
                              <input
                                type="number"
                                defaultValue={analysis.word_count || 0}
                                onBlur={(e) =>
                                  saveCorrection(
                                    analysis.quote_file_id,
                                    "word_count",
                                    String(analysis.word_count),
                                    e.target.value,
                                  )
                                }
                                className="text-xl font-bold w-full text-center bg-white border rounded py-1"
                                min="0"
                              />
                              <div className="text-xs text-gray-500">Words</div>
                            </>
                          ) : (
                            <>
                              <div className="text-xl font-bold">
                                {analysis.word_count || 0}
                              </div>
                              <div className="text-xs text-gray-500">Words</div>
                            </>
                          )}
                        </div>

                        <div className="bg-gray-50 p-3 rounded text-center">
                          {claimedByMe ? (
                            <>
                              <input
                                type="number"
                                defaultValue={analysis.page_count || 0}
                                onBlur={(e) =>
                                  saveCorrection(
                                    analysis.quote_file_id,
                                    "page_count",
                                    String(analysis.page_count),
                                    e.target.value,
                                  )
                                }
                                className="text-xl font-bold w-full text-center bg-white border rounded py-1"
                                min="0"
                              />
                              <div className="text-xs text-gray-500">Pages</div>
                            </>
                          ) : (
                            <>
                              <div className="text-xl font-bold">
                                {analysis.page_count || 0}
                              </div>
                              <div className="text-xs text-gray-500">Pages</div>
                            </>
                          )}
                        </div>

                        <div className="bg-gray-50 p-3 rounded text-center">
                          {claimedByMe ? (
                            <>
                              <input
                                type="number"
                                defaultValue={analysis.billable_pages || 0}
                                onBlur={(e) =>
                                  saveCorrection(
                                    analysis.quote_file_id,
                                    "billable_pages",
                                    String(analysis.billable_pages),
                                    e.target.value,
                                  )
                                }
                                className="text-xl font-bold w-full text-center bg-white border rounded py-1"
                                min="0"
                              />
                              <div className="text-xs text-gray-500">
                                Billable Pages
                              </div>
                              <div className="text-xs text-blue-600 mt-1">
                                (e.g., front+back = 1 page)
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-xl font-bold">
                                {analysis.billable_pages || 0}
                              </div>
                              <div className="text-xs text-gray-500">
                                Billable Pages
                              </div>
                            </>
                          )}
                        </div>

                        <div className="bg-gray-50 p-3 rounded text-center">
                          {claimedByMe ? (
                            <>
                              <input
                                type="number"
                                step="0.01"
                                defaultValue={
                                  analysis.complexity_multiplier || 1
                                }
                                onBlur={(e) =>
                                  saveCorrection(
                                    analysis.quote_file_id,
                                    "complexity_multiplier",
                                    String(analysis.complexity_multiplier),
                                    e.target.value,
                                  )
                                }
                                className="text-xl font-bold w-full text-center bg-white border rounded py-1"
                                min="1"
                                max="3"
                              />
                              <div className="text-xs text-gray-500">
                                Multiplier
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-xl font-bold">
                                {analysis.complexity_multiplier || 1}x
                              </div>
                              <div className="text-xs text-gray-500">
                                Multiplier
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Line Total - Editable Override */}
                      <div className="bg-blue-50 p-3 rounded">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Line Total</span>
                          {claimedByMe ? (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">$</span>
                              <input
                                type="number"
                                step="0.01"
                                defaultValue={(
                                  analysis.line_total || 0
                                ).toFixed(2)}
                                onBlur={(e) =>
                                  saveCorrection(
                                    analysis.quote_file_id,
                                    "line_total",
                                    String(analysis.line_total),
                                    e.target.value,
                                  )
                                }
                                className="text-lg font-bold w-24 text-right bg-white border rounded py-1 px-2"
                                min="0"
                              />
                            </div>
                          ) : (
                            <span className="text-lg font-bold">
                              ${(analysis.line_total || 0).toFixed(2)}
                            </span>
                          )}
                        </div>
                        {claimedByMe && (
                          <p className="text-xs text-blue-600 mt-2">
                            Tip: Adjust billable pages for multi-page scans of
                            same document (e.g., front/back of license = 1
                            billable page)
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons - Only show if claimed by me */}
      {claimedByMe && (
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={() => handleReject()}
            className="px-6 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50"
          >
            Reject
          </button>
          <button
            onClick={() => handleEscalate()}
            className="px-6 py-2 border border-orange-300 text-orange-600 rounded hover:bg-orange-50"
          >
            Escalate
          </button>
          <button
            onClick={() => handleApprove()}
            className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Approve
          </button>
        </div>
      )}
    </div>
  );
}
