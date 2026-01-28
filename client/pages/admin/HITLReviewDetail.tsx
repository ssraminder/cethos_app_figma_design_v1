// HITLReviewDetail.tsx - Complete implementation with certification management

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { XCircle, Mail, AlertTriangle } from "lucide-react";
import { CorrectionReasonModal } from "@/components/CorrectionReasonModal";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import MessagePanel from "../../components/messaging/MessagePanel";
import { HITLPanelLayout } from "../../components/admin/hitl";
import DocumentPreviewModal from "../../components/admin/DocumentPreviewModal";

interface PageData {
  id: string;
  page_number: number;
  word_count: number;
  quote_file_id: string;
}

interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface AdditionalCert {
  id: string;
  certification_type_id: string;
  name: string;
  price: number;
}

interface AnalysisResult {
  id: string;
  quote_file_id: string;
  quote_id: string;
  detected_language: string;
  detected_document_type: string;
  assessed_complexity: string;
  complexity_multiplier: number;
  word_count: number;
  page_count: number;
  billable_pages: number;
  line_total: number;
  certification_type_id: string;
  certification_price: number;
  ocr_provider?: string;
  ocr_confidence?: number;
  llm_model?: string;
  processing_time_ms?: number;
  language_confidence?: number;
  document_type_confidence?: number;
  complexity_confidence?: number;
  quote_file: {
    original_filename: string;
    storage_path: string;
    file_size: number;
    mime_type: string;
  };
}

