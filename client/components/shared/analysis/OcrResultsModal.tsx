import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  FileText,
  CheckCircle,
  Globe,
  Loader2,
  AlertCircle,
  AlertTriangle,
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
  Save,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import UseInQuoteModal from "./UseInQuoteModal";

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
  processingStatus: "completed" | "failed" | "manual";
  errorMessage: string | null;
  entryMethod: "ocr" | "manual" | "ai_failed";

  // Saved pricing overrides (from DB)
  pricingBillablePages: number | null;
  pricingComplexity: "easy" | "medium" | "hard" | null;
  pricingComplexityMultiplier: number | null;
  pricingBaseRate: number | null;
  pricingCertificationTypeId: string | null;
  pricingCertificationUnitPrice: number | null;
  pricingIsExcluded: boolean | null;
  pricingIsBillableOverridden: boolean | null;
  pricingDocumentCertifications: Array<{
    index: number;
    certTypeId: string;
    price: number;
  }> | null;
  pricingSavedAt: string | null;
}

interface DocumentCertification {
  index: number;
  subDocumentType: string;
  subDocumentHolderName: string;
  certificationTypeId: string;
  certificationTypeName: string;
  certificationPrice: number;
}

interface CertificationType {
  id: string;
  name: string;
  code: string;
  price: number;
  is_active: boolean;
}

interface PricingRow {
  analysisId: string;
  fileId: string;
  originalFilename: string;
  documentType: string;
  wordCount: number;
  pageCount: number;
  documentCount: number;
  subDocuments: SubDocument[] | null;
  entryMethod: "ocr" | "manual" | "ai_failed";
  processingStatus: string;

  // Editable (initialized from AI analysis + settings)
  billablePages: number;
  billablePagesOverridden: boolean;
  complexity: "easy" | "medium" | "hard";
  complexityMultiplier: number;
  baseRate: number;
  baseRateOverridden: boolean;

  // Certification — row-level default
  defaultCertTypeId: string;
  defaultCertTypeName: string;
  defaultCertUnitPrice: number;

  // Certification — per-document overrides
  documentCertifications: DocumentCertification[];
  hasPerDocCertOverrides: boolean;

  // Calculated
  certificationCost: number;
  translationCost: number;
  lineTotal: number;

