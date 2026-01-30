import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Edit2,
  RefreshCw,
  PenTool,
  DollarSign,
  Award,
  Loader2,
} from "lucide-react";

export interface AnalysisResult {
  id: string;
  quote_file_id: string;
  original_filename: string;
  detected_language: string;
  detected_document_type: string;
  assessed_complexity: string;
  complexity_multiplier: number;
  word_count: number;
  page_count: number;
  billable_pages: number;
  base_rate: number;
  line_total: number;
  certification_type_id?: string;
  certification_price?: number;
}

interface DocumentAnalysisPanelProps {
  analysisResults: AnalysisResult[];
  loading?: boolean;
  onEdit?: (analysisId: string) => void;
  onReanalyze?: (fileId: string) => void;
  onManualEntry?: (fileId: string) => void;
}

export default function DocumentAnalysisPanel({
  analysisResults,
  loading = false,
  onEdit,
  onReanalyze,
  onManualEntry,
}: DocumentAnalysisPanelProps) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    analysisResults[0]?.quote_file_id || null
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["summary", "pricing"])
  );

  const currentAnalysis = analysisResults.find(
    (a) => a.quote_file_id === selectedFileId
  );

  const toggleSection = (section: string) => {
    const newSections = new Set(expandedSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setExpandedSections(newSections);
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity?.toLowerCase()) {
      case "low":
      case "easy":
      case "standard":
        return "bg-green-100 text-green-800";
      case "medium":
      case "moderate":
        return "bg-yellow-100 text-yellow-800";
      case "high":
      case "hard":
      case "complex":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <span className="text-sm text-gray-600">Loading analysis results...</span>
        </div>
      </div>
    );
  }

  if (analysisResults.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-600">No analysis results available</p>
        <p className="text-xs text-gray-500 mt-1">
          Upload and analyze documents to see results here
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Tabs: Document Selection */}
      {analysisResults.length > 1 && (
        <div className="flex overflow-x-auto border-b">
          {analysisResults.map((analysis) => (
            <button
              key={analysis.quote_file_id}
              onClick={() => setSelectedFileId(analysis.quote_file_id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                selectedFileId === analysis.quote_file_id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
              title={analysis.original_filename}
            >
              <span className="truncate max-w-[200px] inline-block">
                {analysis.original_filename}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {currentAnalysis && (
        <div className="p-4 space-y-3">
          {/* Header with filename and actions */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">
                {analysisResults.length === 1 ? currentAnalysis.original_filename : "Document Analysis"}
              </h3>
            </div>
            <div className="flex gap-2">
              {onEdit && (
                <button
                  onClick={() => onEdit(currentAnalysis.id)}
                  className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit
                </button>
              )}
              {onReanalyze && (
                <button
                  onClick={() => onReanalyze(currentAnalysis.quote_file_id)}
                  className="px-3 py-1.5 text-xs bg-gray-50 text-gray-700 rounded hover:bg-gray-100 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Re-analyze
                </button>
              )}
              {onManualEntry && (
                <button
                  onClick={() => onManualEntry(currentAnalysis.quote_file_id)}
                  className="px-3 py-1.5 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100 flex items-center gap-1"
                >
                  <PenTool className="w-3 h-3" />
                  Manual Entry
                </button>
              )}
            </div>
          </div>

          {/* Summary Section */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSection("summary")}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <h4 className="text-sm font-medium text-gray-900">Summary</h4>
              </div>
              {expandedSections.has("summary") ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {expandedSections.has("summary") && (
              <div className="px-4 py-3 border-t space-y-3 text-sm bg-gray-50">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600">Detected Language</p>
                    <p className="font-medium text-gray-900">
                      {currentAnalysis.detected_language || "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Document Type</p>
                    <p className="font-medium text-gray-900">
                      {currentAnalysis.detected_document_type || "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Complexity</p>
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${getComplexityColor(
                        currentAnalysis.assessed_complexity
                      )}`}
                    >
                      {currentAnalysis.assessed_complexity || "Unknown"}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Multiplier</p>
                    <p className="font-medium text-gray-900">
                      {currentAnalysis.complexity_multiplier?.toFixed(2) || "1.00"}x
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Word Count</p>
                    <p className="font-medium text-gray-900">
                      {currentAnalysis.word_count?.toLocaleString() || "0"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Page Count</p>
                    <p className="font-medium text-gray-900">
                      {currentAnalysis.page_count || "0"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Certification Section */}
          {currentAnalysis.certification_type_id && (
            <div className="border border-gray-200 rounded-lg">
              <button
                onClick={() => toggleSection("certification")}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-gray-500" />
                  <h4 className="text-sm font-medium text-gray-900">Certification</h4>
                </div>
                {expandedSections.has("certification") ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {expandedSections.has("certification") && (
                <div className="px-4 py-3 border-t space-y-2 text-sm bg-gray-50">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Certification Cost:</span>
                    <span className="font-medium text-gray-900">
                      ${(currentAnalysis.certification_price || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pricing Section */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSection("pricing")}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-500" />
                <h4 className="text-sm font-medium text-gray-900">Pricing</h4>
              </div>
              {expandedSections.has("pricing") ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {expandedSections.has("pricing") && (
              <div className="px-4 py-3 border-t space-y-2 text-sm bg-gray-50">
                <div className="flex justify-between">
                  <span className="text-gray-600">Billable Pages:</span>
                  <span className="font-medium text-gray-900">
                    {currentAnalysis.billable_pages || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Base Rate:</span>
                  <span className="font-medium text-gray-900">
                    ${(currentAnalysis.base_rate || 0).toFixed(2)}/page
                  </span>
                </div>
                {currentAnalysis.certification_price && currentAnalysis.certification_price > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Certification:</span>
                    <span className="font-medium text-gray-900">
                      ${currentAnalysis.certification_price.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-semibold text-blue-700">
                  <span>Line Total:</span>
                  <span>${(currentAnalysis.line_total || 0).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
