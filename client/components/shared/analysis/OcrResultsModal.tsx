import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  FileText,
  CheckCircle,
  Globe,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  Download,
  Search,
  RefreshCw,
  Sparkles,
  DollarSign,
  Pencil,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OcrPageData {
  page_number: number;
  word_count: number;
  confidence_score: number | null;
  raw_text: string | null;
  detected_language: string | null;
  language_confidence: number | null;
}

interface OcrApplyData {
  pages: number;
  words: number;
  language: string;
}

interface OcrBatchFile {
  id: string;
  filename: string;
  status: string;
  page_count: number;
  word_count: number;
  file_size: number;
  error_message: string | null;
  file_group_id: string | null;
  original_filename: string | null;
  chunk_index: number | null;
  pages?: OcrPageData[];
}

interface DisplayRow {
  id: string;
  fileGroupId: string | null;
  filename: string;
  isGrouped: boolean;
  chunkCount: number;
  chunkFileIds: string[];
  totalPages: number;
  totalWords: number;
  status: string;
  files: OcrBatchFile[];
}

interface AnalysisJob {
  id: string;
  status: string;
  totalFiles?: number;
  completedFiles?: number;
  failedFiles?: number;
  totalDocumentsFound?: number;
  startedAt?: string;
  completedAt?: string;
  staffName?: string;
}

interface SubDocument {
  type: string;
  holderName: string;
  pageRange: string;
  language: string;
}

interface AnalysisResult {
  id: string;
  fileId: string;
  originalFilename: string;
  fileGroupId: string | null;
  chunkCount: number;
  documentType: string;
  documentTypeConfidence: number;
  holderName: string;
  holderNameNormalized: string;
  language: string;
  languageName: string;
  issuingCountry: string;
  issuingCountryCode: string;
  issuingAuthority: string;
  documentDate: string | null;
  documentNumber: string | null;
  wordCount: number;
  pageCount: number;
  billablePages: number;
  complexity: "easy" | "medium" | "hard";
  complexityConfidence: number;
  complexityFactors: string[];
  complexityReasoning: string;
  documentCount: number;
  subDocuments: SubDocument[] | null;
  actionableItems: Array<{
    type: "warning" | "note" | "suggestion";
    message: string;
  }>;
  processingStatus: "completed" | "failed";
  errorMessage: string | null;
}

interface PricingRow {
  analysisId: string;
  fileId: string;
  originalFilename: string;
  documentType: string;
  wordCount: number;
  pageCount: number;
  documentCount: number;

  // Editable (initialized from AI analysis + settings)
  billablePages: number;
  billablePagesOverridden: boolean;
  complexity: "easy" | "medium" | "hard";
  complexityMultiplier: number;
  baseRate: number;
  baseRateOverridden: boolean;

  // Calculated
  translationCost: number;
  lineTotal: number;
}

interface OcrResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Existing single-file mode
  fileId?: string;
  fileName?: string;
  showActions?: boolean;
  onApplyToQuote?: (data: OcrApplyData) => void;
  mode?: "view" | "select";
  // Batch mode
  batchId?: string;
}

// ---------------------------------------------------------------------------
// Language helpers
// ---------------------------------------------------------------------------

const languageNames: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  ru: "Russian",
  hi: "Hindi",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  no: "Norwegian",
  tr: "Turkish",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  tl: "Tagalog",
  uk: "Ukrainian",
  cs: "Czech",
  ro: "Romanian",
  hu: "Hungarian",
  el: "Greek",
  he: "Hebrew",
};

const languageFlags: Record<string, string> = {
  en: "\u{1F1EC}\u{1F1E7}",
  es: "\u{1F1EA}\u{1F1F8}",
  fr: "\u{1F1EB}\u{1F1F7}",
  de: "\u{1F1E9}\u{1F1EA}",
  it: "\u{1F1EE}\u{1F1F9}",
  pt: "\u{1F1E7}\u{1F1F7}",
  zh: "\u{1F1E8}\u{1F1F3}",
  ja: "\u{1F1EF}\u{1F1F5}",
  ko: "\u{1F1F0}\u{1F1F7}",
  ar: "\u{1F1F8}\u{1F1E6}",
  ru: "\u{1F1F7}\u{1F1FA}",
  hi: "\u{1F1EE}\u{1F1F3}",
  nl: "\u{1F1F3}\u{1F1F1}",
  pl: "\u{1F1F5}\u{1F1F1}",
  sv: "\u{1F1F8}\u{1F1EA}",
  da: "\u{1F1E9}\u{1F1F0}",
  fi: "\u{1F1EB}\u{1F1EE}",
  no: "\u{1F1F3}\u{1F1F4}",
  tr: "\u{1F1F9}\u{1F1F7}",
  th: "\u{1F1F9}\u{1F1ED}",
  vi: "\u{1F1FB}\u{1F1F3}",
  id: "\u{1F1EE}\u{1F1E9}",
  ms: "\u{1F1F2}\u{1F1FE}",
  tl: "\u{1F1F5}\u{1F1ED}",
  uk: "\u{1F1FA}\u{1F1E6}",
  cs: "\u{1F1E8}\u{1F1FF}",
  ro: "\u{1F1F7}\u{1F1F4}",
  hu: "\u{1F1ED}\u{1F1FA}",
  el: "\u{1F1EC}\u{1F1F7}",
  he: "\u{1F1EE}\u{1F1F1}",
};

function getLanguageName(code: string | null): string {
  if (!code) return "Unknown";
  return languageNames[code.toLowerCase()] || code.toUpperCase();
}

function getLanguageFlag(code: string | null): string {
  if (!code) return "\u{1F310}";
  return languageFlags[code.toLowerCase()] || "\u{1F310}";
}

function getMostCommonLanguage(pages: OcrPageData[]): string | null {
  const counts: Record<string, number> = {};
  for (const page of pages) {
    const lang = page.detected_language;
    if (lang) {
      counts[lang] = (counts[lang] || 0) + 1;
    }
  }
  let maxLang: string | null = null;
  let maxCount = 0;
  for (const [lang, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxLang = lang;
    }
  }
  return maxLang;
}

// ---------------------------------------------------------------------------
// Confidence color helpers
// ---------------------------------------------------------------------------

function confidenceColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 70) return "text-yellow-600";
  return "text-red-600";
}