  // Exclude from pricing/quote
  isExcluded: boolean;
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
// Normalize analysis results — map snake_case pricing fields to camelCase
// (Edge function may not map newly-added pricing columns)
// ---------------------------------------------------------------------------

function normalizeAnalysisResults(
  results: Record<string, unknown>[]
): AnalysisResult[] {
  return results.map((r) => {
    const result = r as AnalysisResult & Record<string, unknown>;
    return {
      ...result,
      pricingSavedAt:
        result.pricingSavedAt ?? (result.pricing_saved_at as string | null) ?? null,
      pricingBillablePages:
        result.pricingBillablePages ??
        (result.pricing_billable_pages != null
          ? Number(result.pricing_billable_pages)
          : null),
      pricingComplexity:
        result.pricingComplexity ??
        (result.pricing_complexity as AnalysisResult["pricingComplexity"]) ??
        null,
      pricingComplexityMultiplier:
        result.pricingComplexityMultiplier ??
        (result.pricing_complexity_multiplier != null
          ? Number(result.pricing_complexity_multiplier)
          : null),
      pricingBaseRate:
        result.pricingBaseRate ??
        (result.pricing_base_rate != null
          ? Number(result.pricing_base_rate)
          : null),
      pricingCertificationTypeId:
        result.pricingCertificationTypeId ??
        (result.pricing_certification_type_id as string | null) ??
        null,
      pricingCertificationUnitPrice:
        result.pricingCertificationUnitPrice ??
        (result.pricing_certification_unit_price != null
          ? Number(result.pricing_certification_unit_price)
          : null),
      pricingIsExcluded:
        result.pricingIsExcluded ??
        (result.pricing_is_excluded as boolean | null) ??
        null,
      pricingIsBillableOverridden:
        result.pricingIsBillableOverridden ??
        (result.pricing_is_billable_overridden as boolean | null) ??
        null,
      pricingDocumentCertifications:
        result.pricingDocumentCertifications ??
        (result.pricing_document_certifications as AnalysisResult["pricingDocumentCertifications"]) ??
        null,
      entryMethod:
        result.entryMethod ??
        (result.entry_method as AnalysisResult["entryMethod"]) ??
        "ocr",
      processingStatus:
        result.processingStatus ??
        (result.processing_status as AnalysisResult["processingStatus"]) ??
        "completed",
    };
  });
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
  if (billablePages === 0) return 0;
  const perPageRate = Math.ceil((baseRate * languageMultiplier) / 2.5) * 2.5;
  return billablePages * perPageRate;
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
  const navigate = useNavigate();

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
  const [certificationTypes, setCertificationTypes] = useState<CertificationType[]>([]);
  const [pricingRatesLoaded, setPricingRatesLoaded] = useState(false);
  const [showUseInQuoteModal, setShowUseInQuoteModal] = useState(false);
  const [expandedCertRows, setExpandedCertRows] = useState<Set<string>>(new Set());
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Linked quote state (for "Update Existing Quote" flow)
  const [linkedQuoteId, setLinkedQuoteId] = useState<string | null>(null);
  const [linkedQuoteNumber, setLinkedQuoteNumber] = useState<string | null>(null);
  const [isUpdatingQuote, setIsUpdatingQuote] = useState(false);

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
            setAnalysisResults(normalizeAnalysisResults(analysisData.results || []));
          }
        }
      } catch {
        // No analysis yet - that's fine
        console.log("No existing analysis for batch");
      }

      // 3. Check if batch is linked to an existing quote
      try {
        const { data: batchRow } = await supabase
          .from('ocr_batches')
          .select('quote_id, quotes(quote_number)')
          .eq('id', batchId)
          .single();

        if (batchRow?.quote_id) {
          setLinkedQuoteId(batchRow.quote_id);
          const quoteData = batchRow.quotes as unknown as { quote_number: string } | null;
          setLinkedQuoteNumber(quoteData?.quote_number || null);
        } else {
          setLinkedQuoteId(null);
          setLinkedQuoteNumber(null);
        }
      } catch {
        // No linked quote - that's fine
        console.log("No linked quote for batch");
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
      setExpandedCertRows(new Set());
      setIsSavingPricing(false);
      setLastSavedAt(null);
      setHasUnsavedChanges(false);
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
          setAnalysisResults(normalizeAnalysisResults(data.results || []));

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

        const { data: certTypes } = await supabase
          .from("certification_types")
          .select("id, name, code, price, is_active")
          .eq("is_active", true)
          .order("sort_order");

        setCertificationTypes(certTypes || []);
        setPricingRatesLoaded(true);
      } catch {
        // Use defaults
        setPricingBaseRate(65);
        setPricingWordsPerPage(225);
        setCertificationTypes([]);
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

    // Include completed, manual, and failed rows (not just completed)
    const completedResults = analysisResults.filter(
      (r) =>
        r.processingStatus === "completed" ||
        r.processingStatus === "manual" ||
        r.entryMethod === "manual" ||
        r.processingStatus === "failed"
    );
    if (completedResults.length === 0) {
      setPricingRows([]);
      return;
    }

    const defaultCert = certificationTypes.find(c => c.code === "notarization") || certificationTypes[0];

    const rows: PricingRow[] = completedResults.map((r) => {
      const hasSaved = !!r.pricingSavedAt;

      // Use saved values if available, otherwise calculate defaults
      const complexity: "easy" | "medium" | "hard" =
        hasSaved && r.pricingComplexity ? r.pricingComplexity : r.complexity;
      const mult =
        hasSaved && r.pricingComplexityMultiplier != null
          ? r.pricingComplexityMultiplier
          : complexityMultipliers[complexity] || 1.0;
      const baseRate =
        hasSaved && r.pricingBaseRate != null
          ? r.pricingBaseRate
          : pricingBaseRate;
      const isExcluded = hasSaved ? !!r.pricingIsExcluded : false;
      const isBillableOverridden = hasSaved ? !!r.pricingIsBillableOverridden : false;

      let billable: number;
      if (hasSaved && r.pricingBillablePages != null) {
        billable = r.pricingBillablePages;
      } else {
        billable =
          r.billablePages ||
          recalcBillablePages(r.wordCount, mult, pricingWordsPerPage);
      }

      // Certification — use saved if available
      let rowCertTypeId: string;
      let rowCertTypeName: string;
      let rowCertUnitPrice: number;

      if (hasSaved && r.pricingCertificationTypeId) {
        const savedCert = certificationTypes.find(
          (c) => c.id === r.pricingCertificationTypeId
        );
        rowCertTypeId = savedCert?.id || defaultCert?.id || "";
        rowCertTypeName = savedCert?.name || defaultCert?.name || "";
        rowCertUnitPrice =
          r.pricingCertificationUnitPrice ?? savedCert?.price ?? defaultCert?.price ?? 0;
      } else {
        rowCertTypeId = defaultCert?.id || "";
        rowCertTypeName = defaultCert?.name || "";
        rowCertUnitPrice = defaultCert?.price || 0;
      }

      const docCount = r.documentCount || 1;
      const subDocs = r.subDocuments || [];
      const savedDocCerts = hasSaved ? r.pricingDocumentCertifications : null;

      // Build per-document certifications
      const docCerts: DocumentCertification[] = [];
      for (let i = 0; i < docCount; i++) {
        const subDoc = subDocs[i];
        const savedDC = savedDocCerts?.find(
          (dc: { index: number }) => dc.index === i
        );

        if (savedDC) {
          const savedCertType = certificationTypes.find(
            (c) => c.id === savedDC.certTypeId
          );
          docCerts.push({
            index: i,
            subDocumentType: subDoc?.type || r.documentType || "other",
            subDocumentHolderName:
              subDoc?.holderName || r.holderName || `Document ${i + 1}`,
            certificationTypeId: savedDC.certTypeId,
            certificationTypeName: savedCertType?.name || "",
            certificationPrice: savedDC.price,
          });
        } else {
          docCerts.push({
            index: i,
            subDocumentType: subDoc?.type || r.documentType || "other",
            subDocumentHolderName:
              subDoc?.holderName || r.holderName || `Document ${i + 1}`,
            certificationTypeId: rowCertTypeId,
            certificationTypeName: rowCertTypeName,
            certificationPrice: isExcluded ? 0 : rowCertUnitPrice,
          });
        }
      }

      const certCost = isExcluded
        ? 0
        : docCerts.reduce((sum, dc) => sum + dc.certificationPrice, 0);
      const transCost =
        isExcluded || billable === 0
          ? 0
          : calcTranslationCost(billable, baseRate);

      return {
        analysisId: r.id,
        fileId: r.fileId,
        originalFilename: r.originalFilename,
        documentType: r.documentType,
        wordCount: r.wordCount,
        pageCount: r.pageCount,
        documentCount: docCount,
        subDocuments: r.subDocuments,
        entryMethod: r.entryMethod || "ocr",
        processingStatus: r.processingStatus,
        billablePages: billable,
        billablePagesOverridden: isBillableOverridden,
        complexity,
        complexityMultiplier: mult,
        baseRate,
        baseRateOverridden: hasSaved && r.pricingBaseRate != null,
        defaultCertTypeId: rowCertTypeId,
        defaultCertTypeName: rowCertTypeName,
        defaultCertUnitPrice: rowCertUnitPrice,
        documentCertifications: docCerts,
        hasPerDocCertOverrides: !!savedDocCerts,
        certificationCost: certCost,
        translationCost: transCost,
        lineTotal: transCost + certCost,
        isExcluded,
      };
    });

    setPricingRows(rows);
    setHasUnsavedChanges(false);

    // Show "last saved" indicator if data was loaded from saved state
    const savedResults = completedResults.filter((r) => r.pricingSavedAt);
    if (savedResults.length > 0) {
      const latest = savedResults.sort(
        (a, b) =>
          new Date(b.pricingSavedAt!).getTime() -
          new Date(a.pricingSavedAt!).getTime()
      )[0];
      setLastSavedAt(new Date(latest.pricingSavedAt!));
    }
  }, [analysisResults, pricingRatesLoaded, pricingBaseRate, pricingWordsPerPage, certificationTypes]);

  // -------------------------------------------------------------------------
  // Pricing: computed totals
  // -------------------------------------------------------------------------

  const pricingActiveRows = useMemo(
    () => pricingRows.filter((r) => !r.isExcluded),
    [pricingRows]
  );
  const pricingExcludedCount = pricingRows.length - pricingActiveRows.length;
  const pricingTotalDocuments = useMemo(
    () => pricingActiveRows.reduce((sum, r) => sum + r.documentCount, 0),
    [pricingActiveRows]
  );
  const pricingTranslationSubtotal = useMemo(
    () => pricingActiveRows.reduce((sum, r) => sum + r.translationCost, 0),
    [pricingActiveRows]
  );
  const pricingCertificationTotal = useMemo(
    () => pricingActiveRows.reduce((sum, r) => sum + r.certificationCost, 0),
    [pricingActiveRows]
  );
  const pricingEstimatedTotal =
    pricingTranslationSubtotal + pricingCertificationTotal;

  // Whether pricing tab should be visible — show when there are any analysis
  // results (completed, manual, or failed) OR when pricing rows exist (manual docs)
  const showPricingTab =
    isBatchMode &&
    (pricingRows.length > 0 ||
      (analysisResults.length > 0 &&
        analysisResults.some(
          (r) =>
            r.processingStatus === "completed" ||
            r.processingStatus === "manual" ||
            r.entryMethod === "manual" ||
            r.processingStatus === "failed"
        )));

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
        if (updated.billablePages === 0) {
          updated.translationCost = 0;
          updated.certificationCost = 0;
          updated.lineTotal = 0;
        } else {
          updated.translationCost = calcTranslationCost(
            updated.billablePages,
            updated.baseRate
          );
          updated.lineTotal = updated.translationCost + updated.certificationCost;
        }

        return updated;
      })
    );
    setHasUnsavedChanges(true);
  };

  // -------------------------------------------------------------------------
  // Pricing: certification handlers
  // -------------------------------------------------------------------------

  const handleRowCertChange = (rowId: string, certTypeId: string) => {
    const cert = certificationTypes.find((c) => c.id === certTypeId);
    if (!cert) return;

    setPricingRows((prev) =>
      prev.map((row) => {
        if (row.analysisId !== rowId) return row;

        const updated = {
          ...row,
          defaultCertTypeId: cert.id,
          defaultCertTypeName: cert.name,
          defaultCertUnitPrice: cert.price,
        };

        // If no per-doc overrides yet, apply to all documents
        if (!row.hasPerDocCertOverrides) {
          updated.documentCertifications = row.documentCertifications.map((dc) => ({
            ...dc,
            certificationTypeId: cert.id,
            certificationTypeName: cert.name,
            certificationPrice: cert.price,
          }));
        }

        updated.certificationCost = updated.documentCertifications.reduce(
          (sum, dc) => sum + dc.certificationPrice,
          0
        );
        updated.lineTotal = updated.translationCost + updated.certificationCost;

        return updated;
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleDocCertChange = (
    rowId: string,
    docIndex: number,
    certTypeId: string
  ) => {
    const cert = certificationTypes.find((c) => c.id === certTypeId);
    if (!cert) return;

    setPricingRows((prev) =>
      prev.map((row) => {
        if (row.analysisId !== rowId) return row;

        const updatedDocCerts = row.documentCertifications.map((dc) => {
          if (dc.index !== docIndex) return dc;
          return {
            ...dc,
            certificationTypeId: cert.id,
            certificationTypeName: cert.name,
            certificationPrice: cert.price,
          };
        });

        const certCost = updatedDocCerts.reduce(
          (sum, dc) => sum + dc.certificationPrice,
          0
        );

        return {
          ...row,
          documentCertifications: updatedDocCerts,
          hasPerDocCertOverrides: true,
          certificationCost: certCost,
          lineTotal: row.translationCost + certCost,
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  const toggleCertExpand = (rowId: string) => {
    setExpandedCertRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const handleToggleExclude = (rowId: string) => {
    setPricingRows((prev) =>
      prev.map((row) => {
        if (row.analysisId !== rowId) return row;
        return { ...row, isExcluded: !row.isExcluded };
      })
    );
    setHasUnsavedChanges(true);
  };

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleSavePricing = async () => {
    if (pricingRows.length === 0) return;

    setIsSavingPricing(true);
    try {
      const staffSession = JSON.parse(
        localStorage.getItem("staffSession") || "{}"
      );

      const updates = pricingRows.map((row) => ({
        analysisId: row.analysisId,
        pricingBillablePages: row.billablePages,
        pricingComplexity: row.complexity,
        pricingComplexityMultiplier: row.complexityMultiplier,
        pricingBaseRate: row.baseRate,
        pricingCertificationTypeId: row.defaultCertTypeId,
        pricingCertificationUnitPrice: row.defaultCertUnitPrice,
        pricingIsExcluded: row.isExcluded,
        pricingIsBillableOverridden: row.billablePagesOverridden,
        pricingDocumentCertifications: row.documentCertifications.map((dc) => ({
          index: dc.index,
          certTypeId: dc.certificationTypeId,
          price: dc.certificationPrice,
        })),
      }));

      for (const upd of updates) {
        const { error } = await supabase
          .from("ocr_ai_analysis")
          .update({
            pricing_billable_pages: upd.pricingBillablePages,
            pricing_complexity: upd.pricingComplexity,
            pricing_complexity_multiplier: upd.pricingComplexityMultiplier,
            pricing_base_rate: upd.pricingBaseRate,
            pricing_certification_type_id: upd.pricingCertificationTypeId,
            pricing_certification_unit_price: upd.pricingCertificationUnitPrice,
            pricing_is_excluded: upd.pricingIsExcluded,
            pricing_is_billable_overridden: upd.pricingIsBillableOverridden,
            pricing_document_certifications: upd.pricingDocumentCertifications,
            pricing_saved_at: new Date().toISOString(),
            pricing_saved_by_staff_id: staffSession.staffId || null,
          })
          .eq("id", upd.analysisId);

        if (error) throw error;
      }

      setLastSavedAt(new Date());
      setHasUnsavedChanges(false);
      toast.success("Pricing saved successfully");
    } catch (err: unknown) {
      console.error("Failed to save pricing:", err);
      toast.error(
        `Failed to save pricing: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setIsSavingPricing(false);
    }
  };

  // -------------------------------------------------------------------------
  // Manual document handlers
  // -------------------------------------------------------------------------

  const handleAddManualDocument = async () => {
    if (!batchId) return;

    const nextIndex = pricingRows.length;
    const defaultCert =
      certificationTypes.find((c) => c.code === "notarization") ||
      certificationTypes[0];
    const baseRate = pricingBaseRate || 65;

    try {
      const { data, error } = await supabase
        .from("ocr_ai_analysis")
        .insert({
          batch_id: batchId,
          file_id: null,
          job_id: null,
          entry_method: "manual",
          processing_status: "manual",
          document_index: nextIndex,
          original_filename: `Manual Document ${nextIndex + 1}`,
          ocr_word_count: 0,
          ocr_page_count: 1,
          assessed_complexity: "easy",
          complexity_multiplier: 1.0,
          billable_pages: 1.0,
          base_rate: baseRate,
          certification_price: 0,
          is_excluded: false,
          document_type: "other",
          document_type_confidence: 1.0,
          holder_name: "",
          holder_name_normalized: "",
          language: "en",
          language_name: "English",
          issuing_country: "",
          issuing_country_code: "",
          issuing_authority: "",
          complexity_confidence: 1.0,
          complexity_factors: [],
          complexity_reasoning: "Manual entry",
          document_count: 1,
          actionable_items: [],
        })
        .select()
        .single();

      if (error) throw error;

      // Add new row directly to local state
      const certUnitPrice = defaultCert?.price ?? 0;
      const translationCost = calcTranslationCost(1.0, baseRate);
      const certCost = certUnitPrice;
      const newRow: PricingRow = {
        analysisId: data.id,
        fileId: "",
        originalFilename: `Manual Document ${nextIndex + 1}`,
        documentType: "other",
        wordCount: 0,
        pageCount: 1,
        documentCount: 1,
        subDocuments: null,
        entryMethod: "manual",
        processingStatus: "manual",
        billablePages: 1.0,
        billablePagesOverridden: false,
        complexity: "easy",
        complexityMultiplier: 1.0,
        baseRate,
        baseRateOverridden: false,
        defaultCertTypeId: defaultCert?.id || "",
        defaultCertTypeName: defaultCert?.name || "",
        defaultCertUnitPrice: certUnitPrice,
        documentCertifications: [
          {
            index: 0,
            subDocumentType: "other",
            subDocumentHolderName: "Document 1",
            certificationTypeId: defaultCert?.id || "",
            certificationTypeName: defaultCert?.name || "",
            certificationPrice: certUnitPrice,
          },
        ],
        hasPerDocCertOverrides: false,
        certificationCost: certCost,
        translationCost,
        lineTotal: translationCost + certCost,
        isExcluded: false,
      };

      setPricingRows((prev) => [...prev, newRow]);
      setHasUnsavedChanges(true);
      toast.success("Manual document added");
    } catch (err) {
      console.error("Failed to add manual document:", err);
      toast.error("Failed to add document. Please try again.");
    }
  };

  const handleDeleteManualDocument = async (analysisId: string) => {
    if (!confirm("Delete this manual document?")) return;

    try {
      const { error } = await supabase
        .from("ocr_ai_analysis")
        .delete()
        .eq("id", analysisId)
        .eq("entry_method", "manual");

      if (error) throw error;

      setPricingRows((prev) => prev.filter((r) => r.analysisId !== analysisId));
      setHasUnsavedChanges(true);
      toast.success("Manual document deleted");
    } catch (err) {
      console.error("Failed to delete manual document:", err);
      toast.error("Failed to delete document.");
    }
  };

  const handleManualDocNameBlur = async (
    analysisId: string,
    name: string
  ) => {
    try {
      await supabase
        .from("ocr_ai_analysis")
        .update({
          original_filename: name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", analysisId);
    } catch (err) {
      console.error("Failed to update document name:", err);
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      const confirmClose = window.confirm(
        "You have unsaved pricing changes. Close anyway?"
      );
      if (!confirmClose) return;
    }
    onClose();
  };

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
        setAnalysisResults(normalizeAnalysisResults(data.results as Record<string, unknown>[]));
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
        setAnalysisResults(normalizeAnalysisResults(data.results || []));
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
      "Status",
      "Words",
      "Billable Pages",
      "Complexity",
      "Certification",
      "Cert Cost",
      "Base Rate",
      "Translation Cost",
      "Doc Count",
      "Line Total",
    ];
    const rows: (string | number)[][] = [];
    pricingRows.forEach((r) => {
      rows.push([
        r.originalFilename,
        documentTypeLabels[r.documentType] || r.documentType,
        r.isExcluded ? "Excluded" : "Included",
        r.wordCount,
        r.isExcluded ? 0 : r.billablePages,
        r.complexity,
        r.defaultCertTypeName,
        r.isExcluded ? "0.00" : r.certificationCost.toFixed(2),
        r.baseRate.toFixed(2),
        r.isExcluded ? "0.00" : r.translationCost.toFixed(2),
        r.documentCount,
        r.isExcluded ? "0.00" : r.lineTotal.toFixed(2),
      ]);
    });

    // Summary rows
    rows.push([]);
    rows.push([
      "Translation Subtotal",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      pricingTranslationSubtotal.toFixed(2),
      "",
      "",
    ]);
    rows.push([
      "Certification Total",
      "",
      "",
      "",
      "",
      "",
      "",
      pricingCertificationTotal.toFixed(2),
      "",
      "",
      pricingTotalDocuments,
      "",
    ]);
    rows.push([
      "Estimated Total",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      pricingEstimatedTotal.toFixed(2),
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
  // Quote creation callback
  // -------------------------------------------------------------------------

  const handleQuoteCreated = useCallback(
    (quoteId: string, quoteNumber: string) => {
      setShowUseInQuoteModal(false);
      onClose();
      toast.success(`Quote ${quoteNumber} created successfully`);
      navigate(`/admin/quotes/${quoteId}`);
    },
    [onClose, navigate],
  );

  // -------------------------------------------------------------------------
  // Update existing quote handler
  // -------------------------------------------------------------------------

  const handleUpdateExistingQuote = useCallback(async () => {
    if (!linkedQuoteId || !linkedQuoteNumber || !batchId) return;

    const activeRows = pricingRows.filter((r) => !r.isExcluded);
    if (activeRows.length === 0) {
      toast.error("No active documents to update the quote with");
      return;
    }

    const confirmed = window.confirm(
      `Update ${linkedQuoteNumber} with ${activeRows.length} document(s)?\n\n` +
      `This will overwrite the existing pricing on the quote and set status to "Awaiting Payment".`
    );
    if (!confirmed) return;

    setIsUpdatingQuote(true);

    try {
      const documentPayload = activeRows.map((row) => ({
        filename: row.originalFilename || "Unknown",
        ocrBatchFileId: row.fileId || null,

        // Analysis
        detectedLanguage: analysisResults.find((r) => r.id === row.analysisId)?.language || "unknown",
        languageName: analysisResults.find((r) => r.id === row.analysisId)?.languageName || "Unknown",
        detectedDocumentType: row.documentType || "document",
        assessedComplexity: row.complexity || "easy",

        // Counts
        wordCount: row.wordCount || 0,
        pageCount: row.pageCount || 1,

        // Pricing
        billablePages: row.billablePages || 1.0,
        complexityMultiplier: row.complexityMultiplier || 1.0,
        baseRate: row.baseRate || 65.0,
        perPageRate: row.baseRate * row.complexityMultiplier || 65.0,
        translationCost: row.translationCost || 0,

        // Certification
        certificationTypeId: row.defaultCertTypeId || null,
        certificationPrice: row.certificationCost || 0,
      }));

      const staffId = localStorage.getItem("staffUserId") || null;

      const { data, error } = await supabase.functions.invoke("update-quote-from-analysis", {
        body: {
          quoteId: linkedQuoteId,
          batchId: batchId,
          staffId: staffId,
          documents: documentPayload,
        },
      });

      if (error) {
        throw new Error(error.message || "Edge function call failed");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Update failed");
      }

      toast.success(
        `${linkedQuoteNumber} updated! ${data.documentsProcessed} document(s), ` +
        `total: $${data.totals?.total?.toFixed(2) || "0.00"}`
      );

      onClose();
      navigate(`/admin/quotes/${linkedQuoteId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update quote";
      console.error("Update quote error:", err);
      toast.error(message);
    } finally {
      setIsUpdatingQuote(false);
    }
  }, [linkedQuoteId, linkedQuoteNumber, batchId, pricingRows, analysisResults, onClose, navigate]);

  // -------------------------------------------------------------------------
  // Render: Pricing tab content
  // -------------------------------------------------------------------------

  const renderPricingTab = () => {
    if (pricingRows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <FileText className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-sm font-medium mb-1">No documents to price</p>
          <p className="text-xs text-gray-400 mb-4">
            OCR processing may have failed, or no files were uploaded.
          </p>
          <button
            onClick={handleAddManualDocument}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Document Manually
          </button>
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddManualDocument}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Document
            </button>
            <button
              onClick={() => setShowUseInQuoteModal(true)}
              disabled={pricingActiveRows.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Use in Quote
              <ArrowRight className="w-4 h-4" />
            </button>
            {linkedQuoteId && linkedQuoteNumber && (
              <button
                onClick={handleUpdateExistingQuote}
                disabled={isUpdatingQuote || pricingActiveRows.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdatingQuote ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Update {linkedQuoteNumber}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Editable Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-8 px-2 py-2.5" />
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
                  <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                    Certification
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-700">
                    Rate
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-700">
                    Total
                  </th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pricingRows.map((row) => {
                  const docTypeLabel =
                    documentTypeLabels[row.documentType] || row.documentType;
                  const excluded = row.isExcluded;
                  return (
                    <React.Fragment key={row.analysisId}>
                      <tr className={excluded ? "opacity-40 bg-gray-50" : "hover:bg-gray-50"}>
                        <td className="px-2 py-2.5">
                          <input
                            type="checkbox"
                            checked={!excluded}
                            onChange={() => handleToggleExclude(row.analysisId)}
                            title={excluded ? "Include in quote" : "Exclude from quote"}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {row.entryMethod === "manual" && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded flex-shrink-0">
                                Manual
                              </span>
                            )}
                            {row.processingStatus === "failed" && row.entryMethod !== "manual" && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded flex-shrink-0">
                                <AlertTriangle className="w-3 h-3" />
                                OCR Failed
                              </span>
                            )}
                            {row.entryMethod === "manual" ? (
                              <input
                                type="text"
                                value={row.originalFilename || ""}
                                onChange={(e) => {
                                  const newName = e.target.value;
                                  setPricingRows((prev) =>
                                    prev.map((r) =>
                                      r.analysisId === row.analysisId
                                        ? { ...r, originalFilename: newName }
                                        : r
                                    )
                                  );
                                }}
                                onBlur={(e) =>
                                  handleManualDocNameBlur(row.analysisId, e.target.value)
                                }
                                className="text-sm border border-gray-200 rounded px-2 py-1 w-40 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                                placeholder="Document name"
                              />
                            ) : (
                              <div
                                className="font-medium text-gray-900 truncate max-w-[160px]"
                                title={row.originalFilename}
                              >
                                {row.originalFilename}
                              </div>
                            )}
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
                              disabled={excluded}
                              onChange={(e) =>
                                updatePricingRow(
                                  row.analysisId,
                                  "billablePages",
                                  e.target.value
                                )
                              }
                              className={`w-[72px] px-2 py-1 border rounded text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                                excluded
                                  ? "bg-gray-100 border-gray-200 cursor-not-allowed"
                                  : row.billablePagesOverridden
                                    ? "bg-amber-50 border-amber-400"
                                    : "border-gray-300"
                              }`}
                            />
                            {!excluded && row.billablePagesOverridden && (
                              <Pencil className="w-3 h-3 text-amber-500 flex-shrink-0" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <select
                            value={row.complexity}
                            disabled={excluded}
                            onChange={(e) =>
                              updatePricingRow(
                                row.analysisId,
                                "complexity",
                                e.target.value
                              )
                            }
                            className={`px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                              excluded ? "bg-gray-100 cursor-not-allowed" : ""
                            }`}
                          >
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                        </td>
                        {/* Certification column */}
                        <td className="px-3 py-2.5">
                          {excluded ? (
                            <span className="text-xs text-gray-400">&mdash;</span>
                          ) : (
                          <div className="flex flex-col gap-1">
                            <select
                              value={row.defaultCertTypeId}
                              onChange={(e) =>
                                handleRowCertChange(row.analysisId, e.target.value)
                              }
                              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            >
                              {certificationTypes.map((ct) => (
                                <option key={ct.id} value={ct.id}>
                                  {ct.name} (${ct.price.toFixed(2)})
                                </option>
                              ))}
                            </select>
                            <span className="text-xs text-gray-500">
                              ${row.certificationCost.toFixed(2)}
                              {row.documentCount > 1 &&
                                !row.hasPerDocCertOverrides && (
                                  <span>
                                    {" "}
                                    ({row.documentCount} &times; $
                                    {row.defaultCertUnitPrice.toFixed(2)})
                                  </span>
                                )}
                            </span>
                            {row.documentCount > 1 && (
                              <div>
                                <button
                                  onClick={() => toggleCertExpand(row.analysisId)}
                                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  {expandedCertRows.has(row.analysisId)
                                    ? "\u25BE"
                                    : "\u25B8"}{" "}
                                  Edit per document
                                  {row.hasPerDocCertOverrides && (
                                    <span className="text-amber-500 text-xs">
                                      (customized)
                                    </span>
                                  )}
                                </button>
                                {expandedCertRows.has(row.analysisId) && (
                                  <div className="mt-2 ml-2 pl-2 border-l-2 border-blue-100 space-y-2">
                                    {row.documentCertifications.map((dc) => {
                                      const dcTypeLabel =
                                        documentTypeLabels[dc.subDocumentType] ||
                                        dc.subDocumentType;
                                      const displayName = dc.subDocumentHolderName
                                        ? `${dcTypeLabel} \u2014 ${dc.subDocumentHolderName}`
                                        : dcTypeLabel;
                                      return (
                                        <div
                                          key={dc.index}
                                          className="flex items-center gap-2 text-xs"
                                        >
                                          <span className="text-gray-500 w-4">
                                            {dc.index + 1}.
                                          </span>
                                          <span
                                            className="text-gray-700 min-w-[120px] truncate"
                                            title={displayName}
                                          >
                                            {displayName}
                                          </span>
                                          <select
                                            value={dc.certificationTypeId}
                                            onChange={(e) =>
                                              handleDocCertChange(
                                                row.analysisId,
                                                dc.index,
                                                e.target.value
                                              )
                                            }
                                            className="text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                          >
                                            {certificationTypes.map((ct) => (
                                              <option key={ct.id} value={ct.id}>
                                                {ct.name}
                                              </option>
                                            ))}
                                          </select>
                                          <span className="text-gray-500">
                                            ${dc.certificationPrice.toFixed(2)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                    <div className="text-xs font-medium text-gray-700 pt-1 border-t border-gray-100">
                                      Cert Total: ${row.certificationCost.toFixed(2)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <span className="text-gray-400 text-xs">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.baseRate}
                              disabled={excluded}
                              onChange={(e) =>
                                updatePricingRow(
                                  row.analysisId,
                                  "baseRate",
                                  e.target.value
                                )
                              }
                              className={`w-[72px] px-2 py-1 border rounded text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                                excluded
                                  ? "bg-gray-100 border-gray-200 cursor-not-allowed"
                                  : row.baseRateOverridden
                                    ? "bg-amber-50 border-amber-400"
                                    : "border-gray-300"
                              }`}
                            />
                            {!excluded && row.baseRateOverridden && (
                              <Pencil className="w-3 h-3 text-amber-500 flex-shrink-0" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                          {excluded ? (
                            <span className="text-gray-400">&mdash;</span>
                          ) : (
                            <span className="text-gray-900">
                              ${row.lineTotal.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {row.entryMethod === "manual" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteManualDocument(row.analysisId);
                              }}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete manual document"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* Document count sub-row */}
                      <tr className={excluded ? "opacity-40 bg-gray-50" : "bg-gray-50/50"}>
                        <td />
                        <td
                          colSpan={9}
                          className={`px-3 py-1 pl-6 text-xs ${
                            row.documentCount > 1
                              ? "text-amber-600 font-medium"
                              : "text-gray-500"
                          }`}
                        >
                          {row.documentCount > 1
                            ? `\u2514 ${row.documentCount} docs`
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
              <span className="text-gray-600">Certification Total:</span>
              <span className="font-medium text-gray-900 tabular-nums">
                ${pricingCertificationTotal.toFixed(2)}
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
          {pricingExcludedCount > 0 && (
            <div className="text-xs text-gray-400 mt-2">
              {pricingExcludedCount} document
              {pricingExcludedCount !== 1 ? "s" : ""} excluded from pricing
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3 flex items-start gap-1">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Final total may vary based on language tier, rush fees, delivery,
            and tax. These are applied when creating the quote.
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
            onClick={handleClose}
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
              <div className="flex items-center gap-3">
                {lastSavedAt && !hasUnsavedChanges && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Saved {Math.round((Date.now() - lastSavedAt.getTime()) / 60000) < 1 ? "just now" : `${Math.round((Date.now() - lastSavedAt.getTime()) / 60000)}m ago`}
                  </span>
                )}
                {hasUnsavedChanges && (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    Unsaved changes
                  </span>
                )}
                <button
                  onClick={handleSavePricing}
                  disabled={isSavingPricing || pricingRows.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg hover:bg-white text-sm font-medium text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingPricing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Pricing
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowUseInQuoteModal(true)}
                  disabled={pricingActiveRows.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Use in Quote
                  <ArrowRight className="w-4 h-4" />
                </button>
                {linkedQuoteId && linkedQuoteNumber && (
                  <button
                    onClick={handleUpdateExistingQuote}
                    disabled={isUpdatingQuote || pricingActiveRows.length === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUpdatingQuote ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Update {linkedQuoteNumber}
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={handleClose}
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
                  onClick={handleClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white text-sm font-medium text-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Use in Quote modal (rendered on top at z-60) */}
      {showUseInQuoteModal && batchId && analysisJob && (
        <UseInQuoteModal
          isOpen={showUseInQuoteModal}
          onClose={() => setShowUseInQuoteModal(false)}
          pricingRows={pricingRows}
          analysisJob={analysisJob}
          batchId={batchId}
          analysisResults={analysisResults}
          onQuoteCreated={handleQuoteCreated}
        />
      )}
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
