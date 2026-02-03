// HITLReviewDetail.tsx - Complete implementation with certification management

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  XCircle,
  Mail,
  AlertTriangle,
  Send,
  CreditCard,
  Upload,
  FileText,
  CheckCircle,
  Loader2,
  Brain,
  X,
  ArrowLeft,
  DollarSign,
  Clock,
  User,
  UserCheck,
  Check,
  Camera,
  Save,
  RefreshCw,
  Zap,
  Layers,
  Scissors,
  Plus,
  AlertCircle,
  Lock,
} from "lucide-react";
import { CorrectionReasonModal } from "@/components/CorrectionReasonModal";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import MessagePanel from "../../components/messaging/MessagePanel";
import {
  HITLPanelLayout,
  PricingSummaryBox,
  TranslationDetailsCard,
  DocumentCardV2,
  DocumentGroupCard,
  CreateGroupModal,
  EditGroupModal,
  AssignItemsModal,
  FileAccordion,
  DocumentGroupsView,
} from "../../components/admin/hitl";
import type { DocumentGroup, AssignedItem } from "../../components/admin/hitl/DocumentGroupCard";
import type { UnassignedItem } from "../../components/admin/hitl/AssignItemsModal";
import DocumentPreviewModal from "../../components/admin/DocumentPreviewModal";
import { UnifiedDocumentEditor } from "@/components/shared/document-editor";
import { DocumentFlowEditor } from "@/components/shared/document-flow";

// ============================================
// ROLE HIERARCHY FOR CLAIM OVERRIDE
// ============================================

// Role hierarchy (higher number = higher authority)
const ROLE_HIERARCHY: Record<string, number> = {
  reviewer: 1,
  senior_reviewer: 2,
  admin: 3,
  super_admin: 4,
};

/**
 * Check if currentRole can override claimedByRole
 * @param currentRole - The role of the current staff user
 * @param claimedByRole - The role of the staff who claimed the review
 * @returns true if current user can take over the review
 */