const HITLReviewDetail: React.FC = () => {
  const { reviewId } = useParams();
  const navigate = useNavigate();

  // ============================================
  // SUPABASE HELPER (Raw fetch to bypass RLS)
  // ============================================
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const fetchFromSupabase = async (endpoint: string) => {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    console.log(`🌐 Fetching: ${url}`);
    console.log(`🔑 Using anon key: ${SUPABASE_ANON_KEY?.substring(0, 20)}...`);

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
    });

    console.log(
      `📡 Response status: ${response.status} ${response.statusText}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Fetch failed [${response.status}]:`, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(
      `✅ Fetch success, rows returned:`,
      Array.isArray(data) ? data.length : typeof data,
    );
    return data;
  };

  // ============================================
  // STATE
  // ============================================

  // Review data
  const [reviewData, setReviewData] = useState<any>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [pageData, setPageData] = useState<Record<string, PageData[]>>({});
  const [quoteFiles, setQuoteFiles] = useState<any[]>([]);

  // Certification data
  const [certificationTypes, setCertificationTypes] = useState<
    CertificationType[]
  >([]);
  const [additionalCerts, setAdditionalCerts] = useState<
    Record<string, AdditionalCert[]>
  >({});

  // Language data
  const [languages, setLanguages] = useState<
    Array<{ id: string; code: string; name: string; price_multiplier: number }>
  >([]);

  // Settings from database
  const [baseRate, setBaseRate] = useState(65);
  const [wordsPerPage, setWordsPerPage] = useState(225);

  // UI state
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddCertModal, setShowAddCertModal] = useState<string | null>(null);
  const [showAiDetails, setShowAiDetails] = useState<Record<string, boolean>>(
    {},
  );

  // Correction reason modal state
  const [correctionModal, setCorrectionModal] = useState<{
    isOpen: boolean;
    field: string;
    aiValue: string | number;
    correctedValue: string | number;
    fileId?: string;
    analysisId?: string;
    pageId?: string;
  } | null>(null);

  // Edit tracking
  const [localEdits, setLocalEdits] = useState<
    Record<string, Record<string, any>>
  >({});
  const [localPageEdits, setLocalPageEdits] = useState<
    Record<
      string,
      {
        wordCount: number;
        originalWordCount: number;
        fileId: string;
      }
    >
  >({});

  // Staff session
  const { session: staffSession, loading: authLoading } = useAdminAuthContext();
  const [claimedByMe, setClaimedByMe] = useState(false);
  const [claimedByOther, setClaimedByOther] = useState(false);
  const [assignedStaffName, setAssignedStaffName] = useState<string | null>(
    null,
  );

  // Action buttons
  const [internalNotes, setInternalNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Reject Quote (permanent rejection) state
  const [showRejectQuoteModal, setShowRejectQuoteModal] = useState(false);
  const [rejectQuoteReason, setRejectQuoteReason] = useState("");
  const [sendEmailToCustomer, setSendEmailToCustomer] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  // Page splitting/combining
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [splitMode, setSplitMode] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [splitDocumentName, setSplitDocumentName] = useState("");
  const [targetDocumentId, setTargetDocumentId] = useState("");

  // Document preview modal
  const [previewDocument, setPreviewDocument] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);

  // ============================================
  // DATA FETCHING
  // ============================================

  useEffect(() => {
    if (authLoading) return;
    if (!staffSession?.staffId) {
      navigate("/admin/login");
      return;
    }
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffSession, authLoading, reviewId]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchReviewData(),
        fetchCertificationTypes(),
        fetchLanguages(),
        fetchSettings(),
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
    setLoading(false);
  };

  const fetchReviewData = async () => {
    console.log("🔍 Fetching review data for ID:", reviewId);
    console.log("🔍 SUPABASE_URL:", SUPABASE_URL);
    console.log("🔍 SUPABASE_ANON_KEY exists:", !!SUPABASE_ANON_KEY);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("❌ Supabase credentials not configured!");
      return;
    }

    try {
      // Step 1: Fetch review from v_hitl_queue view (bypasses RLS)
      const viewReviews = await fetchFromSupabase(
        `v_hitl_queue?review_id=eq.${reviewId}`,
      );
      console.log(`📋 View data:`, viewReviews);
      const viewReview = viewReviews[0];

      if (!viewReview) {
        console.error("❌ No review found in v_hitl_queue for ID:", reviewId);
        return;
      }

      console.log("✅ Found review in view:", viewReview);

      // Step 2: Fetch quote using quote_number from view (with necessary joins)
      const quotes = await fetchFromSupabase(
        `quotes?quote_number=eq.${viewReview.quote_number}&select=*,` +
          `customer:customers(id,full_name,email,phone),` +
          `source_language:languages!source_language_id(id,name,code),` +
          `target_language:languages!target_language_id(id,name,code),` +
          `intended_use:intended_uses!intended_use_id(id,name)`,
      );
      const quote = quotes[0];

      console.log("💰 Quote found:", quote);
      console.log("💰 Quote customer:", quote?.customer);
      console.log("💰 Quote source_language:", quote?.source_language);
      console.log("💰 Quote target_language:", quote?.target_language);
      console.log("💰 Quote intended_use:", quote?.intended_use);
      console.log(
        "💰 Quote pricing - subtotal:",
        quote?.subtotal,
        "certification_total:",
        quote?.certification_total,
        "tax_amount:",
        quote?.tax_amount,
        "total:",
        quote?.total,
      );

      if (!quote) {
        console.error(
          "❌ No quote found for quote_number:",
          viewReview.quote_number,
        );
        return;
      }

      // Step 3: Get assigned_to from view if available, or try to fetch from base table
      let assignedTo = viewReview.assigned_to || null;
      let reviewStatus =
        viewReview.review_status || viewReview.status || "pending";

      // If view doesn't have assigned_to, fetch directly from hitl_reviews base table
      if (!assignedTo) {
        try {
          const baseReviews = await fetchFromSupabase(
            `hitl_reviews?id=eq.${viewReview.review_id}&select=assigned_to,status`,
          );
          if (baseReviews && baseReviews[0]) {
            assignedTo = baseReviews[0].assigned_to;
            reviewStatus = baseReviews[0].status;
            console.log(
              "✅ Fetched from base table - assigned_to:",
              assignedTo,
              "status:",
              reviewStatus,
            );
          }
        } catch (error) {
          console.warn("⚠️ Could not fetch from base table (RLS):", error);
        }
      }

      console.log("📍 Final assigned_to:", assignedTo);
      console.log("📍 Final status:", reviewStatus);

      // Construct review object from view data
      const review = {
        id: viewReview.review_id,
        quote_id: quote.id,
        status: reviewStatus,
        quote_number: viewReview.quote_number,
        customer_name: viewReview.customer_name,
        customer_email: viewReview.customer_email,
        priority: viewReview.priority,
        sla_status: viewReview.sla_status,
        minutes_to_sla: viewReview.minutes_to_sla,
        assigned_to: assignedTo,
      };

      console.log("📄 Constructed review data:", review);

      // Merge quote into review data
      const reviewWithQuote = { ...review, quotes: quote };
      setReviewData(reviewWithQuote);

      // Check if claimed by current user
      const currentStaffId = staffSession?.staffId;
      const isClaimed = assignedTo === currentStaffId;
      const isClaimedByOther = !!assignedTo && assignedTo !== currentStaffId;

      // Only update claim status if we have definitive information
      // If assigned_to is null, it might mean the view/RLS blocked access
      if (assignedTo !== null) {
        setClaimedByMe(isClaimed);
        setClaimedByOther(isClaimedByOther);
        setAssignedStaffName(null); // Will be set if we fetch from base table with staff join
        console.log(
          `🔐 Claim status updated - Claimed by me: ${isClaimed}, by other: ${isClaimedByOther} (assigned_to: ${assignedTo}, staffId: ${currentStaffId})`,
        );
      } else {
        // Fallback: If status is "in_review", it must be claimed by someone
        // We'll assume it's claimed by current user if we can't determine otherwise
        console.warn(
          `⚠️ assigned_to is null - Cannot determine claim status from database. Status: ${reviewStatus}`,
        );

        // If review is in_review status, assume it's claimed (showing action buttons is safer than hiding them)
        if (reviewStatus === "in_review") {
          console.log(
            "🔐 Review is 'in_review' - assuming claimed by current user",
          );
          setClaimedByMe(true);
          setClaimedByOther(false);
        }
        // Otherwise preserve existing state (don't override)
      }

      if (quote?.id) {
        console.log("🔍 Fetching quote files for quote:", quote.id);

        // Fetch quote files for the document files panel
        const files = await fetchFromSupabase(
          `quote_files?quote_id=eq.${quote.id}&order=created_at.desc`,
        );
        console.log("📁 Quote files:", files);
        setQuoteFiles(files || []);

        console.log("🔍 Fetching analysis results for quote:", quote.id);

        // Fetch analysis results with quote_file relationship and AI metadata (using nested select)
        const analysis = await fetchFromSupabase(
          `ai_analysis_results?quote_id=eq.${quote.id}&select=*,quote_file:quote_files(*),ocr_provider,ocr_confidence,llm_model,processing_time_ms,language_confidence,document_type_confidence,complexity_confidence`,
        );

        console.log("📊 Analysis results:", analysis);
        console.log("📊 Analysis count:", analysis?.length || 0);

        setAnalysisResults(analysis || []);

        if (analysis && analysis.length > 0) {
          // Fetch pages for each file
          const pagePromises = analysis.map(async (a: any) => {
            const pages = await fetchFromSupabase(
              `quote_pages?quote_file_id=eq.${a.quote_file_id}&order=page_number`,
            );
            return { fileId: a.quote_file_id, pages: pages || [] };
          });

          const pagesResults = await Promise.all(pagePromises);
          const pagesMap: Record<string, PageData[]> = {};
          pagesResults.forEach((r) => {
            pagesMap[r.fileId] = r.pages;
          });
          setPageData(pagesMap);

          // Fetch additional certifications
          const certPromises = analysis.map(async (a: any) => {
            const certs = await fetchFromSupabase(
              `document_certifications?analysis_id=eq.${a.id}&is_primary=eq.false&select=*,certification_types(name,code)`,
            );

            return {
              fileId: a.quote_file_id,
              certs: (certs || []).map((c: any) => ({
                id: c.id,
                certification_type_id: c.certification_type_id,
                name: c.certification_types?.name || "Unknown",
                price: c.price,
              })),
            };
          });

          const certsResults = await Promise.all(certPromises);
          const certsMap: Record<string, AdditionalCert[]> = {};
          certsResults.forEach((r) => {
            certsMap[r.fileId] = r.certs;
          });
          setAdditionalCerts(certsMap);
        }
      }
    } catch (error) {
      console.error("❌ Unexpected error in fetchReviewData:", error);
    }
  };

  const fetchCertificationTypes = async () => {
    try {
      const data = await fetchFromSupabase(
        "certification_types?is_active=eq.true&order=sort_order",
      );
      setCertificationTypes(data || []);
    } catch (error) {
      console.error("Error fetching certification types:", error);
      setCertificationTypes([]);
    }
  };

  const fetchLanguages = async () => {
    try {
      const data = await fetchFromSupabase(
        "languages?is_active=eq.true&order=sort_order",
      );
      setLanguages(data || []);
    } catch (error) {
      console.error("Error fetching languages:", error);
      setLanguages([]);
    }
  };

  const fetchSettings = async () => {
    try {
      const settings = await fetchFromSupabase(
        "app_settings?setting_key=in.(base_rate,words_per_page)",
      );

      (settings || []).forEach((s: any) => {
        if (s.setting_key === "base_rate")
          setBaseRate(parseFloat(s.setting_value));
        if (s.setting_key === "words_per_page")
          setWordsPerPage(parseInt(s.setting_value));
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  // ============================================
  // CLAIM REVIEW & ACTION BUTTONS
  // ============================================

  const handleClaimReview = async () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");

    if (!session.staffId) {
      alert("Session expired. Please login again.");
      navigate("/admin/login");
      return;
    }

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
            staffId: session.staffId,
          }),
        },
      );

      const result = await response.json();

      if (result.success) {
        // Set claim status BEFORE refetching data
        setClaimedByMe(true);
        setClaimedByOther(false);

        // Update reviewData to reflect claimed status and in_review state
        if (reviewData) {
          setReviewData({
            ...reviewData,
            assigned_to: session.staffId,
            status: "in_review", // Status should change to in_review when claimed
          });
        }

        // Refresh data (but don't let it override our claim status)
        await fetchAllData();

        // CRITICAL: Re-assert the claim status after fetch in case fetchReviewData overwrote it
        setClaimedByMe(true);
        setClaimedByOther(false);
      } else {
        throw new Error(result.error || "Failed to claim review");
      }
    } catch (error) {
      console.error("Claim error:", error);
      alert("Failed to claim review: " + (error as Error).message);
    }
  };

  const handleApproveReview = async () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");

    if (
      !confirm(
        "Approve this quote? The customer will be notified and can proceed to payment.",
      )
    ) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/approve-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: session.staffId,
            notes: internalNotes || null,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to approve review");
      }

      alert("✅ Quote approved! Customer will be notified via email.");
      navigate("/admin/hitl");
    } catch (error) {
      console.error("Approve error:", error);
      alert("Error approving review: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectReview = async () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");

    if (!rejectReason.trim()) {
      alert("Please provide a reason for requesting a better scan.");
      return;
    }

    setIsSubmitting(true);

    try {
      const fileIds = analysisResults.map((a) => a.quote_file_id);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/reject-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: session.staffId,
            reason: rejectReason.trim(),
            fileIds: fileIds,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to reject review");
      }

      alert("📧 Better scan requested. Customer will be notified via email.");
      setShowRejectModal(false);
      navigate("/admin/hitl");
    } catch (error) {
      console.error("Reject error:", error);
      alert("Error rejecting review: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEscalateReview = async () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");

    const escalateReason = prompt(
      "Please provide a reason for escalating this review:",
    );

    if (!escalateReason || !escalateReason.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetchFromSupabase(
        `hitl_reviews?id=eq.${reviewId}`,
      );

      await fetch(`${SUPABASE_URL}/rest/v1/hitl_reviews?id=eq.${reviewId}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "escalated",
          resolution_notes: escalateReason.trim(),
          updated_at: new Date().toISOString(),
        }),
      });

      alert("⚠️ Review escalated to admin.");
      navigate("/admin/hitl");
    } catch (error) {
      console.error("Escalate error:", error);
      alert("Error escalating review: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectQuote = async () => {
    if (!rejectQuoteReason.trim()) {
      alert("Please provide a reason for rejection.");
      return;
    }

    if (!staffSession?.staffId) {
      alert("Not authenticated. Please log in again.");
      return;
    }

    setIsRejecting(true);
    const now = new Date().toISOString();

    try {
      // 1. Update HITL review status
      await fetch(`${SUPABASE_URL}/rest/v1/hitl_reviews?id=eq.${reviewId}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "rejected",
          completed_at: now,
          completed_by: staffSession.staffId,
          resolution_notes: rejectQuoteReason,
        }),
      });

      // 2. Update quote status
      await fetch(
        `${SUPABASE_URL}/rest/v1/quotes?id=eq.${reviewData.quote_id}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            status: "rejected",
            updated_at: now,
          }),
        },
      );

      // 3. Log staff activity
      await fetch(`${SUPABASE_URL}/rest/v1/staff_activity_log`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          staff_id: staffSession.staffId,
          action_type: "reject_hitl",
          entity_type: "hitl_review",
          entity_id: reviewId,
          details: {
            quote_id: reviewData.quote_id,
            quote_number: reviewData.quote_number,
            reason: rejectQuoteReason,
            email_sent: sendEmailToCustomer,
          },
        }),
      });

      // 4. Send email if opted in
      const customerEmail =
        reviewData?.customer_email || reviewData?.customer?.email;
      const customerName =
        reviewData?.customer_name || reviewData?.customer?.full_name;

      if (sendEmailToCustomer && customerEmail) {
        await sendRejectionEmail(
          customerEmail,
          customerName || "Customer",
          reviewData.quote_number,
          rejectQuoteReason,
        );
      }

      alert("❌ Quote rejected successfully.");
      navigate("/admin/hitl");
    } catch (error) {
      console.error("Failed to reject quote:", error);
      alert("Failed to reject quote. Please try again.");
    } finally {
      setIsRejecting(false);
      setShowRejectQuoteModal(false);
    }
  };

  const sendRejectionEmail = async (
    email: string,
    name: string,
    quoteNumber: string,
    reason: string,
  ) => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          templateId: 19,
          to: email,
          params: {
            CUSTOMER_NAME: name || "Customer",
            QUOTE_NUMBER: quoteNumber,
            REJECTION_REASON: reason,
            SUPPORT_EMAIL: "support@cethos.com",
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send email");
      }
    } catch (error) {
      console.error("Failed to send rejection email:", error);
      // Don't throw - email failure shouldn't block rejection
    }
  };

  // ============================================
  // EDIT HELPERS
  // ============================================

  const getValue = (fileId: string, field: string, original: any) => {
    return localEdits[fileId]?.[field] ?? original;
  };

  const updateLocalEdit = (fileId: string, field: string, value: any) => {
    setLocalEdits((prev) => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        [field]: value,
      },
    }));
  };

  const getPageWordCount = (page: PageData) => {
    return localPageEdits[page.id]?.wordCount ?? page.word_count;
  };

  const updatePageWordCount = (page: PageData, newWordCount: number) => {
    setLocalPageEdits((prev) => ({
      ...prev,
      [page.id]: {
        wordCount: newWordCount,
        originalWordCount: page.word_count,
        fileId: page.quote_file_id,
      },
    }));
  };

  const hasChanges = (fileId: string) => {
    const hasFileEdits =
      localEdits[fileId] && Object.keys(localEdits[fileId]).length > 0;
    const hasPageEdits = Object.values(localPageEdits).some(
      (e) => e.fileId === fileId,
    );
    return hasFileEdits || hasPageEdits;
  };

  const hasAnyChanges = () => {
    return (
      Object.keys(localEdits).length > 0 ||
      Object.keys(localPageEdits).length > 0
    );
  };

  // ============================================
  // COMPLEXITY HELPERS
  // ============================================

  const getComplexityMultiplier = (complexity: string) => {
    switch (complexity) {
      case "easy":
        return 1.0;
      case "medium":
        return 1.15;
      case "hard":
        return 1.25;
      default:
        return 1.0;
    }
  };

  const handleComplexityChange = (fileId: string, newComplexity: string) => {
    const multiplier = getComplexityMultiplier(newComplexity);
    updateLocalEdit(fileId, "assessed_complexity", newComplexity);
    updateLocalEdit(fileId, "complexity_multiplier", multiplier);
  };

  // ============================================
  // CERTIFICATION HELPERS
  // ============================================

  const handleCertificationChange = (fileId: string, certTypeId: string) => {
    const cert = certificationTypes.find((c) => c.id === certTypeId);
    updateLocalEdit(fileId, "certification_type_id", certTypeId);
    updateLocalEdit(fileId, "certification_price", cert?.price || 0);
  };

  const calculateCertificationTotal = (
    fileId: string,
    analysis: AnalysisResult,
  ) => {
    const primaryCertId = getValue(
      fileId,
      "certification_type_id",
      analysis.certification_type_id,
    );
    const primaryPrice =
      certificationTypes.find((c) => c.id === primaryCertId)?.price || 0;
    const additionalPrice = (additionalCerts[fileId] || []).reduce(
      (sum, cert) => sum + cert.price,
      0,
    );
    return primaryPrice + additionalPrice;
  };

  const addAdditionalCert = async (
    fileId: string,
    analysisId: string,
    certTypeId: string,
  ) => {
    const cert = certificationTypes.find((c) => c.id === certTypeId);
    if (!cert) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            reviewId,
            staffId: staffSession.staffId,
            field: "add_certification",
            correctedValue: JSON.stringify({
              certification_type_id: certTypeId,
              price: cert.price,
            }),
            fileId,
            analysisId,
          }),
        },
      );

      if (response.ok) {
        setAdditionalCerts((prev) => ({
          ...prev,
          [fileId]: [
            ...(prev[fileId] || []),
            {
              id: crypto.randomUUID(), // Temporary, will refresh
              certification_type_id: certTypeId,
              name: cert.name,
              price: cert.price,
            },
          ],
        }));
        setShowAddCertModal(null);
        // Refresh to get actual IDs
        await fetchReviewData();
      }
    } catch (error) {
      console.error("Error adding certification:", error);
      alert("Failed to add certification");
    }
  };

  const removeAdditionalCert = async (fileId: string, certId: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            reviewId,
            staffId: staffSession.staffId,
            field: "remove_certification",
            correctedValue: certId,
          }),
        },
      );

      if (response.ok) {
        setAdditionalCerts((prev) => ({
          ...prev,
          [fileId]: (prev[fileId] || []).filter((c) => c.id !== certId),
        }));
      }
    } catch (error) {
      console.error("Error removing certification:", error);
    }
  };

  // ============================================
  // PAGE SPLITTING & COMBINING
  // ============================================

  const togglePageSelection = (pageId: string) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedPages(new Set());
    setSplitMode(false);
  };

  const confirmSplitPages = async () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");

    const firstPageId = Array.from(selectedPages)[0];
    let sourceAnalysisId: string | null = null;

    for (const [fileId, pages] of Object.entries(pageData)) {
      if (pages.some((p) => p.id === firstPageId)) {
        const analysis = analysisResults.find(
          (a) => a.quote_file_id === fileId,
        );
        sourceAnalysisId = analysis?.id || null;
        break;
      }
    }

    if (!sourceAnalysisId) {
      alert("Could not determine source document");
      return;
    }

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
            field: "create_document_from_pages",
            correctedValue: JSON.stringify({
              source_analysis_id: sourceAnalysisId,
              page_ids: Array.from(selectedPages),
              document_name: splitDocumentName || "Split Document",
            }),
            reason: `Split ${selectedPages.size} pages into new document`,
          }),
        },
      );

      const result = await response.json();

      if (result.success) {
        alert(
          `✅ Created new document: ${splitDocumentName || "Split Document"}`,
        );
        clearSelection();
        setShowSplitModal(false);
        setSplitDocumentName("");
        await fetchAllData();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Split error:", error);
      alert("Failed to split pages: " + (error as Error).message);
    }
  };

  const confirmCombinePages = async () => {
    if (!targetDocumentId) {
      alert("Please select a target document");
      return;
    }

    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");

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
            field: "combine_pages",
            correctedValue: JSON.stringify({
              target_document_id: targetDocumentId,
              page_ids: Array.from(selectedPages),
            }),
            reason: `Combined ${selectedPages.size} pages into document`,
          }),
        },
      );

      const result = await response.json();

      if (result.success) {
        alert("✅ Pages combined successfully");
        clearSelection();
        setShowCombineModal(false);
        setTargetDocumentId("");
        await fetchAllData();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Combine error:", error);
      alert("Failed to combine pages: " + (error as Error).message);
    }
  };

  // ============================================
  // PRICING CALCULATIONS
  // ============================================

  const calculatePageBillable = (
    wordCount: number,
    complexityMultiplier: number,
  ) => {
    // CEIL((words / 225) × complexity × 10) / 10 = Round UP to 0.10
    return (
      Math.ceil((wordCount / wordsPerPage) * complexityMultiplier * 10) / 10
    );
  };

  const calculateDocumentBillable = (
    fileId: string,
    analysis: AnalysisResult,
  ) => {
    const complexity =
      getValue(
        fileId,
        "complexity_multiplier",
        analysis.complexity_multiplier,
      ) || 1.0;
    const pages = pageData[fileId] || [];

    let totalBillable = 0;
    pages.forEach((page) => {
      const words = getPageWordCount(page);
      totalBillable += calculatePageBillable(words, complexity);
    });

    // Minimum 1.00 per document
    return Math.max(totalBillable, 1.0);
  };

  const calculateTranslationCost = (
    fileId: string,
    analysis: AnalysisResult,
  ) => {
    const billablePages = calculateDocumentBillable(fileId, analysis);
    const languageMultiplier = getLanguageMultiplier(
      analysis.detected_language,
    );

    // Round UP to nearest $2.50
    const rawCost = billablePages * baseRate * languageMultiplier;
    return Math.ceil(rawCost / 2.5) * 2.5;
  };

  const calculateLineTotal = (fileId: string, analysis: AnalysisResult) => {
    return (
      calculateTranslationCost(fileId, analysis) +
      calculateCertificationTotal(fileId, analysis)
    );
  };

  const getLanguageMultiplier = (languageCode: string) => {
    const lang = languages.find((l) => l.code === languageCode);
    return lang?.price_multiplier || 1.0;
  };

  // ============================================
  // SAVE CORRECTIONS
  // ============================================

  // Handle field edit - shows modal before saving
  const handleFieldEdit = (
    field: string,
    aiValue: string | number,
    correctedValue: string | number,
    fileId?: string,
    analysisId?: string,
    pageId?: string,
  ) => {
    // Only show modal if value actually changed
    if (String(aiValue) === String(correctedValue)) return;

    setCorrectionModal({
      isOpen: true,
      field,
      aiValue,
      correctedValue,
      fileId,
      analysisId,
      pageId,
    });
  };

  // Save individual correction with reason
  const saveCorrection = async (reason: string) => {
    if (!correctionModal || !staffSession?.staffId) return;

    setIsSaving(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            reviewId,
            staffId: staffSession.staffId,
            field: correctionModal.field,
            originalValue: String(correctionModal.aiValue),
            correctedValue: String(correctionModal.correctedValue),
            fileId: correctionModal.fileId,
            analysisId: correctionModal.analysisId,
            pageId: correctionModal.pageId,
            reason: reason, // ← NOW INCLUDED
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to save correction");

      // Close modal and refresh data
      setCorrectionModal(null);
      alert("Correction saved successfully!");
      await fetchReviewData();
    } catch (error) {
      console.error("Error saving correction:", error);
      alert("Failed to save correction: " + error);
    } finally {
      setIsSaving(false);
    }
  };

  const saveAllCorrections = async () => {
    if (!staffSession?.staffId) {
      alert("Session expired. Please login again.");
      return;
    }

    const hasFileEdits = Object.keys(localEdits).length > 0;
    const hasPageEdits = Object.keys(localPageEdits).length > 0;

    if (!hasFileEdits && !hasPageEdits) {
      alert("No changes to save");
      return;
    }

    setIsSaving(true);

    try {
      // Save file-level edits
      for (const [fileId, edits] of Object.entries(localEdits)) {
        const analysis = analysisResults.find(
          (a) => a.quote_file_id === fileId,
        );

        for (const [field, value] of Object.entries(edits)) {
          // Get the correct original value from the analysis object
          let originalValue = "";
          if (field === "assessed_complexity") {
            originalValue = analysis?.assessed_complexity || "";
          } else if (field === "detected_language") {
            originalValue = analysis?.detected_language || "";
          } else if (field === "detected_document_type") {
            originalValue = analysis?.detected_document_type || "";
          } else if (field === "complexity_multiplier") {
            originalValue = String(analysis?.complexity_multiplier || 1.0);
          } else if (field === "certification_type_id") {
            originalValue = analysis?.certification_type_id || "";
          } else if (field === "certification_price") {
            originalValue = String(analysis?.certification_price || 0);
          } else {
            originalValue = String((analysis as any)?.[field] || "");
          }

          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                reviewId,
                staffId: staffSession.staffId,
                field,
                originalValue: String(originalValue),
                correctedValue: String(value),
                fileId,
                analysisId: analysis?.id,
              }),
            },
          );
        }
      }

      // Save page-level edits
      for (const [pageId, editData] of Object.entries(localPageEdits)) {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              reviewId,
              staffId: staffSession.staffId,
              field: "page_word_count",
              originalValue: String(editData.originalWordCount),
              correctedValue: String(editData.wordCount),
              fileId: editData.fileId,
              pageId, // CRITICAL: Include pageId
            }),
          },
        );
      }

      alert("Corrections saved successfully!");
      setLocalEdits({});
      setLocalPageEdits({});

      // Refresh data
      await fetchReviewData();
    } catch (error) {
      console.error("Save error:", error);
      alert("Error saving corrections: " + error);
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================
  // CLAIM REVIEW
  // ============================================

  // ============================================
  // SAVE INTERNAL NOTES
  // ============================================

  const handleSaveInternalNotes = async (notes: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/hitl_reviews?id=eq.${reviewData?.id}`,
        {
          method: "PATCH",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ internal_notes: notes }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to save internal notes");
      }

      setReviewData({ ...reviewData, internal_notes: notes });
      console.log("✅ Internal notes saved successfully");
    } catch (error) {
      console.error("Error saving internal notes:", error);
      throw error;
    }
  };

  const claimReview = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            reviewId,
            staffId: staffSession.staffId,
          }),
        },
      );

      if (response.ok) {
        setClaimedByMe(true);
        await fetchReviewData();
      }
    } catch (error) {
      console.error("Error claiming review:", error);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/admin/hitl")}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to Queue
            </button>
            <h1 className="text-xl font-semibold">
              Review: {reviewData?.quotes?.quote_number}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {claimedByMe ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                ✓ Claimed by you
              </span>
            ) : claimedByOther ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                Claimed by {assignedStaffName || "another staff"}
              </span>
            ) : (
              <button
                onClick={handleClaimReview}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium"
              >
                Claim Review
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 mx-auto w-full px-4 py-6 overflow-hidden">
        {/* No Data Warning */}
        {!reviewData && !loading && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-yellow-800 font-medium">No review data found</p>
            <p className="text-yellow-600 text-sm mt-2">
              Review ID: {reviewId}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Check browser console for details
            </p>
          </div>
        )}

        {reviewData && !reviewData.quotes && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 text-center">
            <p className="text-orange-800 font-medium">
              No quote found for this review
            </p>
            <p className="text-orange-600 text-sm mt-2">
              Quote ID: {reviewData.quote_id}
            </p>
          </div>
        )}

        {reviewData && reviewData.quotes && (
          <HITLPanelLayout
            reviewData={reviewData.quotes}
            quoteFiles={quoteFiles}
            staffId={staffSession?.staffId}
            staffName={staffSession?.name}
            loading={loading}
            onSaveInternalNotes={handleSaveInternalNotes}
          >
            {/* Center Panel Content: Document Accordion */}
            {/* Page Selection Toolbar */}
            {claimedByMe && analysisResults.length > 0 && (
              <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSplitMode(!splitMode)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      splitMode
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {splitMode ? "✓ Selection Mode" : "Select Pages"}
                  </button>

                  {splitMode && selectedPages.size > 0 && (
                    <>
                      <span className="text-sm text-gray-600">
                        {selectedPages.size} page(s) selected
                      </span>
                      <button
                        onClick={() => setShowSplitModal(true)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
                      >
                        Split to New Document
                      </button>
                      <button
                        onClick={() => setShowCombineModal(true)}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700"
                      >
                        Combine Into...
                      </button>
                      <button
                        onClick={clearSelection}
                        className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-sm"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Document List */}
            <div className="space-y-4">
              {analysisResults.map((analysis, index) => {
                const pages = pageData[analysis.quote_file_id] || [];
                const totalWords = pages.reduce(
                  (sum, p) => sum + getPageWordCount(p),
                  0,
                );

                return (
                  <div
                    key={analysis.id}
                    className="bg-white rounded-lg shadow overflow-hidden"
                  >
                    {/* File Header */}
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
                          {index + 1}. {analysis.quote_file?.original_filename}
                        </span>
                        <span className="text-sm text-gray-500">
                          {totalWords} words • {pages.length} page(s)
                        </span>
                        {hasChanges(analysis.quote_file_id) && (
                          <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                            Unsaved changes
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-bold text-blue-600">
                          $
                          {calculateLineTotal(
                            analysis.quote_file_id,
                            analysis,
                          ).toFixed(2)}
                        </span>
                        <span className="text-gray-400">
                          {expandedFile === analysis.id ? "▼" : "▶"}
                        </span>
                      </div>
                    </button>

                    {/* Expanded Content */}
                    {expandedFile === analysis.id && (
                      <div className="p-6 border-t">
                        <div className="grid grid-cols-2 gap-6">
                          {/* Left Column: Document Preview */}
                          <div>
                            <h4 className="font-semibold mb-3">
                              Document Preview
                            </h4>
                            <div className="border rounded-lg overflow-hidden bg-gray-50">
                              <img
                                src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${analysis.quote_file?.storage_path}`}
                                alt={analysis.quote_file?.original_filename}
                                className="w-full max-h-[400px] object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            </div>
                            <div className="mt-2 space-y-2">
                              <div className="flex justify-between text-sm text-gray-500">
                                <span>
                                  {(
                                    analysis.quote_file?.file_size /
                                    1024 /
                                    1024
                                  ).toFixed(2)}{" "}
                                  MB
                                </span>
                                <a
                                  href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${analysis.quote_file?.storage_path}`}
                                  target="_blank"
                                  className="text-blue-600 hover:underline"
                                >
                                  ↓ Download
                                </a>
                              </div>
                              <button
                                onClick={() => {
                                  setPreviewDocument({
                                    url: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${analysis.quote_file?.storage_path}`,
                                    name:
                                      analysis.quote_file?.original_filename ||
                                      "Document",
                                    type: analysis.quote_file?.mime_type?.includes(
                                      "pdf",
                                    )
                                      ? "pdf"
                                      : "image",
                                  });
                                }}
                                className="w-full px-3 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded hover:bg-blue-100 transition-colors"
                              >
                                👁 Full Preview
                              </button>
                            </div>
                          </div>

                          {/* Right Column: Analysis & Editing */}
                          <div className="space-y-4">
                            {/* Document Type */}
                            <div className="bg-white border rounded p-3">
                              <label className="text-sm text-gray-500 block mb-1">
                                Document Type
                              </label>
                              {claimedByMe ? (
                                <input
                                  type="text"
                                  value={
                                    getValue(
                                      analysis.quote_file_id,
                                      "detected_document_type",
                                      analysis.detected_document_type,
                                    ) || ""
                                  }
                                  onChange={(e) =>
                                    updateLocalEdit(
                                      analysis.quote_file_id,
                                      "detected_document_type",
                                      e.target.value,
                                    )
                                  }
                                  onBlur={(e) => {
                                    const newValue = e.target.value;
                                    if (
                                      newValue !==
                                      analysis.detected_document_type
                                    ) {
                                      handleFieldEdit(
                                        "detected_document_type",
                                        analysis.detected_document_type,
                                        newValue,
                                        analysis.quote_file_id,
                                        analysis.id,
                                      );
                                    }
                                  }}
                                  className="w-full border rounded px-3 py-2"
                                />
                              ) : (
                                <div className="font-medium">
                                  {analysis.detected_document_type}
                                </div>
                              )}
                            </div>

                            {/* Language */}
                            <div className="bg-white border rounded p-3">
                              <label className="text-sm text-gray-500 block mb-1">
                                Detected Language
                              </label>
                              {claimedByMe ? (
                                <select
                                  value={
                                    getValue(
                                      analysis.quote_file_id,
                                      "detected_language",
                                      analysis.detected_language,
                                    ) || ""
                                  }
                                  onChange={(e) => {
                                    const newValue = e.target.value;
                                    updateLocalEdit(
                                      analysis.quote_file_id,
                                      "detected_language",
                                      newValue,
                                    );
                                    if (
                                      newValue !== analysis.detected_language
                                    ) {
                                      handleFieldEdit(
                                        "detected_language",
                                        analysis.detected_language,
                                        newValue,
                                        analysis.quote_file_id,
                                        analysis.id,
                                      );
                                    }
                                  }}
                                  className="w-full border rounded px-3 py-2"
                                >
                                  {languages.map((lang) => (
                                    <option key={lang.code} value={lang.code}>
                                      {lang.name} ({lang.price_multiplier}x)
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="font-medium">
                                  {analysis.detected_language}
                                </div>
                              )}
                            </div>

                            {/* Complexity */}
                            <div className="bg-white border rounded p-3">
                              <label className="text-sm text-gray-500 block mb-1">
                                Complexity
                              </label>
                              {claimedByMe ? (
                                <select
                                  value={
                                    getValue(
                                      analysis.quote_file_id,
                                      "assessed_complexity",
                                      analysis.assessed_complexity,
                                    ) || "easy"
                                  }
                                  onChange={(e) => {
                                    const newValue = e.target.value;
                                    handleComplexityChange(
                                      analysis.quote_file_id,
                                      newValue,
                                    );
                                    if (
                                      newValue !== analysis.assessed_complexity
                                    ) {
                                      handleFieldEdit(
                                        "assessed_complexity",
                                        analysis.assessed_complexity,
                                        newValue,
                                        analysis.quote_file_id,
                                        analysis.id,
                                      );
                                    }
                                  }}
                                  className="w-full border rounded px-3 py-2"
                                >
                                  <option value="easy">Easy (1.0x)</option>
                                  <option value="medium">Medium (1.15x)</option>
                                  <option value="hard">Hard (1.25x)</option>
                                </select>
                              ) : (
                                <div className="font-medium capitalize">
                                  {analysis.assessed_complexity} (
                                  {analysis.complexity_multiplier}x)
                                </div>
                              )}
                            </div>

                            {/* Page Breakdown */}
                            <div className="bg-white border rounded p-3">
                              <label className="text-sm text-gray-500 block mb-2">
                                Page Breakdown ({pages.length} page
                                {pages.length !== 1 ? "s" : ""})
                              </label>
                              <div className="space-y-2">
                                {pages.map((page, idx) => {
                                  const words = getPageWordCount(page);
                                  const complexity =
                                    getValue(
                                      analysis.quote_file_id,
                                      "complexity_multiplier",
                                      analysis.complexity_multiplier,
                                    ) || 1.0;
                                  const pageBillable = calculatePageBillable(
                                    words,
                                    complexity,
                                  );

                                  return (
                                    <div
                                      key={page.id}
                                      className={`flex items-center justify-between p-2 rounded ${
                                        selectedPages.has(page.id)
                                          ? "bg-blue-50 border border-blue-200"
                                          : "bg-gray-50"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        {splitMode && (
                                          <input
                                            type="checkbox"
                                            checked={selectedPages.has(page.id)}
                                            onChange={() =>
                                              togglePageSelection(page.id)
                                            }
                                            className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                          />
                                        )}
                                        <span className="text-sm font-medium">
                                          Page {idx + 1}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        {claimedByMe ? (
                                          <input
                                            type="number"
                                            value={words}
                                            onChange={(e) =>
                                              updatePageWordCount(
                                                page,
                                                parseInt(e.target.value) || 0,
                                              )
                                            }
                                            onBlur={(e) => {
                                              const newValue =
                                                parseInt(e.target.value) || 0;
                                              if (
                                                newValue !== page.word_count
                                              ) {
                                                handleFieldEdit(
                                                  "page_word_count",
                                                  page.word_count,
                                                  newValue,
                                                  page.quote_file_id,
                                                  undefined,
                                                  page.id,
                                                );
                                              }
                                            }}
                                            className="w-20 text-right border rounded px-2 py-1 text-sm"
                                            min="0"
                                          />
                                        ) : (
                                          <span className="text-sm">
                                            {words}
                                          </span>
                                        )}
                                        <span className="text-xs text-gray-500">
                                          words
                                        </span>
                                        <span className="text-xs text-blue-600 font-medium">
                                          = {pageBillable.toFixed(2)} bp
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Document Billable Total */}
                              <div className="flex justify-between mt-3 pt-2 border-t font-medium">
                                <span>Document Billable:</span>
                                <span>
                                  {calculateDocumentBillable(
                                    analysis.quote_file_id,
                                    analysis,
                                  ).toFixed(2)}{" "}
                                  pages
                                </span>
                              </div>
                              {calculateDocumentBillable(
                                analysis.quote_file_id,
                                analysis,
                              ) === 1.0 &&
                                pages.reduce(
                                  (sum, p) =>
                                    sum +
                                    calculatePageBillable(
                                      getPageWordCount(p),
                                      getValue(
                                        analysis.quote_file_id,
                                        "complexity_multiplier",
                                        analysis.complexity_multiplier,
                                      ) || 1.0,
                                    ),
                                  0,
                                ) < 1.0 && (
                                  <div className="text-xs text-orange-600 mt-1">
                                    * Minimum 1.00 applied
                                  </div>
                                )}
                            </div>

                            {/* CERTIFICATION SECTION */}
                            <div className="bg-white border rounded p-3">
                              <label className="text-sm text-gray-500 block mb-2">
                                Certification
                              </label>

                              {/* Primary Certification */}
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium">
                                  Primary:
                                </span>
                                <div className="flex items-center gap-2 flex-1 ml-4">
                                  {claimedByMe ? (
                                    <select
                                      value={
                                        getValue(
                                          analysis.quote_file_id,
                                          "certification_type_id",
                                          analysis.certification_type_id,
                                        ) || ""
                                      }
                                      onChange={(e) =>
                                        handleCertificationChange(
                                          analysis.quote_file_id,
                                          e.target.value,
                                        )
                                      }
                                      className="flex-1 border rounded px-3 py-1 text-sm"
                                    >
                                      {certificationTypes.map((cert) => (
                                        <option key={cert.id} value={cert.id}>
                                          {cert.name} (${cert.price.toFixed(2)})
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-sm flex-1">
                                      {certificationTypes.find(
                                        (c) =>
                                          c.id ===
                                          analysis.certification_type_id,
                                      )?.name || "Not set"}
                                    </span>
                                  )}
                                  <span className="text-sm font-medium w-20 text-right">
                                    $
                                    {(
                                      certificationTypes.find(
                                        (c) =>
                                          c.id ===
                                          getValue(
                                            analysis.quote_file_id,
                                            "certification_type_id",
                                            analysis.certification_type_id,
                                          ),
                                      )?.price || 0
                                    ).toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              {/* Additional Certifications */}
                              <div className="border-t pt-2">
                                <div className="text-xs text-gray-500 mb-2">
                                  Additional Certifications:
                                </div>

                                {(additionalCerts[analysis.quote_file_id] || [])
                                  .length === 0 ? (
                                  <p className="text-xs text-gray-400 italic">
                                    None added
                                  </p>
                                ) : (
                                  <div className="space-y-1">
                                    {(
                                      additionalCerts[analysis.quote_file_id] ||
                                      []
                                    ).map((cert) => (
                                      <div
                                        key={cert.id}
                                        className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded"
                                      >
                                        <span className="text-sm">
                                          {cert.name}
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm">
                                            ${cert.price.toFixed(2)}
                                          </span>
                                          {claimedByMe && (
                                            <button
                                              onClick={() =>
                                                removeAdditionalCert(
                                                  analysis.quote_file_id,
                                                  cert.id,
                                                )
                                              }
                                              className="text-red-500 text-xs hover:text-red-700"
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {claimedByMe && (
                                  <button
                                    onClick={() =>
                                      setShowAddCertModal(
                                        analysis.quote_file_id,
                                      )
                                    }
                                    className="text-blue-600 text-sm mt-2 hover:underline"
                                  >
                                    + Add Certification
                                  </button>
                                )}
                              </div>

                              {/* Certification Total */}
                              <div className="border-t pt-2 mt-3 flex justify-between">
                                <span className="text-sm font-medium">
                                  Certification Total:
                                </span>
                                <span className="text-sm font-bold">
                                  $
                                  {calculateCertificationTotal(
                                    analysis.quote_file_id,
                                    analysis,
                                  ).toFixed(2)}
                                </span>
                              </div>
                            </div>

                            {/* PRICING SUMMARY */}
                            <div className="bg-blue-50 border border-blue-200 rounded p-3">
                              <h4 className="text-sm font-semibold text-blue-800 mb-2">
                                Document Total
                              </h4>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span>Billable Pages:</span>
                                  <span>
                                    {calculateDocumentBillable(
                                      analysis.quote_file_id,
                                      analysis,
                                    ).toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Translation:</span>
                                  <span>
                                    $
                                    {calculateTranslationCost(
                                      analysis.quote_file_id,
                                      analysis,
                                    ).toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Certification:</span>
                                  <span>
                                    $
                                    {calculateCertificationTotal(
                                      analysis.quote_file_id,
                                      analysis,
                                    ).toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex justify-between font-bold border-t pt-1 mt-1 text-blue-800">
                                  <span>Line Total:</span>
                                  <span>
                                    $
                                    {calculateLineTotal(
                                      analysis.quote_file_id,
                                      analysis,
                                    ).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* AI Processing Details - Collapsible */}
                        <div className="bg-gray-50 rounded-lg border mt-6">
                          <button
                            onClick={() =>
                              setShowAiDetails((prev) => ({
                                ...prev,
                                [analysis.id]: !prev[analysis.id],
                              }))
                            }
                            className="w-full flex justify-between items-center p-4 text-left hover:bg-gray-100"
                          >
                            <span className="font-medium text-gray-700">
                              🤖 AI Processing Details
                            </span>
                            <span className="text-gray-400 text-lg">
                              {showAiDetails[analysis.id] ? "−" : "+"}
                            </span>
                          </button>

                          {showAiDetails[analysis.id] && (
                            <div className="px-4 pb-4 border-t">
                              {/* Processing Info Grid */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                                <div className="bg-white p-3 rounded border">
                                  <p className="text-xs text-gray-500 uppercase">
                                    OCR Provider
                                  </p>
                                  <p className="font-medium">
                                    {analysis?.ocr_provider ||
                                      "Google Document AI"}
                                  </p>
                                </div>

                                <div className="bg-white p-3 rounded border">
                                  <p className="text-xs text-gray-500 uppercase">
                                    OCR Confidence
                                  </p>
                                  <p
                                    className={`font-medium ${
                                      (analysis?.ocr_confidence || 0) > 0.8
                                        ? "text-green-600"
                                        : (analysis?.ocr_confidence || 0) > 0.6
                                          ? "text-yellow-600"
                                          : "text-red-600"
                                    }`}
                                  >
                                    {analysis?.ocr_confidence
                                      ? `${(analysis.ocr_confidence * 100).toFixed(1)}%`
                                      : "N/A"}
                                  </p>
                                </div>

                                <div className="bg-white p-3 rounded border">
                                  <p className="text-xs text-gray-500 uppercase">
                                    AI Model
                                  </p>
                                  <p className="font-medium">
                                    {analysis?.llm_model || "Claude Sonnet"}
                                  </p>
                                </div>

                                <div className="bg-white p-3 rounded border">
                                  <p className="text-xs text-gray-500 uppercase">
                                    Processing Time
                                  </p>
                                  <p className="font-medium">
                                    {analysis?.processing_time_ms
                                      ? `${(analysis.processing_time_ms / 1000).toFixed(1)}s`
                                      : "N/A"}
                                  </p>
                                </div>
                              </div>

                              {/* Confidence Scores */}
                              <div className="mt-4">
                                <p className="text-sm font-medium text-gray-700 mb-2">
                                  AI Confidence Scores
                                </p>
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="bg-white p-3 rounded border">
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-600">
                                        Language
                                      </span>
                                      <span
                                        className={`text-sm font-medium ${
                                          (analysis?.language_confidence || 0) >
                                          0.9
                                            ? "text-green-600"
                                            : (analysis?.language_confidence ||
                                                  0) > 0.8
                                              ? "text-yellow-600"
                                              : "text-red-600"
                                        }`}
                                      >
                                        {analysis?.language_confidence
                                          ? `${(analysis.language_confidence * 100).toFixed(0)}%`
                                          : "N/A"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="bg-white p-3 rounded border">
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-600">
                                        Document Type
                                      </span>
                                      <span
                                        className={`text-sm font-medium ${
                                          (analysis?.document_type_confidence ||
                                            0) > 0.85
                                            ? "text-green-600"
                                            : (analysis?.document_type_confidence ||
                                                  0) > 0.7
                                              ? "text-yellow-600"
                                              : "text-red-600"
                                        }`}
                                      >
                                        {analysis?.document_type_confidence
                                          ? `${(analysis.document_type_confidence * 100).toFixed(0)}%`
                                          : "N/A"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="bg-white p-3 rounded border">
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-600">
                                        Complexity
                                      </span>
                                      <span
                                        className={`text-sm font-medium ${
                                          (analysis?.complexity_confidence ||
                                            0) > 0.8
                                            ? "text-green-600"
                                            : (analysis?.complexity_confidence ||
                                                  0) > 0.6
                                              ? "text-yellow-600"
                                              : "text-red-600"
                                        }`}
                                      >
                                        {analysis?.complexity_confidence
                                          ? `${(analysis.complexity_confidence * 100).toFixed(0)}%`
                                          : "N/A"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* HITL Trigger Reasons */}
                              {reviewData?.trigger_reasons?.length > 0 && (
                                <div className="mt-4">
                                  <p className="text-sm font-medium text-gray-700 mb-2">
                                    Why HITL Was Triggered
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {reviewData.trigger_reasons.map(
                                      (reason: string, idx: number) => (
                                        <span
                                          key={idx}
                                          className="px-3 py-1 bg-amber-100 text-amber-800 text-sm rounded-full"
                                        >
                                          {reason
                                            .replace(/_/g, " ")
                                            .replace(/\b\w/g, (l) =>
                                              l.toUpperCase(),
                                            )}
                                        </span>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </HITLPanelLayout>
        )}

        {/* Messages Panel - Now integrated in HITLPanelLayout */}
        {false && reviewData && reviewData.quotes && staffSession?.staffId && (
          <div className="mt-6">
            <MessagePanel
              quoteId={reviewData.quotes.id}
              staffId={staffSession.staffId}
              staffName={staffSession.name || "Staff"}
            />
          </div>
        )}

        {/* Save Button */}
        {claimedByMe && hasAnyChanges() && (
          <div className="fixed bottom-6 right-6">
            <button
              onClick={saveAllCorrections}
              disabled={isSaving}
              className={`px-6 py-3 rounded-lg shadow-lg text-white font-medium ${
                isSaving ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isSaving ? "Saving..." : "Save All Corrections"}
            </button>
          </div>
        )}
      </main>

      {/* Add Certification Modal */}
      {showAddCertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Certification</h3>

            <div className="space-y-2">
              {certificationTypes
                .filter((cert) => {
                  const analysis = analysisResults.find(
                    (a) => a.quote_file_id === showAddCertModal,
                  );
                  const existing = additionalCerts[showAddCertModal] || [];
                  const isPrimary =
                    getValue(
                      showAddCertModal,
                      "certification_type_id",
                      analysis?.certification_type_id,
                    ) === cert.id;
                  const isAdded = existing.some(
                    (e) => e.certification_type_id === cert.id,
                  );
                  return !isPrimary && !isAdded;
                })
                .map((cert) => (
                  <button
                    key={cert.id}
                    onClick={() => {
                      const analysis = analysisResults.find(
                        (a) => a.quote_file_id === showAddCertModal,
                      );
                      if (analysis) {
                        addAdditionalCert(
                          showAddCertModal,
                          analysis.id,
                          cert.id,
                        );
                      }
                    }}
                    className="w-full text-left p-3 border rounded hover:bg-gray-50 flex justify-between"
                  >
                    <span>{cert.name}</span>
                    <span className="font-medium">
                      ${cert.price.toFixed(2)}
                    </span>
                  </button>
                ))}
            </div>

            <button
              onClick={() => setShowAddCertModal(null)}
              className="mt-4 w-full py-2 border rounded text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Correction Reason Modal */}
      {correctionModal && (
        <CorrectionReasonModal
          isOpen={correctionModal.isOpen}
          onClose={() => setCorrectionModal(null)}
          onConfirm={saveCorrection}
          fieldName={correctionModal.field}
          aiValue={correctionModal.aiValue}
          correctedValue={correctionModal.correctedValue}
        />
      )}

      {/* Action Footer - Only show when claimed by me */}
      {claimedByMe && reviewData?.status === "in_review" && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-40">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-end gap-3">
              {/* Action Buttons */}
              <button
                onClick={() => setShowRejectQuoteModal(true)}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Reject Quote
              </button>

              <button
                onClick={() => setShowRejectModal(true)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-red-100 text-red-700 border border-red-300 rounded-lg hover:bg-red-200 font-medium disabled:opacity-50"
              >
                Request Better Scan
              </button>

              <button
                onClick={handleEscalateReview}
                disabled={isSubmitting}
                className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
              >
                Escalate to Admin
              </button>

              <button
                onClick={handleApproveReview}
                disabled={isSubmitting}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
              >
                {isSubmitting ? "Processing..." : "Approve Quote ✓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add padding at bottom for fixed footer */}
      {claimedByMe && reviewData?.status === "in_review" && (
        <div className="h-20"></div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">Request Better Scan</h3>

            <p className="text-gray-600 mb-4">
              The customer will be notified that a clearer scan is needed.
              Please explain the issue:
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-2"
              >
                <option value="">Select a reason...</option>
                <option value="Document is too blurry to read">
                  Document is too blurry to read
                </option>
                <option value="Part of the document is cut off">
                  Part of the document is cut off
                </option>
                <option value="Image is too dark or overexposed">
                  Image is too dark or overexposed
                </option>
                <option value="Document appears to be incomplete">
                  Document appears to be incomplete
                </option>
                <option value="Wrong document uploaded">
                  Wrong document uploaded
                </option>
                <option value="Other (see notes)">Other (see notes)</option>
              </select>

              <textarea
                value={rejectReason.startsWith("Other") ? "" : rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Or type a custom reason..."
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectReview}
                disabled={!rejectReason.trim() || isSubmitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300"
              >
                {isSubmitting ? "Sending..." : "Send to Customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Quote Modal */}
      {showRejectQuoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Reject Quote
                </h3>
                <p className="text-sm text-gray-500">
                  {reviewData?.quote_number}
                </p>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Rejecting this quote will permanently close it. The customer
                will not be able to proceed with this quote.
              </p>
            </div>

            {/* Reason Dropdown */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rejection Reason
              </label>
              <select
                value={rejectQuoteReason.split(":")[0]}
                onChange={(e) => {
                  const reasons = {
                    spam: "Spam or invalid submission",
                    inappropriate: "Inappropriate content",
                    duplicate: "Duplicate submission",
                    unreadable: "Documents completely unreadable",
                    other: "",
                  };
                  setRejectQuoteReason(
                    reasons[e.target.value as keyof typeof reasons] || "",
                  );
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="">Select a reason...</option>
                <option value="spam">Spam or invalid submission</option>
                <option value="inappropriate">Inappropriate content</option>
                <option value="duplicate">Duplicate submission</option>
                <option value="unreadable">
                  Documents completely unreadable
                </option>
                <option value="other">Other (specify below)</option>
              </select>
            </div>

            {/* Custom Reason Text */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Details (required)
              </label>
              <textarea
                value={rejectQuoteReason}
                onChange={(e) => setRejectQuoteReason(e.target.value)}
                placeholder="Provide details about why this quote is being rejected..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
              />
            </div>

            {/* Email Option */}
            <div className="mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmailToCustomer}
                  onChange={(e) => setSendEmailToCustomer(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">
                    Send rejection notification to customer
                  </span>
                </div>
              </label>
              {sendEmailToCustomer && (
                <p className="ml-7 mt-1 text-xs text-gray-500">
                  Email will be sent to:{" "}
                  <span className="font-medium">
                    {reviewData?.customer_email ||
                      reviewData?.customer?.email ||
                      "Unknown"}
                  </span>
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectQuoteModal(false);
                  setRejectQuoteReason("");
                  setSendEmailToCustomer(false);
                }}
                disabled={isRejecting}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectQuote}
                disabled={isRejecting || !rejectQuoteReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRejecting ? "Rejecting..." : "Reject Quote"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Modal */}
      {showSplitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">
              Split Pages to New Document
            </h3>

            <p className="text-gray-600 mb-4">
              Create a new document from {selectedPages.size} selected page(s).
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Name
              </label>
              <input
                type="text"
                value={splitDocumentName}
                onChange={(e) => setSplitDocumentName(e.target.value)}
                placeholder="e.g., Birth Certificate - Page 2"
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSplitModal(false);
                  setSplitDocumentName("");
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={confirmSplitPages}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Create Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Combine Modal */}
      {showCombineModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">
              Combine Pages Into Document
            </h3>

            <p className="text-gray-600 mb-4">
              Move {selectedPages.size} selected page(s) into an existing
              document.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Document
              </label>
              <select
                value={targetDocumentId}
                onChange={(e) => setTargetDocumentId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="">Select a document...</option>
                {analysisResults.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.detected_document_type ||
                      doc.quote_file?.original_filename}{" "}
                    ({doc.page_count} pages)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCombineModal(false);
                  setTargetDocumentId("");
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={confirmCombinePages}
                disabled={!targetDocumentId}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300"
              >
                Combine Pages
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDocument && (
        <DocumentPreviewModal
          isOpen={true}
          onClose={() => setPreviewDocument(null)}
          fileUrl={previewDocument.url}
          fileName={previewDocument.name}
          fileType={previewDocument.type}
        />
      )}
    </div>
  );
};

export default HITLReviewDetail;