function confidenceBgColor(score: number): string {
  if (score >= 90) return "bg-green-50 border-green-200";
  if (score >= 70) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

function confidenceIconColor(score: number): string {
  if (score >= 90) return "text-green-500";
  if (score >= 70) return "text-yellow-500";
  return "text-red-500";
}

// ---------------------------------------------------------------------------
// Document type labels
// ---------------------------------------------------------------------------

const documentTypeLabels: Record<string, string> = {
  birth_certificate: "Birth Certificate",
  death_certificate: "Death Certificate",
  marriage_certificate: "Marriage Certificate",
  divorce_decree: "Divorce Decree",
  diploma: "Diploma",
  transcript: "Academic Transcript",
  degree: "Degree Certificate",
  passport: "Passport",
  drivers_license: "Driver's License",
  national_id: "National ID",
  immigration_document: "Immigration Document",
  court_order: "Court Order",
  power_of_attorney: "Power of Attorney",
  affidavit: "Affidavit",
  corporate_document: "Corporate Document",
  medical_record: "Medical Record",
  tax_document: "Tax Document",
  bank_statement: "Bank Statement",
  employment_letter: "Employment Letter",
  other: "Other Document",
};

// ---------------------------------------------------------------------------
// Complexity styles
// ---------------------------------------------------------------------------

const complexityStyles: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  easy: { bg: "bg-green-100", text: "text-green-700", label: "Easy" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Medium" },
  hard: { bg: "bg-red-100", text: "text-red-700", label: "Hard" },
};

const actionableIcons: Record<string, string> = {
  warning: "\u26A0\uFE0F",
  note: "\u2139\uFE0F",
  suggestion: "\uD83D\uDCA1",
};

// ---------------------------------------------------------------------------
// Pricing helpers
// ---------------------------------------------------------------------------

const complexityMultipliers: Record<string, number> = {
  easy: 1.0,
  medium: 1.15,
  hard: 1.25,
};

function recalcBillablePages(
  wordCount: number,
  complexityMultiplier: number,
  wordsPerPage: number
): number {
  const raw = (wordCount / wordsPerPage) * complexityMultiplier;
  const rounded = Math.ceil(raw * 10) / 10;
  return Math.max(rounded, 1.0);
}

function calcTranslationCost(
  billablePages: number,
  baseRate: number,
  languageMultiplier: number = 1.0
): number {
  return Math.ceil((billablePages * baseRate * languageMultiplier) / 2.5) * 2.5;
}

// ---------------------------------------------------------------------------
// File grouping
// ---------------------------------------------------------------------------

function groupFiles(files: OcrBatchFile[]): DisplayRow[] {
  const groups = new Map<string, OcrBatchFile[]>();
  const standalone: OcrBatchFile[] = [];

  files.forEach((f) => {
    if (f.file_group_id) {
      if (!groups.has(f.file_group_id)) groups.set(f.file_group_id, []);
      groups.get(f.file_group_id)!.push(f);
    } else {
      standalone.push(f);
    }
  });

  const displayRows: DisplayRow[] = [];

  groups.forEach((chunks, groupId) => {
    const sorted = chunks.sort(
      (a, b) => (a.chunk_index || 0) - (b.chunk_index || 0)
    );
    const primary = sorted[0];
    displayRows.push({
      id: primary.id,
      fileGroupId: groupId,
      filename: primary.original_filename || primary.filename,
      isGrouped: true,
      chunkCount: sorted.length,
      chunkFileIds: sorted.map((c) => c.id),
      totalPages: sorted.reduce((sum, c) => sum + (c.page_count || 0), 0),
      totalWords: sorted.reduce((sum, c) => sum + (c.word_count || 0), 0),
      status: sorted.every((c) => c.status === "completed")
        ? "completed"
        : sorted.every((c) => c.status === "failed")
          ? "failed"
          : "partial",
      files: sorted,
    });
  });

  standalone.forEach((f) => {
    displayRows.push({
      id: f.id,
      fileGroupId: null,
      filename: f.filename,
      isGrouped: false,
      chunkCount: 1,
      chunkFileIds: [f.id],
      totalPages: f.page_count || 0,
      totalWords: f.word_count || 0,
      status: f.status,
      files: [f],
    });
  });

  return displayRows;
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 bg-gray-200 rounded" />
        <div className="h-4 bg-gray-200 rounded w-24" />
      </div>
      <div className="h-6 bg-gray-200 rounded w-32 mt-2" />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden animate-pulse">
      <div className="bg-gray-50 px-4 py-3 flex gap-4">
        {["w-12", "w-16", "w-24", "w-20", "w-16"].map((w, i) => (
          <div key={i} className={`h-4 bg-gray-200 rounded ${w}`} />
        ))}
      </div>
      {[1, 2, 3].map((row) => (
        <div key={row} className="px-4 py-3 flex gap-4 border-t border-gray-100">
          {["w-8", "w-12", "w-16", "w-20", "w-12"].map((w, i) => (
            <div key={i} className={`h-4 bg-gray-200 rounded ${w}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OcrResultsModal
// ---------------------------------------------------------------------------

export default function OcrResultsModal({
  isOpen,
  onClose,
  fileId,
  fileName,
  batchId,
  showActions = false,
  onApplyToQuote,
  mode = "view",
}: OcrResultsModalProps) {
  const isBatchMode = !!batchId;

  // Existing states
  const [isLoading, setIsLoading] = useState(true);
  const [files, setFiles] = useState<OcrBatchFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Per-file page details
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [filePageData, setFilePageData] = useState<Record<string, OcrPageData[]>>({});
  const [loadingFilePages, setLoadingFilePages] = useState<Set<string>>(new Set());
  const [expandedPage, setExpandedPage] = useState<number | null>(null);
  const [copiedPage, setCopiedPage] = useState<number | null>(null);

  // Single-file mode states
  const [singleFilePages, setSingleFilePages] = useState<OcrPageData[]>([]);

  // Tab state (batch mode only)
  const [activeTab, setActiveTab] = useState<string>("ocr");

  // Selection state (batch mode only)
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  // Analysis state (batch mode only)
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analyseError, setAnalyseError] = useState<string | null>(null);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);

  // Pricing state (batch mode only)
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);
  const [pricingBaseRate, setPricingBaseRate] = useState<number>(0);
  const [pricingWordsPerPage, setPricingWordsPerPage] = useState<number>(225);
  const [pricingCertPrice, setPricingCertPrice] = useState<number>(50);
  const [pricingRatesLoaded, setPricingRatesLoaded] = useState(false);
  const [showUseInQuoteModal, setShowUseInQuoteModal] = useState(false);

  // Grouped display rows
  const displayRows = useMemo(() => groupFiles(files), [files]);

  // Computed totals
  const totalPages = useMemo(
    () => displayRows.reduce((sum, r) => sum + r.totalPages, 0),
    [displayRows]
  );
  const totalWords = useMemo(
    () => displayRows.reduce((sum, r) => sum + r.totalWords, 0),
    [displayRows]
  );

  const completedRows = useMemo(
    () => displayRows.filter((r) => r.status === "completed"),
    [displayRows]
  );

  const isSelectable = (row: DisplayRow) => row.status === "completed";

  // -------------------------------------------------------------------------
  // File selection
  // -------------------------------------------------------------------------

  const toggleFile = (row: DisplayRow) => {
    if (!isSelectable(row)) return;
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) {
        next.delete(row.id);
      } else {
        next.add(row.id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedFileIds.size === completedRows.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(completedRows.map((r) => r.id)));
    }
  };

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchBatchData = useCallback(async () => {
    if (!batchId) return;
    setIsLoading(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

      // 1. Fetch batch files
      const response = await fetch(
        `${supabaseUrl}/functions/v1/ocr-batch-results?batchId=${encodeURIComponent(batchId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch batch results (${response.status})`);
      }

      const data = await response.json();
      const batchFiles: OcrBatchFile[] = (data.files || []).map(
        (f: Record<string, unknown>) => ({
          id: f.id as string,
          filename: f.filename as string,
          status: f.status as string,
          page_count: (f.page_count as number) || 0,
          word_count: (f.word_count as number) || 0,
          file_size: (f.file_size as number) || 0,
          error_message: (f.error_message as string) || null,
          file_group_id: (f.file_group_id as string) || null,
          original_filename: (f.original_filename as string) || null,
          chunk_index: f.chunk_index != null ? (f.chunk_index as number) : null,
        })
      );
      setFiles(batchFiles);

      // 2. Check for existing AI analysis
      try {
        const analysisRes = await fetch(
          `${supabaseUrl}/functions/v1/get-ocr-ai-analysis?batchId=${encodeURIComponent(batchId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (analysisRes.ok) {
          const analysisData = await analysisRes.json();
          if (analysisData.success && analysisData.job) {
            setAnalysisJob(analysisData.job);
            setAnalysisResults(analysisData.results || []);
          }
        }
      } catch {
        // No analysis yet - that's fine
        console.log("No existing analysis for batch");
      }
    } catch (err) {
      console.error("Error fetching batch data:", err);
      setError((err as Error).message || "Failed to load batch results");
    } finally {
      setIsLoading(false);
    }
  }, [batchId]);

  // Fetch page details for a specific file
  const fetchFilePages = useCallback(
    async (fileId: string) => {
      if (filePageData[fileId]) return; // Already cached

      setLoadingFilePages((prev) => new Set(prev).add(fileId));
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

        const response = await fetch(
          `${supabaseUrl}/functions/v1/ocr-batch-results?fileId=${encodeURIComponent(fileId)}&includeText=true`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) throw new Error("Failed to fetch file pages");

        const data = await response.json();
        const pages: OcrPageData[] = (data.file?.pages || []).map(
          (p: Record<string, unknown>) => ({
            page_number: p.page_number as number,
            word_count: (p.word_count as number) || 0,
            confidence_score: (p.confidence_score as number) ?? null,
            raw_text: (p.raw_text as string) ?? null,
            detected_language: (p.detected_language as string) ?? null,
            language_confidence: (p.language_confidence as number) ?? null,
          })
        );

        setFilePageData((prev) => ({ ...prev, [fileId]: pages }));
      } catch (err) {
        console.error("Error fetching file pages:", err);
        toast.error("Failed to load page details");
      } finally {
        setLoadingFilePages((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
      }
    },
    [filePageData]
  );

  // Fetch single file page data
  const fetchSingleFileData = useCallback(async () => {
    if (!fileId) return;
    setIsLoading(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/ocr-batch-results?fileId=${encodeURIComponent(fileId)}&includeText=true`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch file results (${response.status})`);
      }

      const data = await response.json();
      const pages: OcrPageData[] = (data.file?.pages || []).map(
        (p: Record<string, unknown>) => ({
          page_number: p.page_number as number,
          word_count: (p.word_count as number) || 0,
          confidence_score: (p.confidence_score as number) ?? null,
          raw_text: (p.raw_text as string) ?? null,
          detected_language: (p.detected_language as string) ?? null,
          language_confidence: (p.language_confidence as number) ?? null,
        })
      );

      setSingleFilePages(pages);
    } catch (err) {
      console.error("Error fetching single file data:", err);
      setError((err as Error).message || "Failed to load file results");
    } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (isOpen && batchId) {
      fetchBatchData();
    } else if (isOpen && fileId) {
      fetchSingleFileData();
    }
    if (!isOpen) {
      setFiles([]);
      setFilePageData({});
      setExpandedFileId(null);
      setExpandedPage(null);
      setError(null);
      setCopiedPage(null);
      setCopiedAll(false);
      setSelectedFileIds(new Set());
      setActiveTab("ocr");
      setAnalyseError(null);
      setSingleFilePages([]);
      setPricingRows([]);
      setPricingRatesLoaded(false);
      setShowUseInQuoteModal(false);
    }
  }, [isOpen, batchId, fileId, fetchBatchData, fetchSingleFileData]);

  // -------------------------------------------------------------------------
  // Polling for background jobs
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!analysisJob || analysisJob.status !== "processing") return;

    const interval = setInterval(async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

        const res = await fetch(
          `${supabaseUrl}/functions/v1/get-ocr-ai-analysis?jobId=${encodeURIComponent(analysisJob.id)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (!res.ok) return;

        const data = await res.json();
        if (data.success && data.job) {
          setAnalysisJob(data.job);
          setAnalysisResults(data.results || []);

          if (["completed", "failed", "partial"].includes(data.job.status)) {
            clearInterval(interval);
          }
        }
      } catch {
        // Polling failure - silently retry next interval
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [analysisJob?.id, analysisJob?.status]);

  // -------------------------------------------------------------------------
  // Pricing: fetch rate data
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isBatchMode || pricingRatesLoaded) return;

    const completedResults = analysisResults.filter(
      (r) => r.processingStatus === "completed"
    );
    if (completedResults.length === 0) return;

    const fetchRates = async () => {
      try {
        const { data: settings } = await supabase
          .from("app_settings")
          .select("setting_key, setting_value")
          .in("setting_key", ["base_rate", "words_per_page"]);

        const br = parseFloat(
          settings?.find((s: { setting_key: string }) => s.setting_key === "base_rate")
            ?.setting_value || "65"
        );
        const wpp = parseInt(
          settings?.find((s: { setting_key: string }) => s.setting_key === "words_per_page")
            ?.setting_value || "225",
          10
        );

        setPricingBaseRate(br);
        setPricingWordsPerPage(wpp);

        const { data: defaultCert } = await supabase
          .from("certification_types")
          .select("id, name, price")
          .eq("code", "notarization")
          .single();

        setPricingCertPrice(defaultCert?.price || 50);
        setPricingRatesLoaded(true);
      } catch {
        // Use defaults
        setPricingBaseRate(65);
        setPricingWordsPerPage(225);
        setPricingCertPrice(50);
        setPricingRatesLoaded(true);
      }
    };

    fetchRates();
  }, [isBatchMode, analysisResults, pricingRatesLoaded]);

  // -------------------------------------------------------------------------
  // Pricing: initialize rows when analysis results + rates are ready
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!pricingRatesLoaded || pricingBaseRate === 0) return;

    const completedResults = analysisResults.filter(
      (r) => r.processingStatus === "completed"
    );
    if (completedResults.length === 0) {
      setPricingRows([]);
      return;
    }

    const rows: PricingRow[] = completedResults.map((r) => {
      const mult = complexityMultipliers[r.complexity] || 1.0;
      const billable =
        r.billablePages ||
        recalcBillablePages(r.wordCount, mult, pricingWordsPerPage);
      const transCost = calcTranslationCost(billable, pricingBaseRate);

      return {
        analysisId: r.id,
        fileId: r.fileId,
        originalFilename: r.originalFilename,
        documentType: r.documentType,
        wordCount: r.wordCount,
        pageCount: r.pageCount,
        documentCount: r.documentCount || 1,
        billablePages: billable,
        billablePagesOverridden: false,
        complexity: r.complexity,
        complexityMultiplier: mult,
        baseRate: pricingBaseRate,
        baseRateOverridden: false,
        translationCost: transCost,
        lineTotal: transCost,
      };
    });

    setPricingRows(rows);
  }, [analysisResults, pricingRatesLoaded, pricingBaseRate, pricingWordsPerPage]);

  // -------------------------------------------------------------------------
  // Pricing: computed totals
  // -------------------------------------------------------------------------

  const pricingTotalDocuments = useMemo(
    () => pricingRows.reduce((sum, r) => sum + r.documentCount, 0),
    [pricingRows]
  );
  const pricingTranslationSubtotal = useMemo(
    () => pricingRows.reduce((sum, r) => sum + r.translationCost, 0),
    [pricingRows]
  );
  const pricingCertificationEstimate = pricingTotalDocuments * pricingCertPrice;
  const pricingEstimatedTotal =
    pricingTranslationSubtotal + pricingCertificationEstimate;

  // Whether pricing tab should be visible
  const showPricingTab =
    isBatchMode &&
    analysisResults.length > 0 &&
    analysisResults.some((r) => r.processingStatus === "completed");

  // -------------------------------------------------------------------------
  // Pricing: row update handler
  // -------------------------------------------------------------------------

  const updatePricingRow = (
    analysisId: string,
    field: string,
    value: string | number
  ) => {
    setPricingRows((prev) =>
      prev.map((row) => {
        if (row.analysisId !== analysisId) return row;

        const updated = { ...row };

        if (field === "complexity") {
          const cVal = value as "easy" | "medium" | "hard";
          updated.complexity = cVal;
          updated.complexityMultiplier = complexityMultipliers[cVal] || 1.0;
          // Recalc billable pages unless manually overridden
          if (!updated.billablePagesOverridden) {
            updated.billablePages = recalcBillablePages(
              updated.wordCount,
              updated.complexityMultiplier,
              pricingWordsPerPage
            );
          }
        } else if (field === "billablePages") {
          const numVal = parseFloat(value as string);
          if (!isNaN(numVal) && numVal >= 0) {
            updated.billablePages = numVal;
            updated.billablePagesOverridden = true;
          }
        } else if (field === "baseRate") {
          const numVal = parseFloat(value as string);
          if (!isNaN(numVal) && numVal >= 0) {
            updated.baseRate = numVal;
            updated.baseRateOverridden = true;
          }
        }

        // Recalculate costs
        updated.translationCost = calcTranslationCost(
          updated.billablePages,
          updated.baseRate
        );
        updated.lineTotal = updated.translationCost;

        return updated;
      })
    );
  };

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleAnalyse = async () => {
    if (selectedFileIds.size === 0) return;

    setIsAnalysing(true);
    setAnalyseError(null);

    try {
      const staffSession = JSON.parse(
        localStorage.getItem("staffSession") || "{}"
      );

      const fileIdsToSend = Array.from(selectedFileIds);

      const response = await supabase.functions.invoke("analyse-ocr-batch", {
        body: {
          batchId,
          fileIds: fileIdsToSend,
          staffId: staffSession.staffId,
          staffName: staffSession.staffName,
          staffEmail: staffSession.staffEmail,
        },
      });

      if (response.error) throw new Error(response.error.message);

      const data = response.data as Record<string, unknown>;

      if (data.mode === "sync") {
        setAnalysisResults(data.results as AnalysisResult[]);
        setAnalysisJob({
          id: data.jobId as string,
          status: "completed",
          totalFiles: fileIdsToSend.length,
          completedFiles: (data.results as AnalysisResult[]).filter(
            (r: AnalysisResult) => r.processingStatus === "completed"
          ).length,
          failedFiles: (data.results as AnalysisResult[]).filter(
            (r: AnalysisResult) => r.processingStatus === "failed"
          ).length,
          totalDocumentsFound: (data.totalDocumentsFound as number) || undefined,
          completedAt: new Date().toISOString(),
          staffName: staffSession.staffName,
        });
        setActiveTab("analysis");
        toast.success("AI analysis complete");
      } else {
        setAnalysisJob({
          id: data.jobId as string,
          status: "processing",
          totalFiles: fileIdsToSend.length,
          completedFiles: 0,
          staffName: staffSession.staffName,
          startedAt: new Date().toISOString(),
        });
        setActiveTab("analysis");
        toast.success("AI analysis started in background");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to start analysis";
      setAnalyseError(message);
      toast.error(message);
    } finally {
      setIsAnalysing(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!analysisJob?.id) return;
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(
        `${supabaseUrl}/functions/v1/get-ocr-ai-analysis?jobId=${encodeURIComponent(analysisJob.id)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) throw new Error("Refresh failed");
      const data = await res.json();
      if (data.success && data.job) {
        setAnalysisJob(data.job);
        setAnalysisResults(data.results || []);
      }
    } catch {
      toast.error("Failed to refresh status");
    }
  };

  const handleReanalyse = () => {
    // Switch to OCR tab, pre-select previously analysed files
    if (analysisResults.length > 0) {
      const previousFileIds = new Set(analysisResults.map((r) => r.fileId));
      // Match against display rows
      const matchedIds = new Set<string>();
      displayRows.forEach((row) => {
        if (previousFileIds.has(row.id) || row.chunkFileIds.some((id) => previousFileIds.has(id))) {
          matchedIds.add(row.id);
        }
      });
      setSelectedFileIds(matchedIds);
    }
    setActiveTab("ocr");
  };

  const handleExpandFile = (fileId: string) => {
    if (expandedFileId === fileId) {
      setExpandedFileId(null);
      setExpandedPage(null);
    } else {
      setExpandedFileId(fileId);
      setExpandedPage(null);
      fetchFilePages(fileId);
    }
  };

  const handleCopyPageText = async (pageNum: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPage(pageNum);
      toast.success(`Page ${pageNum} text copied`);
      setTimeout(() => setCopiedPage(null), 2000);
    } catch {
      toast.error("Failed to copy text");
    }
  };

  const handleCopyAllText = async () => {
    const allText: string[] = [];

    if (!isBatchMode && singleFilePages.length > 0) {
      // Single-file mode: copy all page text
      for (const p of singleFilePages) {
        if (p.raw_text) {
          allText.push(
            `--- ${fileName || "File"} - Page ${p.page_number} ---\n${p.raw_text}`
          );
        }
      }
    } else {
      // Batch mode: copy all loaded text from expanded files
      for (const row of displayRows) {
        for (const file of row.files) {
          const pages = filePageData[file.id];
          if (pages) {
            for (const p of pages) {
              if (p.raw_text) {
                allText.push(
                  `--- ${row.filename} - Page ${p.page_number} ---\n${p.raw_text}`
                );
              }
            }
          }
        }
      }
    }

    if (allText.length === 0) {
      toast.error(
        isBatchMode
          ? "No text available. Expand files to load their text first."
          : "No text available."
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(allText.join("\n\n"));
      setCopiedAll(true);
      toast.success("All loaded text copied to clipboard");
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast.error("Failed to copy text");
    }
  };

  const handleApplyToQuote = () => {
    if (!onApplyToQuote) return;

    if (!isBatchMode) {
      // Single-file mode
      const sfPages = singleFilePages.reduce((s, p) => s + (p.page_number ? 1 : 0), 0);
      const sfWords = singleFilePages.reduce((s, p) => s + p.word_count, 0);
      const primaryLanguage = getMostCommonLanguage(singleFilePages);
      onApplyToQuote({
        pages: sfPages || singleFilePages.length,
        words: sfWords,
        language: primaryLanguage || "en",
      });
      return;
    }

    // Batch mode: get all page data across all files
    const allPages: OcrPageData[] = [];
    for (const row of displayRows) {
      for (const file of row.files) {
        const pages = filePageData[file.id];
        if (pages) allPages.push(...pages);
      }
    }

    const primaryLanguage = getMostCommonLanguage(allPages);
    onApplyToQuote({
      pages: totalPages,
      words: totalWords,
      language: primaryLanguage || "en",
    });
  };

  const exportAnalysisCSV = () => {
    if (analysisResults.length === 0) return;

    const headers = [
      "Filename",
      "Document Type",
      "Holder Name",
      "Language",
      "Country",
      "Pages",
      "Words",
      "Billable Pages",
      "Complexity",
      "Doc Count",
      "Notes",
    ];
    const rows = analysisResults.map((r) => [
      r.originalFilename,
      documentTypeLabels[r.documentType] || r.documentType,
      r.holderName || "",
      r.languageName || "",
      r.issuingCountry || "",
      r.pageCount,
      r.wordCount,
      r.billablePages,
      r.complexity || "",
      r.documentCount || 1,
      (r.actionableItems || []).map((a) => a.message).join("; "),
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-analysis-${batchId?.slice(0, 8) || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpandedPage = (pageNum: number) => {
    setExpandedPage((prev) => (prev === pageNum ? null : pageNum));
  };

  // -------------------------------------------------------------------------
  // Pricing: Export CSV
  // -------------------------------------------------------------------------

  const exportPricingCSV = () => {
    if (pricingRows.length === 0) return;

    const headers = [
      "Filename",
      "Document Type",
      "Words",
      "Billable Pages",
      "Complexity",
      "Base Rate",
      "Translation Cost",
      "Doc Count",
    ];
    const rows = pricingRows.map((r) => [
      r.originalFilename,
      documentTypeLabels[r.documentType] || r.documentType,
      r.wordCount,
      r.billablePages,
      r.complexity,
      r.baseRate.toFixed(2),
      r.translationCost.toFixed(2),
      r.documentCount,
    ]);

    // Summary rows
    rows.push([] as unknown as (string | number)[]);
    rows.push([
      "Translation Subtotal",
      "",
      "",
      "",
      "",
      "",
      pricingTranslationSubtotal.toFixed(2),
      "",
    ]);
    rows.push([
      "Certification Estimate",
      "",
      "",
      "",
      "",
      "",
      pricingCertificationEstimate.toFixed(2),
      pricingTotalDocuments,
    ]);
    rows.push([
      "Estimated Total",
      "",
      "",
      "",
      "",
      "",
      pricingEstimatedTotal.toFixed(2),
      "",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pricing-estimate-${batchId?.slice(0, 8) || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // -------------------------------------------------------------------------
  // Render: Pricing tab content
  // -------------------------------------------------------------------------

  const renderPricingTab = () => {
    if (pricingRows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="p-4 bg-gray-100 rounded-full mb-4">
            <DollarSign className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No pricing data available
          </h3>
          <p className="text-sm text-gray-500 text-center max-w-md">
            Run AI analysis on the Analysis tab first, then pricing will be
            generated automatically.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Pricing Estimate
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Based on AI analysis &middot; Edit values below before creating
              quote
            </p>
          </div>
          <button
            onClick={() => setShowUseInQuoteModal(true)}
            disabled={pricingRows.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Use in Quote
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Editable Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                    File
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                    Type
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-700">
                    Words
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-700">
                    Billable
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-gray-700">
                    Complexity
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-700">
                    Rate
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-700">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pricingRows.map((row) => {
                  const docTypeLabel =
                    documentTypeLabels[row.documentType] || row.documentType;
                  return (
                    <React.Fragment key={row.analysisId}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-3 py-2.5">
                          <div
                            className="font-medium text-gray-900 truncate max-w-[180px]"
                            title={row.originalFilename}
                          >
                            {row.originalFilename}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                          {docTypeLabel}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">
                          {row.wordCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={row.billablePages}
                              onChange={(e) =>
                                updatePricingRow(
                                  row.analysisId,
                                  "billablePages",
                                  e.target.value
                                )
                              }
                              className={`w-[72px] px-2 py-1 border rounded text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                                row.billablePagesOverridden
                                  ? "bg-amber-50 border-amber-400"
                                  : "border-gray-300"
                              }`}
                            />
                            {row.billablePagesOverridden && (
                              <Pencil className="w-3 h-3 text-amber-500 flex-shrink-0" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <select
                            value={row.complexity}
                            onChange={(e) =>
                              updatePricingRow(
                                row.analysisId,
                                "complexity",
                                e.target.value
                              )
                            }
                            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <span className="text-gray-400 text-xs">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.baseRate}
                              onChange={(e) =>
                                updatePricingRow(
                                  row.analysisId,
                                  "baseRate",
                                  e.target.value
                                )
                              }
                              className={`w-[72px] px-2 py-1 border rounded text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                                row.baseRateOverridden
                                  ? "bg-amber-50 border-amber-400"
                                  : "border-gray-300"
                              }`}
                            />
                            {row.baseRateOverridden && (
                              <Pencil className="w-3 h-3 text-amber-500 flex-shrink-0" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-gray-900 tabular-nums whitespace-nowrap">
                          ${row.translationCost.toFixed(2)}
                        </td>
                      </tr>
                      {/* Document count sub-row */}
                      <tr className="bg-gray-50/50">
                        <td
                          colSpan={7}
                          className={`px-3 py-1 pl-6 text-xs ${
                            row.documentCount > 1
                              ? "text-amber-600 font-medium"
                              : "text-gray-500"
                          }`}
                        >
                          {row.documentCount > 1
                            ? `\u2514 ${row.documentCount} docs \u26A0\uFE0F`
                            : `\u2514 1 doc`}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Box */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Summary</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Translation Subtotal:</span>
              <span className="font-medium text-gray-900 tabular-nums">
                ${pricingTranslationSubtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">
                Certification Estimate:
              </span>
              <span className="font-medium text-gray-900 tabular-nums">
                ${pricingCertificationEstimate.toFixed(2)}
                <span className="text-xs text-gray-500 ml-1">
                  ({pricingTotalDocuments} doc
                  {pricingTotalDocuments !== 1 ? "s" : ""} &times; $
                  {pricingCertPrice.toFixed(2)})
                </span>
              </span>
            </div>
            <div className="flex justify-between pt-2 mt-2 border-t-2 border-gray-200">
              <span className="text-lg font-semibold text-gray-900">
                Estimated Total:
              </span>
              <span className="text-lg font-semibold text-gray-900 tabular-nums">
                ${pricingEstimatedTotal.toFixed(2)}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3 flex items-start gap-1">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Final total may vary based on language tier, certification type,
            rush fees, delivery, and tax. These are applied when creating
            quote.
          </p>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render: Single-file view (no tabs, no checkboxes)
  // -------------------------------------------------------------------------

  const renderSingleFileView = () => {
    if (isLoading) {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonTable />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="p-3 bg-red-50 rounded-full mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Failed to Load Results
          </h3>
          <p className="text-sm text-gray-600 mb-4 text-center max-w-md">
            {error}
          </p>
          <button
            onClick={fetchSingleFileData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      );
    }

    if (singleFilePages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="p-3 bg-gray-100 rounded-full mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No OCR Results
          </h3>
          <p className="text-sm text-gray-600 text-center max-w-md">
            No page data was found for this file.
          </p>
        </div>
      );
    }

    const sfTotalPages = singleFilePages.length;
    const sfTotalWords = singleFilePages.reduce(
      (sum, p) => sum + p.word_count,
      0
    );
    const sfAvgConfidence =
      singleFilePages.filter((p) => p.confidence_score != null).length > 0
        ? singleFilePages.reduce(
            (sum, p) => sum + (p.confidence_score || 0),
            0
          ) /
          singleFilePages.filter((p) => p.confidence_score != null).length
        : 0;
    const sfPrimaryLang = getMostCommonLanguage(singleFilePages);

    return (
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-700">Pages</span>
            </div>
            <div className="text-xl font-bold text-blue-900">{sfTotalPages}</div>
          </div>

          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-green-700">Words</span>
            </div>
            <div className="text-xl font-bold text-green-900">
              {sfTotalWords.toLocaleString()}
            </div>
          </div>

          <div
            className={`p-3 border rounded-lg ${confidenceBgColor(sfAvgConfidence * 100)}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle
                className={`w-4 h-4 ${confidenceIconColor(sfAvgConfidence * 100)}`}
              />
              <span className="text-xs font-medium text-gray-700">
                Confidence
              </span>
            </div>
            <div
              className={`text-xl font-bold ${confidenceColor(sfAvgConfidence * 100)}`}
            >
              {sfAvgConfidence > 0
                ? `${(sfAvgConfidence * 100).toFixed(1)}%`
                : "N/A"}
            </div>
          </div>

          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-medium text-purple-700">
                Language
              </span>
            </div>
            <div className="text-lg font-bold text-purple-900">
              {sfPrimaryLang
                ? `${getLanguageFlag(sfPrimaryLang)} ${getLanguageName(sfPrimaryLang)}`
                : "Unknown"}
            </div>
          </div>
        </div>

        {/* Per-page results table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">
                    Page
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">
                    Words
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">
                    Confidence
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">
                    Language
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">
                    Text
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {singleFilePages.map((page) => (
                  <React.Fragment key={page.page_number}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {page.page_number}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {page.word_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`font-medium ${confidenceColor(
                            (page.confidence_score || 0) * 100
                          )}`}
                        >
                          {page.confidence_score != null
                            ? `${(page.confidence_score * 100).toFixed(1)}%`
                            : "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {page.detected_language ? (
                          <span>
                            {getLanguageFlag(page.detected_language)}{" "}
                            {getLanguageName(page.detected_language)}
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {page.raw_text ? (
                          <button
                            onClick={() => toggleExpandedPage(page.page_number)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                          >
                            {expandedPage === page.page_number ? (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                Hide
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                View
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">No text</span>
                        )}
                      </td>
                    </tr>

                    {expandedPage === page.page_number && page.raw_text && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <div className="mx-4 my-3 border border-gray-200 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                              <span className="text-sm font-medium text-gray-700">
                                Page {page.page_number} Text
                              </span>
                              <button
                                onClick={() =>
                                  handleCopyPageText(
                                    page.page_number,
                                    page.raw_text!
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                              >
                                {copiedPage === page.page_number ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Copy
                                  </>
                                )}
                              </button>
                            </div>
                            <div className="p-4 max-h-[300px] overflow-y-auto bg-white">
                              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                                {page.raw_text}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render: OCR Results tab content
  // -------------------------------------------------------------------------

  const renderOcrResultsTab = () => {
    if (isLoading) {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonTable />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="p-3 bg-red-50 rounded-full mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Failed to Load Results
          </h3>
          <p className="text-sm text-gray-600 mb-4 text-center max-w-md">
            {error}
          </p>
          <button
            onClick={fetchBatchData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      );
    }

    if (displayRows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="p-3 bg-gray-100 rounded-full mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No OCR Results
          </h3>
          <p className="text-sm text-gray-600 text-center max-w-md">
            No files were found for this batch.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-700">
                Files & Pages
              </span>
            </div>
            <div className="text-xl font-bold text-blue-900">
              {displayRows.length} {displayRows.length === 1 ? "File" : "Files"}
            </div>
            <div className="text-sm text-blue-700">
              {totalPages} pages, {totalWords.toLocaleString()} words
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-medium text-amber-700">
                Billable Pages
              </span>
            </div>
            <div className="text-xl font-bold text-amber-900">
              {(totalWords / 225).toFixed(1)}
            </div>
            <div className="text-sm text-amber-700">at 225 words/page</div>
          </div>

          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-medium text-purple-700">
                Status
              </span>
            </div>
            <div className="text-xl font-bold text-purple-900">
              {completedRows.length}/{displayRows.length}
            </div>
            <div className="text-sm text-purple-700">files completed</div>
          </div>
        </div>

        {/* Select All */}
        <div className="flex items-center justify-between px-1">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={
                completedRows.length > 0 &&
                selectedFileIds.size === completedRows.length
              }
              onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              aria-label="Select all completed files"
            />
            <span className="font-medium text-gray-700">Select All</span>
          </label>
          {selectedFileIds.size > 0 && (
            <span className="text-sm text-gray-500">
              {selectedFileIds.size}/{completedRows.length} selected
            </span>
          )}
        </div>

        {/* File List */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="grid">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left w-10">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                    File
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-700">
                    Pages
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-700">
                    Words
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-700">
                    Billable
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-gray-700">
                    Status
                  </th>
                  <th className="px-3 py-2.5 w-10">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayRows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`hover:bg-gray-50 ${
                        expandedFileId === row.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedFileIds.has(row.id)}
                          onChange={() => toggleFile(row)}
                          disabled={!isSelectable(row)}
                          className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 disabled:opacity-40"
                          aria-label={`Select ${row.filename}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <span className="font-medium text-gray-900 truncate max-w-[240px]">
                            {row.filename}
                          </span>
                          {row.isGrouped && (
                            <span className="flex-shrink-0 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                              {row.chunkCount} chunks
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {row.status === "completed" || row.status === "partial"
                          ? row.totalPages
                          : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {row.status === "completed" || row.status === "partial"
                          ? row.totalWords.toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {row.status === "completed" || row.status === "partial"
                          ? (row.totalWords / 225).toFixed(1)
                          : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {row.status === "completed" ? (
                          <CheckCircle className="w-4 h-4 text-green-500 inline" />
                        ) : row.status === "failed" ? (
                          <AlertCircle className="w-4 h-4 text-red-500 inline" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-500 inline" />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.status === "completed" && (
                          <button
                            onClick={() => handleExpandFile(row.files[0].id)}
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                            aria-label={`${expandedFileId === row.files[0].id ? "Collapse" : "Expand"} ${row.filename}`}
                          >
                            {expandedFileId === row.files[0].id ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Expanded per-page details */}
                    {expandedFileId === row.files[0].id && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="bg-gray-50 border-t border-gray-200">
                            {row.isGrouped ? (
                              // Show all chunks
                              row.files.map((file) => (
                                <FilePageDetails
                                  key={file.id}
                                  file={file}
                                  pages={filePageData[file.id]}
                                  isLoading={loadingFilePages.has(file.id)}
                                  expandedPage={expandedPage}
                                  copiedPage={copiedPage}
                                  onTogglePage={toggleExpandedPage}
                                  onCopyPage={handleCopyPageText}
                                  onLoadPages={() => fetchFilePages(file.id)}
                                  showChunkHeader
                                />
                              ))
                            ) : (
                              <FilePageDetails
                                file={row.files[0]}
                                pages={filePageData[row.files[0].id]}
                                isLoading={loadingFilePages.has(row.files[0].id)}
                                expandedPage={expandedPage}
                                copiedPage={copiedPage}
                                onTogglePage={toggleExpandedPage}
                                onCopyPage={handleCopyPageText}
                                onLoadPages={() => fetchFilePages(row.files[0].id)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render: AI Analysis tab content
  // -------------------------------------------------------------------------

  const renderAnalysisTab = () => {
    // No analysis yet
    if (!analysisJob) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="p-4 bg-gray-100 rounded-full mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No AI analysis has been run for this batch
          </h3>
          <p className="text-sm text-gray-500 text-center max-w-md">
            Select files in the OCR Results tab and click "Analyse Selected" to
            start document analysis.
          </p>
        </div>
      );
    }

    // Processing
    if (analysisJob.status === "processing") {
      const total = analysisJob.totalFiles || 0;
      const completed = analysisJob.completedFiles || 0;
      const pct = total > 0 ? (completed / total) * 100 : 0;

      return (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-10 h-10 text-violet-600 animate-spin mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            AI Analysis in Progress
          </h3>
          <div className="w-64 mb-3">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-600 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">
            {completed} of {total} files analyzed
          </p>
          {analysisJob.startedAt && (
            <p className="text-xs text-gray-400 mb-1">
              Started:{" "}
              {new Date(analysisJob.startedAt).toLocaleTimeString()}
              {analysisJob.staffName && ` by ${analysisJob.staffName}`}
            </p>
          )}
          <p className="text-xs text-gray-400 mb-4">
            You'll receive an email when complete.
          </p>
          <button
            onClick={handleRefreshStatus}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Status
          </button>
        </div>
      );
    }

    // Failed
    if (analysisJob.status === "failed") {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="p-4 bg-red-50 rounded-full mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Analysis Failed
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            The AI analysis encountered an error. You can try re-analysing.
          </p>
          <button
            onClick={handleReanalyse}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-medium"
          >
            Re-analyse
          </button>
        </div>
      );
    }

    // Results (completed or partial)
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-gray-600">
            <p>
              Analysis completed{" "}
              {analysisJob.completedAt
                ? new Date(analysisJob.completedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }) +
                  " at " +
                  new Date(analysisJob.completedAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : ""}
            </p>
            <p>
              {analysisResults.length} file
              {analysisResults.length !== 1 ? "s" : ""} analyzed
              {analysisJob.totalDocumentsFound != null &&
                analysisJob.totalDocumentsFound > 0 && (
                  <>
                    {" \u00B7 "}
                    {analysisJob.totalDocumentsFound} document
                    {analysisJob.totalDocumentsFound !== 1 ? "s" : ""} detected
                  </>
                )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReanalyse}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-analyse
            </button>
            <button
              onClick={exportAnalysisCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {analysisJob.status === "partial" && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            Some files could not be analyzed. Results are partial.
          </div>
        )}

        {/* Result Cards */}
        {analysisResults.map((result) => (
          <AnalysisResultCardComponent key={result.id} result={result} />
        ))}

        {analysisResults.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">
            No analysis results available.
          </div>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!isOpen) return null;

  // ---------------------------------------------------------------------------
  // Single-file mode render
  // ---------------------------------------------------------------------------
  if (!isBatchMode) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  OCR Results
                </h2>
                {fileName && (
                  <p className="text-sm text-gray-500 mt-0.5">{fileName}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {renderSingleFileView()}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              {showActions && !isLoading && !error && singleFilePages.length > 0 && (
                <button
                  onClick={handleCopyAllText}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-white text-sm font-medium text-gray-700 transition-colors"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-4 h-4 text-green-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy All Text
                    </>
                  )}
                </button>
              )}
              {showActions && onApplyToQuote && !isLoading && !error && singleFilePages.length > 0 && (
                <button
                  onClick={handleApplyToQuote}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Apply to Quote
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white text-sm font-medium text-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Batch mode render
  // ---------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                OCR Batch Results
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {!isLoading && (
                  <>
                    {displayRows.length} file
                    {displayRows.length !== 1 ? "s" : ""}
                    {" \u00B7 "}
                    {totalPages} page{totalPages !== 1 ? "s" : ""}
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs + Content */}
        <div className="flex-1 overflow-y-auto">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col h-full"
          >
            <div className="px-6 pt-4 border-b border-gray-200">
              <TabsList
                className="bg-transparent p-0 h-auto gap-0"
                role="tablist"
              >
                <TabsTrigger
                  value="ocr"
                  role="tab"
                  aria-selected={activeTab === "ocr"}
                  className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:bg-transparent"
                >
                  OCR Results
                </TabsTrigger>
                <TabsTrigger
                  value="analysis"
                  role="tab"
                  aria-selected={activeTab === "analysis"}
                  className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:bg-transparent"
                >
                  AI Analysis
                  {analysisJob?.status === "completed" &&
                    analysisResults.length > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs bg-violet-100 text-violet-700 rounded-full">
                        {analysisResults.length}
                      </span>
                    )}
                  {analysisJob?.status === "processing" && (
                    <Loader2 className="ml-1.5 w-3.5 h-3.5 animate-spin text-violet-600 inline" />
                  )}
                </TabsTrigger>
                {showPricingTab && (
                  <TabsTrigger
                    value="pricing"
                    role="tab"
                    aria-selected={activeTab === "pricing"}
                    className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:bg-transparent"
                  >
                    Pricing
                    {pricingRows.length > 0 && (
                      <span className="ml-1.5 text-xs text-gray-400">
                        ({pricingTotalDocuments} doc
                        {pricingTotalDocuments !== 1 ? "s" : ""})
                      </span>
                    )}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent
              value="ocr"
              role="tabpanel"
              aria-labelledby="ocr"
              className="flex-1 px-6 py-4 mt-0"
            >
              {renderOcrResultsTab()}
            </TabsContent>
            <TabsContent
              value="analysis"
              role="tabpanel"
              aria-labelledby="analysis"
              className="flex-1 px-6 py-4 mt-0"
            >
              {renderAnalysisTab()}
            </TabsContent>
            {showPricingTab && (
              <TabsContent
                value="pricing"
                role="tabpanel"
                aria-labelledby="pricing"
                className="flex-1 px-6 py-4 mt-0"
              >
                {renderPricingTab()}
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          {activeTab === "pricing" ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportPricingCSV}
                  disabled={pricingRows.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-white text-sm font-medium text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  Export Pricing CSV
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowUseInQuoteModal(true)}
                  disabled={pricingRows.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Use in Quote
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white text-sm font-medium text-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {showActions && !isLoading && !error && displayRows.length > 0 && (
                  <button
                    onClick={handleCopyAllText}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-white text-sm font-medium text-gray-700 transition-colors"
                  >
                    {copiedAll ? (
                      <>
                        <Check className="w-4 h-4 text-green-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy All Text
                      </>
                    )}
                  </button>
                )}
                {showActions && onApplyToQuote && !isLoading && !error && (
                  <button
                    onClick={handleApplyToQuote}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Apply to Quote
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {analyseError && (
                  <span className="text-xs text-red-600 mr-2">
                    {analyseError}
                  </span>
                )}
                <button
                  onClick={handleAnalyse}
                  disabled={selectedFileIds.size === 0 || isAnalysing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed bg-violet-600 text-white hover:bg-violet-700"
                >
                  {isAnalysing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analysing {selectedFileIds.size} file
                      {selectedFileIds.size !== 1 ? "s" : ""}...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Analyse Selected
                      {selectedFileIds.size > 0 &&
                        ` (${selectedFileIds.size})`}
                    </>
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white text-sm font-medium text-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilePageDetails sub-component
// ---------------------------------------------------------------------------

function FilePageDetails({
  file,
  pages,
  isLoading,
  expandedPage,
  copiedPage,
  onTogglePage,
  onCopyPage,
  onLoadPages,
  showChunkHeader,
}: {
  file: OcrBatchFile;
  pages?: OcrPageData[];
  isLoading: boolean;
  expandedPage: number | null;
  copiedPage: number | null;
  onTogglePage: (pageNum: number) => void;
  onCopyPage: (pageNum: number, text: string) => void;
  onLoadPages: () => void;
  showChunkHeader?: boolean;
}) {
  useEffect(() => {
    if (!pages && !isLoading) {
      onLoadPages();
    }
  }, [pages, isLoading, onLoadPages]);

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      {showChunkHeader && (
        <div className="px-4 py-2 bg-gray-100 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">
            Chunk {file.chunk_index ?? "?"}: {file.filename}
          </span>
          <span className="text-xs text-gray-400">
            ({file.page_count} pages, {(file.word_count || 0).toLocaleString()}{" "}
            words)
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="px-4 py-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600 mr-2" />
          <span className="text-sm text-gray-500">Loading page details...</span>
        </div>
      ) : pages && pages.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700">
                Page
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">
                Words
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">
                Confidence
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">
                Language
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">
                Text
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {pages.map((page) => (
              <React.Fragment key={page.page_number}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {page.page_number}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {page.word_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`font-medium ${confidenceColor(
                        (page.confidence_score || 0) * 100
                      )}`}
                    >
                      {page.confidence_score != null
                        ? `${(page.confidence_score * 100).toFixed(1)}%`
                        : "N/A"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {page.detected_language ? (
                      <span>
                        {getLanguageFlag(page.detected_language)}{" "}
                        {getLanguageName(page.detected_language)}
                      </span>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {page.raw_text ? (
                      <button
                        onClick={() => onTogglePage(page.page_number)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                      >
                        {expandedPage === page.page_number ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            Hide
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </>
                        )}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">No text</span>
                    )}
                  </td>
                </tr>

                {expandedPage === page.page_number && page.raw_text && (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <div className="mx-4 my-3 border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                          <span className="text-sm font-medium text-gray-700">
                            Page {page.page_number} Text
                          </span>
                          <button
                            onClick={() =>
                              onCopyPage(page.page_number, page.raw_text!)
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                          >
                            {copiedPage === page.page_number ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-green-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                        <div className="p-4 max-h-[300px] overflow-y-auto bg-white">
                          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                            {page.raw_text}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-4 py-4 text-sm text-gray-500 text-center">
          No page data available.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnalysisResultCard sub-component
// ---------------------------------------------------------------------------

function AnalysisResultCardComponent({
  result,
}: {
  result: AnalysisResult;
}) {
  const cStyle = complexityStyles[result.complexity] || complexityStyles.medium;
  const docLabel =
    documentTypeLabels[result.documentType] || result.documentType;
  const docCount = result.documentCount || 1;

  return (
    <article className="border border-gray-200 rounded-lg p-4 bg-white hover:border-gray-300 hover:shadow-sm transition-all">
      {/* Filename header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
          <h4 className="font-semibold text-gray-900 text-sm truncate">
            {result.originalFilename}
          </h4>
          {result.chunkCount > 1 && (
            <span className="flex-shrink-0 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {result.chunkCount} chunks reassembled
            </span>
          )}
        </div>
        {docCount > 1 && (
          <span className="flex-shrink-0 text-xs font-medium bg-blue-50 text-blue-600 px-2 py-0.5 rounded ml-2">
            {docCount} docs detected
          </span>
        )}
      </div>

      {/* Key details grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm mb-3">
        <div>
          <span className="text-gray-500">Type:</span>{" "}
          <span className="font-medium text-gray-900">{docLabel}</span>
          {result.documentTypeConfidence > 0 && (
            <span className="text-xs text-gray-400 ml-1">
              ({(result.documentTypeConfidence * 100).toFixed(0)}%)
            </span>
          )}
        </div>
        <div>
          <span className="text-gray-500">Complexity:</span>{" "}
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cStyle.bg} ${cStyle.text}`}
          >
            {cStyle.label}
          </span>
          {result.complexityConfidence > 0 && (
            <span className="text-xs text-gray-400 ml-1">
              ({(result.complexityConfidence * 100).toFixed(0)}%)
            </span>
          )}
        </div>
        {result.holderName && (
          <div>
            <span className="text-gray-500">Name:</span>{" "}
            <span className="font-medium text-gray-900">
              {result.holderName}
            </span>
          </div>
        )}
        {result.languageName && (
          <div>
            <span className="text-gray-500">Language:</span>{" "}
            <span className="text-gray-900">
              {result.languageName}{" "}
              {getLanguageFlag(result.language)}
            </span>
          </div>
        )}
        {result.issuingCountry && (
          <div>
            <span className="text-gray-500">Country:</span>{" "}
            <span className="text-gray-900">
              {result.issuingCountry}
              {result.issuingCountryCode &&
                ` (${result.issuingCountryCode})`}
            </span>
          </div>
        )}
        <div>
          <span className="text-gray-500">Words:</span>{" "}
          <span className="text-gray-900">
            {result.wordCount.toLocaleString()}
          </span>
          <span className="text-gray-400 mx-1">|</span>
          <span className="text-gray-500">Billable:</span>{" "}
          <span className="text-gray-900">
            {result.billablePages.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Sub-Documents */}
      {result.subDocuments && result.subDocuments.length > 0 && (
        <div className="border-t border-gray-100 pt-3 mt-1 mb-1">
          <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Sub-Documents
          </p>
          <ul className="space-y-1">
            {result.subDocuments.map((sub, idx) => {
              const subTypeLabel =
                documentTypeLabels[sub.type] || sub.type;
              return (
                <li
                  key={idx}
                  className="flex items-start gap-1.5 text-sm text-gray-700"
                >
                  <span className="flex-shrink-0">{"\u2022"}</span>
                  <span>
                    {subTypeLabel}
                    {sub.holderName && <> &mdash; {sub.holderName}</>}
                    {sub.pageRange && (
                      <span className="text-gray-400">
                        {" "}
                        (pp. {sub.pageRange}
                        {sub.language && `, ${sub.language}`})
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Actionable Items */}
      {result.actionableItems && result.actionableItems.length > 0 && (
        <div className="border-t border-gray-100 pt-3 mt-1">
          <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Actionable Items
          </p>
          <ul className="space-y-1">
            {result.actionableItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5 text-sm">
                <span className="flex-shrink-0" role="img" aria-label={item.type}>
                  {actionableIcons[item.type] || "\u2022"}
                </span>
                <span className="text-gray-700">{item.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
