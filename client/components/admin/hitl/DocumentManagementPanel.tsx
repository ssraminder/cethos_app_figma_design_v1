import React, { useState } from "react";
import { Upload, RefreshCw, AlertCircle, CheckCircle, XCircle } from "lucide-react";

interface QuoteFile {
  id: string;
  original_filename: string;
  file_size: number;
  processing_status?: string;
  storage_path?: string;
  mime_type: string;
  created_at: string;
}

interface DocumentManagementPanelProps {
  quoteId: string;
  files: QuoteFile[];
  onFilesUploaded: () => void;
}

export default function DocumentManagementPanel({
  quoteId,
  files,
  onFilesUploaded,
}: DocumentManagementPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [processWithAI, setProcessWithAI] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [retryingFiles, setRetryingFiles] = useState<Set<string>>(new Set());

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      for (const file of Array.from(selectedFiles)) {
        setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));

        const formData = new FormData();
        formData.append("file", file);
        formData.append("quoteId", quoteId);
        formData.append("processWithAI", processWithAI.toString());

        // Upload file
        const uploadResponse = await fetch(
          `${SUPABASE_URL}/functions/v1/upload-quote-file`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: formData,
          }
        );

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }));
      }

      // Clear progress after 2 seconds
      setTimeout(() => setUploadProgress({}), 2000);

      // Refresh files list
      onFilesUploaded();
      
      // Reset file input
      e.target.value = "";
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload files: " + (error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleRetryProcessing = async (fileId: string) => {
    setRetryingFiles((prev) => new Set(prev).add(fileId));

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/retry-document-processing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quote_file_id: fileId,
            force_reprocess: true,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to retry processing");
      }

      // Refresh files list
      onFilesUploaded();
    } catch (error) {
      console.error("Retry error:", error);
      alert("Failed to retry processing: " + (error as Error).message);
    } finally {
      setRetryingFiles((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "complete":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "pending":
      case "processing":
        return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "complete":
        return "bg-green-100 text-green-800";
      case "pending":
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const failedFiles = files.filter((f) => f.processing_status === "failed");
  const processingFiles = files.filter(
    (f) => f.processing_status === "pending" || f.processing_status === "processing"
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Document Management
        </h3>
        {processingFiles.length > 0 && (
          <span className="text-xs text-blue-600 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {processingFiles.length} processing
          </span>
        )}
      </div>

      {/* Upload Section */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-teal-500 transition-colors">
        <label className="flex flex-col items-center cursor-pointer">
          <Upload className="w-8 h-8 text-gray-400 mb-2" />
          <span className="text-sm font-medium text-gray-700">
            Upload Additional Files
          </span>
          <span className="text-xs text-gray-500 mt-1">
            Click to browse or drag and drop
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>

        {/* Upload Settings */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={processWithAI}
              onChange={(e) => setProcessWithAI(e.target.checked)}
              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-gray-700">
              Automatically process with AI
            </span>
          </label>
          {!processWithAI && (
            <p className="text-xs text-amber-600 mt-1 ml-6">
              Files will be uploaded but not processed. You'll need to manually
              enter document details.
            </p>
          )}
        </div>
      </div>

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([filename, progress]) => (
            <div key={filename} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate">{filename}</span>
                <span className="text-gray-500">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-teal-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Failed Files - Retry Section */}
      {failedFiles.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                {failedFiles.length} file{failedFiles.length > 1 ? "s" : ""} failed
                processing
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                You can retry AI processing or enter details manually
              </p>
            </div>
          </div>
          <div className="space-y-2 mt-3">
            {failedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between bg-white rounded p-2"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getStatusIcon(file.processing_status)}
                  <span className="text-xs text-gray-900 truncate">
                    {file.original_filename}
                  </span>
                </div>
                <button
                  onClick={() => handleRetryProcessing(file.id)}
                  disabled={retryingFiles.has(file.id)}
                  className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {retryingFiles.has(file.id) ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Status Summary */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-900 font-semibold">{files.length}</div>
          <div className="text-gray-500">Total</div>
        </div>
        <div className="bg-green-50 rounded p-2">
          <div className="text-green-900 font-semibold">
            {files.filter((f) => f.processing_status === "complete").length}
          </div>
          <div className="text-green-700">Processed</div>
        </div>
        <div className="bg-red-50 rounded p-2">
          <div className="text-red-900 font-semibold">{failedFiles.length}</div>
          <div className="text-red-700">Failed</div>
        </div>
      </div>
    </div>
  );
}
