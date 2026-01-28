import { useState } from "react";
import { Upload, X, FileText, AlertCircle } from "lucide-react";

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
}

export default function StaffFileUploadForm({
  quoteId,
  staffId,
  onFilesChange,
}: StaffFileUploadFormProps) {
  const [files, setFiles] = useState<FileData[]>([]);
  const [processWithAI, setProcessWithAI] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<Record<string, "pending" | "uploading" | "success" | "failed">>({});

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

  const addFiles = (newFiles: File[]) => {
    const fileData: FileData[] = newFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      file,
    }));

    const updated = [...files, ...fileData];
    setFiles(updated);
    onFilesChange(updated);

    // Set initial status
    fileData.forEach((f) => {
      setUploadStatus((prev) => ({ ...prev, [f.id]: "pending" }));
    });
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
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* AI Processing Toggle */}
      <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <input
          type="checkbox"
          id="processWithAI"
          checked={processWithAI}
          onChange={(e) => setProcessWithAI(e.target.checked)}
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
          <h3 className="text-sm font-medium text-gray-900">
            Uploaded Files ({files.length})
          </h3>
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
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)}
                      {uploadStatus[file.id] === "pending" && (
                        <span className="ml-2 text-amber-600">• Pending</span>
                      )}
                      {uploadStatus[file.id] === "uploading" && (
                        <span className="ml-2 text-blue-600">• Uploading...</span>
                      )}
                      {uploadStatus[file.id] === "success" && (
                        <span className="ml-2 text-green-600">• Uploaded</span>
                      )}
                      {uploadStatus[file.id] === "failed" && (
                        <span className="ml-2 text-red-600">• Failed</span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
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
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Files will be uploaded after quote creation</p>
            <p className="text-xs mt-1">
              Files will be uploaded to the server when you complete the quote in the final step.
            </p>
          </div>
        </div>
      )}

      {/* Note */}
      <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md">
        <p className="font-medium text-gray-700 mb-1">Note:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Files are optional - you can create a quote without uploading files</li>
          <li>If AI processing is enabled, we'll automatically extract document details</li>
          <li>You can override AI results in the next step if needed</li>
        </ul>
      </div>
    </div>
  );
}