const canOverrideClaim = (
  currentRole: string | undefined,
  claimedByRole: string | undefined
): boolean => {
  if (!currentRole || !claimedByRole) return false;
  const currentLevel = ROLE_HIERARCHY[currentRole.toLowerCase()] || 0;
  const claimedLevel = ROLE_HIERARCHY[claimedByRole.toLowerCase()] || 0;
  return currentLevel > claimedLevel;
};

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
  // SUPABASE HELPER (Raw fetch with auth)
  // ============================================
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Helper to get the access token from Supabase session
  const getAccessToken = async (): Promise<string> => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      console.error("Failed to get session for auth token:", error);
      throw new Error("Not authenticated. Please log in again.");
    }
    return session.access_token;
  };

  const fetchFromSupabase = async (endpoint: string) => {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    console.log(`🌐 Fetching: ${url}`);

    const accessToken = await getAccessToken();
    console.log(`🔑 Using access token: ${accessToken?.substring(0, 20)}...`);

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
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
    Array<{ id: string; code: string; name: string; multiplier: number }>
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
  const [assignedStaffRole, setAssignedStaffRole] = useState<string | null>(
    null,
  );
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [isClaimingReview, setIsClaimingReview] = useState(false);

  // Action buttons
  const [internalNotes, setInternalNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Reject Quote (permanent rejection) state
  const [showRejectQuoteModal, setShowRejectQuoteModal] = useState(false);
  const [rejectQuoteReason, setRejectQuoteReason] = useState("");
  const [sendEmailToCustomer, setSendEmailToCustomer] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  // Update & Send Payment Link state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateReason, setUpdateReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Manual Payment state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [selectedPaymentMethodCode, setSelectedPaymentMethodCode] = useState<string>("");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<
    Array<{ id: string; name: string; code: string }>
  >([]);

  // File upload state
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{
      id: string;
      name: string;
      size: number;
      file: File;
      uploadStatus: "pending" | "uploading" | "success" | "failed";
      uploadedFileId?: string;
    }>
  >([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [processWithAI, setProcessWithAI] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Billing, Shipping, and Rush Options state
  const [showAddressSection, setShowAddressSection] = useState(false);
  const [billingAddress, setBillingAddress] = useState<any>(null);
  const [shippingAddress, setShippingAddress] = useState<any>(null);
  const [turnaroundType, setTurnaroundType] = useState<
    "standard" | "rush" | "same_day"
  >("standard");
  const [rushFee, setRushFee] = useState(0);
  const [rushMultiplierValue, setRushMultiplierValue] = useState(1.3);
  const [sameDayMultiplierValue, setSameDayMultiplierValue] = useState(2.0);
  const [turnaroundOptions, setTurnaroundOptions] = useState<
    Array<{
      id: string;
      code: string;
      name: string;
      description: string;
      multiplier: number;
      is_rush: boolean;
    }>
  >([]);

  // Page splitting/combining
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [splitMode, setSplitMode] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [splitDocumentName, setSplitDocumentName] = useState("");
  const [targetDocumentId, setTargetDocumentId] = useState("");

  // Document-level selection for combine/split
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  // Document preview modal
  const [previewDocument, setPreviewDocument] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);

  // ============================================
  // DOCUMENT GROUPING STATE
  // ============================================
  const [documentGroups, setDocumentGroups] = useState<DocumentGroup[]>([]);
  const [unassignedItems, setUnassignedItems] = useState<UnassignedItem[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Document Grouping Modal states
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedGroupForAssign, setSelectedGroupForAssign] = useState<string | null>(null);
  const [selectedGroupForEdit, setSelectedGroupForEdit] = useState<DocumentGroup | null>(null);
  const [analyzingGroupId, setAnalyzingGroupId] = useState<string | null>(null);
  const [pendingAssignItem, setPendingAssignItem] = useState<UnassignedItem | null>(null);

  // Toggle for new unified document editor
  const [useUnifiedEditor, setUseUnifiedEditor] = useState(false);

  // ============================================
  // FILE ACCORDION FLOW STATE
  // ============================================
  interface FileAccordionData {
    analysisResult?: AnalysisResult;
    pages?: PageData[];
    isAnalyzing: boolean;
    isSubmitted: boolean;
  }

  interface DocumentGroupForView {
    id: string;
    name: string;
    documentType: string;
    holderName?: string;
    countryOfIssue?: string;
    sourceFile: string;
    pages: Array<{
      id: string;
      pageNumber: number;
      wordCount: number;
      complexity: string;
      complexityMultiplier: number;
      billablePages: number;
    }>;
    certificationTypeId: string;
    certificationName: string;
    certificationPrice: number;
  }

  interface PageGrouping {
    pageId: string;
    groupId: string;
  }

  const [fileAccordionData, setFileAccordionData] = useState<
    Record<string, FileAccordionData>
  >({});
  const [documentGroupsForView, setDocumentGroupsForView] = useState<
    DocumentGroupForView[]
  >([]);
  const [showDocumentGroupsView, setShowDocumentGroupsView] = useState(false);
  const [toTranslateCategoryId, setToTranslateCategoryId] = useState<string | null>(null);

  // ============================================
  // DATA FETCHING
  // ============================================

  useEffect(() => {
    if (authLoading) return;
    if (!staffSession?.staffId) {
      navigate("/admin/login");
      return;
    }
    // Guard against React 18 Strict Mode double-fetch and re-renders
    if (hasFetchedRef.current) {
      console.log("🔄 [HITLReviewDetail] Initial fetch already done, skipping...");
      return;
    }
    hasFetchedRef.current = true;
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffSession?.staffId, authLoading, reviewId]);

  // Load document groups when quote data is available
  useEffect(() => {
    if (reviewData?.quote_id) {
      refreshDocumentGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewData?.quote_id]);

  // ============================================
  // FETCH GUARD REFS (prevent infinite loops)
  // ============================================
  const hasFetchedRef = useRef<boolean>(false);
  const isRefreshingRef = useRef<boolean>(false);

  // ============================================
  // POLLING FOR PROCESSING DOCUMENTS
  // ============================================
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef<number>(0);
  const MAX_POLL_COUNT = 9; // 9 polls × 10 seconds = 90 seconds max

  useEffect(() => {
    // Check if any files are currently processing (from database status)
    const hasProcessingFiles = quoteFiles.some(
      (f) => f.ai_processing_status === 'processing'
    );

    // Clean up existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (!hasProcessingFiles) {
      // Reset poll count when no files are processing
      pollCountRef.current = 0;
      return;
    }

    console.log("🔄 [HITL Polling] Starting - documents are processing");

    pollIntervalRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      console.log(`🔄 [HITL Polling] Poll #${pollCountRef.current}/${MAX_POLL_COUNT}...`);

      // Timeout after max attempts - mark stuck files as failed
      if (pollCountRef.current >= MAX_POLL_COUNT) {
        console.log("⏱️ [HITL Polling] Timeout - marking stuck files as failed");

        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        // Mark stuck processing files as failed
        for (const file of quoteFiles) {
          if (file.ai_processing_status === 'processing') {
            try {
              const accessToken = await getAccessToken();
              await fetch(
                `${SUPABASE_URL}/rest/v1/quote_files?id=eq.${file.id}`,
                {
                  method: "PATCH",
                  headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    Prefer: "return=minimal",
                  },
                  body: JSON.stringify({
                    ai_processing_status: "failed",
                    error_message: "Processing timed out after 90 seconds",
                  }),
                }
              );
            } catch (error) {
              console.error("Error marking file as failed:", error);
            }
          }
        }

        // Refresh to show failed status
        await fetchReviewData();
        return;
      }

      // Refresh data from database
      await fetchReviewData();

      // Check if still processing after refresh (using latest data)
      // The next useEffect run will handle cleanup if no longer processing
    }, 10000); // 10 seconds

    return () => {
      if (pollIntervalRef.current) {
        console.log("🔄 [HITL Polling] Cleanup");
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [quoteFiles.map(f => f.ai_processing_status).join(',')]); // Re-run when any file status changes

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchReviewData(),
        fetchCertificationTypes(),
        fetchLanguages(),
        fetchSettings(),
        fetchPaymentMethods(),
        fetchTurnaroundOptions(),
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
    setLoading(false);
  };

  const fetchPaymentMethods = async () => {
    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id, name, code")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (err) {
      console.error("Error fetching payment methods:", err);
    }
  };

  const fetchTurnaroundOptions = async () => {
    try {
      const { data, error } = await supabase
        .from("delivery_options")
        .select("id, code, name, description, multiplier, is_rush")
        .eq("category", "turnaround")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;
      setTurnaroundOptions(data || []);

      // Fetch rush/same-day multipliers from settings
      const { data: settings } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["rush_multiplier", "same_day_multiplier"]);

      settings?.forEach((setting) => {
        if (setting.setting_key === "rush_multiplier") {
          setRushMultiplierValue(parseFloat(setting.setting_value) || 1.3);
        } else if (setting.setting_key === "same_day_multiplier") {
          setSameDayMultiplierValue(parseFloat(setting.setting_value) || 2.0);
        }
      });
    } catch (err) {
      console.error("Error fetching turnaround options:", err);
    }
  };

  const fetchReviewData = useCallback(async () => {
    // Guard against concurrent fetches to prevent infinite loops
    if (isRefreshingRef.current) {
      console.log("🔄 [HITLReviewDetail] Fetch already in progress, skipping...");
      return;
    }
    isRefreshingRef.current = true;

    console.log("🔄 [HITLReviewDetail] Refreshing files AND analysis data...");
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
      let assignedStaffInfo: { full_name: string; role: string } | null = null;

      // Always try to fetch from base table to get the staff details
      try {
        const baseReviews = await fetchFromSupabase(
          `hitl_reviews?id=eq.${viewReview.review_id}&select=assigned_to,status,assigned_staff:staff_users!hitl_reviews_assigned_to_fkey(full_name,role)`,
        );
        if (baseReviews && baseReviews[0]) {
          assignedTo = baseReviews[0].assigned_to || assignedTo;
          reviewStatus = baseReviews[0].status || reviewStatus;
          if (baseReviews[0].assigned_staff) {
            assignedStaffInfo = baseReviews[0].assigned_staff;
          }
          console.log(
            "✅ Fetched from base table - assigned_to:",
            assignedTo,
            "status:",
            reviewStatus,
            "staff_info:",
            assignedStaffInfo,
          );
        }
      } catch (error) {
        console.warn("⚠️ Could not fetch from base table (RLS):", error);
      }

      console.log("📍 Final assigned_to:", assignedTo);
      console.log("📍 Final status:", reviewStatus);
      console.log("📍 Final assigned_staff_info:", assignedStaffInfo);

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

      // Load billing/shipping addresses and turnaround options from quote
      if (quote.billing_address) {
        setBillingAddress(quote.billing_address);
      }
      if (quote.shipping_address) {
        setShippingAddress(quote.shipping_address);
      }
      if (quote.turnaround_type) {
        setTurnaroundType(
          quote.turnaround_type as "standard" | "rush" | "same_day",
        );
      }
      if (quote.rush_fee) {
        setRushFee(parseFloat(quote.rush_fee) || 0);
      }

      // Check if claimed by current user
      const currentStaffId = staffSession?.staffId;
      const isClaimed = assignedTo === currentStaffId;
      const isClaimedByOther = !!assignedTo && assignedTo !== currentStaffId;

      // Only update claim status if we have definitive information
      // If assigned_to is null, it might mean the view/RLS blocked access
      if (assignedTo !== null) {
        setClaimedByMe(isClaimed);
        setClaimedByOther(isClaimedByOther);
        // Set staff name and role if claimed by another staff
        if (isClaimedByOther && assignedStaffInfo) {
          setAssignedStaffName(assignedStaffInfo.full_name);
          setAssignedStaffRole(assignedStaffInfo.role);
        } else {
          setAssignedStaffName(null);
          setAssignedStaffRole(null);
        }
        console.log(
          `🔐 Claim status updated - Claimed by me: ${isClaimed}, by other: ${isClaimedByOther} (assigned_to: ${assignedTo}, staffId: ${currentStaffId}, staff_name: ${assignedStaffInfo?.full_name}, staff_role: ${assignedStaffInfo?.role})`,
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
        console.log("🔍 [HITLReviewDetail] Fetching quote files for quote:", quote.id);

        // Fetch BOTH datasets in parallel for better performance
        const [filesResult, analysisResult] = await Promise.all([
          fetchFromSupabase(
            `quote_files?quote_id=eq.${quote.id}&order=created_at.desc`,
          ),
          fetchFromSupabase(
            `ai_analysis_results?quote_id=eq.${quote.id}&select=*,quote_file:quote_files(*),ocr_provider,ocr_confidence,llm_model,processing_time_ms,language_confidence,document_type_confidence,complexity_confidence`,
          ),
        ]);

        // Process files result
        console.log("✅ [HITLReviewDetail] Files fetched:", filesResult?.length || 0);
        setQuoteFiles(filesResult || []);

        // Process analysis result with detailed logging
        console.log("✅ [HITLReviewDetail] Analysis results fetched:", analysisResult?.length || 0);
        console.log("✅ [HITLReviewDetail] Analysis data:", analysisResult?.map((a: any) => ({
          file: a.quote_file?.original_filename,
          word_count: a.word_count,
          page_count: a.page_count,
          billable_pages: a.billable_pages,
          line_total: a.line_total
        })));

        setAnalysisResults(analysisResult || []);

        // Alias for backward compatibility with code below
        const files = filesResult;
        const analysis = analysisResult;

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
      console.log("🔄 [HITLReviewDetail] Refresh complete!");
    } catch (error) {
      console.error("❌ [HITLReviewDetail] Unexpected error in fetchReviewData:", error);
    } finally {
      // Always reset the refresh guard
      isRefreshingRef.current = false;
    }
  }, [reviewId, staffSession?.staffId, SUPABASE_URL, SUPABASE_ANON_KEY]);

  // Memoized callbacks for child components (prevent infinite loops)
  const handleDetailsChange = useCallback(() => {
    console.log("🔄 [HITLReviewDetail] Details changed, refreshing...");
    fetchReviewData();
  }, [fetchReviewData]);

  const handlePricingUpdate = useCallback(() => {
    console.log("🔄 [HITLReviewDetail] Pricing update, refreshing...");
    fetchReviewData();
  }, [fetchReviewData]);

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
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/claim-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
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

  const handleClaimOverride = async () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");

    if (!session.staffId) {
      alert("Session expired. Please login again.");
      navigate("/admin/login");
      return;
    }

    // Close confirmation modal
    setShowOverrideConfirm(false);
    setIsClaimingReview(true);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/claim-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: session.staffId,
            isOverride: true,
          }),
        },
      );

      const result = await response.json();

      if (result.success) {
        toast.success(result.message || "Review claimed successfully");

        // Set claim status BEFORE refetching data
        setClaimedByMe(true);
        setClaimedByOther(false);
        setAssignedStaffName(null);
        setAssignedStaffRole(null);

        // Update reviewData to reflect claimed status and in_review state
        if (reviewData) {
          setReviewData({
            ...reviewData,
            assigned_to: session.staffId,
            status: "in_review",
          });
        }

        // Refresh data
        await fetchAllData();

        // Re-assert the claim status after fetch
        setClaimedByMe(true);
        setClaimedByOther(false);
      } else {
        throw new Error(result.error || "Failed to take over review");
      }
    } catch (error) {
      console.error("Claim override error:", error);
      toast.error("Failed to take over review: " + (error as Error).message);
    } finally {
      setIsClaimingReview(false);
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
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/approve-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
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
      const accessToken = await getAccessToken();

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/reject-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
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

      // Update HITL review status to escalated
      const accessToken = await getAccessToken();
      await fetch(`${SUPABASE_URL}/rest/v1/hitl_reviews?id=eq.${reviewId}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "escalated",
          resolution_notes: escalateReason.trim(),
          updated_at: new Date().toISOString(),
        }),
      });

      // Update quote status to escalated
      if (reviewData?.quote_id) {
        await supabase
          .from("quotes")
          .update({ status: "escalated" })
          .eq("id", reviewData.quote_id);
      }

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

    try {
      // Call Edge Function to reject quote permanently
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/reject-quote-permanent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: staffSession.staffId,
            reason: rejectQuoteReason.trim(),
            sendEmail: sendEmailToCustomer,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to reject quote");
      }

      alert("❌ Quote rejected successfully.");
      navigate("/admin/hitl");
    } catch (error) {
      console.error("Failed to reject quote:", error);
      alert("Failed to reject quote: " + (error as Error).message);
    } finally {
      setIsRejecting(false);
      setShowRejectQuoteModal(false);
    }
  };

  // Remove analysis for a file (allows re-analysis)
  const handleRemoveAnalysis = async (
    analysisId: string,
    fileId: string,
    fileName: string,
  ) => {
    // Confirmation dialog
    const confirmed = window.confirm(
      `Remove analysis for "${fileName}"?\n\nThe file will remain in the upload list and can be re-analyzed.`
    );

    if (!confirmed) return;

    try {
      const accessToken = await getAccessToken();

      // 1. Delete from ai_analysis_results
      const deleteResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_analysis_results?id=eq.${analysisId}`,
        {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!deleteResponse.ok) {
        throw new Error("Failed to delete analysis results");
      }

      // 2. Reset quote_files status to 'skipped' (not 'pending' to avoid auto-processing)
      const updateResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/quote_files?id=eq.${fileId}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            ai_processing_status: "skipped",
          }),
        }
      );

      if (!updateResponse.ok) {
        throw new Error("Failed to reset file status");
      }

      alert(`Analysis removed for "${fileName}". The file can now be re-analyzed.`);

      // 3. Refresh data
      await fetchReviewData();
    } catch (error) {
      console.error("Error removing analysis:", error);
      alert("Failed to remove analysis: " + (error as Error).message);
    }
  };

  // ============================================
  // NEW WORKFLOW HANDLERS
  // ============================================

  // Save - saves all form changes without status change
  const handleSave = async () => {
    if (!staffSession?.staffId || !reviewData?.quote_id) {
      toast.error("Missing required data. Please refresh the page.");
      return;
    }

    setIsSaving(true);

    try {
      // Save any local edits (document-level and page-level corrections)
      const hasFileEdits = Object.keys(localEdits).length > 0;
      const hasPageEdits = Object.keys(localPageEdits).length > 0;

      if (hasFileEdits || hasPageEdits) {
        const accessToken = await getAccessToken();

        // Save file-level edits
        for (const [fileId, edits] of Object.entries(localEdits)) {
          const analysis = analysisResults.find(
            (a) => a.quote_file_id === fileId,
          );

          for (const [field, value] of Object.entries(edits)) {
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
                  Authorization: `Bearer ${accessToken}`,
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
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                reviewId,
                staffId: staffSession.staffId,
                field: "page_word_count",
                originalValue: String(editData.originalWordCount),
                correctedValue: String(editData.wordCount),
                fileId: editData.fileId,
                pageId,
              }),
            },
          );
        }

        setLocalEdits({});
        setLocalPageEdits({});
      }

      // Recalculate quote totals
      await supabase.rpc("recalculate_quote_totals", {
        p_quote_id: reviewData.quote_id,
      });

      toast.success("Quote saved successfully");
      await fetchReviewData();
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save quote");
    } finally {
      setIsSaving(false);
    }
  };

  // Approve Quote - saves changes, sets quote status to 'approved'
  const handleApprove = async () => {
    if (!staffSession?.staffId || !reviewData?.quote_id) {
      toast.error("Missing required data. Please refresh the page.");
      return;
    }

    setIsSending(true);

    try {
      // 1. Save all changes first
      await handleSave();

      // 2. Update quote status to 'approved'
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({ status: "approved" })
        .eq("id", reviewData.quote_id);

      if (quoteError) throw quoteError;

      // 3. Update HITL review status to 'approved'
      const accessToken = await getAccessToken();
      await fetch(`${SUPABASE_URL}/rest/v1/hitl_reviews?id=eq.${reviewId}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "approved",
          completed_at: new Date().toISOString(),
          completed_by: staffSession.staffId,
          updated_at: new Date().toISOString(),
        }),
      });

      toast.success("Quote approved");
      await fetchAllData();
    } catch (error) {
      console.error("Approve error:", error);
      toast.error("Failed to approve quote");
    } finally {
      setIsSending(false);
    }
  };

  // Send to Customer - creates Stripe payment link, sends email, updates status to awaiting_payment
  const handleSendToCustomer = async () => {
    const customerEmail =
      reviewData?.customer_email ||
      reviewData?.quotes?.customer?.email;

    if (!customerEmail) {
      toast.error("Customer email is required");
      return;
    }

    if (!staffSession?.staffId || !reviewData?.quote_id) {
      toast.error("Missing required data. Please refresh the page.");
      return;
    }

    setIsSending(true);

    try {
      // 1. Save all changes first
      await handleSave();

      // 2. Call Edge Function to create payment link and send email
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/update-quote-and-notify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            quote_id: reviewData.quote_id,
            amount: total,
            customer_email: customerEmail,
            customer_name: customerName,
            quote_number: quoteNumber,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.url) {
        throw new Error(result.error || "Failed to create payment link");
      }

      // 3. Update quote status to awaiting_payment and store payment link
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          status: "awaiting_payment",
          payment_link: result.url,
          quote_sent_at: new Date().toISOString(),
        })
        .eq("id", reviewData.quote_id);

      if (quoteError) throw quoteError;

      toast.success("Quote sent to customer!");

      // 4. Refresh data
      await fetchAllData();
    } catch (error) {
      console.error("Send to customer error:", error);
      toast.error("Failed to send quote to customer");
    } finally {
      setIsSending(false);
    }
  };

  // Resend Quote - resends payment email to customer (for awaiting_payment status)
  const handleResendQuote = async () => {
    const customerEmail =
      reviewData?.customer_email ||
      reviewData?.quotes?.customer?.email;

    if (!customerEmail) {
      toast.error("Customer email is required");
      return;
    }

    if (!staffSession?.staffId || !reviewData?.quote_id) {
      toast.error("Missing required data. Please refresh the page.");
      return;
    }

    setIsSending(true);

    try {
      // Call Edge Function to create/refresh payment link and resend email
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/update-quote-and-notify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            quote_id: reviewData.quote_id,
            amount: total,
            customer_email: customerEmail,
            customer_name: customerName,
            quote_number: quoteNumber,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.url) {
        throw new Error(result.error || "Failed to resend quote");
      }

      // Update payment link if it changed
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          payment_link: result.url,
          quote_sent_at: new Date().toISOString(),
        })
        .eq("id", reviewData.quote_id);

      if (quoteError) throw quoteError;

      toast.success("Quote resent to customer!");
      await fetchAllData();
    } catch (error) {
      console.error("Resend quote error:", error);
      toast.error("Failed to resend quote");
    } finally {
      setIsSending(false);
    }
  };

  // Send Quote Link - sends email with quote review page link
  const handleSendQuoteLink = async () => {
    const customerEmail =
      reviewData?.customer_email ||
      reviewData?.quotes?.customer?.email;

    if (!customerEmail) {
      toast.error("Customer email is required");
      return;
    }

    if (!reviewData?.quote_id) {
      toast.error("Missing quote data. Please refresh the page.");
      return;
    }

    setIsSending(true);

    try {
      // 1. Save all changes first
      await handleSave();

      // 2. Call Edge Function to send quote link email
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/send-quote-link-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            quoteId: reviewData.quote_id,
            staffId: staffSession?.staffId,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to send quote link");
      }

      // 3. Update quote status to awaiting_payment
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          status: "awaiting_payment",
          quote_sent_at: new Date().toISOString(),
        })
        .eq("id", reviewData.quote_id);

      if (quoteError) throw quoteError;

      toast.success("Quote link sent to customer!");

      // 4. Refresh data
      await fetchAllData();
    } catch (error) {
      console.error("Send quote link error:", error);
      toast.error("Failed to send quote link");
    } finally {
      setIsSending(false);
    }
  };

  // Send Payment Link - creates Stripe checkout and sends direct payment link
  const handleSendPaymentLink = async () => {
    const customerEmail =
      reviewData?.customer_email ||
      reviewData?.quotes?.customer?.email;
    const customerName =
      reviewData?.customer_name ||
      reviewData?.quotes?.customer?.full_name ||
      "";
    const quoteNumber =
      reviewData?.quote_number ||
      reviewData?.quotes?.quote_number ||
      "";
    const total = reviewData?.total || reviewData?.quotes?.total || 0;

    if (!customerEmail) {
      toast.error("Customer email is required");
      return;
    }

    if (!total) {
      toast.error("Quote total not found");
      return;
    }

    if (!staffSession?.staffId || !reviewData?.quote_id) {
      toast.error("Missing required data. Please refresh the page.");
      return;
    }

    setIsSending(true);

    try {
      // 1. Save all changes first
      await handleSave();

      // 2. Create Stripe payment link
      const accessToken = await getAccessToken();
      const paymentResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/create-payment-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            quote_id: reviewData.quote_id,
            amount: total,
            customer_email: customerEmail,
            customer_name: customerName,
            quote_number: quoteNumber,
          }),
        },
      );

      const paymentResult = await paymentResponse.json();

      if (!paymentResponse.ok || !paymentResult.url) {
        throw new Error(paymentResult.error || "Failed to create payment link");
      }

      // 3. Send payment email with Stripe URL
      const emailResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/send-payment-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            quoteId: reviewData.quote_id,
            customerEmail: customerEmail,
            customerName: customerName,
            quoteNumber: quoteNumber,
            total: total,
            paymentUrl: paymentResult.url,
            staffId: staffSession?.staffId,
          }),
        },
      );

      const emailResult = await emailResponse.json();

      if (!emailResponse.ok || !emailResult.success) {
        console.warn("Email send warning:", emailResult);
        // Continue anyway - payment link was created
      }

      // 4. Update quote status and store payment link
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          status: "awaiting_payment",
          payment_link: paymentResult.url,
          payment_link_sent_at: new Date().toISOString(),
        })
        .eq("id", reviewData.quote_id);

      if (quoteError) throw quoteError;

      toast.success("Payment link sent to customer!");

      // 5. Refresh data
      await fetchAllData();
    } catch (error) {
      console.error("Send payment link error:", error);
      toast.error("Failed to send payment link");
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateAndNotify = async () => {
    if (!updateReason.trim()) {
      alert("Please provide a reason for the update.");
      return;
    }

    if (!staffSession?.staffId || !reviewData?.quote_id) {
      alert("Missing required data. Please refresh the page.");
      return;
    }

    setIsUpdating(true);

    try {
      // Collect document pricing changes if any local edits exist
      const documents = [];
      for (const analysisId in localEdits) {
        const edits = localEdits[analysisId];
        if (Object.keys(edits).length > 0) {
          documents.push({
            analysisId,
            billablePages: edits.billable_pages,
            translationCost: edits.line_total,
            certificationCost: edits.certification_price,
          });
        }
      }

      // Call Edge Function to update quote and notify customer
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/update-quote-and-notify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            quoteId: reviewData.quote_id,
            staffId: staffSession.staffId,
            updateReason: updateReason.trim(),
            changes: {
              documents: documents.length > 0 ? documents : undefined,
            },
            sendToCustomer: true,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to update quote");
      }

      // Show success message with version and pricing info
      const priceDelta = result.newTotal - result.oldTotal;
      const deltaText =
        priceDelta > 0
          ? `+$${priceDelta.toFixed(2)}`
          : priceDelta < 0
            ? `-$${Math.abs(priceDelta).toFixed(2)}`
            : "No change";

      alert(
        `✅ Quote updated successfully!\n\n` +
          `Version: ${result.newVersion}\n` +
          `Old Total: $${result.oldTotal.toFixed(2)}\n` +
          `New Total: $${result.newTotal.toFixed(2)}\n` +
          `Change: ${deltaText}\n\n` +
          `Customer notified: ${result.emailSent ? "Yes" : "No"}\n` +
          `Magic Link: ${result.magicLink}`,
      );

      setShowUpdateModal(false);
      setUpdateReason("");

      // Optionally refresh data or navigate
      await fetchAllData();
    } catch (error) {
      console.error("Failed to update quote:", error);
      alert("Failed to update quote: " + (error as Error).message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle payment method selection change
  const handlePaymentMethodChange = (methodId: string) => {
    setSelectedPaymentMethod(methodId);

    // Find and store the payment method code
    const method = paymentMethods.find((pm) => pm.id === methodId);
    setSelectedPaymentMethodCode(method?.code || '');

    // Auto-default to $0 for Account Payment
    if (method?.code === 'account') {
      setAmountPaid('0');
    }
  };

  const handleManualPayment = async () => {
    // Validation
    if (!selectedPaymentMethod) {
      toast.error("Please select a payment method");
      return;
    }

    const quote = reviewData?.quotes || reviewData;
    const parsedAmountPaid = parseFloat(amountPaid) || 0;
    const totalAmount = quote?.total || 0;

    if (parsedAmountPaid < 0) {
      toast.error("Amount paid cannot be negative");
      return;
    }

    if (parsedAmountPaid > totalAmount) {
      toast.error("Amount paid cannot exceed total amount");
      return;
    }

    if (!staffSession?.staffId || !reviewData?.quote_id) {
      toast.error("Missing required data. Please refresh the page.");
      return;
    }

    const calculatedBalanceDue = Math.max(0, totalAmount - parsedAmountPaid);
    const isAccountPayment = selectedPaymentMethodCode === 'account';

    // Confirmation dialog
    const confirmMessage = isAccountPayment
      ? `Create order with Account Payment (Net 30)?\n\n` +
        `Total: $${totalAmount.toFixed(2)}\n` +
        `Paid Now: $${parsedAmountPaid.toFixed(2)}\n` +
        `Balance Due: $${calculatedBalanceDue.toFixed(2)}\n\n` +
        `An Accounts Receivable record will be created.\n` +
        `Payment due in 30 days.`
      : calculatedBalanceDue > 0
      ? `Create order with partial payment?\n\n` +
        `Total: $${totalAmount.toFixed(2)}\n` +
        `Paid: $${parsedAmountPaid.toFixed(2)}\n` +
        `Balance: $${calculatedBalanceDue.toFixed(2)}`
      : `Create order - Paid in Full?\n\n` +
        `Total: $${totalAmount.toFixed(2)}`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsProcessingPayment(true);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      // Prepare payload for edge function
      const payload = {
        quote_id: reviewData.quote_id,
        payment_method_id: selectedPaymentMethod,
        payment_method_code: selectedPaymentMethodCode,
        amount_paid: parsedAmountPaid,
        total_amount: totalAmount,
        remarks: paymentRemarks || undefined,
        staff_id: staffSession.staffId,
        quote_data: {
          customer_id: quote.customer_id,
          subtotal: quote.subtotal || 0,
          certification_total: quote.certification_total || 0,
          rush_fee: quote.rush_fee || 0,
          delivery_fee: quote.delivery_fee || 0,
          tax_rate: quote.tax_rate || 0.05,
          tax_amount: quote.tax_amount || 0,
          is_rush: quote.is_rush || false,
          service_province: quote.service_province,
        },
      };

      // Call edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-manual-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to process payment');
      }

      // Success! Show appropriate toast
      if (result.is_account_payment && result.balance_due > 0) {
        toast.success(
          `Order ${result.order_number} created with Account Payment. ` +
          `AR record created - $${result.balance_due.toFixed(2)} due in 30 days.`
        );
      } else if (result.balance_due > 0) {
        toast.success(
          `Order ${result.order_number} created with $${result.balance_due.toFixed(2)} balance due.`
        );
      } else {
        toast.success(`Order ${result.order_number} created - Paid in Full!`);
      }

      // Close modal and reset state
      setShowPaymentModal(false);
      setSelectedPaymentMethod("");
      setSelectedPaymentMethodCode("");
      setPaymentRemarks("");
      setAmountPaid("");

      // Navigate back to HITL list
      navigate("/admin/hitl");

    } catch (error: any) {
      console.error("Manual payment error:", error);
      toast.error(error.message || "Failed to process payment");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // ============================================
  // FILE UPLOAD FUNCTIONS
  // ============================================

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const addFiles = async (newFiles: File[]) => {
    console.log("📁 [FILE UPLOAD] Adding", newFiles.length, "files");

    const fileData = newFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      file,
      uploadStatus: "pending" as const,
    }));

    const updatedFiles = [...uploadedFiles, ...fileData];
    setUploadedFiles(updatedFiles);

    // Upload immediately if we have a quote ID
    if (reviewData?.quote_id) {
      for (const fileItem of fileData) {
        await uploadFile(fileItem);
      }
    }
  };

  const uploadFile = async (fileItem: (typeof uploadedFiles)[0]) => {
    if (!reviewData?.quote_id || !staffSession?.staffId) return;

    console.log(`📤 [FILE UPLOAD] Uploading ${fileItem.name}`);

    // Update status to uploading
    setUploadedFiles((prev) =>
      prev.map((f) =>
        f.id === fileItem.id ? { ...f, uploadStatus: "uploading" } : f,
      ),
    );
    setIsUploadingFiles(true);

    try {
      const accessToken = await getAccessToken();
      const formData = new FormData();
      formData.append("file", fileItem.file);
      formData.append("quoteId", reviewData.quote_id);
      formData.append("staffId", staffSession.staffId);
      formData.append("processWithAI", processWithAI ? "true" : "false");

      const uploadResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-staff-quote-file`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`❌ [FILE UPLOAD] Upload failed:`, errorText);
        throw new Error("Upload failed");
      }

      const result = await uploadResponse.json();
      console.log(`✅ [FILE UPLOAD] Upload successful:`, result);

      // Update with uploaded file ID
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? {
                ...f,
                uploadStatus: "success",
                uploadedFileId: result.fileId,
              }
            : f,
        ),
      );
    } catch (error) {
      console.error(`❌ [FILE UPLOAD] Failed to upload:`, error);
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id ? { ...f, uploadStatus: "failed" } : f,
        ),
      );
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const analyzeUploadedFiles = async () => {
    if (!processWithAI || !reviewData?.quote_id) return;

    console.log("🧠 [AI ANALYSIS] Starting analysis");
    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "process-document",
        {
          body: { quoteId: reviewData.quote_id },
        },
      );

      if (error) {
        console.error("❌ [AI ANALYSIS] Error:", error);
        alert("Failed to analyze files: " + error.message);
        return;
      }

      console.log("✅ [AI ANALYSIS] Response:", data);
      alert("✅ Files analyzed successfully! Refreshing quote data...");

      // Clear uploaded files and refresh data
      setUploadedFiles([]);
      setShowUploadSection(false);
      await fetchAllData();
    } catch (error) {
      console.error("❌ [AI ANALYSIS] Error:", error);
      alert("Failed to analyze files: " + (error as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeUploadedFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const allFilesUploaded =
    uploadedFiles.length > 0 &&
    uploadedFiles.every((f) => f.uploadStatus === "success");

  // ============================================
  // ADDRESS AND TURNAROUND HANDLING
  // ============================================

  const handleUpdateBillingAddress = async (address: any) => {
    if (!reviewData?.quote_id) return;

    try {
      const { error } = await supabase
        .from("quotes")
        .update({ billing_address: address })
        .eq("id", reviewData.quote_id);

      if (error) throw error;

      setBillingAddress(address);
      alert("✅ Billing address updated successfully!");
    } catch (error) {
      console.error("Failed to update billing address:", error);
      alert("Failed to update billing address: " + (error as Error).message);
    }
  };

  const handleUpdateShippingAddress = async (address: any) => {
    if (!reviewData?.quote_id) return;

    try {
      const { error } = await supabase
        .from("quotes")
        .update({ shipping_address: address })
        .eq("id", reviewData.quote_id);

      if (error) throw error;

      setShippingAddress(address);
      alert("✅ Shipping address updated successfully!");
    } catch (error) {
      console.error("Failed to update shipping address:", error);
      alert("Failed to update shipping address: " + (error as Error).message);
    }
  };

  const handleUpdateTurnaroundType = async (
    newType: "standard" | "rush" | "same_day",
  ) => {
    if (!reviewData?.quote_id || !reviewData?.quotes) return;

    try {
      // Calculate new rush fee
      const subtotal = reviewData.quotes.subtotal || 0;
      let newRushFee = 0;
      let multiplier = 1.0;

      if (newType === "rush") {
        multiplier = rushMultiplierValue;
        newRushFee = subtotal * (multiplier - 1);
      } else if (newType === "same_day") {
        multiplier = sameDayMultiplierValue;
        newRushFee = subtotal * (multiplier - 1);
      }

      // Calculate new total
      const certificationTotal = reviewData.quotes.certification_total || 0;
      const deliveryFee = reviewData.quotes.delivery_fee || 0;
      const newSubtotalWithRush = subtotal + newRushFee;
      const taxRate = reviewData.quotes.tax_rate || 0;
      const taxAmount =
        (newSubtotalWithRush + certificationTotal + deliveryFee) * taxRate;
      const newTotal =
        newSubtotalWithRush + certificationTotal + deliveryFee + taxAmount;

      const { error } = await supabase
        .from("quotes")
        .update({
          turnaround_type: newType,
          rush_fee: newRushFee,
          is_rush: newType !== "standard",
          tax_amount: taxAmount,
          total: newTotal,
        })
        .eq("id", reviewData.quote_id);

      if (error) throw error;

      setTurnaroundType(newType);
      setRushFee(newRushFee);

      // Update review data with new totals
      setReviewData({
        ...reviewData,
        quotes: {
          ...reviewData.quotes,
          turnaround_type: newType,
          rush_fee: newRushFee,
          is_rush: newType !== "standard",
          tax_amount: taxAmount,
          total: newTotal,
        },
      });

      alert(
        `✅ Turnaround type updated to ${newType}!\nRush Fee: $${newRushFee.toFixed(2)}\nNew Total: $${newTotal.toFixed(2)}`,
      );
      await fetchAllData(); // Refresh to get updated pricing
    } catch (error) {
      console.error("Failed to update turnaround type:", error);
      alert("Failed to update turnaround type: " + (error as Error).message);
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
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
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
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
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
    setSelectedDocuments([]);
    setSplitMode(false);
  };

  // Document-level selection functions
  const toggleDocumentSelection = (analysisId: string) => {
    setSelectedDocuments((prev) =>
      prev.includes(analysisId)
        ? prev.filter((id) => id !== analysisId)
        : [...prev, analysisId]
    );
  };

  const selectAllDocuments = () => {
    if (selectedDocuments.length === analysisResults.length) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(analysisResults.map((a) => a.id));
    }
  };

  const getDocumentPageCount = (analysisId: string): number => {
    const analysis = analysisResults.find((a) => a.id === analysisId);
    if (!analysis) return 1;
    const pages = pageData[analysis.quote_file_id] || [];
    return pages.length > 0 ? pages.length : analysis.page_count || 1;
  };

  const handleCombineDocuments = async () => {
    if (selectedDocuments.length < 2) return;

    const confirmed = window.confirm(
      `Combine ${selectedDocuments.length} documents into one? This will merge all pages.`
    );

    if (!confirmed) return;

    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");

    try {
      // Get all page IDs from selected documents
      const pageIds: string[] = [];
      const firstAnalysis = analysisResults.find(
        (a) => a.id === selectedDocuments[0]
      );
      if (!firstAnalysis) {
        throw new Error("Could not find source document");
      }

      for (const docId of selectedDocuments) {
        const analysis = analysisResults.find((a) => a.id === docId);
        if (analysis) {
          const docPages = pageData[analysis.quote_file_id] || [];
          pageIds.push(...docPages.map((p) => p.id));
        }
      }

      if (pageIds.length === 0) {
        throw new Error("No pages found in selected documents");
      }

      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/save-hitl-correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            reviewId: reviewId,
            staffId: session.staffId,
            field: "create_document_from_pages",
            correctedValue: JSON.stringify({
              source_analysis_id: selectedDocuments[0],
              page_ids: pageIds,
              document_name: "Combined Document",
            }),
            reason: `Combined ${selectedDocuments.length} documents`,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        toast.success("Documents combined successfully");
        clearSelection();
        await fetchAllData();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Combine error:", error);
      toast.error("Failed to combine documents: " + (error as Error).message);
    }
  };

  const handleSplitDocument = (analysisId: string) => {
    // Find all pages for this document and select them
    const analysis = analysisResults.find((a) => a.id === analysisId);
    if (analysis) {
      const docPages = pageData[analysis.quote_file_id] || [];
      setSelectedPages(new Set(docPages.map((p) => p.id)));
    }
    setShowSplitModal(true);
    setSplitDocumentName("");
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
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/save-hitl-correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
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
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/save-hitl-correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
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
  // DOCUMENT GROUPING FUNCTIONS
  // ============================================

  // Fetch document groups for the quote
  const fetchDocumentGroups = async (quoteId: string) => {
    const { data, error } = await supabase
      .from("v_document_groups_with_items")
      .select("*")
      .eq("quote_id", quoteId)
      .order("group_number");

    if (error) throw error;
    return data;
  };

  // Fetch unassigned items for the quote
  const fetchUnassignedItems = async (quoteId: string) => {
    const { data, error } = await supabase
      .from("v_unassigned_quote_items")
      .select("*")
      .eq("quote_id", quoteId)
      .order("page_number");

    if (error) throw error;
    return data;
  };

  // Refresh document groups
  const refreshDocumentGroups = async () => {
    if (!reviewData?.quote_id) return;

    setIsLoadingGroups(true);
    try {
      const [groups, unassigned] = await Promise.all([
        fetchDocumentGroups(reviewData.quote_id),
        fetchUnassignedItems(reviewData.quote_id),
      ]);
      setDocumentGroups(groups || []);
      setUnassignedItems(unassigned || []);
    } catch (error) {
      console.error("Refresh document groups error:", error);
    } finally {
      setIsLoadingGroups(false);
    }
  };

  // Toggle group expansion
  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // Create new document group
  const handleCreateGroup = async (
    label: string,
    documentType: string,
    complexity: string
  ) => {
    try {
      const { data, error } = await supabase.rpc("create_document_group", {
        p_quote_id: reviewData?.quote_id,
        p_group_label: label,
        p_document_type: documentType,
        p_complexity: complexity,
        p_staff_id: staffSession?.staffId,
      });

      if (error) throw error;

      toast.success("Document group created");
      await refreshDocumentGroups();
      setShowCreateGroupModal(false);

      // Expand the new group
      if (data) {
        setExpandedGroups((prev) => new Set([...prev, data]));
      }

      // If there was a pending item to assign, assign it now
      if (pendingAssignItem && data) {
        await handleAssignToGroup(data, pendingAssignItem);
        setPendingAssignItem(null);
      }
    } catch (error) {
      console.error("Create group error:", error);
      toast.error("Failed to create group");
    }
  };

  // Edit document group
  const handleEditGroup = async (
    groupId: string,
    label: string,
    documentType: string,
    complexity: string
  ) => {
    try {
      const { error } = await supabase
        .from("quote_document_groups")
        .update({
          group_label: label,
          document_type: documentType,
          complexity: complexity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", groupId);

      if (error) throw error;

      // Recalculate the group totals
      await supabase.rpc("recalculate_document_group", {
        p_group_id: groupId,
      });

      toast.success("Document group updated");
      await refreshDocumentGroups();
      setShowEditGroupModal(false);
      setSelectedGroupForEdit(null);
    } catch (error) {
      console.error("Edit group error:", error);
      toast.error("Failed to update group");
    }
  };

  // Assign item to group
  const handleAssignToGroup = async (groupId: string, item: UnassignedItem) => {
    try {
      if (item.item_type === "page" && item.page_id) {
        await supabase.rpc("assign_page_to_group", {
          p_group_id: groupId,
          p_page_id: item.page_id,
          p_staff_id: staffSession?.staffId,
        });
      } else if (item.item_type === "file" && item.file_id) {
        await supabase.rpc("assign_file_to_group", {
          p_group_id: groupId,
          p_file_id: item.file_id,
          p_staff_id: staffSession?.staffId,
        });
      }

      toast.success("Item assigned to group");
      await refreshDocumentGroups();
    } catch (error) {
      console.error("Assign error:", error);
      toast.error("Failed to assign item");
    }
  };

  // Assign multiple items to group
  const handleAssignMultipleToGroup = async (
    groupId: string,
    items: UnassignedItem[]
  ) => {
    try {
      for (const item of items) {
        if (item.item_type === "page" && item.page_id) {
          await supabase.rpc("assign_page_to_group", {
            p_group_id: groupId,
            p_page_id: item.page_id,
            p_staff_id: staffSession?.staffId,
          });
        } else if (item.item_type === "file" && item.file_id) {
          await supabase.rpc("assign_file_to_group", {
            p_group_id: groupId,
            p_file_id: item.file_id,
            p_staff_id: staffSession?.staffId,
          });
        }
      }

      toast.success(`${items.length} item(s) assigned to group`);
      await refreshDocumentGroups();
      setShowAssignModal(false);
      setSelectedGroupForAssign(null);
    } catch (error) {
      console.error("Assign error:", error);
      toast.error("Failed to assign items");
    }
  };

  // Quick assign from dropdown
  const handleQuickAssign = async (item: UnassignedItem, groupId: string) => {
    if (groupId === "__new__") {
      // Open create modal, then assign
      setShowCreateGroupModal(true);
      setPendingAssignItem(item);
    } else if (groupId) {
      await handleAssignToGroup(groupId, item);
    }
  };

  // Remove item from group
  const handleRemoveFromGroup = async (assignmentId: string) => {
    try {
      await supabase.rpc("remove_from_group", {
        p_assignment_id: assignmentId,
      });

      toast.success("Item removed from group");
      await refreshDocumentGroups();
    } catch (error) {
      console.error("Remove error:", error);
      toast.error("Failed to remove item");
    }
  };

  // Delete document group
  const handleDeleteGroup = async (groupId: string) => {
    try {
      await supabase.rpc("delete_document_group", {
        p_group_id: groupId,
      });

      toast.success("Document group deleted");
      await refreshDocumentGroups();
    } catch (error) {
      console.error("Delete group error:", error);
      toast.error("Failed to delete group");
    }
  };

  // Analyze group with AI
  const handleAnalyzeGroup = async (groupId: string) => {
    try {
      setAnalyzingGroupId(groupId);

      const { data, error } = await supabase.functions.invoke(
        "analyze-document-group",
        {
          body: {
            groupId,
            staffId: staffSession?.staffId,
          },
        }
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success("Analysis complete");
      await refreshDocumentGroups();

      // Also refresh quote totals
      await fetchReviewData();
    } catch (error) {
      console.error("Analyze error:", error);
      toast.error("Analysis failed: " + (error as Error).message);
    } finally {
      setAnalyzingGroupId(null);
    }
  };

  // Open assign modal for a specific group
  const openAssignModal = (groupId: string) => {
    setSelectedGroupForAssign(groupId);
    setShowAssignModal(true);
  };

  // Open edit modal for a specific group
  const openEditModal = (group: DocumentGroup) => {
    setSelectedGroupForEdit(group);
    setShowEditGroupModal(true);
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

    // If pageData is available, calculate from individual pages
    // Otherwise fall back to analysis.billable_pages from the database
    if (pages.length > 0) {
      let totalBillable = 0;
      pages.forEach((page) => {
        const words = getPageWordCount(page);
        totalBillable += calculatePageBillable(words, complexity);
      });
      // Minimum 1.00 per document
      return Math.max(totalBillable, 1.0);
    }

    // Fall back to analysis.billable_pages when pageData is not available
    return analysis.billable_pages || 1.0;
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
    return lang?.multiplier || 1.0;
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
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
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
      const accessToken = await getAccessToken();

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
                Authorization: `Bearer ${accessToken}`,
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
              Authorization: `Bearer ${accessToken}`,
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
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/hitl_reviews?id=eq.${reviewData?.id}`,
        {
          method: "PATCH",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
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
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
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
  // FILE ACCORDION FLOW HANDLERS
  // ============================================

  // Fetch the "to_translate" category ID on mount
  useEffect(() => {
    const fetchToTranslateCategory = async () => {
      const { data } = await supabase
        .from("file_categories")
        .select("id")
        .eq("slug", "to_translate")
        .single();
      if (data) {
        setToTranslateCategoryId(data.id);
      }
    };
    fetchToTranslateCategory();
  }, []);

  // Filter files to show in accordion (To Translate category only)
  const translatableFiles = quoteFiles.filter(
    (f: any) =>
      f.category?.slug === "to_translate" ||
      f.category_id === toTranslateCategoryId
  );

  // Handle AI analysis of a single file
  const handleAnalyzeFile = async (fileId: string) => {
    setFileAccordionData((prev) => ({
      ...prev,
      [fileId]: { ...prev[fileId], isAnalyzing: true, isSubmitted: false },
    }));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ fileId }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to analyze file");
      }

      // Refresh data to get analysis results
      await fetchReviewData();

      // Find the analysis result for this file
      const updatedAnalysis = analysisResults.find(
        (a) => a.quote_file_id === fileId
      );
      const updatedPages = pageData[fileId] || [];

      setFileAccordionData((prev) => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          analysisResult: updatedAnalysis,
          pages: updatedPages,
          isAnalyzing: false,
        },
      }));
    } catch (error) {
      console.error("Error analyzing file:", error);
      toast.error("Failed to analyze file");
      setFileAccordionData((prev) => ({
        ...prev,
        [fileId]: { ...prev[fileId], isAnalyzing: false },
      }));
    }
  };

  // Handle manual entry for a file
  const handleManualEntryForFile = (fileId: string) => {
    // Open the existing ManualEntryModal
    // This would integrate with the existing manual entry flow
    console.log("Opening manual entry for file:", fileId);
    // TODO: Integrate with existing ManualEntryModal
  };

  // Handle submitting page groupings
  const handleSubmitGroupings = async (
    fileId: string,
    groupings: PageGrouping[]
  ) => {
    try {
      const accessToken = await getAccessToken();

      if (!staffSession?.staffId) {
        throw new Error("Staff session not available");
      }

      // Save groupings via edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-hitl-correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            reviewId,
            staffId: staffSession.staffId,
            field: "page_groupings",
            correctedValue: JSON.stringify(groupings),
            fileId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save groupings");
      }

      // Mark file as submitted
      setFileAccordionData((prev) => ({
        ...prev,
        [fileId]: { ...prev[fileId], isSubmitted: true },
      }));

      // Check if all files are submitted
      const allSubmitted = translatableFiles.every(
        (f: any) =>
          fileAccordionData[f.id]?.isSubmitted || f.id === fileId
      );

      if (allSubmitted) {
        // Fetch document groups and switch to DocumentGroupsView
        await refreshDocumentGroups();
        setShowDocumentGroupsView(true);
      }

      toast.success("Groupings saved successfully");
    } catch (error) {
      console.error("Error saving groupings:", error);
      toast.error("Failed to save groupings");
    }
  };

  // Handle re-analyzing a document group
  const handleReanalyzeGroupForView = async (groupId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reanalyze-document-group`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ groupId }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to re-analyze group");
      }

      await refreshDocumentGroups();
      toast.success("Group re-analyzed successfully");
    } catch (error) {
      console.error("Error re-analyzing group:", error);
      toast.error("Failed to re-analyze group");
    }
  };

  // Handle certification change for document group view
  const handleCertificationChangeForView = async (
    groupId: string,
    certTypeId: string
  ) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      // Get the certification type details
      const certType = certificationTypes.find((ct) => ct.id === certTypeId);
      if (!certType) return;

      // Update the group certification
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/document_groups?id=eq.${groupId}`,
        {
          method: "PATCH",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            certification_type_id: certTypeId,
            certification_price: certType.price,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update certification");
      }

      // Update local state
      setDocumentGroupsForView((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                certificationTypeId: certTypeId,
                certificationName: certType.name,
                certificationPrice: certType.price,
              }
            : g
        )
      );

      // Refresh data to recalculate totals
      await fetchReviewData();
      toast.success("Certification updated");
    } catch (error) {
      console.error("Error updating certification:", error);
      toast.error("Failed to update certification");
    }
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================

  // Check if review is in a read-only state
  // Note: 'approved' is NOT read-only - it means "ready to send to customer" and staff can still edit and send
  const isReadOnly = ['rejected', 'escalated'].includes(reviewData?.status || '');

  // Check if review is approved (ready to send to customer)
  const isApproved = reviewData?.status === 'approved';

  // Check if quote has been converted to an order (hide send buttons)
  const isConvertedToOrder = ['paid', 'converted'].includes(reviewData?.quotes?.status || '');

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
    <div className="p-6 max-w-6xl mx-auto">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 -mx-6 px-6 py-4 mb-6 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Left: Back button and title */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/admin/hitl")}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="border-l border-gray-300 h-8"></div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {reviewData?.quotes?.quote_number || "Loading..."}
              </h1>
              <div className="flex items-center gap-2">
                {claimedByMe ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                    Claimed by you
                  </span>
                ) : claimedByOther ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                    <User className="w-3 h-3" />
                    {assignedStaffName || "Another staff"}
                    {assignedStaffRole && (
                      <span className="text-amber-500">({assignedStaffRole.replace(/_/g, " ")})</span>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                    Unclaimed
                  </span>
                )}
                <span className="text-xs text-gray-500 capitalize">
                  {reviewData?.status?.replace(/_/g, " ") || "Pending"}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-4">
            {/* Claim Review - for unclaimed */}
            {!claimedByMe && !claimedByOther && (
              <button
                onClick={handleClaimReview}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium transition-colors text-sm"
              >
                Claim Review
              </button>
            )}

            {/* When claimed by another staff */}
            {claimedByOther && (
              <>
                {/* Show Take Over button if current user has higher role */}
                {canOverrideClaim(staffSession?.staffRole, assignedStaffRole ?? undefined) ? (
                  <button
                    onClick={() => setShowOverrideConfirm(true)}
                    disabled={isClaimingReview}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium transition-colors text-sm disabled:opacity-50"
                  >
                    {isClaimingReview ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    Take Over Review
                  </button>
                ) : (
                  // Show locked indicator if current user cannot override
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm">
                    <Lock className="w-4 h-4" />
                    In Review by {assignedStaffName || "another staff"}
                  </div>
                )}
              </>
            )}

            {/* When claimed by me - show workflow buttons */}
            {claimedByMe && (
              <>
                {/* Left Group: Reject & Escalate (only in_review status) */}
                {reviewData?.status === "in_review" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowRejectQuoteModal(true)}
                      disabled={isSubmitting || isSaving}
                      className="flex items-center gap-1.5 px-3 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      <XCircle className="w-4 h-4" />
                      <span className="hidden sm:inline">Reject</span>
                    </button>

                    <button
                      onClick={handleEscalateReview}
                      disabled={isSubmitting || isSaving}
                      className="flex items-center gap-1.5 px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      <Zap className="w-4 h-4" />
                      <span className="hidden sm:inline">Escalate</span>
                    </button>
                  </div>
                )}

                {/* Divider between left and right groups */}
                {reviewData?.status === "in_review" && !isReadOnly && (
                  <div className="border-l border-gray-300 h-8"></div>
                )}

                {/* Right Group: Save + Send Quote Link + Send Payment Link */}
                {!isReadOnly && (
                  <div className="flex items-center gap-2">
                    {/* Save Button - always visible when not read-only */}
                    <button
                      onClick={handleSave}
                      disabled={isSaving || isSending}
                      className="flex items-center gap-1.5 px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      <Save className="w-4 h-4" />
                      <span className="hidden sm:inline">{isSaving ? "Saving..." : "Save"}</span>
                    </button>

                    {/* Send Quote Link & Send Payment Link - hidden when paid or converted */}
                    {!isConvertedToOrder && (
                      <>
                        {/* Send Quote Link Button - purple outline */}
                        <button
                          onClick={handleSendQuoteLink}
                          disabled={isSaving || isSending}
                          className="flex items-center gap-1.5 px-4 py-2 border border-purple-300 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50 text-sm font-medium"
                        >
                          <Mail className="w-4 h-4" />
                          <span className="hidden sm:inline">{isSending ? "Sending..." : "Send Quote Link"}</span>
                        </button>

                        {/* Send Payment Link Button - purple solid */}
                        <button
                          onClick={handleSendPaymentLink}
                          disabled={isSaving || isSending}
                          className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm font-medium"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span className="hidden sm:inline">{isSending ? "Sending..." : "Send Payment Link"}</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Approved Status Banner - Ready to send to customer */}
      {isApproved && (
        <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-green-800 font-medium">
              Approved - Ready to send to customer
            </p>
          </div>
          <p className="text-green-600 text-sm mt-1 ml-7">
            This quote has been approved. You can still make edits before sending to the customer.
          </p>
        </div>
      )}

      {/* Read-Only Status Banner (rejected/escalated only) */}
      {isReadOnly && (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg mb-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-gray-600" />
            <p className="text-gray-800 font-medium">
              This review has been {reviewData?.status?.replace(/_/g, " ")}
            </p>
          </div>
          <p className="text-gray-600 text-sm mt-1 ml-7">
            Completed: {reviewData?.completed_at ? new Date(reviewData.completed_at).toLocaleString() : "N/A"}
          </p>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* No Data Warning */}
          {!reviewData && !loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center max-w-2xl mx-auto mt-12">
              <div className="mb-4">
                <svg
                  className="w-16 h-16 mx-auto text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-blue-900 font-semibold text-lg mb-2">
                Review Not Found in Queue
              </p>
              <p className="text-blue-700 mb-4">
                This review may have already been completed, rejected, or
                removed from the queue.
              </p>
              <p className="text-blue-600 text-sm mb-6">
                Review ID:{" "}
                <code className="bg-blue-100 px-2 py-1 rounded">
                  {reviewId}
                </code>
              </p>
              <button
                onClick={() => navigate("/admin/hitl")}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                ← Return to HITL Queue
              </button>
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
              onRefreshFiles={fetchReviewData}
            >
              {/* Center Panel Content: Document Accordion */}

              {/* Translation Details Card - TOP OF MAIN CONTENT */}
              <TranslationDetailsCard
                quoteId={reviewData.quote_id}
                onDetailsChange={handleDetailsChange}
              />

              {/* Addresses Section - Compact 2-column layout */}
              {claimedByMe && reviewData?.quotes && (
                <div className="mb-6 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <h3 className="font-semibold text-gray-900">Addresses</h3>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Billing Address */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Billing Address
                          </h4>
                        </div>
                        {billingAddress ? (
                          <div className="text-sm text-gray-700 space-y-0.5">
                            <p className="font-medium text-gray-900">
                              {billingAddress.name || reviewData.quotes.customer?.full_name}
                            </p>
                            <p>{billingAddress.address_line1}</p>
                            {billingAddress.address_line2 && <p>{billingAddress.address_line2}</p>}
                            <p>
                              {billingAddress.city}, {billingAddress.province || billingAddress.state}{" "}
                              {billingAddress.postal_code}
                            </p>
                            <p>{billingAddress.country || "Canada"}</p>
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-sm text-gray-500 italic mb-2">No billing address on file</p>
                            <button
                              onClick={() => setShowAddressSection(true)}
                              className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                            >
                              Add Address
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Shipping Address */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Shipping Address
                          </h4>
                        </div>
                        {shippingAddress ? (
                          <div className="text-sm text-gray-700 space-y-0.5">
                            <p className="font-medium text-gray-900">
                              {shippingAddress.name || reviewData.quotes.customer?.full_name}
                            </p>
                            <p>{shippingAddress.address_line1}</p>
                            {shippingAddress.address_line2 && <p>{shippingAddress.address_line2}</p>}
                            <p>
                              {shippingAddress.city}, {shippingAddress.province || shippingAddress.state}{" "}
                              {shippingAddress.postal_code}
                            </p>
                            <p>{shippingAddress.country || "Canada"}</p>
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-sm text-gray-500 italic mb-2">
                              No shipping address (Digital delivery only)
                            </p>
                            <button
                              onClick={() => setShowAddressSection(true)}
                              className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                            >
                              Add Address
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Selection Mode Toolbar */}
              {analysisResults.length > 0 && (
                <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (splitMode) {
                          clearSelection();
                        } else {
                          setSplitMode(true);
                        }
                      }}
                      disabled={!claimedByMe}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        splitMode
                          ? "bg-teal-600 text-white"
                          : !claimedByMe
                            ? "bg-gray-200 border border-gray-300 text-gray-400 cursor-not-allowed"
                            : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                      title={
                        !claimedByMe ? "Claim this review to enable selection" : ""
                      }
                    >
                      {splitMode ? "✓ Selection Mode" : "Selection Mode"}
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

              {/* Document Selection Action Bar - Shows when documents are selected */}
              {splitMode && selectedDocuments.length > 0 && (
                <div className="sticky top-0 z-10 bg-teal-50 border border-teal-200 rounded-lg p-4 mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-teal-800">
                      {selectedDocuments.length} document{selectedDocuments.length !== 1 ? "s" : ""} selected
                    </span>
                    <button
                      onClick={selectAllDocuments}
                      className="text-sm text-teal-600 hover:text-teal-800 underline"
                    >
                      {selectedDocuments.length === analysisResults.length ? "Deselect All" : "Select All"}
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Combine Button - Only show when 2+ documents selected */}
                    {selectedDocuments.length >= 2 && (
                      <button
                        onClick={handleCombineDocuments}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                      >
                        <Layers className="w-4 h-4" />
                        Combine Selected
                      </button>
                    )}

                    {/* Split Button - Only show when 1 multi-page document selected */}
                    {selectedDocuments.length === 1 && getDocumentPageCount(selectedDocuments[0]) > 1 && (
                      <button
                        onClick={() => handleSplitDocument(selectedDocuments[0])}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                      >
                        <Scissors className="w-4 h-4" />
                        Split Document
                      </button>
                    )}

                    {/* Cancel Selection */}
                    <button
                      onClick={clearSelection}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Document List - Only show files that HAVE analysis records */}
              {/* Files without analysis should only appear in Document Management panel */}
              <div className="space-y-4">
                {analysisResults.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                    <p className="text-gray-500">No analyzed documents yet.</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Use the Document Management panel to analyze files or add manual entries.
                    </p>
                  </div>
                ) : analysisResults.map((analysis, index) => {
                  // Get the file data from analysis.quote_file or from quoteFiles
                  const file = quoteFiles.find((f) => f.id === analysis.quote_file_id) || {
                    id: analysis.quote_file_id,
                    original_filename: analysis.quote_file?.original_filename || 'Unknown',
                    storage_path: analysis.quote_file?.storage_path,
                    file_size: analysis.quote_file?.file_size || 0,
                    mime_type: analysis.quote_file?.mime_type || '',
                    ai_processing_status: 'completed',
                  };
                  const pages = pageData[analysis.quote_file_id] || [];
                  // Use pageData if available, otherwise fall back to analysis values
                  const totalWords = pages.length > 0
                    ? pages.reduce((sum, p) => sum + getPageWordCount(p), 0)
                    : analysis.word_count || 0;
                  const displayPageCount = pages.length > 0 ? pages.length : (analysis.page_count || 0);
                  const fileId = analysis.quote_file_id;
                  const isExpanded = expandedFile === fileId;

                  // Original code for files WITH analysis - keep unchanged
                  return (
                    <div
                      key={fileId}
                      className={`bg-white rounded-lg border shadow-sm overflow-hidden ${
                        splitMode && selectedDocuments.includes(analysis.id)
                          ? "border-teal-400 ring-2 ring-teal-200"
                          : "border-gray-200"
                      }`}
                    >
                      {/* File Header */}
                      <div
                        className="w-full px-4 py-3 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 hover:from-gray-100 hover:to-gray-50 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          {/* Selection Checkbox - Only show in selection mode */}
                          {splitMode && (
                            <input
                              type="checkbox"
                              checked={selectedDocuments.includes(analysis.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleDocumentSelection(analysis.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                          )}
                          <div
                            className="flex items-center gap-3 flex-1"
                            onClick={() => setExpandedFile(isExpanded ? null : fileId)}
                          >
                            <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-teal-600" />
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900">
                                {index + 1}.{" "}
                                {file.original_filename ||
                                  analysis.quote_file?.original_filename}
                              </h4>
                              <p className="text-xs text-gray-500">
                                {totalWords} words • {displayPageCount} page(s)
                              </p>
                            </div>
                            {hasChanges(analysis.quote_file_id) && (
                              <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800 font-medium">
                                Unsaved
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-3"
                          onClick={() => setExpandedFile(isExpanded ? null : fileId)}
                        >
                          <span className="text-lg font-semibold text-gray-900">
                            $
                            {calculateLineTotal(
                              analysis.quote_file_id,
                              analysis,
                            ).toFixed(2)}
                          </span>
                          <span className="text-gray-400">
                            {isExpanded ? "▼" : "▶"}
                          </span>
                          {/* Remove Analysis Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAnalysis(
                                analysis.id,
                                analysis.quote_file_id,
                                file.original_filename || analysis.quote_file?.original_filename || "Unknown"
                              );
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title="Remove analysis"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
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
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
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
                                        analysis.quote_file
                                          ?.original_filename || "Document",
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
                              <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
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
                                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                  />
                                ) : (
                                  <div className="font-medium text-gray-900">
                                    {analysis.detected_document_type}
                                  </div>
                                )}
                              </div>

                              {/* Language */}
                              <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
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
                                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                  >
                                    {languages.map((lang) => (
                                      <option key={lang.code} value={lang.code}>
                                        {lang.name} ({lang.multiplier}x)
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="font-medium text-gray-900">
                                    {analysis.detected_language}
                                  </div>
                                )}
                              </div>

                              {/* Complexity */}
                              <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
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
                                        newValue !==
                                        analysis.assessed_complexity
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
                                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                  >
                                    <option value="easy">Easy (1.0x)</option>
                                    <option value="medium">
                                      Medium (1.15x)
                                    </option>
                                    <option value="hard">Hard (1.25x)</option>
                                  </select>
                                ) : (
                                  <div className="font-medium text-gray-900 capitalize">
                                    {analysis.assessed_complexity} (
                                    {analysis.complexity_multiplier}x)
                                  </div>
                                )}
                              </div>

                              {/* Page Breakdown */}
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-xs font-medium text-blue-700 uppercase tracking-wide mb-3">
                                  Page Breakdown ({pages.length} page
                                  {pages.length !== 1 ? "s" : ""})
                                </p>
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
                                              checked={selectedPages.has(
                                                page.id,
                                              )}
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
                                <div className="flex justify-between mt-3 pt-3 border-t border-blue-200">
                                  <span className="text-sm font-medium text-blue-700">Document Billable:</span>
                                  <span className="text-sm font-bold text-blue-700">
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
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                                  Certification
                                </p>

                                {/* Primary Certification */}
                                <div className="flex items-center gap-3 mb-3">
                                  <span className="text-sm font-medium whitespace-nowrap flex-shrink-0">
                                    Primary:
                                  </span>
                                  <div className="flex items-center gap-2 flex-1">
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
                                            {cert.name} ($
                                            {cert.price.toFixed(2)})
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

                                  {(
                                    additionalCerts[analysis.quote_file_id] ||
                                    []
                                  ).length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">
                                      None added
                                    </p>
                                  ) : (
                                    <div className="space-y-1">
                                      {(
                                        additionalCerts[
                                          analysis.quote_file_id
                                        ] || []
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
                              <div className="bg-gradient-to-r from-teal-50 to-green-50 border border-teal-100 rounded-lg p-4">
                                <p className="text-xs font-medium text-teal-700 uppercase tracking-wide mb-2">
                                  Document Total
                                </p>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Billable Pages:</span>
                                    <span>
                                      {calculateDocumentBillable(
                                        analysis.quote_file_id,
                                        analysis,
                                      ).toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Translation:</span>
                                    <span>
                                      $
                                      {calculateTranslationCost(
                                        analysis.quote_file_id,
                                        analysis,
                                      ).toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Certification:</span>
                                    <span>
                                      $
                                      {calculateCertificationTotal(
                                        analysis.quote_file_id,
                                        analysis,
                                      ).toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between font-semibold border-t border-teal-200 pt-2 mt-2 text-teal-700">
                                    <span>Line Total:</span>
                                    <span className="font-bold">
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
                                          : (analysis?.ocr_confidence || 0) >
                                              0.6
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
                                            (analysis?.language_confidence ||
                                              0) > 0.9
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

                          {/* Request Better Scan Button - Inside Document Card */}
                          {claimedByMe && (
                            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                              <button
                                onClick={() => setShowRejectModal(true)}
                                disabled={isSubmitting}
                                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 font-medium text-sm transition-colors disabled:opacity-50"
                              >
                                <Camera className="w-4 h-4" />
                                Request Better Scan
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ============================================ */}
              {/* FILE ANALYSIS SECTION */}
              {/* ============================================ */}

              {/* New Document Flow: File Accordions */}
              {translatableFiles.length > 0 && !showDocumentGroupsView && (
                <div className="bg-white border rounded-xl p-6 mt-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-teal-600" />
                      Files to Analyze ({translatableFiles.length})
                    </h3>
                    {translatableFiles.map((file: any) => (
                      <FileAccordion
                        key={file.id}
                        file={{
                          id: file.id,
                          original_filename: file.original_filename,
                          file_size: file.file_size,
                          mime_type: file.mime_type,
                          ai_processing_status: file.ai_processing_status,
                          category_id: file.category_id,
                          category: file.category,
                        }}
                        analysisResult={
                          fileAccordionData[file.id]?.analysisResult ||
                          analysisResults.find((a) => a.quote_file_id === file.id)
                        }
                        pages={
                          fileAccordionData[file.id]?.pages ||
                          pageData[file.id]?.map((p) => ({
                            id: p.id,
                            page_number: p.page_number,
                            word_count: p.word_count,
                          })) ||
                          []
                        }
                        isAnalyzing={fileAccordionData[file.id]?.isAnalyzing}
                        onAnalyze={handleAnalyzeFile}
                        onManualEntry={handleManualEntryForFile}
                        onSubmit={handleSubmitGroupings}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state when no To Translate files */}
              {translatableFiles.length === 0 && !showDocumentGroupsView && (
                <div className="border rounded-lg p-6 bg-gray-50 text-center mt-6">
                  <p className="text-gray-600">No "To Translate" files uploaded yet.</p>
                  <p className="text-gray-500 text-sm mt-1">
                    Upload files with the "To Translate" category to begin analysis.
                  </p>
                </div>
              )}

              {/* Post-Submit: Document Groups View with Pricing */}
              {showDocumentGroupsView && documentGroupsForView.length > 0 && (
                <div className="mt-6">
                  <DocumentGroupsView
                    groups={documentGroupsForView}
                    onReanalyze={handleReanalyzeGroupForView}
                    onCertificationChange={handleCertificationChangeForView}
                    baseRate={baseRate}
                    languageMultiplier={
                      reviewData?.quotes?.source_language_multiplier || 1.0
                    }
                  />
                </div>
              )}

              {/* ========== OLD DOCUMENT GROUPING UI - HIDDEN ==========
              <div className="bg-white border rounded-xl p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-teal-600" />
                    Document Grouping
                  </h3>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useUnifiedEditor}
                        onChange={(e) => setUseUnifiedEditor(e.target.checked)}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      Use Unified Editor
                    </label>
                    {!useUnifiedEditor && (
                      <button
                        onClick={() => setShowCreateGroupModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!claimedByMe}
                      >
                        <Plus className="w-4 h-4" />
                        New Document Group
                      </button>
                    )}
                  </div>
                </div>

                {useUnifiedEditor && reviewData?.quote_id ? (
                  <UnifiedDocumentEditor
                    quoteId={reviewData.quote_id}
                    mode="hitl"
                    reviewId={reviewId}
                    readOnly={!claimedByMe}
                    onPricingUpdate={handlePricingUpdate}
                  />
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-4">
                      Group pages/files that belong to the same logical document. Each group = 1 certification.
                    </p>

                {isLoadingGroups ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                  </div>
                ) : documentGroups.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No document groups yet</p>
                    <p className="text-sm text-gray-400">
                      Create a group to organize pages/files
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {documentGroups.map((group) => (
                      <DocumentGroupCard
                        key={group.group_id}
                        group={group}
                        isExpanded={expandedGroups.has(group.group_id)}
                        onToggleExpand={() => toggleGroupExpand(group.group_id)}
                        onEdit={() => openEditModal(group)}
                        onDelete={() => handleDeleteGroup(group.group_id)}
                        onAnalyze={() => handleAnalyzeGroup(group.group_id)}
                        onAssignItems={() => openAssignModal(group.group_id)}
                        onRemoveItem={(assignmentId) =>
                          handleRemoveFromGroup(assignmentId)
                        }
                        isAnalyzing={analyzingGroupId === group.group_id}
                        isEditable={claimedByMe}
                      />
                    ))}
                  </div>
                )}

                {unassignedItems.length > 0 && (
                  <div className="mt-6 pt-6 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      Unassigned Pages/Files ({unassignedItems.length})
                    </h4>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="space-y-2">
                        {unassignedItems.map((item) => (
                          <div
                            key={item.item_id}
                            className="flex items-center justify-between bg-white p-3 rounded border"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium">
                                {item.file_name}
                                {item.page_number &&
                                  ` - Page ${item.page_number}`}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({item.word_count || 0} words)
                              </span>
                            </div>
                            <select
                              onChange={(e) =>
                                handleQuickAssign(item, e.target.value)
                              }
                              className="text-sm border rounded px-2 py-1"
                              disabled={!claimedByMe}
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Assign to...
                              </option>
                              {documentGroups.map((g) => (
                                <option key={g.group_id} value={g.group_id}>
                                  Document {g.group_number}: {g.group_label}
                                </option>
                              ))}
                              <option value="__new__">+ Create new group</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {documentGroups.length > 0 && (
                  <div className="mt-6 pt-4 border-t bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">
                        Total: {documentGroups.length} document
                        {documentGroups.length !== 1 ? "s" : ""} (
                        {documentGroups.length} certification
                        {documentGroups.length !== 1 ? "s" : ""})
                      </span>
                      <span className="text-xl font-bold text-teal-600">
                        $
                        {documentGroups
                          .reduce((sum, g) => sum + (g.line_total || 0), 0)
                          .toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
                  </>
                )}
              </div>
              ========== END OLD DOCUMENT GROUPING UI ========== */}

              {/* Document Flow Editor - New unified document management */}
              {reviewData?.quotes?.id && (
                <div className="mt-6">
                  <DocumentFlowEditor
                    mode="hitl"
                    quoteId={reviewData.quotes.id}
                    reviewId={reviewId}
                    onPricingChange={(totals) => {
                      console.log('Pricing updated:', totals);
                      // Refresh quote data when pricing changes
                      fetchReviewData();
                    }}
                    readOnly={!claimedByMe}
                    showPricing={true}
                    allowUpload={claimedByMe}
                  />
                </div>
              )}
            </HITLPanelLayout>
          )}

          {/* Messages Panel - Now integrated in HITLPanelLayout */}
          {false &&
            reviewData &&
            reviewData.quotes &&
            staffSession?.staffId && (
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
        </div>

        {/* Right Sidebar - Summary Info */}
        <div className="space-y-6">
          {reviewData && reviewData.quotes && (
            <>
              {/* Pricing Summary - Enhanced with Quote Certifications & Adjustments */}
              <PricingSummaryBox
                quoteId={reviewData.quotes.id}
                staffId={staffSession?.staffId}
                onPricingChange={handlePricingUpdate}
                showActions={claimedByMe}
                isSubmitting={isSubmitting}
                quoteStatus={reviewData?.quotes?.status}
                hitlReviewStatus={reviewData?.status}
                onManualPayment={() => {
                  const total = reviewData?.total || reviewData?.quotes?.total || 0;
                  setAmountPaid(total.toFixed(2));
                  setShowPaymentModal(true);
                }}
              />
            </>
          )}
        </div>
      </div>

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

      {/* Note: Main action buttons (Reject, Escalate, Save, Approve, Send to Customer, Resend Quote) are now in the sticky header */}
      {/* Manual Payment button is in PricingSummaryBox (shown when claimed and HITL review status is 'in_review') */}

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

      {/* Update & Send Payment Link Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Send className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Update Quote & Send Payment Link
                </h3>
                <p className="text-sm text-gray-500">
                  {reviewData?.quote_number}
                </p>
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">This will:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Save all your corrections and pricing changes</li>
                  <li>Increment the quote version number</li>
                  <li>Generate a fresh 30-day magic link</li>
                  <li>Send payment link email to customer</li>
                </ul>
              </div>
            </div>

            {/* Update Reason */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Update Reason <span className="text-red-500">*</span>
              </label>
              <select
                value={
                  updateReason.includes(":")
                    ? updateReason.split(":")[0]
                    : updateReason
                      ? "other"
                      : ""
                }
                onChange={(e) => {
                  const reasons = {
                    pricing: "Pricing corrections applied",
                    language: "Language detection corrected",
                    complexity: "Complexity assessment updated",
                    certification: "Certification requirements changed",
                    pages: "Page count adjusted",
                    other: "",
                  };
                  setUpdateReason(
                    reasons[e.target.value as keyof typeof reasons] || "",
                  );
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-2"
              >
                <option value="">Select a reason...</option>
                <option value="pricing">Pricing corrections applied</option>
                <option value="language">Language detection corrected</option>
                <option value="complexity">
                  Complexity assessment updated
                </option>
                <option value="certification">
                  Certification requirements changed
                </option>
                <option value="pages">Page count adjusted</option>
                <option value="other">Other (specify below)</option>
              </select>
              <textarea
                value={updateReason}
                onChange={(e) => setUpdateReason(e.target.value)}
                placeholder="Explain what was changed and why..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Current Quote Summary */}
            {reviewData && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 mb-2">
                  Current Quote Summary
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">Version:</span>{" "}
                    <span className="font-medium">
                      {reviewData.version || 1}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total:</span>{" "}
                    <span className="font-medium">
                      ${reviewData.total?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">Customer:</span>{" "}
                    <span className="font-medium">
                      {reviewData.customer_email ||
                        reviewData.customer?.email ||
                        "Unknown"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowUpdateModal(false);
                  setUpdateReason("");
                }}
                disabled={isUpdating}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateAndNotify}
                disabled={isUpdating || !updateReason.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {isUpdating ? "Updating..." : "Update & Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Manual Payment
                </h3>
                <p className="text-sm text-gray-500">
                  {reviewData?.quote_number}
                </p>
              </div>
            </div>

            {/* Warning - Dynamic based on payment method */}
            <div className={`rounded-lg p-3 mb-4 flex items-start gap-2 ${
              selectedPaymentMethodCode === 'account'
                ? 'bg-blue-50 border border-blue-200'
                : 'bg-amber-50 border border-amber-200'
            }`}>
              <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                selectedPaymentMethodCode === 'account' ? 'text-blue-600' : 'text-amber-600'
              }`} />
              <div className={`text-sm ${
                selectedPaymentMethodCode === 'account' ? 'text-blue-800' : 'text-amber-800'
              }`}>
                {selectedPaymentMethodCode === 'account' ? (
                  <>
                    <p className="font-medium mb-1">Account Payment (Net 30)</p>
                    <p>
                      Order will be created and work can proceed. An Accounts Receivable
                      record will track the balance due within 30 days.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium mb-1">Important:</p>
                    <p>
                      This will convert the quote to an order.
                      Ensure payment has been received before proceeding.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Quote Summary */}
            {reviewData && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 mb-2">
                  Quote Summary
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Customer:</span>
                    <span className="font-medium">
                      {reviewData.customer_name ||
                        reviewData.quotes?.customer?.full_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email:</span>
                    <span className="font-medium">
                      {reviewData.customer_email ||
                        reviewData.quotes?.customer?.email}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="font-bold text-lg text-purple-600">
                      $
                      {reviewData.total?.toFixed(2) ||
                        reviewData.quotes?.total?.toFixed(2) ||
                        "0.00"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Method Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedPaymentMethod}
                onChange={(e) => handlePaymentMethodChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                disabled={isProcessingPayment}
              >
                <option value="">Select payment method...</option>
                {paymentMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount Paid */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount Paid <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  disabled={isProcessingPayment}
                />
              </div>
            </div>

            {/* Balance Display */}
            {reviewData && (
              <div className="mb-4">
                {(() => {
                  const totalAmount = reviewData.total || reviewData.quotes?.total || 0;
                  const paid = parseFloat(amountPaid) || 0;
                  const balanceDue = Math.max(0, totalAmount - paid);
                  const isPaidInFull = paid >= totalAmount;
                  const isAccountPayment = selectedPaymentMethodCode === 'account';
                  const isZeroPayment = paid === 0 && amountPaid !== "";

                  // Account payment with balance due - show in blue
                  if (isAccountPayment && balanceDue > 0) {
                    return (
                      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-blue-700">
                            Balance Due (Net 30):
                          </span>
                          <span className="font-bold text-blue-700">
                            ${balanceDue.toFixed(2)}
                          </span>
                        </div>
                        {paid > 0 && (
                          <div className="flex items-center justify-between mt-1 text-xs text-blue-600">
                            <span>Upfront payment:</span>
                            <span>${paid.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className={`p-3 rounded-lg ${isPaidInFull ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                      {isZeroPayment && !isAccountPayment && (
                        <div className="flex items-start gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-amber-800">
                            This will create an order with full balance due.
                          </p>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${isPaidInFull ? 'text-green-700' : 'text-amber-700'}`}>
                          {isPaidInFull ? 'Paid in Full' : 'Balance Due:'}
                        </span>
                        <span className={`font-bold ${isPaidInFull ? 'text-green-700' : 'text-amber-700'}`}>
                          {isPaidInFull ? (
                            <span className="flex items-center gap-1">
                              <Check className="w-4 h-4" />
                              ${paid.toFixed(2)}
                            </span>
                          ) : (
                            `$${balanceDue.toFixed(2)}`
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Optional Remarks */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Remarks (Optional)
              </label>
              <textarea
                value={paymentRemarks}
                onChange={(e) => setPaymentRemarks(e.target.value)}
                placeholder="Add any notes about this payment (e.g., reference number, transaction ID, etc.)..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                disabled={isProcessingPayment}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedPaymentMethod("");
                  setSelectedPaymentMethodCode("");
                  setPaymentRemarks("");
                  setAmountPaid("");
                }}
                disabled={isProcessingPayment}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleManualPayment}
                disabled={
                  isProcessingPayment ||
                  !selectedPaymentMethod ||
                  amountPaid === "" ||
                  isNaN(parseFloat(amountPaid)) ||
                  parseFloat(amountPaid) < 0
                }
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {isProcessingPayment ? "Processing..." : "Confirm Payment"}
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

      {/* Document Grouping Modals */}
      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => {
          setShowCreateGroupModal(false);
          setPendingAssignItem(null);
        }}
        onCreate={handleCreateGroup}
      />

      <EditGroupModal
        isOpen={showEditGroupModal}
        onClose={() => {
          setShowEditGroupModal(false);
          setSelectedGroupForEdit(null);
        }}
        group={selectedGroupForEdit}
        onSave={handleEditGroup}
      />

      <AssignItemsModal
        isOpen={showAssignModal}
        onClose={() => {
          setShowAssignModal(false);
          setSelectedGroupForAssign(null);
        }}
        groupId={selectedGroupForAssign || ""}
        groupLabel={
          documentGroups.find((g) => g.group_id === selectedGroupForAssign)
            ?.group_label || ""
        }
        unassignedItems={unassignedItems}
        onAssign={handleAssignMultipleToGroup}
      />

      {/* Claim Override Confirmation Modal */}
      {showOverrideConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold">Take Over Review?</h3>
            </div>

            <p className="text-gray-600 mb-4">
              This review is currently claimed by <strong>{assignedStaffName || "another staff member"}</strong>
              {assignedStaffRole && (
                <span className="text-gray-500"> ({assignedStaffRole.replace(/_/g, " ")})</span>
              )}.
              Taking over will remove their claim and assign it to you.
            </p>

            <p className="text-sm text-gray-500 mb-6">
              Any unsaved changes by the previous reviewer may be lost.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowOverrideConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClaimOverride}
                disabled={isClaimingReview}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {isClaimingReview ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
                Take Over Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HITLReviewDetail;
