import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Brain,
  Edit3,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DEFAULT_DOCUMENT_TYPES,
  COMPLEXITY_OPTIONS,
  DEFAULT_WORDS_PER_PAGE,
} from "@/types/document-editor";

// ============================================
// INTERFACES
// ============================================

interface QuoteFile {
  id: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  ai_processing_status: string;
  category_id: string;
  category?: { slug: string; name: string };
}

interface QuotePage {
  id: string;
  page_number: number;
  word_count: number;
  complexity?: string;
  complexity_multiplier?: number;
}

interface AnalysisResult {
  id: string;
  quote_file_id: string;
  detected_document_type: string;
  extracted_holder_name: string | null;
  extracted_issuing_country: string | null;
  assessed_complexity: string;
  complexity_multiplier: number;
}

interface PageGrouping {
  pageId: string;
  groupId: string;
}

interface DocumentGroupLocal {
  id: string;
  name: string;
}

interface FileAccordionProps {
  file: QuoteFile;
  analysisResult?: AnalysisResult;
  pages?: QuotePage[];
  onAnalyze: (fileId: string) => Promise<void>;
  onManualEntry: (fileId: string) => void;
  onSubmit: (fileId: string, groupings: PageGrouping[]) => Promise<void>;
  isAnalyzing?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const COUNTRY_OPTIONS = [
  "Canada",
  "United States",
  "United Kingdom",
  "Mexico",
  "France",
  "Germany",
  "Spain",
  "Italy",
  "China",
  "Japan",
  "India",
  "Brazil",
  "Other",
];

// ============================================
// COMPONENT
// ============================================

export default function FileAccordion({
  file,
  analysisResult,
  pages = [],
  onAnalyze,
  onManualEntry,
  onSubmit,
  isAnalyzing = false,
}: FileAccordionProps) {
  // ============================================
  // STATE
  // ============================================
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOneDocument, setIsOneDocument] = useState(true);
  const [documentGroups, setDocumentGroups] = useState<DocumentGroupLocal[]>([
    { id: "group-1", name: "Document 1" },
  ]);
  const [pageGroupings, setPageGroupings] = useState<Record<string, string>>(
    {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Local editable state for analysis fields
  const [localDocumentType, setLocalDocumentType] = useState<string>("");
  const [localHolderName, setLocalHolderName] = useState<string>("");
  const [localCountry, setLocalCountry] = useState<string>("");
  const [localComplexities, setLocalComplexities] = useState<
    Record<string, string>
  >({});

  // Initialize local state when analysis result changes
  useEffect(() => {
    if (analysisResult) {
      setLocalDocumentType(analysisResult.detected_document_type || "");
      setLocalHolderName(analysisResult.extracted_holder_name || "");
      setLocalCountry(analysisResult.extracted_issuing_country || "");
    }
  }, [analysisResult]);

  // Initialize page groupings and complexities when pages change
  useEffect(() => {
    if (pages.length > 0) {
      const initialGroupings: Record<string, string> = {};
      const initialComplexities: Record<string, string> = {};
      pages.forEach((page) => {
        if (!pageGroupings[page.id]) {
          initialGroupings[page.id] = documentGroups[0]?.id || "group-1";
        }
        initialComplexities[page.id] = page.complexity || "medium";
      });
      setPageGroupings((prev) => ({ ...initialGroupings, ...prev }));
      setLocalComplexities(initialComplexities);
    }
  }, [pages]);

  // ============================================
  // HELPERS
  // ============================================

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = () => {
    if (isAnalyzing) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
          <Loader2 className="w-3 h-3 animate-spin" />
          Analyzing...
        </span>
      );
    }

    if (analysisResult) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
          <CheckCircle className="w-3 h-3" />
          Analyzed
        </span>
      );
    }

    const status = file.ai_processing_status;
    if (status === "failed") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
          <AlertCircle className="w-3 h-3" />
          Failed
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
        Not analyzed
      </span>
    );
  };

  const calculateBillablePages = (
    wordCount: number,
    complexity: string
  ): number => {
    const multiplier =
      COMPLEXITY_OPTIONS.find((c) => c.value === complexity)?.multiplier || 1.0;
    return (
      Math.ceil((wordCount / DEFAULT_WORDS_PER_PAGE) * multiplier * 10) / 10
    );
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleAddGroup = () => {
    const newId = `group-${documentGroups.length + 1}`;
    setDocumentGroups([
      ...documentGroups,
      { id: newId, name: `Document ${documentGroups.length + 1}` },
    ]);
  };

  const handleRemoveGroup = (groupId: string) => {
    if (documentGroups.length <= 1) return;
    setDocumentGroups(documentGroups.filter((g) => g.id !== groupId));
    // Reassign pages from removed group to first group
    const newGroupings = { ...pageGroupings };
    Object.keys(newGroupings).forEach((pageId) => {
      if (newGroupings[pageId] === groupId) {
        newGroupings[pageId] = documentGroups[0].id;
      }
    });
    setPageGroupings(newGroupings);
  };

  const handleGroupNameChange = (groupId: string, name: string) => {
    setDocumentGroups(
      documentGroups.map((g) => (g.id === groupId ? { ...g, name } : g))
    );
  };

  const handlePageGroupChange = (pageId: string, groupId: string) => {
    setPageGroupings({ ...pageGroupings, [pageId]: groupId });
  };

  const handleComplexityChange = (pageId: string, complexity: string) => {
    setLocalComplexities({ ...localComplexities, [pageId]: complexity });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const groupings = pages.map((p) => ({
        pageId: p.id,
        groupId: pageGroupings[p.id] || documentGroups[0].id,
      }));
      await onSubmit(file.id, groupings);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group pages by document group for summary
  const getGroupSummary = () => {
    const summary: Record<string, number[]> = {};
    pages.forEach((page) => {
      const groupId = pageGroupings[page.id] || documentGroups[0].id;
      if (!summary[groupId]) {
        summary[groupId] = [];
      }
      summary[groupId].push(page.page_number);
    });
    return summary;
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      {/* Collapsed Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-500" />
          )}
          <FileText className="w-5 h-5 text-gray-400" />
          <div className="text-left">
            <span className="font-medium text-gray-900">
              {file.original_filename}
            </span>
            <span className="ml-2 text-sm text-gray-500">
              ({pages.length} page{pages.length !== 1 ? "s" : ""})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">{getStatusBadge()}</div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          {/* Not Analyzed State */}
          {!analysisResult && !isAnalyzing && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <p className="text-gray-500 text-sm">
                Choose how to analyze this file:
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => onAnalyze(file.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
                >
                  <Brain className="w-4 h-4" />
                  Analyze with AI
                </button>
                <button
                  onClick={() => onManualEntry(file.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  Enter Manually
                </button>
              </div>
            </div>
          )}

          {/* Analyzing State */}
          {isAnalyzing && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
              <p className="text-gray-600">Analyzing document...</p>
              <div className="w-64 bg-gray-200 rounded-full h-2">
                <div className="bg-teal-600 h-2 rounded-full w-1/2 animate-pulse"></div>
              </div>
            </div>
          )}

          {/* Analyzed State */}
          {analysisResult && !isAnalyzing && (
            <div className="space-y-6">
              {/* Document Metadata */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Document Type
                  </label>
                  <select
                    value={localDocumentType}
                    onChange={(e) => setLocalDocumentType(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    {DEFAULT_DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Holder's Name
                  </label>
                  <input
                    type="text"
                    value={localHolderName}
                    onChange={(e) => setLocalHolderName(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Enter name..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Country
                  </label>
                  <select
                    value={localCountry}
                    onChange={(e) => setLocalCountry(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Select country...</option>
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Document Structure Toggle */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Document Structure
                </label>
                <div className="flex gap-4">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name={`docStructure-${file.id}`}
                      checked={isOneDocument}
                      onChange={() => setIsOneDocument(true)}
                      className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      One Document
                    </span>
                  </label>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name={`docStructure-${file.id}`}
                      checked={!isOneDocument}
                      onChange={() => setIsOneDocument(false)}
                      className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      Multiple Documents
                    </span>
                  </label>
                </div>
              </div>

              {/* Page Breakdown Table */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Page Breakdown
                </label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">
                          Page
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">
                          Words
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">
                          Complexity
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">
                          Billable
                        </th>
                        {!isOneDocument && (
                          <th className="px-4 py-2 text-left font-medium text-gray-600">
                            Document Group
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {pages.map((page) => {
                        const complexity =
                          localComplexities[page.id] || "medium";
                        const billable = calculateBillablePages(
                          page.word_count,
                          complexity
                        );

                        return (
                          <tr key={page.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2">{page.page_number}</td>
                            <td className="px-4 py-2">{page.word_count}</td>
                            <td className="px-4 py-2">
                              <select
                                value={complexity}
                                onChange={(e) =>
                                  handleComplexityChange(page.id, e.target.value)
                                }
                                className="border border-gray-300 rounded px-2 py-1 text-sm"
                              >
                                {COMPLEXITY_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-2 font-medium">
                              {billable.toFixed(2)}
                            </td>
                            {!isOneDocument && (
                              <td className="px-4 py-2">
                                <select
                                  value={
                                    pageGroupings[page.id] ||
                                    documentGroups[0]?.id
                                  }
                                  onChange={(e) =>
                                    handlePageGroupChange(
                                      page.id,
                                      e.target.value
                                    )
                                  }
                                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                                >
                                  {documentGroups.map((group) => (
                                    <option key={group.id} value={group.id}>
                                      {group.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Document Groups Management (only if multiple documents) */}
              {!isOneDocument && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Document Groups
                  </label>
                  <div className="space-y-2">
                    {documentGroups.map((group) => {
                      const summary = getGroupSummary();
                      const pageNumbers = summary[group.id] || [];
                      const pageRange =
                        pageNumbers.length > 0
                          ? `Pages ${pageNumbers.join(", ")}`
                          : "No pages assigned";

                      return (
                        <div
                          key={group.id}
                          className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
                        >
                          <input
                            type="text"
                            value={group.name}
                            onChange={(e) =>
                              handleGroupNameChange(group.id, e.target.value)
                            }
                            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-gray-500">
                            ({pageRange})
                          </span>
                          {documentGroups.length > 1 && (
                            <button
                              onClick={() => handleRemoveGroup(group.id)}
                              className="p-1 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={handleAddGroup}
                      className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"
                    >
                      <Plus className="w-4 h-4" />
                      Add Document Group
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Submit Groupings
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
