// SURGICAL FIX COMPONENT: Handles documents with or without AI analysis
import React from "react";
import { AlertTriangle, CheckCircle, Loader2, FileText } from "lucide-react";

interface QuoteFile {
  id: string;
  original_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  ai_processing_status?: string;
  error_message?: string;
}

interface HITLDocumentCardProps {
  file: QuoteFile;
  index: number;
  analysis: any | null;
  isExpanded: boolean;
  hasChanges: boolean;
  onToggle: () => void;
  children?: React.ReactNode; // Full analysis UI when analysis exists
}

export default function HITLDocumentCard({
  file,
  index,
  analysis,
  isExpanded,
  hasChanges,
  onToggle,
  children,
}: HITLDocumentCardProps) {
  const hasAnalysis = !!analysis;
  const aiStatus = file.ai_processing_status || 'unknown';
  const hasFailed = aiStatus === 'failed' || aiStatus === 'error';
  const isPending = aiStatus === 'pending' || aiStatus === 'processing';

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* File Header */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex justify-between items-center bg-gray-50 hover:bg-gray-100 text-left"
      >
        <div className="flex items-center gap-4">
          <span className="text-lg font-medium">
            {index + 1}. {file.original_filename}
          </span>
          {hasAnalysis ? (
            <span className="text-sm text-gray-500">
              {/* Word/page count shown by parent when analysis exists */}
            </span>
          ) : hasFailed ? (
            <span className="px-3 py-1 rounded-full text-xs bg-red-100 text-red-800 font-semibold border border-red-300">
              ⚠️ AI Analysis Failed
            </span>
          ) : isPending ? (
            <span className="px-3 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 font-semibold border border-yellow-300">
              <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
              Processing...
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs bg-gray-100 text-gray-700 font-semibold border border-gray-300">
              <FileText className="w-3 h-3 inline mr-1" />
              No Analysis
            </span>
          )}
          {hasChanges && (
            <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400">
            {isExpanded ? "▼" : "▶"}
          </span>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && !hasAnalysis && (
        <div className="p-6 border-t bg-gray-50">
          {/* Error Alert */}
          {hasFailed && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-5 mb-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-7 h-7 text-red-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h4 className="font-bold text-red-900 text-lg mb-2">
                    ⚠️ AI Analysis Failed
                  </h4>
                  <p className="text-sm text-red-800 mb-3">
                    Automated document analysis could not be completed. 
                    <strong> This document requires manual review and entry.</strong>
                  </p>
                  {file.error_message && (
                    <div className="mt-3 p-4 bg-red-100 rounded-lg border border-red-200">
                      <p className="text-xs font-bold text-red-900 mb-2">Error Details:</p>
                      <p className="text-sm text-red-800 font-mono leading-relaxed">
                        {file.error_message}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pending Alert */}
          {isPending && (
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-5 mb-6">
              <div className="flex items-start gap-4">
                <Loader2 className="w-7 h-7 text-yellow-600 animate-spin flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h4 className="font-bold text-yellow-900 text-lg mb-2">
                    Analysis In Progress
                  </h4>
                  <p className="text-sm text-yellow-800">
                    The document is currently being analyzed. Please refresh the page in a moment to see results.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Document Preview */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3 text-gray-900 text-lg">
                📄 Document Preview
              </h4>
              <div className="border-2 rounded-lg overflow-hidden bg-white shadow-sm">
                <img
                  src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${file.storage_path}`}
                  alt={file.original_filename}
                  className="w-full max-h-[450px] object-contain p-4"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div className="mt-4 flex justify-between items-center">
                <span className="text-sm text-gray-600">
                  Size: <strong>{((file.file_size || 0) / 1024 / 1024).toFixed(2)} MB</strong>
                </span>
                <a
                  href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/quote-files/${file.storage_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
                >
                  ↓ Download File
                </a>
              </div>
            </div>

            {/* Manual Processing Notice */}
            <div>
              <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-5">
                <h5 className="font-bold text-blue-900 text-lg mb-3">
                  📋 Manual Processing Required
                </h5>
                <div className="space-y-3 text-sm text-blue-900">
                  <p>
                    Since automated analysis is not available for this document, 
                    you must manually review and enter the details:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Review the document preview carefully</li>
                    <li>Count pages and estimate word count</li>
                    <li>Identify document type and complexity</li>
                    <li>Enter details in <strong>Translation Details</strong> section</li>
                  </ul>
                  <div className="mt-4 p-3 bg-blue-100 rounded border border-blue-200">
                    <p className="text-xs font-semibold">
                      💡 Tip: Download the file to view the full document if needed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* If has analysis, render the full analysis UI passed as children */}
      {isExpanded && hasAnalysis && children}
    </div>
  );
}
