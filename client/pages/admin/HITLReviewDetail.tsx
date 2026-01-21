// HITLReviewDetail.tsx - Complete implementation with certification management

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CorrectionReasonModal } from "@/components/CorrectionReasonModal";

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
  const [staffSession, setStaffSession] = useState<any>(null);
  const [claimedByMe, setClaimedByMe] = useState(false);
  const [claimedByOther, setClaimedByOther] = useState(false);
  const [assignedStaffName, setAssignedStaffName] = useState<string | null>(null);

  // Action buttons
  const [internalNotes, setInternalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Page splitting/combining
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [splitMode, setSplitMode] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [splitDocumentName, setSplitDocumentName] = useState('');
  const [targetDocumentId, setTargetDocumentId] = useState('');

  // Correction reason modal
  const [correctionModal, setCorrectionModal] = useState<{
    isOpen: boolean;
    field: string;
    aiValue: string | number | null;
    correctedValue: string | number;
    callback: (reason: string) => void;
  } | null>(null);

  // ============================================
  // DATA FETCHING
  // ============================================

  useEffect(() => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    setStaffSession(session);

    console.log("🔐 Session check:", session);
    console.log("🔐 Has staffId:", !!session.staffId);

    if (!session.staffId) {
      console.warn("⚠️ No staff session found - redirecting to login");
      console.warn(
        "⚠️ If you need to test, temporarily add a session to sessionStorage",
      );
      navigate("/admin/login");
      return;
    }

    fetchAllData();
  }, [reviewId]);

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

      // Step 2: Fetch quote using quote_number from view
      const quotes = await fetchFromSupabase(
        `quotes?quote_number=eq.${viewReview.quote_number}&select=*`,
      );
      const quote = quotes[0];

      console.log("💰 Quote found:", quote);

      if (!quote) {
        console.error(
          "❌ No quote found for quote_number:",
          viewReview.quote_number,
        );
        return;
      }

      // Step 3: Get assigned_to from view if available, or try to fetch from base table
      let assignedTo = viewReview.assigned_to || null;

      // If view doesn't have assigned_to, try fetching from base table
      if (!assignedTo) {
        try {
          const baseReviews = await fetchFromSupabase(
            `hitl_reviews?id=eq.${viewReview.review_id}&select=assigned_to`,
          );
          if (baseReviews && baseReviews[0]) {
            assignedTo = baseReviews[0].assigned_to;
            console.log("✅ Fetched assigned_to from base table:", assignedTo);
          }
        } catch (error) {
          console.warn(
            "⚠️ Could not fetch assigned_to from base table (RLS):",
            error,
          );
        }
      }

      // Construct review object from view data
      const review = {
        id: viewReview.review_id,
        quote_id: quote.id,
        status: viewReview.status,
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
      const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
      const isClaimed = assignedTo === session.staffId;
      setClaimedByMe(isClaimed);
      console.log(
        `🔐 Claimed by me: ${isClaimed} (assigned_to: ${assignedTo}, staffId: ${session.staffId})`,
      );

      if (quote?.id) {
        console.log("🔍 Fetching analysis results for quote:", quote.id);

        // Fetch analysis results with quote_file relationship (using nested select)
        const analysis = await fetchFromSupabase(
          `ai_analysis_results?quote_id=eq.${quote.id}&select=*,quote_file:quote_files(*)`,
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
                originalValue: String((analysis as any)?.[field] || ""),
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
            {!claimedByMe && (
              <button
                onClick={claimReview}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Claim Review
              </button>
            )}
            {claimedByMe && (
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded text-sm">
                Claimed by you
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
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

        {reviewData && reviewData.quotes && analysisResults.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <p className="text-blue-800 font-medium">
              No documents found for this quote
            </p>
            <p className="text-blue-600 text-sm mt-2">
              Quote: {reviewData.quotes.quote_number}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              The AI analysis may not have completed yet
            </p>
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
                        <h4 className="font-semibold mb-3">Document Preview</h4>
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
                        <div className="mt-2 flex justify-between text-sm text-gray-500">
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
                              onChange={(e) =>
                                updateLocalEdit(
                                  analysis.quote_file_id,
                                  "detected_language",
                                  e.target.value,
                                )
                              }
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
                              onChange={(e) =>
                                handleComplexityChange(
                                  analysis.quote_file_id,
                                  e.target.value,
                                )
                              }
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
                                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                                >
                                  <span className="text-sm font-medium">
                                    Page {idx + 1}
                                  </span>
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
                                          if (newValue !== page.word_count) {
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
                                      <span className="text-sm">{words}</span>
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
                                      c.id === analysis.certification_type_id,
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
                                  additionalCerts[analysis.quote_file_id] || []
                                ).map((cert) => (
                                  <div
                                    key={cert.id}
                                    className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded"
                                  >
                                    <span className="text-sm">{cert.name}</span>
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
                                  setShowAddCertModal(analysis.quote_file_id)
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
                  </div>
                )}
              </div>
            );
          })}
        </div>

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
    </div>
  );
};

export default HITLReviewDetail;
