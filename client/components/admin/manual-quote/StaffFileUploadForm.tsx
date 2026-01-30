import { useState, useEffect } from "react";
import {
  Upload,
  X,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  Brain,
  File,
  Edit2,
  RefreshCw,
  PenTool,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  DocumentAnalysisPanel,
  AnalyzeDocumentModal,
  ManualEntryModal,
  EditableDocumentAnalysisPanel,
} from "@/components/shared/analysis";
import type { AnalysisResult } from "@/components/shared/analysis/DocumentAnalysisPanel";

interface QuoteFile {
  id: string;
  original_filename: string;
  storage_path?: string;
  mime_type: string;
}

export interface FileWithAnalysis {
  // File info
  id: string;
  name: string;
  size: number;
  file: File;
  uploadStatus: "pending" | "uploading" | "success" | "failed";
  uploadedFileId?: string; // quote_files.id from database

  // AI Analysis
  analysisStatus: "idle" | "analyzing" | "completed" | "failed" | "timeout";
  detectedLanguage?: string;
  detectedLanguageCode?: string;
  detectedDocumentType?: string;
  pageCount?: number;
  wordCount?: number;
  complexity?: "low" | "medium" | "high";
}

interface StaffFileUploadFormProps {
  quoteId: string | null;
  staffId: string;
  value: FileWithAnalysis[];
  onChange: (files: FileWithAnalysis[]) => void;
  processWithAI: boolean;
  onProcessWithAIChange: (value: boolean) => void;
}

