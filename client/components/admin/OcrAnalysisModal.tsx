import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  X,
  ExternalLink,
  Loader2,
  RefreshCw,
  FileText,
  AlertCircle,
} from "lucide-react";

interface OcrAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
  quoteNumber?: string;
}

interface BatchFile {
  id: string;
  filename: string;
  status: string;
  page_count: number | null;
  word_count: number | null;
  error_message: string | null;
}

interface AnalysisResult {
  id: string;
  detected_language: string | null;
  language_name: string | null;
  detected_document_type: string | null;
  assessed_complexity: string | null;
  word_count: number | null;
  page_count: number | null;
  billable_pages: number | null;
  ocr_confidence: number | null;
  language_confidence: number | null;
  document_type_confidence: number | null;
  complexity_confidence: number | null;
  processing_status: string | null;
  quote_file_id: string | null;
  base_rate: number | null;
  certification_price: number | null;
  line_total: number | null;
  is_excluded: boolean | null;
  quote_files: { original_filename: string } | null;
}

type TabKey = "ocr" | "analysis" | "pricing";

export default function OcrAnalysisModal({
  isOpen,
  onClose,
  quoteId,
  quoteNumber,
}: OcrAnalysisModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("ocr");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(true);

  // Tab data
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);

  // Loading/error per tab
  const [loadingOcr, setLoadingOcr] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [errorOcr, setErrorOcr] = useState("");
  const [errorAnalysis, setErrorAnalysis] = useState("");

  // Track which tabs have been loaded
  const [loadedTabs, setLoadedTabs] = useState<Set<TabKey>>(new Set());

  // Fetch batch ID on open
  useEffect(() => {
    if (!isOpen) {
      // Reset state when closed
      setActiveTab("ocr");
      setBatchId(null);
      setBatchFiles([]);
      setAnalysisResults([]);
      setLoadedTabs(new Set());
      setLoadingBatch(true);
      setErrorOcr("");
      setErrorAnalysis("");
      return;
    }

    const fetchBatchId = async () => {
      setLoadingBatch(true);
      const { data: batch } = await supabase
        .from("ocr_batches")
        .select("id")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setBatchId(batch?.id || null);
      setLoadingBatch(false);
    };

    fetchBatchId();
  }, [isOpen, quoteId]);

  // Fetch OCR tab data
  const fetchOcrData = useCallback(async () => {
    if (!batchId) return;
    setLoadingOcr(true);
    setErrorOcr("");
    try {
      const { data, error } = await supabase
        .from("ocr_batch_files")
        .select("id, filename, status, page_count, word_count, error_message")
        .eq("batch_id", batchId)
        .order("queued_at");

      if (error) throw error;
      setBatchFiles(data || []);
      setLoadedTabs((prev) => new Set(prev).add("ocr"));
    } catch {
      setErrorOcr("Failed to load OCR results.");
    } finally {
      setLoadingOcr(false);
    }
  }, [batchId]);

  // Fetch Analysis tab data (shared with Pricing tab)
  const fetchAnalysisData = useCallback(async () => {
    setLoadingAnalysis(true);
    setErrorAnalysis("");
    try {
      const { data, error } = await supabase
        .from("ai_analysis_results")
        .select(
          "id, detected_language, language_name, detected_document_type, assessed_complexity, word_count, page_count, billable_pages, ocr_confidence, language_confidence, document_type_confidence, complexity_confidence, processing_status, quote_file_id, base_rate, certification_price, line_total, is_excluded, quote_files(original_filename)",
        )
        .eq("quote_id", quoteId);

      if (error) throw error;
      setAnalysisResults(data || []);
      setLoadedTabs((prev) => {
        const next = new Set(prev);
        next.add("analysis");
        next.add("pricing");
        return next;
      });
    } catch {
      setErrorAnalysis("Failed to load AI analysis data.");
    } finally {
      setLoadingAnalysis(false);
    }
  }, [quoteId]);

  // Load data when batch is resolved and tab changes
  useEffect(() => {
    if (loadingBatch || !isOpen) return;

    if (activeTab === "ocr" && !loadedTabs.has("ocr") && batchId) {
      fetchOcrData();
    }
    if (
      (activeTab === "analysis" || activeTab === "pricing") &&
      !loadedTabs.has("analysis")
    ) {
      fetchAnalysisData();
    }
  }, [
    activeTab,
    loadingBatch,
    batchId,
    isOpen,
    loadedTabs,
    fetchOcrData,
    fetchAnalysisData,
  ]);

  // Auto-load OCR tab when batchId is ready
  useEffect(() => {
    if (batchId && isOpen && !loadedTabs.has("ocr")) {
      fetchOcrData();
    }
  }, [batchId, isOpen, loadedTabs, fetchOcrData]);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "ocr", label: "OCR Results" },
    { key: "analysis", label: "AI Analysis" },
    { key: "pricing", label: "Pricing" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Panel */}
      <div className="relative bg-white rounded-lg shadow-2xl max-w-4xl w-full mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-lg">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              OCR & Analysis Results
            </h2>
            {quoteNumber && (
              <span className="text-sm text-gray-500 truncate">
                — {quoteNumber}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {batchId && (
              <a
                href={`/admin/ocr-word-count/${batchId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-teal-700 hover:text-teal-800 hover:bg-teal-50 rounded-lg transition-colors"
              >
                Open full page
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto max-h-[70vh] p-6">
          {loadingBatch ? (
            <LoadingSpinner />
          ) : (
            <>
              {activeTab === "ocr" && (
                <OcrResultsTab
                  batchFiles={batchFiles}
                  loading={loadingOcr}
                  error={errorOcr}
                  onRetry={fetchOcrData}
                />
              )}
              {activeTab === "analysis" && (
                <AiAnalysisTab
                  analysisResults={analysisResults}
                  loading={loadingAnalysis}
                  error={errorAnalysis}
                  onRetry={fetchAnalysisData}
                />
              )}
              {activeTab === "pricing" && (
                <PricingTab
                  analysisResults={analysisResults}
                  loading={loadingAnalysis}
                  error={errorAnalysis}
                  onRetry={fetchAnalysisData}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Sub-components ────────────────────────── */

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      <span className="ml-2 text-gray-500">Loading...</span>
    </div>
  );
}

function ErrorWithRetry({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
      <p className="text-gray-600 mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
          ✅ Completed
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
          ❌ Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
          ⏳ Processing
        </span>
      );
  }
}

function ConfidenceBadge({ value }: { value: number | null | undefined }) {
  if (value == null || value === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
        N/A
      </span>
    );
  }
  const pct = Math.round(value * (value <= 1 ? 100 : 1));
  const cls =
    pct >= 80
      ? "bg-green-100 text-green-700"
      : pct >= 50
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}
    >
      {pct}%
    </span>
  );
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/* ────────────────────────── TAB 1: OCR Results ────────────────────────── */

function OcrResultsTab({
  batchFiles,
  loading,
  error,
  onRetry,
}: {
  batchFiles: BatchFile[];
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorWithRetry message={error} onRetry={onRetry} />;

  if (batchFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="w-8 h-8 text-gray-300 mb-3" />
        <p className="text-gray-500">
          No OCR data available — this quote may have been created manually.
        </p>
      </div>
    );
  }

  const totalPages = batchFiles.reduce(
    (sum, f) => sum + (f.page_count || 0),
    0,
  );
  const totalWords = batchFiles.reduce(
    (sum, f) => sum + (f.word_count || 0),
    0,
  );

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-2.5 px-3 font-medium text-gray-600">
                File
              </th>
              <th className="text-left py-2.5 px-3 font-medium text-gray-600">
                Status
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-gray-600">
                Pages
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-gray-600">
                Words
              </th>
            </tr>
          </thead>
          <tbody>
            {batchFiles.map((file, idx) => (
              <tr
                key={file.id}
                className={idx % 2 === 1 ? "bg-gray-50/50" : ""}
              >
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="truncate max-w-[250px]">
                      {file.filename}
                    </span>
                  </div>
                  {file.status === "failed" && file.error_message && (
                    <p className="text-xs text-red-500 mt-1 ml-6">
                      {file.error_message}
                    </p>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  <StatusBadge status={file.status} />
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums">
                  {file.page_count ?? "—"}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums">
                  {file.word_count?.toLocaleString() ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-gray-50 font-medium">
              <td className="py-2.5 px-3" colSpan={2}>
                Total: {batchFiles.length} file
                {batchFiles.length !== 1 ? "s" : ""}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                {totalPages}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                {totalWords.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────────── TAB 2: AI Analysis ────────────────────────── */

function AiAnalysisTab({
  analysisResults,
  loading,
  error,
  onRetry,
}: {
  analysisResults: AnalysisResult[];
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorWithRetry message={error} onRetry={onRetry} />;

  if (analysisResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="w-8 h-8 text-gray-300 mb-3" />
        <p className="text-gray-500">No AI analysis data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {analysisResults.map((item) => {
        const filename =
          item.quote_files?.original_filename || `Document ${item.id.slice(0, 8)}`;
        return (
          <div
            key={item.id}
            className="border rounded-lg p-4 bg-white hover:border-gray-300 transition-colors"
          >
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-gray-400" />
              <h4 className="font-medium text-gray-900 truncate">
                {filename}
              </h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Language</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {item.language_name || item.detected_language || "—"}
                  </span>
                  <ConfidenceBadge value={item.language_confidence} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Doc Type</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {item.detected_document_type || "—"}
                  </span>
                  <ConfidenceBadge value={item.document_type_confidence} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Complexity</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">
                    {item.assessed_complexity || "—"}
                  </span>
                  <ConfidenceBadge value={item.complexity_confidence} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">OCR Confidence</p>
                <ConfidenceBadge value={item.ocr_confidence} />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-3 border-t text-sm text-gray-600">
              <span>
                Words:{" "}
                <strong className="text-gray-900">
                  {item.word_count?.toLocaleString() ?? "—"}
                </strong>
              </span>
              <span>
                Pages:{" "}
                <strong className="text-gray-900">
                  {item.page_count ?? "—"}
                </strong>
              </span>
              <span>
                Billable:{" "}
                <strong className="text-gray-900">
                  {item.billable_pages ?? "—"} pages
                </strong>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────── TAB 3: Pricing ────────────────────────── */

function PricingTab({
  analysisResults,
  loading,
  error,
  onRetry,
}: {
  analysisResults: AnalysisResult[];
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorWithRetry message={error} onRetry={onRetry} />;

  if (analysisResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="w-8 h-8 text-gray-300 mb-3" />
        <p className="text-gray-500">No pricing data available.</p>
      </div>
    );
  }

  const totals = analysisResults.reduce(
    (acc, item) => {
      if (!item.is_excluded) {
        acc.words += item.word_count || 0;
        acc.pages += item.page_count || 0;
        acc.billable += item.billable_pages || 0;
        acc.cert += item.certification_price || 0;
        acc.lineTotal += item.line_total || 0;
      }
      return acc;
    },
    { words: 0, pages: 0, billable: 0, cert: 0, lineTotal: 0 },
  );

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-2.5 px-3 font-medium text-gray-600">
                Document
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-gray-600">
                Words
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-gray-600">
                Pages
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-gray-600">
                Billable
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-gray-600">
                Rate
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-gray-600">
                Cert
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-gray-600">
                Line Total
              </th>
            </tr>
          </thead>
          <tbody>
            {analysisResults.map((item, idx) => {
              const filename =
                item.quote_files?.original_filename ||
                `Document ${item.id.slice(0, 8)}`;
              const excluded = !!item.is_excluded;
              return (
                <tr
                  key={item.id}
                  className={`${idx % 2 === 1 ? "bg-gray-50/50" : ""} ${excluded ? "opacity-50" : ""}`}
                >
                  <td className="py-2.5 px-3">
                    <span className={excluded ? "line-through" : ""}>
                      {filename}
                    </span>
                    {excluded && (
                      <span className="ml-2 text-xs text-gray-400">
                        (Excluded)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {item.word_count?.toLocaleString() ?? "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {item.page_count ?? "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {item.billable_pages ?? "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {fmt(item.base_rate)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {fmt(item.certification_price)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-medium">
                    {fmt(item.line_total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-gray-50 font-semibold">
              <td className="py-2.5 px-3">Totals</td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                {totals.words.toLocaleString()}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                {totals.pages}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                {totals.billable}
              </td>
              <td className="py-2.5 px-3"></td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                {fmt(totals.cert)}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                {fmt(totals.lineTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
