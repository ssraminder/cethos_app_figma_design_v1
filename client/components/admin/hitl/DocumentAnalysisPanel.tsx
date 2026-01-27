import React, { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";

interface AnalysisResult {
  analysis_id: string;
  quote_file_id: string;
  original_filename: string;
  detected_language: string;
  detected_document_type: string;
  assessed_complexity: string;
  complexity_multiplier: number;
  word_count: number;
  page_count: number;
  billable_pages: number;
  line_total: number;
  certification_code: string;
  certification_name: string;
  certification_price: number;
  total_certification_cost: number;
}

interface DocumentAnalysisPanelProps {
  analysisResults: AnalysisResult[];
  loading?: boolean;
}

export default function DocumentAnalysisPanel({
  analysisResults,
  loading = false,
}: DocumentAnalysisPanelProps) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    analysisResults[0]?.quote_file_id || null
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["summary"])
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
      case "easy":
      case "standard":
        return "bg-green-100 text-green-800";
      case "medium":
      case "moderate":
        return "bg-yellow-100 text-yellow-800";
      case "hard":
      case "complex":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
        </div>
      </div>
    );
  }

  if (analysisResults.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-600">No analysis results yet</p>
        <p className="text-xs text-gray-500 mt-1">
          Documents are being analyzed by AI
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Tabs: Document Selection */}
      <div className="flex overflow-x-auto border-b">
        {analysisResults.map((analysis) => (
          <button
            key={analysis.quote_file_id}
            onClick={() => setSelectedFileId(analysis.quote_file_id)}
            className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              selectedFileId === analysis.quote_file_id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
            title={analysis.original_filename}
          >
            <span className="truncate max-w-xs">
              {analysis.original_filename}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {currentAnalysis && (
        <div className="p-4 space-y-2">
          {/* Summary Section */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSection("summary")}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-semibold text-gray-900">
                Analysis Summary
              </h3>
              {expandedSections.has("summary") ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {expandedSections.has("summary") && (
              <div className="px-4 py-3 border-t space-y-2 text-sm bg-gray-50">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-600">Detected Language</p>
                    <p className="font-medium text-gray-900">
                      {currentAnalysis.detected_language}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600">Document Type</p>
                    <p className="font-medium text-gray-900">
                      {currentAnalysis.detected_document_type}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600">Complexity</p>
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${getComplexityColor(
                        currentAnalysis.assessed_complexity
                      )}`}
                    >
                      {currentAnalysis.assessed_complexity}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600">Multiplier</p>
                    <p className="font-medium text-gray-900">
                      {currentAnalysis.complexity_multiplier.toFixed(2)}x
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600">Word Count</p>
                    <p className="font-medium text-gray-900">
                      {currentAnalysis.word_count.toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600">Pages</p>
                    <p className="font-medium text-gray-900">
                      {currentAnalysis.page_count}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Certification Section */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSection("certification")}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-semibold text-gray-900">
                Certification
              </h3>
              {expandedSections.has("certification") ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {expandedSections.has("certification") && (
              <div className="px-4 py-3 border-t space-y-2 text-sm bg-gray-50">
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium text-gray-900">
                    {currentAnalysis.certification_name}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Code:</span>
                  <span className="font-medium text-gray-900">
                    {currentAnalysis.certification_code}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Price:</span>
                  <span className="font-medium text-gray-900">
                    ${Number(currentAnalysis.certification_price).toFixed(2)}
                  </span>
                </div>

                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span className="text-gray-900">Total Cost:</span>
                  <span className="text-green-600">
                    ${Number(currentAnalysis.total_certification_cost).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Pricing Section */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSection("pricing")}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-semibold text-gray-900">
                Document Pricing
              </h3>
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
                    {currentAnalysis.billable_pages}
                  </span>
                </div>

                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span className="text-gray-900">Line Total:</span>
                  <span className="text-green-600">
                    ${Number(currentAnalysis.line_total).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Actions Section */}
          <div className="flex gap-2 pt-2">
            <button className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded hover:bg-blue-100 transition-colors">
              Preview Document
            </button>
            <button className="flex-1 px-3 py-2 text-gray-700 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50 transition-colors">
              Correct Analysis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
