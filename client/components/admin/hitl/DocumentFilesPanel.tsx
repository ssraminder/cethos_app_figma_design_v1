import React from "react";
import { FileText, Download, Clock } from "lucide-react";

interface QuoteFile {
  id: string;
  original_filename: string;
  file_size: number;
  created_at: string;
  processing_status?: string;
  storage_path?: string;
  mime_type: string;
}

interface DocumentFilesPanelProps {
  files: QuoteFile[];
  loading?: boolean;
}

export default function DocumentFilesPanel({
  files,
  loading = false,
}: DocumentFilesPanelProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "complete":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "complete":
        return "✓";
      case "pending":
        return "⏳";
      case "failed":
        return "✗";
      default:
        return "•";
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

  const totalFiles = files.length;
  const totalSize = files.reduce((sum, file) => sum + file.file_size, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="border-b pb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Documents ({totalFiles})
        </h3>
      </div>

      {/* Files List */}
      {files.length === 0 ? (
        <div className="text-center py-6">
          <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No files uploaded</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-start gap-2 p-2 hover:bg-gray-50 rounded border border-transparent hover:border-gray-200 transition-colors"
            >
              {/* File Icon */}
              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {file.original_filename}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">
                    {formatFileSize(file.file_size)}
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500">
                    {new Date(file.created_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Processing Status */}
                {file.processing_status && (
                  <div className="mt-1 flex items-center gap-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadge(
                        file.processing_status
                      )}`}
                    >
                      {getStatusIcon(file.processing_status)}{" "}
                      {file.processing_status.charAt(0).toUpperCase() +
                        file.processing_status.slice(1)}
                    </span>
                  </div>
                )}
              </div>

              {/* Download Button */}
              <button
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Download file"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File Statistics */}
      {files.length > 0 && (
        <div className="border-t pt-3 space-y-2 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Total Files:</span>
            <span className="font-medium text-gray-900">{totalFiles}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Size:</span>
            <span className="font-medium text-gray-900">
              {formatFileSize(totalSize)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
