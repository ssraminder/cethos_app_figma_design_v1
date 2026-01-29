import React, { useState } from "react";
import { FileText, Download, Eye, Brain, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import DocumentPreviewModal from "../../admin/DocumentPreviewModal";
import AnalyzeDocumentModal from "./AnalyzeDocumentModal";
import ManualEntryModal from "./ManualEntryModal";

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
  quoteId: string;
  loading?: boolean;
  onRefresh?: () => void | Promise<void>;
}

export default function DocumentFilesPanel({
  files,
  quoteId,
  loading = false,
  onRefresh,
}: DocumentFilesPanelProps) {
  const [previewFile, setPreviewFile] = useState<QuoteFile | null>(null);
  const [analyzeFile, setAnalyzeFile] = useState<QuoteFile | null>(null);
  const [manualEntryFile, setManualEntryFile] = useState<QuoteFile | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  const handleDeleteFile = async (file: QuoteFile) => {
    // Confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete "${file.original_filename}"?\n\nThis will also remove any analysis results for this file.`
    );

    if (!confirmed) return;

    setDeletingFileId(file.id);

    try {
      // 1. Delete from ai_analysis_results (if exists)
      if (supabase) {
        await supabase
          .from('ai_analysis_results')
          .delete()
          .eq('quote_file_id', file.id);

        // 2. Delete from quote_files table
        const { error: dbError } = await supabase
          .from('quote_files')
          .delete()
          .eq('id', file.id);

        if (dbError) throw dbError;

        // 3. Delete from storage bucket
        if (file.storage_path) {
          const { error: storageError } = await supabase.storage
            .from('quote-files')
            .remove([file.storage_path]);

          if (storageError) {
            console.warn('Storage delete warning:', storageError);
            // Don't throw - file might already be deleted
          }
        }
      }

      toast.success(`"${file.original_filename}" deleted successfully`);

      // 4. Refresh file list
      if (onRefresh) {
        onRefresh();
      }

    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast.error(`Failed to delete file: ${error.message}`);
    } finally {
      setDeletingFileId(null);
    }
  };

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
                        file.processing_status,
                      )}`}
                    >
                      {getStatusIcon(file.processing_status)}{" "}
                      {file.processing_status.charAt(0).toUpperCase() +
                        file.processing_status.slice(1)}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Analyze Button */}
                <button
                  onClick={() => setAnalyzeFile(file)}
                  className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                  title="Analyze/Re-analyze file"
                >
                  <Brain className="w-4 h-4" />
                </button>

                {/* Manual Entry Button */}
                <button
                  onClick={() => setManualEntryFile(file)}
                  className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                  title="Manual Entry"
                >
                  <Pencil className="w-4 h-4" />
                </button>

                {/* Preview Button */}
                <button
                  onClick={() => setPreviewFile(file)}
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Preview file"
                >
                  <Eye className="w-4 h-4" />
                </button>

                {/* Download Button */}
                <button
                  onClick={() => {
                    const fileUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${file.storage_path}`;
                    const link = document.createElement("a");
                    link.href = fileUrl;
                    link.download = file.original_filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                  title="Download file"
                >
                  <Download className="w-4 h-4" />
                </button>

                {/* Delete Button */}
                <button
                  onClick={() => handleDeleteFile(file)}
                  disabled={deletingFileId === file.id}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                  title="Delete file"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document Preview Modal */}
      {previewFile && (
        <DocumentPreviewModal
          isOpen={true}
          onClose={() => setPreviewFile(null)}
          fileUrl={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${previewFile.storage_path}`}
          fileName={previewFile.original_filename}
          fileType={previewFile.mime_type?.includes("pdf") ? "pdf" : "image"}
        />
      )}

      {/* Analyze Document Modal */}
      {analyzeFile && (
        <AnalyzeDocumentModal
          isOpen={true}
          onClose={() => setAnalyzeFile(null)}
          file={analyzeFile}
          quoteId={quoteId}
          onAnalysisComplete={async () => {
            console.log(
              "🟢 [DocumentFilesPanel] onAnalysisComplete callback triggered!",
            );
            console.log(
              "🟢 [DocumentFilesPanel] Refreshing data before closing modal...",
            );

            // CRITICAL: Refresh data FIRST, then close modal
            if (onRefresh) {
              console.log("🟢 [DocumentFilesPanel] Calling onRefresh...");
              await onRefresh();
              console.log("🟢 [DocumentFilesPanel] onRefresh completed!");
            }

            // Close modal state after refresh completes
            setAnalyzeFile(null);
          }}
        />
      )}

      {/* Manual Entry Modal */}
      {manualEntryFile && (
        <ManualEntryModal
          isOpen={true}
          onClose={() => setManualEntryFile(null)}
          file={manualEntryFile}
          quoteId={quoteId}
          onSaveComplete={async () => {
            console.log(
              "🟠 [DocumentFilesPanel] onSaveComplete callback triggered!",
            );

            // Refresh data FIRST, then close modal
            if (onRefresh) {
              console.log("🟠 [DocumentFilesPanel] Calling onRefresh...");
              await onRefresh();
              console.log("🟠 [DocumentFilesPanel] onRefresh completed!");
            }

            // Close modal state after refresh completes
            setManualEntryFile(null);
          }}
        />
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
