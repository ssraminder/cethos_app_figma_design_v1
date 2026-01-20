import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

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

  // Combined files tracking (fileId -> parentFileId)
  const [combinedFiles, setCombinedFiles] = useState<Record<string, string>>(
    {},
  );

  // Language editing state
  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);

  // Page-level data
  const [pageData, setPageData] = useState<
    Record<
      string,
      Array<{
        id: string;
        page_number: number;
        word_count: number;
      }>
    >
  >({});

  // Local page edits (pageId -> word_count)
  const [localPageEdits, setLocalPageEdits] = useState<Record<string, number>>(
    {},
  );

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [savedCombinedFiles, setSavedCombinedFiles] = useState<Record<string, string>>({});

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Initialize Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Complexity to multiplier mapping
  const COMPLEXITY_MULTIPLIERS: Record<string, number> = {
    standard: 1.0,
    complex: 1.15,
    highly_complex: 1.5,
  };

  // Language multipliers
  const LANGUAGE_MULTIPLIERS: Record<string, number> = {
    en: 1.0, // English
    es: 1.0, // Spanish
    fr: 1.1, // French
    de: 1.1, // German
    zh: 1.25, // Chinese
    ja: 1.25, // Japanese
    ko: 1.25, // Korean
    ar: 1.3, // Arabic
    ru: 1.15, // Russian
    pl: 1.1, // Polish
    pt: 1.0, // Portuguese
    it: 1.0, // Italian
    nl: 1.1, // Dutch
    sv: 1.1, // Swedish
    uk: 1.15, // Ukrainian
    vi: 1.2, // Vietnamese
    th: 1.25, // Thai
    hi: 1.15, // Hindi
    tr: 1.1, // Turkish
    he: 1.2, // Hebrew
  };

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

  // Get language multiplier
  const getLanguageMultiplier = (langCode: string) => {
    return LANGUAGE_MULTIPLIERS[langCode?.toLowerCase()] || 1.0;
  };

  // Handle complexity change and auto-update multiplier
  const handleComplexityChange = (fileId: string, newComplexity: string) => {
    const multiplier = COMPLEXITY_MULTIPLIERS[newComplexity] || 1.0;
    updateLocalEdit(fileId, "complexity", newComplexity);
    updateLocalEdit(fileId, "complexity_multiplier", multiplier);
  };

  // Page-level constants and functions
  const wordsPerPage = 225; // from app_settings
  const baseRate = 50; // default base rate

  // Update page word count locally
  const updatePageWordCount = (pageId: string, wordCount: number) => {
    setLocalPageEdits((prev) => ({ ...prev, [pageId]: wordCount }));
  };

  // Get word count (edited or original)
  const getPageWordCount = (page: any) => {
    return localPageEdits[page.id] ?? page.word_count;
  };

  // Calculate billable pages for a single page
  const calculatePageBillable = (
    wordCount: number,
    complexityMultiplier: number,
  ) => {
    return (wordCount / wordsPerPage) * complexityMultiplier;
  };

  // Round up to nearest increment
  const roundUpTo = (value: number, increment: number) => {
    return Math.ceil(value / increment) * increment;
  };

  // Get combined children of a file
  const getCombinedChildren = (fileId: string) => {
    return Object.entries(combinedFiles)
      .filter(([childId, parentId]) => parentId === fileId)
      .map(([childId]) => childId);
  };

  // Calculate document total (including combined files)
  const calculateDocumentTotal = (fileId: string, analysis: any) => {
    // Get this file's pages
    const thisFilePages = pageData[fileId] || [];

    // Get combined files' pages
    const combinedFileIds = getCombinedChildren(fileId);

    let allPages: Array<{ wordCount: number }> = [];

    // Add this file's pages
    thisFilePages.forEach((page) => {
      allPages.push({ wordCount: getPageWordCount(page) });
    });

    // Add combined files' pages
    combinedFileIds.forEach((combinedFileId) => {
      const combinedPages = pageData[combinedFileId] || [];
      combinedPages.forEach((page) => {
        allPages.push({ wordCount: getPageWordCount(page) });
      });
    });

    // Calculate per-page billable
    const complexityMultiplier =
      getValue(
        fileId,
        "complexity_multiplier",
        analysis.complexity_multiplier,
      ) || 1;

    let totalBillable = 0;
    allPages.forEach((page) => {
      totalBillable += calculatePageBillable(
        page.wordCount,
        complexityMultiplier,
      );
    });

    // Round to nearest 0.10
    totalBillable = roundUpTo(totalBillable, 0.1);

    // Minimum 1 page
    if (totalBillable < 1 && totalBillable > 0) {
      totalBillable = 1;
    }

    return totalBillable;
  };

  // Calculate line total based on page data
  const calculateLineTotal = (fileId: string, analysis: any) => {
    // If this file is combined with another, return 0
    if (combinedFiles[fileId]) {
      return 0;
    }

    const billablePages = calculateDocumentTotal(fileId, analysis);

    if (billablePages === 0) {
      return 0;
    }

    const languageCode = getValue(
      fileId,
      "detected_language",
      analysis.detected_language,
    );
    const languageMultiplier = getLanguageMultiplier(languageCode);

    let lineTotal = billablePages * baseRate * languageMultiplier;

    // Round up to nearest 2.50
    lineTotal = roundUpTo(lineTotal, 2.5);

    return lineTotal;
  };

  // Check if file is combined with another
  const isCombinedWith = (fileId: string) => combinedFiles[fileId];

  // Get files that can be combined with (exclude self and already-combined files)
  const getAvailableParentFiles = (currentFileId: string) => {
    return analysisResults.filter(
      (a) =>
        a.quote_file_id !== currentFileId && !combinedFiles[a.quote_file_id], // Can't combine with a file that's already combined
    );
  };

  // Combine file with another
  const combineFileWith = (
    childFileId: string,
    parentFileId: string | null,
  ) => {
    if (parentFileId === null) {
      // Uncombine
      setCombinedFiles((prev) => {
        const updated = { ...prev };
        delete updated[childFileId];
        return updated;
      });
    } else {
      // Combine
      setCombinedFiles((prev) => ({ ...prev, [childFileId]: parentFileId }));
    }
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

  // Save all corrections (page edits + combined files)
  const saveAllCorrections = async () => {
    const session = JSON.parse(sessionStorage.getItem('staffSession') || '{}');

    if (!session.staffId) {
      alert('Session expired. Please login again.');
      return;
    }

    // Build list of changes for confirmation
    const changes: string[] = [];

    // Page word count changes
    Object.entries(localPageEdits).forEach(([pageId, newWordCount]) => {
      changes.push(`Page word count → ${newWordCount}`);
    });

    // Combined files
    Object.entries(combinedFiles).forEach(([childId, parentId]) => {
      const childFile = analysisResults.find(a => a.quote_file_id === childId);
      const parentFile = analysisResults.find(a => a.quote_file_id === parentId);
      changes.push(`${childFile?.quote_file?.original_filename} combined with ${parentFile?.quote_file?.original_filename}`);
    });

    if (changes.length === 0) {
      alert('No changes to save');
      return;
    }

    const confirmed = window.confirm(
      `Save these corrections?\n\n${changes.join('\n')}\n\nThis will recalculate the quote pricing.`
    );

    if (!confirmed) return;

    setIsSaving(true);

    try {
      // 1. Save page word count edits
      for (const [pageId, newWordCount] of Object.entries(localPageEdits)) {
        const originalPage = Object.values(pageData).flat().find(p => p.id === pageId);

        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: session.staffId,
            field: 'page_word_count',
            originalValue: String(originalPage?.word_count || 0),
            correctedValue: String(newWordCount),
            pageId: pageId
          })
        });
      }

      // 2. Save combined file relationships
      for (const [childFileId, parentFileId] of Object.entries(combinedFiles)) {
        const childAnalysis = analysisResults.find(a => a.quote_file_id === childFileId);
        const parentAnalysis = analysisResults.find(a => a.quote_file_id === parentFileId);

        // Save as correction: child file combined with parent
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: session.staffId,
            field: 'combined_with',
            originalValue: null,
            correctedValue: parentFileId,
            fileId: childFileId
          })
        });

        // Update child's billable_pages to 0
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: session.staffId,
            field: 'billable_pages',
            originalValue: String(childAnalysis?.billable_pages || 1),
            correctedValue: '0',
            fileId: childFileId
          })
        });

        // Update parent's billable_pages with recalculated value
        const newBillablePages = calculateDocumentTotal(parentFileId, parentAnalysis);
        const newLineTotal = calculateLineTotal(parentFileId, parentAnalysis);

        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: session.staffId,
            field: 'billable_pages',
            originalValue: String(parentAnalysis?.billable_pages || 1),
            correctedValue: String(newBillablePages),
            fileId: parentFileId
          })
        });

        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: session.staffId,
            field: 'line_total',
            originalValue: String(parentAnalysis?.line_total || 0),
            correctedValue: String(newLineTotal),
            fileId: parentFileId
          })
        });
      }

      // Mark combined files as saved so UI merges them
      setSavedCombinedFiles(prev => ({ ...prev, ...combinedFiles }));

      // Clear local edits
      setLocalPageEdits({});
      setCombinedFiles({});

      alert('Corrections saved successfully!');

      // Refresh data from server
      fetchReviewDetail();

    } catch (error) {
      console.error('Save error:', error);
      alert('Error saving corrections: ' + error);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter out files that have been saved as combined (they'll show under parent)
  const getVisibleFiles = () => {
    return analysisResults.filter(analysis =>
      !savedCombinedFiles[analysis.quote_file_id]
    );
  };

  // Get all pages for a document (including saved combined files)
  const getAllPagesForDocument = (fileId: string) => {
    let allPages: Array<{ id: string; page_number: number; word_count: number; sourceFile: string; sourceFileName: string }> = [];

    // This file's pages
    const thisFilePages = pageData[fileId] || [];
    const thisFile = analysisResults.find(a => a.quote_file_id === fileId);

    thisFilePages.forEach((page) => {
      allPages.push({
        ...page,
        sourceFile: fileId,
        sourceFileName: thisFile?.quote_file?.original_filename || 'Unknown'
      });
    });

    // Combined files' pages (both pending and saved)
    const allCombined = { ...savedCombinedFiles, ...combinedFiles };
    const combinedFileIds = Object.entries(allCombined)
      .filter(([childId, parentId]) => parentId === fileId)
      .map(([childId]) => childId);

    combinedFileIds.forEach(combinedFileId => {
      const combinedPages = pageData[combinedFileId] || [];
      const combinedFile = analysisResults.find(a => a.quote_file_id === combinedFileId);

      combinedPages.forEach(page => {
        allPages.push({
          ...page,
          sourceFile: combinedFileId,
          sourceFileName: combinedFile?.quote_file?.original_filename || 'Unknown'
        });
      });
    });

    return allPages;
  };

  // Get all previews for a document (including combined)
  const getAllPreviewsForDocument = (fileId: string) => {
    const previews: Array<{ fileId: string; fileName: string; storagePath: string; fileSize: number }> = [];

    // This file
    const thisFile = analysisResults.find(a => a.quote_file_id === fileId);
    if (thisFile?.quote_file?.storage_path) {
      previews.push({
        fileId: fileId,
        fileName: thisFile.quote_file.original_filename,
        storagePath: thisFile.quote_file.storage_path,
        fileSize: thisFile.quote_file.file_size
      });
    }

    // Combined files
    const allCombined = { ...savedCombinedFiles, ...combinedFiles };
    const combinedFileIds = Object.entries(allCombined)
      .filter(([childId, parentId]) => parentId === fileId)
      .map(([childId]) => childId);

    combinedFileIds.forEach(combinedFileId => {
      const combinedFile = analysisResults.find(a => a.quote_file_id === combinedFileId);
      if (combinedFile?.quote_file?.storage_path) {
        previews.push({
          fileId: combinedFileId,
          fileName: combinedFile.quote_file.original_filename,
          storagePath: combinedFile.quote_file.storage_path,
          fileSize: combinedFile.quote_file.file_size
        });
      }
    });

    return previews;
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

  // Fetch page data for each file
  useEffect(() => {
    const fetchPageData = async () => {
      if (!analysisResults.length) return;

      const fileIds = analysisResults.map((a) => a.quote_file_id);

      const { data, error } = await supabase
        .from("quote_pages")
        .select("id, quote_file_id, page_number, word_count")
        .in("quote_file_id", fileIds)
        .order("page_number");

      if (data) {
        // Group by file
        const grouped: Record<string, any[]> = {};
        data.forEach((page) => {
          if (!grouped[page.quote_file_id]) {
            grouped[page.quote_file_id] = [];
          }
          grouped[page.quote_file_id].push(page);
        });
        setPageData(grouped);
      }
    };

    fetchPageData();
  }, [analysisResults]);

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
          Documents ({getVisibleFiles().length} files)
        </h3>

        {getVisibleFiles().map((analysis, index) => {
          const allPages = getAllPagesForDocument(analysis.quote_file_id);
          const allPreviews = getAllPreviewsForDocument(analysis.quote_file_id);
          const totalWordCount = allPages.reduce((sum, p) => sum + getPageWordCount(p), 0);

          return (
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
                  {totalWordCount} words • {allPages.length} page(s)
                </span>
                {/* Show combined badge if has combined files */}
                {allPreviews.length > 1 && (
                  <span className="px-2 py-1 rounded text-xs bg-purple-100 text-purple-800">
                    {allPreviews.length} files merged
                  </span>
                )}
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
                  {/* Left: Document Preview - Show ALL combined previews */}
                  <div>
                    <h4 className="font-semibold mb-3">
                      Document Preview{allPreviews.length > 1 ? 's' : ''}
                    </h4>

                    <div className="space-y-4">
                      {allPreviews.map((preview, previewIdx) => (
                        <div key={preview.fileId} className="border rounded-lg overflow-hidden">
                          {allPreviews.length > 1 && (
                            <div className="bg-gray-100 px-3 py-1 text-sm font-medium">
                              File {previewIdx + 1}: {preview.fileName}
                            </div>
                          )}
                          <div className="p-4 bg-gray-50 min-h-[200px] flex items-center justify-center">
                            <img
                              src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${preview.storagePath}`}
                              alt={preview.fileName}
                              className="max-w-full max-h-[250px] object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                          <div className="px-3 py-2 flex justify-between items-center text-sm border-t">
                            <span className="text-gray-500">
                              {(preview.fileSize / 1024 / 1024).toFixed(2)} MB
                            </span>
                            <a
                              href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${preview.storagePath}`}
                              target="_blank"
                              className="text-blue-600 hover:underline"
                            >
                              ↓ Download
                            </a>
                          </div>
                        </div>
                      ))}
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

                      {/* Detected Language */}
                      <div className="bg-white border rounded p-3">
                        <label className="text-sm text-gray-500 block mb-1">
                          Detected Language
                        </label>
                        <div className="flex items-center justify-between">
                          {editingLanguage === analysis.quote_file_id &&
                          claimedByMe ? (
                            // Edit mode
                            <div className="flex items-center gap-2 flex-1 mr-2">
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
                                className="border rounded px-3 py-2 flex-1 focus:ring-2 focus:ring-blue-500"
                                autoFocus
                              >
                                <option value="">Select language...</option>
                                <option value="en">English (1.0x)</option>
                                <option value="es">Spanish (1.0x)</option>
                                <option value="fr">French (1.1x)</option>
                                <option value="de">German (1.1x)</option>
                                <option value="zh">Chinese (1.25x)</option>
                                <option value="ja">Japanese (1.25x)</option>
                                <option value="ko">Korean (1.25x)</option>
                                <option value="ar">Arabic (1.3x)</option>
                                <option value="ru">Russian (1.15x)</option>
                                <option value="pl">Polish (1.1x)</option>
                                <option value="pt">Portuguese (1.0x)</option>
                                <option value="it">Italian (1.0x)</option>
                                <option value="nl">Dutch (1.1x)</option>
                                <option value="sv">Swedish (1.1x)</option>
                                <option value="uk">Ukrainian (1.15x)</option>
                                <option value="vi">Vietnamese (1.2x)</option>
                                <option value="th">Thai (1.25x)</option>
                                <option value="hi">Hindi (1.15x)</option>
                                <option value="tr">Turkish (1.1x)</option>
                                <option value="he">Hebrew (1.2x)</option>
                              </select>
                              <button
                                onClick={() => setEditingLanguage(null)}
                                className="text-gray-500 hover:text-gray-700 p-1"
                                title="Done"
                              >
                                <svg
                                  className="w-5 h-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            // Display mode
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {analysis.language_name ||
                                  getValue(
                                    analysis.quote_file_id,
                                    "detected_language",
                                    analysis.detected_language,
                                  ) ||
                                  "Unknown"}
                              </span>
                              <span className="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                {getLanguageMultiplier(
                                  getValue(
                                    analysis.quote_file_id,
                                    "detected_language",
                                    analysis.detected_language,
                                  ),
                                )}
                                x
                              </span>
                              {claimedByMe && (
                                <button
                                  onClick={() =>
                                    setEditingLanguage(analysis.quote_file_id)
                                  }
                                  className="text-gray-400 hover:text-blue-600 p-1"
                                  title="Edit language"
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                    />
                                  </svg>
                                </button>
                              )}
                            </div>
                          )}
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
                              value={
                                getValue(
                                  analysis.quote_file_id,
                                  "complexity",
                                  analysis.assessed_complexity,
                                ) || "standard"
                              }
                              onChange={(e) =>
                                handleComplexityChange(
                                  analysis.quote_file_id,
                                  e.target.value,
                                )
                              }
                              className="border rounded px-3 py-2 flex-1 mr-2 focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="standard">Standard (1.0x)</option>
                              <option value="complex">Complex (1.15x)</option>
                              <option value="highly_complex">
                                Highly Complex (1.5x)
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

                      {/* PAGE BREAKDOWN */}
                      <div className="bg-white border rounded p-3 mt-3">
                        <label className="text-sm text-gray-500 block mb-2">
                          Page Breakdown
                        </label>

                        {/* This file's pages */}
                        <div className="space-y-2">
                          {(pageData[analysis.quote_file_id] || []).map(
                            (page) => (
                              <div
                                key={page.id}
                                className="flex items-center justify-between bg-gray-50 p-2 rounded"
                              >
                                <span className="text-sm">
                                  Page {page.page_number}
                                </span>
                                <div className="flex items-center gap-2">
                                  {claimedByMe ? (
                                    <input
                                      type="number"
                                      value={getPageWordCount(page)}
                                      onChange={(e) =>
                                        updatePageWordCount(
                                          page.id,
                                          parseInt(e.target.value) || 0,
                                        )
                                      }
                                      className="w-20 text-right border rounded px-2 py-1 text-sm"
                                      min="0"
                                    />
                                  ) : (
                                    <span className="text-sm font-medium">
                                      {page.word_count}
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500">
                                    words
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    ={" "}
                                    {calculatePageBillable(
                                      getPageWordCount(page),
                                      getValue(
                                        analysis.quote_file_id,
                                        "complexity_multiplier",
                                        analysis.complexity_multiplier,
                                      ) || 1,
                                    ).toFixed(3)}{" "}
                                    bp
                                  </span>
                                </div>
                              </div>
                            ),
                          )}
                        </div>

                        {/* Combined files' pages */}
                        {getCombinedChildren(analysis.quote_file_id).map(
                          (childFileId) => {
                            const childAnalysis = analysisResults.find(
                              (a) => a.quote_file_id === childFileId,
                            );
                            const childPages = pageData[childFileId] || [];

                            return (
                              <div
                                key={childFileId}
                                className="mt-3 pt-3 border-t border-dashed"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm text-purple-600 font-medium">
                                    +{" "}
                                    {childAnalysis?.quote_file
                                      ?.original_filename || "Combined file"}
                                  </span>
                                  <button
                                    onClick={() =>
                                      combineFileWith(childFileId, null)
                                    }
                                    className="text-xs text-red-500 hover:text-red-700"
                                  >
                                    Remove
                                  </button>
                                </div>
                                {childPages.map((page) => (
                                  <div
                                    key={page.id}
                                    className="flex items-center justify-between bg-purple-50 p-2 rounded mb-1"
                                  >
                                    <span className="text-sm">
                                      Page {page.page_number}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      {claimedByMe ? (
                                        <input
                                          type="number"
                                          value={getPageWordCount(page)}
                                          onChange={(e) =>
                                            updatePageWordCount(
                                              page.id,
                                              parseInt(e.target.value) || 0,
                                            )
                                          }
                                          className="w-20 text-right border rounded px-2 py-1 text-sm"
                                          min="0"
                                        />
                                      ) : (
                                        <span className="text-sm font-medium">
                                          {page.word_count}
                                        </span>
                                      )}
                                      <span className="text-xs text-gray-500">
                                        words
                                      </span>
                                      <span className="text-xs text-gray-400">
                                        ={" "}
                                        {calculatePageBillable(
                                          getPageWordCount(page),
                                          getValue(
                                            analysis.quote_file_id,
                                            "complexity_multiplier",
                                            analysis.complexity_multiplier,
                                          ) || 1,
                                        ).toFixed(3)}{" "}
                                        bp
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          },
                        )}
                      </div>

                      {/* BILLABLE PAGES CALCULATION */}
                      <div className="bg-gray-100 p-3 rounded mt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Total Billable Pages</span>
                          <span className="text-lg font-bold">
                            {combinedFiles[analysis.quote_file_id]
                              ? "0 (combined)"
                              : calculateDocumentTotal(
                                  analysis.quote_file_id,
                                  analysis,
                                ).toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Sum of (words/225 ×{" "}
                          {getValue(
                            analysis.quote_file_id,
                            "complexity_multiplier",
                            analysis.complexity_multiplier,
                          ) || 1}
                          x) per page, rounded to 0.10, min 1.0
                        </p>
                      </div>

                      {/* Multipliers Display Row - Read Only */}
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div className="bg-gray-100 p-3 rounded text-center">
                          <label className="text-xs text-gray-500 block mb-1">
                            Complexity Multiplier
                          </label>
                          <div className="text-lg font-bold text-gray-700">
                            {getValue(
                              analysis.quote_file_id,
                              "complexity_multiplier",
                              analysis.complexity_multiplier,
                            ) || 1.0}
                            x
                          </div>
                        </div>
                        <div className="bg-gray-100 p-3 rounded text-center">
                          <label className="text-xs text-gray-500 block mb-1">
                            Language Multiplier
                          </label>
                          <div className="text-lg font-bold text-gray-700">
                            {getLanguageMultiplier(
                              getValue(
                                analysis.quote_file_id,
                                "detected_language",
                                analysis.detected_language,
                              ),
                            )}
                            x
                          </div>
                        </div>
                      </div>

                      {/* Line Total - Auto-calculated */}
                      <div className="bg-blue-50 p-3 rounded mt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Line Total</span>
                          <div>
                            <span className="text-sm">Line Total</span>
                            {!combinedFiles[analysis.quote_file_id] && (
                              <p className="text-xs text-gray-500">
                                {calculateDocumentTotal(
                                  analysis.quote_file_id,
                                  analysis,
                                ).toFixed(2)}{" "}
                                × ${baseRate} ×{" "}
                                {getLanguageMultiplier(
                                  getValue(
                                    analysis.quote_file_id,
                                    "detected_language",
                                    analysis.detected_language,
                                  ),
                                )}
                                x → rounded to $2.50
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-xl font-bold ${
                              combinedFiles[analysis.quote_file_id]
                                ? "text-gray-400"
                                : ""
                            }`}
                          >
                            $
                            {calculateLineTotal(
                              analysis.quote_file_id,
                              analysis,
                            ).toFixed(2)}
                          </span>
                        </div>

                        {combinedFiles[analysis.quote_file_id] && (
                          <p className="text-xs text-purple-600 mt-1">
                            Combined with{" "}
                            {
                              analysisResults.find(
                                (a) =>
                                  a.quote_file_id ===
                                  combinedFiles[analysis.quote_file_id],
                              )?.quote_file?.original_filename
                            }
                          </p>
                        )}
                      </div>

                      {/* COMBINE WITH ANOTHER DOCUMENT */}
                      {claimedByMe &&
                        !combinedFiles[analysis.quote_file_id] &&
                        analysisResults.length > 1 &&
                        getCombinedChildren(analysis.quote_file_id).length ===
                          0 && (
                          <div className="bg-purple-50 border border-purple-200 rounded p-3 mt-3">
                            <label className="text-sm font-medium text-purple-800 block mb-2">
                              Combine with another document?
                            </label>
                            <p className="text-xs text-purple-600 mb-2">
                              Use if this file is part of another document
                              (e.g., back of ID card)
                            </p>
                            <select
                              onChange={(e) => {
                                if (e.target.value)
                                  combineFileWith(
                                    analysis.quote_file_id,
                                    e.target.value,
                                  );
                              }}
                              className="border rounded px-3 py-2 text-sm w-full"
                              defaultValue=""
                            >
                              <option value="">-- Select document --</option>
                              {getAvailableParentFiles(
                                analysis.quote_file_id,
                              ).map((parent) => (
                                <option
                                  key={parent.quote_file_id}
                                  value={parent.quote_file_id}
                                >
                                  {parent.quote_file?.original_filename}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                      {/* Already combined indicator */}
                      {combinedFiles[analysis.quote_file_id] && (
                        <div className="bg-purple-50 border border-purple-200 rounded p-3 mt-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-purple-700">
                              ✓ Combined with:{" "}
                              {
                                analysisResults.find(
                                  (a) =>
                                    a.quote_file_id ===
                                    combinedFiles[analysis.quote_file_id],
                                )?.quote_file?.original_filename
                              }
                            </span>
                            {claimedByMe && (
                              <button
                                onClick={() =>
                                  combineFileWith(analysis.quote_file_id, null)
                                }
                                className="text-sm text-purple-600 hover:text-purple-800 underline"
                              >
                                Undo
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Save/Cancel buttons - show if there are changes */}
                      {claimedByMe &&
                        (Object.keys(localPageEdits).length > 0 ||
                          Object.keys(localEdits).length > 0 ||
                          Object.keys(combinedFiles).length > 0) && (
                          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                            <button
                              onClick={() => {
                                setLocalPageEdits({});
                                setLocalEdits({});
                                setCombinedFiles({});
                              }}
                              className="px-4 py-2 text-gray-600 border rounded hover:bg-gray-50"
                            >
                              Reset All
                            </button>
                            <button
                              onClick={() =>
                                alert(
                                  "Save functionality coming soon. Check console for debug info.",
                                )
                              }
                              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              Save All Corrections
                            </button>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })}
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
