import { useState } from "react";
import {
  Upload,
  X,
  FileText,
  AlertCircle,
  Brain,
  CheckCircle,
  Loader2,
} from "lucide-react";

interface FileData {
  id: string;
  name: string;
  size: number;
  file: File;
}

interface StaffFileUploadFormProps {
  quoteId: string | null;
  staffId: string;
  onFilesChange: (files: FileData[]) => void;
  processWithAI: boolean;
  onProcessWithAIChange: (value: boolean) => void;
}

export default function StaffFileUploadForm({
  quoteId,
  staffId,
  onFilesChange,
  processWithAI,
  onProcessWithAIChange,
}: StaffFileUploadFormProps) {
  const [files, setFiles] = useState<FileData[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    Record<string, "pending" | "uploading" | "success" | "failed">
  >({});
  const [analysisStatus, setAnalysisStatus] = useState<
    Record<string, "idle" | "analyzing" | "completed" | "failed" | "timeout">
  >({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
    const fileData: FileData[] = newFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      file,
    }));

    const updated = [...files, ...fileData];
    setFiles(updated);
    onFilesChange(updated);

    // Upload each file immediately if we have a quoteId
    if (quoteId) {
      for (const file of fileData) {
        setUploadStatus((prev) => ({ ...prev, [file.id]: "uploading" }));
        setAnalysisStatus((prev) => ({ ...prev, [file.id]: processWithAI ? "analyzing" : "idle" }));

        try {
          const formData = new FormData();
          formData.append("file", file.file);
          formData.append("quoteId", quoteId);
          formData.append("staffId", staffId);
          formData.append("processWithAI", processWithAI.toString());

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
            throw new Error("Upload failed");
          }

          const result = await uploadResponse.json();

          setUploadStatus((prev) => ({ ...prev, [file.id]: "success" }));

          // If AI processing was enabled, mark as completed
          if (processWithAI && result.analysisComplete) {
            setAnalysisStatus((prev) => ({ ...prev, [file.id]: "completed" }));
          } else if (processWithAI) {
            setAnalysisStatus((prev) => ({ ...prev, [file.id]: "failed" }));
          }
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          setUploadStatus((prev) => ({ ...prev, [file.id]: "failed" }));
          setAnalysisStatus((prev) => ({ ...prev, [file.id]: "failed" }));
        }
      }
    } else {
      // Set initial status if no quoteId yet
      fileData.forEach((f) => {
        setUploadStatus((prev) => ({ ...prev, [f.id]: "pending" }));
        setAnalysisStatus((prev) => ({ ...prev, [f.id]: "idle" }));
      });
    }
  };

  const removeFile = (id: string) => {
    const updated = files.filter((f) => f.id !== id);
    setFiles(updated);
    onFilesChange(updated);

    setUploadStatus((prev) => {
      const newStatus = { ...prev };
      delete newStatus[id];
      return newStatus;
    });

    setAnalysisStatus((prev) => {
      const newStatus = { ...prev };
      delete newStatus[id];
      return newStatus;
    });
  };


  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getAnalysisStatusBadge = (fileId: string) => {
    const status = analysisStatus[fileId];

    switch (status) {
      case "analyzing":
        return (
          <span className="inline-flex items-center gap-1 text-blue-600">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-xs">Analyzing...</span>
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 text-green-600">
            <CheckCircle className="w-3 h-3" />
            <span className="text-xs">Analyzed</span>
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 text-red-600">
            <AlertCircle className="w-3 h-3" />
            <span className="text-xs">Failed</span>
          </span>
        );
      case "timeout":
        return (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <AlertCircle className="w-3 h-3" />
            <span className="text-xs">Timeout (1min)</span>
          </span>
        );
      default:
        return null;
    }
  };

  const allFilesUploaded =
    files.length > 0 &&
    files.every((file) => uploadStatus[file.id] === "success");

  return (
    <div className="space-y-6">
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
            ? "border-indigo-500 bg-indigo-50"
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
          className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 cursor-pointer text-sm"
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

            {allFilesUploaded && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 text-sm font-medium rounded-md">
                <CheckCircle className="w-4 h-4" />
                All files uploaded
              </div>
            )}
          </div>

          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md hover:border-gray-300"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.name}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{formatFileSize(file.size)}</span>
                      {uploadStatus[file.id] === "uploading" && (
                        <span className="inline-flex items-center gap-1 text-blue-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Uploading...
                        </span>
                      )}
                      {uploadStatus[file.id] === "success" && (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          Uploaded
                        </span>
                      )}
                      {uploadStatus[file.id] === "failed" && (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <AlertCircle className="w-3 h-3" />
                          Upload failed
                        </span>
                      )}
                      {uploadStatus[file.id] === "pending" && (
                        <span className="text-amber-600">Waiting...</span>
                      )}
                      {processWithAI && uploadStatus[file.id] === "success" && getAnalysisStatusBadge(file.id)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(file.id)}
                  disabled={isAnalyzing}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Message */}
      {!quoteId && files.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">
              Files will upload when you click Next
            </p>
            <p className="text-xs mt-1">
              Files will be uploaded to the server when you move to the next step.
              {processWithAI && " AI analysis will happen automatically during upload."}
            </p>
          </div>
        </div>
      )}

      {/* Note */}
      <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md">
        <p className="font-medium text-gray-700 mb-1">Note:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Files are optional - you can create a quote without uploading files
          </li>
          {quoteId ? (
            <>
              <li>
                Files are uploaded immediately and stored securely
              </li>
              {processWithAI && (
                <li>
                  AI analysis happens automatically during upload (1-minute timeout per file)
                </li>
              )}
            </>
          ) : (
            <li>
              Files will be uploaded when you proceed to the next step
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
