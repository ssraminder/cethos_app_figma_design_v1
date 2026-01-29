import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Edit2,
  Save,
  X,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

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
  language_confidence?: number;
  document_type_confidence?: number;
  complexity_confidence?: number;
}

interface Language {
  id: string;
  name: string;
  code: string;
}

interface DocumentType {
  id: string;
  name: string;
  code: string;
}

interface EditableDocumentAnalysisPanelProps {
  analysisResults: AnalysisResult[];
  quoteId: string;
  staffId: string;
  loading?: boolean;
  onUpdate?: () => void;
}

interface EditState {
  isEditing: boolean;
  detectedLanguage: string;
  detectedDocumentType: string;
  assessedComplexity: string;
  wordCount: number;
  pageCount: number;
  billablePages: number;
}

export default function EditableDocumentAnalysisPanel({
  analysisResults,
  quoteId,
  staffId,
  loading = false,
  onUpdate,
}: EditableDocumentAnalysisPanelProps) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    analysisResults[0]?.quote_file_id || null,
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["summary"]),
  );

  // Editing state
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Dropdown options
  const [languages, setLanguages] = useState<Language[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);

  // Correction modal state
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [submitToKnowledgeBase, setSubmitToKnowledgeBase] = useState(true);
  const [knowledgeBaseComment, setKnowledgeBaseComment] = useState("");
  const [pendingCorrection, setPendingCorrection] = useState<{
    field: string;
    aiValue: any;
    correctedValue: any;
    analysisId: string;
  } | null>(null);
  const [removingAnalysisId, setRemovingAnalysisId] = useState<string | null>(null);

  const currentAnalysis = analysisResults.find(
    (a) => a.quote_file_id === selectedFileId,
  );

  useEffect(() => {
    loadDropdownOptions();
  }, []);

  useEffect(() => {
    // Initialize edit states for all analysis results
    const initialStates: Record<string, EditState> = {};
    analysisResults.forEach((analysis) => {
      initialStates[analysis.quote_file_id] = {
        isEditing: false,
        detectedLanguage: analysis.detected_language,
        detectedDocumentType: analysis.detected_document_type,
        assessedComplexity: analysis.assessed_complexity,
        wordCount: analysis.word_count,
        pageCount: analysis.page_count,
        billablePages: analysis.billable_pages,
      };
    });
    setEditStates(initialStates);
  }, [analysisResults]);

  const loadDropdownOptions = async () => {
    if (!supabase) return;

    try {
      const [languagesRes, docTypesRes] = await Promise.all([
        supabase.from("languages").select("id, name, code").order("name"),
        supabase.from("document_types").select("id, name, code").order("name"),
      ]);

      if (languagesRes.data) setLanguages(languagesRes.data);
      if (docTypesRes.data) setDocumentTypes(docTypesRes.data);
    } catch (error) {
      console.error("Error loading dropdown options:", error);
    }
  };

  const toggleSection = (section: string) => {
    const newSections = new Set(expandedSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setExpandedSections(newSections);
  };

  const toggleEdit = (fileId: string) => {
    setEditStates((prev) => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        isEditing: !prev[fileId]?.isEditing,
      },
    }));
  };

  const cancelEdit = (fileId: string) => {
    const analysis = analysisResults.find((a) => a.quote_file_id === fileId);
    if (analysis) {
      setEditStates((prev) => ({
        ...prev,
        [fileId]: {
          isEditing: false,
          detectedLanguage: analysis.detected_language,
          detectedDocumentType: analysis.detected_document_type,
          assessedComplexity: analysis.assessed_complexity,
          wordCount: analysis.word_count,
          pageCount: analysis.page_count,
          billablePages: analysis.billable_pages,
        },
      }));
    }
  };

  const updateEditState = (fileId: string, field: string, value: any) => {
    setEditStates((prev) => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        [field]: value,
      },
    }));
  };

  const prepareCorrection = async (
    field: string,
    aiValue: any,
    correctedValue: any,
    analysisId: string,
  ) => {
    setPendingCorrection({ field, aiValue, correctedValue, analysisId });
    setShowCorrectionModal(true);
  };

  const saveCorrection = async () => {
    if (!pendingCorrection || !supabase) return;

    try {
      // Insert correction record
      const { error: correctionError } = await supabase
        .from("staff_corrections")
        .insert({
          quote_id: quoteId,
          analysis_id: pendingCorrection.analysisId,
          field_name: pendingCorrection.field,
          ai_value: String(pendingCorrection.aiValue),
          corrected_value: String(pendingCorrection.correctedValue),
          correction_reason: correctionReason,
          submit_to_knowledge_base: submitToKnowledgeBase,
          knowledge_base_comment: submitToKnowledgeBase
            ? knowledgeBaseComment
            : null,
          created_by_staff_id: staffId,
        });

      if (correctionError) throw correctionError;

      toast.success(
        submitToKnowledgeBase
          ? "Correction saved and submitted to knowledge base"
          : "Correction saved",
      );

      // Reset modal
      setShowCorrectionModal(false);
      setCorrectionReason("");
      setKnowledgeBaseComment("");
      setPendingCorrection(null);
    } catch (error) {
      console.error("Error saving correction:", error);
      toast.error("Failed to save correction");
    }
  };

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

    setRemovingAnalysisId(analysisId);

    try {
      if (!supabase) throw new Error("Supabase not initialized");

      // 1. Delete from ai_analysis_results
      const { error: deleteError } = await supabase
        .from("ai_analysis_results")
        .delete()
        .eq("id", analysisId);

      if (deleteError) throw deleteError;

      // 2. Reset quote_files status to 'skipped' (not 'pending' to avoid auto-processing)
      const { error: updateError } = await supabase
        .from("quote_files")
        .update({ ai_processing_status: "skipped" })
        .eq("id", fileId);

      if (updateError) throw updateError;

      toast.success(`Analysis removed for "${fileName}"`);

      // 3. Refresh data
      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      console.error("Error removing analysis:", error);
      toast.error(`Failed to remove analysis: ${error.message}`);
    } finally {
      setRemovingAnalysisId(null);
    }
  };

  const saveChanges = async (fileId: string) => {
    const analysis = analysisResults.find((a) => a.quote_file_id === fileId);
    const editState = editStates[fileId];

    if (!analysis || !editState || !supabase) return;

    setIsSaving(true);

    try {
      // Check what changed and prepare corrections
      const changes: Array<{
        field: string;
        aiValue: any;
        correctedValue: any;
      }> = [];

      if (editState.detectedLanguage !== analysis.detected_language) {
        changes.push({
          field: "language",
          aiValue: analysis.detected_language,
          correctedValue: editState.detectedLanguage,
        });
      }

      if (editState.detectedDocumentType !== analysis.detected_document_type) {
        changes.push({
          field: "document_type",
          aiValue: analysis.detected_document_type,
          correctedValue: editState.detectedDocumentType,
        });
      }

      if (editState.assessedComplexity !== analysis.assessed_complexity) {
        changes.push({
          field: "complexity",
          aiValue: analysis.assessed_complexity,
          correctedValue: editState.assessedComplexity,
        });
      }

      if (editState.wordCount !== analysis.word_count) {
        changes.push({
          field: "word_count",
          aiValue: analysis.word_count,
          correctedValue: editState.wordCount,
        });
      }

      if (editState.pageCount !== analysis.page_count) {
        changes.push({
          field: "page_count",
          aiValue: analysis.page_count,
          correctedValue: editState.pageCount,
        });
      }

      if (editState.billablePages !== analysis.billable_pages) {
        changes.push({
          field: "billable_pages",
          aiValue: analysis.billable_pages,
          correctedValue: editState.billablePages,
        });
      }

      // If there are changes, prompt for correction reason
      if (changes.length > 0) {
        // For now, save the first change and prompt
        // In a full implementation, you'd batch all changes
        const firstChange = changes[0];
        await prepareCorrection(
          firstChange.field,
          firstChange.aiValue,
          firstChange.correctedValue,
          analysis.analysis_id,
        );
      }

      // Update the analysis record
      const { error: updateError } = await supabase
        .from("ai_analysis_results")
        .update({
          detected_language: editState.detectedLanguage,
          detected_document_type: editState.detectedDocumentType,
          assessed_complexity: editState.assessedComplexity,
          word_count: editState.wordCount,
          page_count: editState.pageCount,
          billable_pages: editState.billablePages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", analysis.analysis_id);

      if (updateError) throw updateError;

      toggleEdit(fileId);

      if (onUpdate) onUpdate();

      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
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

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return "text-gray-400";
    if (confidence >= 0.8) return "text-green-600";
    if (confidence >= 0.6) return "text-yellow-600";
    return "text-red-600";
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

  const currentEditState = currentAnalysis
    ? editStates[currentAnalysis.quote_file_id]
    : null;

  return (
    <>
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
        {currentAnalysis && currentEditState && (
          <div className="p-4 space-y-2">
            {/* Edit Controls */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Document Analysis
              </h3>
              <div className="flex gap-2">
                {currentEditState.isEditing ? (
                  <>
                    <button
                      onClick={() => cancelEdit(currentAnalysis.quote_file_id)}
                      className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                    <button
                      onClick={() => saveChanges(currentAnalysis.quote_file_id)}
                      disabled={isSaving}
                      className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => toggleEdit(currentAnalysis.quote_file_id)}
                      className="px-3 py-1.5 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 flex items-center gap-1"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        handleRemoveAnalysis(
                          currentAnalysis.analysis_id,
                          currentAnalysis.quote_file_id,
                          currentAnalysis.original_filename,
                        )
                      }
                      disabled={removingAnalysisId === currentAnalysis.analysis_id}
                      className="px-3 py-1.5 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 flex items-center gap-1 disabled:opacity-50"
                      title="Remove analysis (file will remain for re-analysis)"
                    >
                      <X className="w-4 h-4" />
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>

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
                <div className="px-4 py-3 border-t space-y-3 text-sm bg-gray-50">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Detected Language */}
                    <div>
                      <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                        Detected Language
                        {currentAnalysis.language_confidence && (
                          <span
                            className={`text-xs ${getConfidenceColor(currentAnalysis.language_confidence)}`}
                          >
                            (
                            {(
                              currentAnalysis.language_confidence * 100
                            ).toFixed(0)}
                            %)
                          </span>
                        )}
                      </p>
                      {currentEditState.isEditing ? (
                        <select
                          value={currentEditState.detectedLanguage}
                          onChange={(e) =>
                            updateEditState(
                              currentAnalysis.quote_file_id,
                              "detectedLanguage",
                              e.target.value,
                            )
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        >
                          {languages.map((lang) => (
                            <option key={lang.id} value={lang.name}>
                              {lang.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="font-medium text-gray-900">
                          {currentEditState.detectedLanguage}
                        </p>
                      )}
                    </div>

                    {/* Document Type */}
                    <div>
                      <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                        Document Type
                        {currentAnalysis.document_type_confidence && (
                          <span
                            className={`text-xs ${getConfidenceColor(currentAnalysis.document_type_confidence)}`}
                          >
                            (
                            {(
                              currentAnalysis.document_type_confidence * 100
                            ).toFixed(0)}
                            %)
                          </span>
                        )}
                      </p>
                      {currentEditState.isEditing ? (
                        <select
                          value={currentEditState.detectedDocumentType}
                          onChange={(e) =>
                            updateEditState(
                              currentAnalysis.quote_file_id,
                              "detectedDocumentType",
                              e.target.value,
                            )
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        >
                          {documentTypes.map((docType) => (
                            <option key={docType.id} value={docType.name}>
                              {docType.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="font-medium text-gray-900">
                          {currentEditState.detectedDocumentType}
                        </p>
                      )}
                    </div>

                    {/* Complexity */}
                    <div>
                      <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                        Complexity
                        {currentAnalysis.complexity_confidence && (
                          <span
                            className={`text-xs ${getConfidenceColor(currentAnalysis.complexity_confidence)}`}
                          >
                            (
                            {(
                              currentAnalysis.complexity_confidence * 100
                            ).toFixed(0)}
                            %)
                          </span>
                        )}
                      </p>
                      {currentEditState.isEditing ? (
                        <select
                          value={currentEditState.assessedComplexity}
                          onChange={(e) =>
                            updateEditState(
                              currentAnalysis.quote_file_id,
                              "assessedComplexity",
                              e.target.value,
                            )
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${getComplexityColor(
                            currentEditState.assessedComplexity,
                          )}`}
                        >
                          {currentEditState.assessedComplexity}
                        </span>
                      )}
                    </div>

                    {/* Multiplier (read-only) */}
                    <div>
                      <p className="text-xs text-gray-600">Multiplier</p>
                      <p className="font-medium text-gray-900">
                        {currentAnalysis.complexity_multiplier.toFixed(2)}x
                      </p>
                    </div>

                    {/* Word Count */}
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Word Count</p>
                      {currentEditState.isEditing ? (
                        <input
                          type="number"
                          value={currentEditState.wordCount}
                          onChange={(e) =>
                            updateEditState(
                              currentAnalysis.quote_file_id,
                              "wordCount",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      ) : (
                        <p className="font-medium text-gray-900">
                          {currentEditState.wordCount.toLocaleString()}
                        </p>
                      )}
                    </div>

                    {/* Page Count */}
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Pages</p>
                      {currentEditState.isEditing ? (
                        <input
                          type="number"
                          value={currentEditState.pageCount}
                          onChange={(e) =>
                            updateEditState(
                              currentAnalysis.quote_file_id,
                              "pageCount",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      ) : (
                        <p className="font-medium text-gray-900">
                          {currentEditState.pageCount}
                        </p>
                      )}
                    </div>

                    {/* Billable Pages */}
                    <div className="col-span-2">
                      <p className="text-xs text-gray-600 mb-1">
                        Billable Pages
                      </p>
                      {currentEditState.isEditing ? (
                        <input
                          type="number"
                          step="0.5"
                          value={currentEditState.billablePages}
                          onChange={(e) =>
                            updateEditState(
                              currentAnalysis.quote_file_id,
                              "billablePages",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      ) : (
                        <p className="font-medium text-gray-900">
                          {currentEditState.billablePages}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Correction Modal */}
      {showCorrectionModal && pendingCorrection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Correction Reason</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Why are you making this correction? *
                </label>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  rows={3}
                  placeholder="e.g., AI misidentified document language..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="border-t pt-4">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={submitToKnowledgeBase}
                    onChange={(e) => setSubmitToKnowledgeBase(e.target.checked)}
                    className="mt-1"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      Submit to Knowledge Base
                    </span>
                    <p className="text-xs text-gray-600 mt-1">
                      Help improve AI accuracy by sharing this correction
                    </p>
                  </div>
                </label>
              </div>

              {submitToKnowledgeBase && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Notes for AI Learning (Optional)
                  </label>
                  <textarea
                    value={knowledgeBaseComment}
                    onChange={(e) => setKnowledgeBaseComment(e.target.value)}
                    rows={2}
                    placeholder="Any patterns or context that might help the AI learn..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowCorrectionModal(false);
                    setCorrectionReason("");
                    setKnowledgeBaseComment("");
                    setPendingCorrection(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCorrection}
                  disabled={!correctionReason.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Save Correction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
