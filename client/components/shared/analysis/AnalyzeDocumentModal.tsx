import { useState, useEffect } from "react";
import {
  X,
  Brain,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Eye,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export interface QuoteFile {
  id: string;
  original_filename: string;
  storage_path?: string;
  mime_type: string;
}

interface OcrSetting {
  id: string;
  provider_name: string;
  display_name: string;
}

interface AnalyzeDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: QuoteFile;
  quoteId: string;
  onAnalysisComplete?: () => void | Promise<void>;
}

type AnalysisType = "ocr_only" | "ocr_ai";
type AnalysisStatus = "idle" | "processing" | "completed" | "error";

interface AnalysisResultData {
  detected_language?: string;
  detected_document_type?: string;
  assessed_complexity?: string;
  word_count?: number;
  page_count?: number;
  billable_pages?: number;
  ocr_text?: string;
  ai_summary?: string;
}

export default function AnalyzeDocumentModal({
  isOpen,
  onClose,
  file,
  quoteId,
  onAnalysisComplete,
}: AnalyzeDocumentModalProps) {
  const [analysisType, setAnalysisType] = useState<AnalysisType>("ocr_ai");
  const [ocrProvider, setOcrProvider] = useState<string>("");
  const [aiModel, setAiModel] = useState<string>("claude-sonnet-4");
  const [ocrProviders, setOcrProviders] = useState<OcrSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResultData | null>(null);
  const [activeTab, setActiveTab] = useState<"ocr" | "analysis">("analysis");

  const AI_MODELS = [
    { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
    { id: "claude-opus-4", name: "Claude Opus 4" },
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gemini-pro", name: "Gemini Pro" },
  ];

  useEffect(() => {
    if (isOpen) {
      loadOcrProviders();
      // Reset state when modal opens
      setStatus("idle");
      setError(null);
      setResults(null);
    }
  }, [isOpen]);

  const loadOcrProviders = async () => {
    try {
      const { data, error } = await supabase
        .from("ocr_settings")
        .select("id, provider_name, display_name")
        .eq("is_active", true);

      if (error) throw error;

      if (data && data.length > 0) {
        setOcrProviders(data);
        setOcrProvider(data[0].provider_name);
      }
    } catch (err) {
      console.error("Error loading OCR providers:", err);
      // Set default if we can't load
      setOcrProviders([{ id: "default", provider_name: "google_vision", display_name: "Google Vision" }]);
      setOcrProvider("google_vision");
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setStatus("processing");
    setError(null);

    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const { data, error } = await supabase.functions.invoke("process-document", {
        body: {
          quoteId,
          fileId: file.id,
          analysisType,
          ocrProvider,
          aiModel: analysisType === "ocr_ai" ? aiModel : undefined,
        },
      });

      clearTimeout(timeoutId);

      if (error) throw error;

      if (data?.success && data?.results?.[0]) {
        const result = data.results[0];
        setResults({
          detected_language: result.detectedLanguage,
          detected_document_type: result.documentType,
          assessed_complexity: result.complexity,
          word_count: result.wordCount,
          page_count: result.pageCount,
          billable_pages: result.billablePages,
          ocr_text: result.ocrText,
          ai_summary: result.aiSummary,
        });
        setStatus("completed");
        toast.success("Document analysis completed");
      } else {
        throw new Error(data?.error || "Analysis failed");
      }
    } catch (err: any) {
      console.error("Analysis error:", err);
      if (err.name === "AbortError") {
        setError("Analysis timed out after 60 seconds. Please try again.");
      } else {
        setError(err.message || "Failed to analyze document");
      }
      setStatus("error");
      toast.error("Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyToQuote = async () => {
    if (onAnalysisComplete) {
      await onAnalysisComplete();
    }
    toast.success("Analysis applied to quote");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Analyze Document
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* File Info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <FileText className="w-5 h-5 text-gray-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.original_filename}
              </p>
              <p className="text-xs text-gray-500">{file.mime_type}</p>
            </div>
          </div>

          {/* Configuration */}
          {status === "idle" && (
            <div className="space-y-4">
              {/* Analysis Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Analysis Type
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="analysisType"
                      value="ocr_only"
                      checked={analysisType === "ocr_only"}
                      onChange={() => setAnalysisType("ocr_only")}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">OCR Only</p>
                      <p className="text-xs text-gray-500">
                        Extract text from the document without AI analysis
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="analysisType"
                      value="ocr_ai"
                      checked={analysisType === "ocr_ai"}
                      onChange={() => setAnalysisType("ocr_ai")}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        OCR + AI Analysis
                      </p>
                      <p className="text-xs text-gray-500">
                        Extract text and analyze with AI for language, type,
                        complexity, and pricing
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* OCR Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  OCR Provider
                </label>
                <select
                  value={ocrProvider}
                  onChange={(e) => setOcrProvider(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ocrProviders.map((provider) => (
                    <option key={provider.id} value={provider.provider_name}>
                      {provider.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* AI Model (only if AI analysis selected) */}
              {analysisType === "ocr_ai" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    AI Model
                  </label>
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {AI_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Processing State */}
          {status === "processing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
              <p className="text-sm text-gray-600">
                Analyzing document... This may take up to 60 seconds.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Please don't close this window.
              </p>
            </div>
          )}

          {/* Error State */}
          {status === "error" && error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Analysis Failed</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setStatus("idle");
                  setError(null);
                }}
                className="mt-3 px-4 py-2 text-sm text-red-700 border border-red-300 rounded-md hover:bg-red-100"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Results */}
          {status === "completed" && results && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Analysis Complete</span>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setActiveTab("analysis")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 ${
                    activeTab === "analysis"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-600 hover:text-gray-900"
                  }`}
                >
                  AI Analysis
                </button>
                <button
                  onClick={() => setActiveTab("ocr")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 ${
                    activeTab === "ocr"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-600 hover:text-gray-900"
                  }`}
                >
                  OCR Results
                </button>
              </div>

              {/* Analysis Tab */}
              {activeTab === "analysis" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">Language</p>
                      <p className="text-sm font-medium text-gray-900">
                        {results.detected_language || "Unknown"}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">Document Type</p>
                      <p className="text-sm font-medium text-gray-900">
                        {results.detected_document_type || "Unknown"}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">Complexity</p>
                      <p className="text-sm font-medium text-gray-900">
                        {results.assessed_complexity || "Unknown"}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">Word Count</p>
                      <p className="text-sm font-medium text-gray-900">
                        {results.word_count?.toLocaleString() || "0"}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">Page Count</p>
                      <p className="text-sm font-medium text-gray-900">
                        {results.page_count || "0"}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">Billable Pages</p>
                      <p className="text-sm font-medium text-gray-900">
                        {results.billable_pages || "0"}
                      </p>
                    </div>
                  </div>

                  {results.ai_summary && (
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-700 mb-1">AI Summary</p>
                      <p className="text-sm text-gray-900">{results.ai_summary}</p>
                    </div>
                  )}
                </div>
              )}

              {/* OCR Tab */}
              {activeTab === "ocr" && (
                <div className="border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto bg-gray-50">
                  {results.ocr_text ? (
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                      {results.ocr_text}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center py-8 text-gray-500">
                      <Eye className="w-5 h-5 mr-2" />
                      <span className="text-sm">No OCR text available</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>

          {status === "idle" && (
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Brain className="w-4 h-4" />
              Start Analysis
            </button>
          )}

          {status === "completed" && (
            <button
              onClick={handleApplyToQuote}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Apply to Quote
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