export default function StaffFileUploadForm({
  quoteId,
  staffId,
  value,
  onChange,
  processWithAI,
  onProcessWithAIChange,
}: StaffFileUploadFormProps) {
  const [files, setFiles] = useState<FileWithAnalysis[]>(value);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Analysis modal states
  const [analyzeModalOpen, setAnalyzeModalOpen] = useState(false);
  const [manualEntryModalOpen, setManualEntryModalOpen] = useState(false);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<QuoteFile | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);

  useEffect(() => {
    onChange(files);
  }, [files]);

  // Fetch analysis results from database
  const fetchAnalysisResults = async () => {
    if (!quoteId) return;

    const { data, error } = await supabase
      .from("ai_analysis_results")
      .select(
        `
        id,
        quote_file_id,
        detected_language,
        detected_document_type,
        assessed_complexity,
        complexity_multiplier,
        word_count,
        page_count,
        billable_pages,
        base_rate,
        line_total,
        certification_type_id,
        certification_price,
        quote_files!inner(original_filename)
      `
      )
      .eq("quote_id", quoteId);

    if (data && !error) {
      setAnalysisResults(
        data.map((r: any) => ({
          ...r,
          original_filename: r.quote_files?.original_filename || "Unknown",
        }))
      );
    }
  };

  useEffect(() => {
    fetchAnalysisResults();
  }, [quoteId]);

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
    console.log("📁 [FILE UPLOAD] QuoteId:", quoteId);
    console.log("📁 [FILE UPLOAD] ProcessWithAI:", processWithAI);

    const fileData: FileWithAnalysis[] = newFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      file,
      uploadStatus: "pending",
      analysisStatus: "idle",
    }));

    const updatedFiles = [...files, ...fileData];
    setFiles(updatedFiles);

    // Upload immediately if we have a quoteId
    if (quoteId) {
      console.log(
        "✅ [FILE UPLOAD] QuoteId exists - starting immediate upload",
      );
      for (const fileItem of fileData) {
        await uploadFile(fileItem);
      }
    } else {
      console.log("⏸️ [FILE UPLOAD] No quoteId - files will be uploaded later");
    }
  };

  const uploadFile = async (fileItem: FileWithAnalysis) => {
    if (!quoteId) return;

    console.log(`📤 [FILE UPLOAD] Uploading ${fileItem.name}`);

    // Update status to uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileItem.id ? { ...f, uploadStatus: "uploading" } : f,
      ),
    );

    try {
      const formData = new FormData();
      formData.append("file", fileItem.file);
      formData.append("quoteId", quoteId);
      formData.append("staffId", staffId);
      formData.append("processWithAI", processWithAI ? "true" : "false");

      const uploadResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-staff-quote-file`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
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
      setFiles((prev) =>
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
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id ? { ...f, uploadStatus: "failed" } : f,
        ),
      );
    }
  };

  const analyzeFiles = async () => {
    if (!processWithAI || !quoteId) return;

    console.log("🧠 [AI ANALYSIS] Starting analysis");
    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "process-document",
        {
          body: { quoteId },
        },
      );

      if (error) {
        console.error("❌ [AI ANALYSIS] Error:", error);
        // Mark all files as failed
        setFiles((prev) =>
          prev.map((f) => ({ ...f, analysisStatus: "failed" })),
        );
        return;
      }

      console.log("✅ [AI ANALYSIS] Response:", data);

      // Update files with analysis results
      if (data && data.results) {
        setFiles((prev) =>
          prev.map((file) => {
            const result = data.results.find(
              (r: any) => r.fileId === file.uploadedFileId,
            );
            if (result && result.success) {
              return {
                ...file,
                analysisStatus: "completed",
                detectedLanguage: result.detectedLanguage || "Unknown",
                detectedDocumentType: result.documentType,
                pageCount: result.pageCount,
                wordCount: result.wordCount,
                complexity: determineComplexity(
                  result.wordCount,
                  result.pageCount,
                ),
              };
            }
            return file;
          }),
        );
      }
    } catch (error) {
      console.error("❌ [AI ANALYSIS] Error:", error);
      setFiles((prev) => prev.map((f) => ({ ...f, analysisStatus: "failed" })));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const determineComplexity = (
    wordCount?: number,
    pageCount?: number,
  ): "low" | "medium" | "high" => {
    if (!wordCount && !pageCount) return "low";
    if ((wordCount || 0) > 5000 || (pageCount || 0) > 10) return "high";
    if ((wordCount || 0) > 2000 || (pageCount || 0) > 5) return "medium";
    return "low";
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const allFilesUploaded =
    files.length > 0 && files.every((f) => f.uploadStatus === "success");

  const hasFilesToAnalyze =
    processWithAI &&
    files.length > 0 &&
    files.some(
      (f) =>
        f.uploadStatus === "success" &&
        (f.analysisStatus === "idle" || f.analysisStatus === "failed"),
    );

  const allFilesAnalyzed =
    processWithAI &&
    files.length > 0 &&
    files.every((f) => f.analysisStatus === "completed");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Upload Documents
        </h2>
        <p className="text-sm text-gray-600">
          Upload the documents that need to be translated (optional)
        </p>
      </div>

      {/* AI Processing Toggle */}
      <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <input
          type="checkbox"
          id="processWithAI"
          checked={processWithAI}
          onChange={(e) => onProcessWithAIChange(e.target.checked)}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="processWithAI" className="flex-1 cursor-pointer">
          <span className="text-sm font-medium text-blue-900">
            Automatically process with AI
          </span>
          <p className="text-xs text-blue-700 mt-0.5">
            {processWithAI
              ? "AI will analyze uploaded files (language, type, pages)"
              : "Manual entry required for all document details"}
          </p>
        </label>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-gray-400"
        }`}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-sm text-gray-600 mb-2">
          Drag and drop files here, or click to browse
        </p>
        <input
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id="fileInput"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        />
        <label
          htmlFor="fileInput"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer text-sm"
        >
          Choose Files
        </label>
        <p className="text-xs text-gray-500 mt-2">
          Supported: PDF, Word, Images (Max 10MB per file)
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">
              Files ({files.length})
            </h3>

            {/* Analyze Button */}
            {hasFilesToAnalyze && !isAnalyzing && (
              <button
                onClick={analyzeFiles}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                <Brain className="w-4 h-4" />
                Analyze Files with AI
              </button>
            )}

            {isAnalyzing && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded-md">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing files...
              </div>
            )}

            {allFilesAnalyzed && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 text-sm font-medium rounded-md">
                <CheckCircle className="w-4 h-4" />
                All files analyzed
              </div>
            )}
          </div>

          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="border border-gray-200 rounded-md p-4 bg-white hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <FileText className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    disabled={file.uploadStatus === "uploading"}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Upload Status */}
                <div className="flex items-center gap-2 text-xs mb-2">
                  {file.uploadStatus === "uploading" && (
                    <span className="inline-flex items-center gap-1 text-blue-600">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Uploading...
                    </span>
                  )}
                  {file.uploadStatus === "success" && (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      Uploaded
                    </span>
                  )}
                  {file.uploadStatus === "failed" && (
                    <span className="inline-flex items-center gap-1 text-red-600">
                      <AlertCircle className="w-3 h-3" />
                      Upload failed
                    </span>
                  )}
                  {file.uploadStatus === "pending" && (
                    <span className="text-amber-600">Pending upload...</span>
                  )}
                </div>

                {/* Analysis Action Buttons */}
                {file.uploadStatus === "success" && file.uploadedFileId && (
                  <div className="mt-3 flex gap-2">
                    {analysisResults.find(
                      (a) => a.quote_file_id === file.uploadedFileId
                    ) ? (
                      <>
                        <button
                          onClick={() => {
                            setSelectedFile({
                              id: file.uploadedFileId!,
                              original_filename: file.name,
                              mime_type: "",
                            });
                            setEditPanelOpen(true);
                          }}
                          className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit Analysis
                        </button>
                        <button
                          onClick={() => {
                            setSelectedFile({
                              id: file.uploadedFileId!,
                              original_filename: file.name,
                              mime_type: "",
                            });
                            setAnalyzeModalOpen(true);
                          }}
                          className="px-3 py-1.5 text-xs bg-gray-50 text-gray-700 rounded hover:bg-gray-100 flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Re-analyze
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setSelectedFile({
                              id: file.uploadedFileId!,
                              original_filename: file.name,
                              mime_type: "",
                            });
                            setAnalyzeModalOpen(true);
                          }}
                          className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center gap-1"
                        >
                          <Brain className="w-3 h-3" />
                          Analyze with AI
                        </button>
                        <button
                          onClick={() => {
                            setSelectedFile({
                              id: file.uploadedFileId!,
                              original_filename: file.name,
                              mime_type: "",
                            });
                            setManualEntryModalOpen(true);
                          }}
                          className="px-3 py-1.5 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100 flex items-center gap-1"
                        >
                          <PenTool className="w-3 h-3" />
                          Manual Entry
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* AI Analysis Status (legacy - showing local state) */}
                {processWithAI && file.uploadStatus === "success" && (
                  <div className="bg-gray-50 rounded p-3 space-y-2 mt-2">
                    {file.analysisStatus === "analyzing" && (
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing with AI...
                      </div>
                    )}

                    {file.analysisStatus === "completed" && (
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-1 text-green-600 mb-2">
                          <CheckCircle className="w-4 h-4" />
                          <span className="font-medium">
                            AI Analysis Complete
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-600">Language:</span>
                            <span className="ml-2 font-medium">
                              {file.detectedLanguage}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Type:</span>
                            <span className="ml-2 font-medium">
                              {file.detectedDocumentType}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Pages:</span>
                            <span className="ml-2 font-medium">
                              {file.pageCount}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Words:</span>
                            <span className="ml-2 font-medium">
                              ~{file.wordCount}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Complexity:</span>
                            <span className="ml-2 font-medium capitalize">
                              {file.complexity}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {file.analysisStatus === "failed" && (
                      <div className="flex items-center gap-2 text-sm text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        Analysis failed
                      </div>
                    )}

                    {file.analysisStatus === "idle" && (
                      <div className="text-sm text-gray-500">
                        Ready for AI analysis
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!quoteId && files.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">
              Files will be uploaded when you continue
            </p>
            <p className="mt-1">
              Files will be uploaded to the server when you move to the next
              step.
            </p>
          </div>
        </div>
      )}

      {/* Analysis Results Summary Section */}
      {analysisResults.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Analysis Results
          </h3>
          <DocumentAnalysisPanel
            analysisResults={analysisResults}
            loading={false}
            onEdit={(analysisId) => {
              const result = analysisResults.find((a) => a.id === analysisId);
              if (result) {
                setSelectedFile({
                  id: result.quote_file_id,
                  original_filename: result.original_filename,
                  mime_type: "",
                });
                setEditPanelOpen(true);
              }
            }}
            onReanalyze={(fileId) => {
              const result = analysisResults.find(
                (a) => a.quote_file_id === fileId
              );
              if (result) {
                setSelectedFile({
                  id: fileId,
                  original_filename: result.original_filename,
                  mime_type: "",
                });
                setAnalyzeModalOpen(true);
              }
            }}
            onManualEntry={(fileId) => {
              const result = analysisResults.find(
                (a) => a.quote_file_id === fileId
              );
              if (result) {
                setSelectedFile({
                  id: fileId,
                  original_filename: result.original_filename,
                  mime_type: "",
                });
                setManualEntryModalOpen(true);
              }
            }}
          />
        </div>
      )}

      <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Note:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Files are optional - you can create a quote without uploading files
          </li>
          {quoteId ? (
            <>
              <li>Files upload immediately when selected</li>
              {processWithAI && (
                <li>
                  Click "Analyze Files with AI" to extract document details
                </li>
              )}
            </>
          ) : (
            <li>Files will be uploaded when you proceed to the next step</li>
          )}
        </ul>
      </div>

      {/* Analysis Modals */}
      {selectedFile && (
        <>
          <AnalyzeDocumentModal
            isOpen={analyzeModalOpen}
            onClose={() => {
              setAnalyzeModalOpen(false);
              setSelectedFile(null);
            }}
            file={selectedFile}
            quoteId={quoteId!}
            onAnalysisComplete={fetchAnalysisResults}
          />

          <ManualEntryModal
            isOpen={manualEntryModalOpen}
            onClose={() => {
              setManualEntryModalOpen(false);
              setSelectedFile(null);
            }}
            file={selectedFile}
            quoteId={quoteId!}
            onSaveComplete={fetchAnalysisResults}
          />
        </>
      )}

      {/* Edit Panel Modal */}
      {editPanelOpen && selectedFile && quoteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Analysis</h2>
              <button
                onClick={() => {
                  setEditPanelOpen(false);
                  setSelectedFile(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <EditableDocumentAnalysisPanel
              analysisResults={analysisResults.filter(
                (a) => a.quote_file_id === selectedFile?.id
              )}
              quoteId={quoteId}
              staffId={staffId}
              onUpdate={() => {
                fetchAnalysisResults();
                setEditPanelOpen(false);
                setSelectedFile(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
