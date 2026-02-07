import React, { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

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

interface OcrResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  showActions?: boolean;
  onApplyToQuote?: (data: OcrApplyData) => void;
  mode?: "view" | "select";
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
  showActions = false,
  onApplyToQuote,
  mode = "view",
}: OcrResultsModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [pageData, setPageData] = useState<OcrPageData[]>([]);
  const [expandedPage, setExpandedPage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedPage, setCopiedPage] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Computed values
  const totalWords = pageData.reduce((sum, p) => sum + (p.word_count || 0), 0);
  const avgConfidence =
    pageData.length > 0
      ? pageData.reduce((sum, p) => sum + (p.confidence_score || 0), 0) /
        pageData.length
      : 0;
  const primaryLanguage = getMostCommonLanguage(pageData);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchResults = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase configuration is missing");
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/ocr-batch-results?batchId=${encodeURIComponent(fileId)}&includeText=true`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch OCR results (${response.status})`);
      }

      const data = await response.json();

      // Extract page data from the response files array
      const file = data.files?.find(
        (f: { id: string }) => f.id === fileId
      );
      const pages: OcrPageData[] = (file?.pages || data.files?.[0]?.pages || []).map(
        (p: {
          page_number: number;
          word_count: number;
          confidence_score?: number;
          raw_text?: string;
          detected_language?: string;
          language_confidence?: number;
        }) => ({
          page_number: p.page_number,
          word_count: p.word_count || 0,
          confidence_score: p.confidence_score ?? null,
          raw_text: p.raw_text ?? null,
          detected_language: p.detected_language ?? null,
          language_confidence: p.language_confidence ?? null,
        })
      );

      setPageData(pages);
    } catch (err) {
      console.error("Error fetching OCR results:", err);
      setError((err as Error).message || "Failed to load OCR results");
    } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (isOpen && fileId) {
      fetchResults();
    }
    // Reset state when modal closes
    if (!isOpen) {
      setPageData([]);
      setExpandedPage(null);
      setError(null);
      setCopiedPage(null);
      setCopiedAll(false);
    }
  }, [isOpen, fileId, fetchResults]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

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
    const allText = pageData
      .filter((p) => p.raw_text)
      .map((p) => `--- Page ${p.page_number} ---\n${p.raw_text}`)
      .join("\n\n");

    if (!allText) {
      toast.error("No text available to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(allText);
      setCopiedAll(true);
      toast.success("All text copied to clipboard");
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast.error("Failed to copy text");
    }
  };

  const handleApplyToQuote = () => {
    if (onApplyToQuote) {
      onApplyToQuote({
        pages: pageData.length,
        words: totalWords,
        language: primaryLanguage || "en",
      });
    }
  };

  const toggleExpandedPage = (pageNum: number) => {
    setExpandedPage((prev) => (prev === pageNum ? null : pageNum));
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!isOpen) return null;

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
                {fileName}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">OCR Results</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isLoading && pageData.length > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {pageData.length} {pageData.length === 1 ? "page" : "pages"}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <SkeletonTable />
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
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
                onClick={fetchResults}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Retry
              </button>
            </div>
          )}

          {/* Results */}
          {!isLoading && !error && pageData.length > 0 && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Pages & Words */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">
                      Pages & Words
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-blue-900">
                    {pageData.length} {pageData.length === 1 ? "Page" : "Pages"}
                  </div>
                  <div className="text-sm text-blue-700 mt-0.5">
                    {totalWords.toLocaleString()} Words
                  </div>
                </div>

                {/* OCR Confidence */}
                <div
                  className={`p-4 border rounded-lg ${confidenceBgColor(avgConfidence)}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle
                      className={`w-5 h-5 ${confidenceIconColor(avgConfidence)}`}
                    />
                    <span
                      className={`text-sm font-medium ${confidenceColor(avgConfidence)}`}
                    >
                      OCR Confidence
                    </span>
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      avgConfidence >= 90
                        ? "text-green-900"
                        : avgConfidence >= 70
                          ? "text-yellow-900"
                          : "text-red-900"
                    }`}
                  >
                    {avgConfidence.toFixed(1)}%
                  </div>
                  <div
                    className={`text-sm mt-0.5 ${
                      avgConfidence >= 90
                        ? "text-green-700"
                        : avgConfidence >= 70
                          ? "text-yellow-700"
                          : "text-red-700"
                    }`}
                  >
                    Confidence
                  </div>
                </div>

                {/* Language */}
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-5 h-5 text-purple-600" />
                    <span className="text-sm font-medium text-purple-700">
                      Language
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-purple-900">
                    {getLanguageName(primaryLanguage)}
                  </div>
                  <div className="text-sm text-purple-700 mt-0.5">
                    {getLanguageFlag(primaryLanguage)} Primary Language
                  </div>
                </div>
              </div>

              {/* Page Details Table */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Page Details
                </h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-700">
                            Page
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-700">
                            Words
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-700">
                            Confidence
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-700">
                            Language
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-700">
                            Text
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {pageData.map((page) => (
                          <React.Fragment key={page.page_number}>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">
                                {page.page_number}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {page.word_count.toLocaleString()}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`font-medium ${confidenceColor(page.confidence_score || 0)}`}
                                >
                                  {page.confidence_score != null
                                    ? `${page.confidence_score.toFixed(1)}%`
                                    : "N/A"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {page.detected_language ? (
                                  <span>
                                    {getLanguageFlag(page.detected_language)}{" "}
                                    {getLanguageName(page.detected_language)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">N/A</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {page.raw_text ? (
                                  <button
                                    onClick={() =>
                                      toggleExpandedPage(page.page_number)
                                    }
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
                                  <span className="text-xs text-gray-400">
                                    No text
                                  </span>
                                )}
                              </td>
                            </tr>

                            {/* Expanded Text Section */}
                            {expandedPage === page.page_number &&
                              page.raw_text && (
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
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && pageData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-3 bg-gray-100 rounded-full mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No OCR Results
              </h3>
              <p className="text-sm text-gray-600 text-center max-w-md">
                No OCR page data was found for this file. The document may not
                have been processed yet.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          {showActions && !isLoading && !error && pageData.length > 0 && (
            <>
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
              {onApplyToQuote && (
                <button
                  onClick={handleApplyToQuote}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Apply to Quote
                </button>
              )}
            </>
          )}
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
