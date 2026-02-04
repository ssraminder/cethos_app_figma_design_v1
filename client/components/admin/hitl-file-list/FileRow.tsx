// client/components/admin/hitl-file-list/FileRow.tsx

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Edit2,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  FileText,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import DocumentPreviewModal from '@/components/admin/DocumentPreviewModal';
import { FileWithPages, PageUpdateData } from './types';
import { formatFileSize } from '@/types/document-editor';
import PageTable from './PageTable';
import EditFilenameModal from './EditFilenameModal';

interface FileRowProps {
  file: FileWithPages;
  isExpanded: boolean;
  isAnalyzing: boolean;
  readOnly: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onAnalyze: () => void;
  onUpdatePage: (update: PageUpdateData) => void;
  onRemoveUncheckedPages: () => void;
  onRefresh: () => void;
}

export function FileRow({
  file,
  isExpanded,
  isAnalyzing,
  readOnly,
  onToggleExpand,
  onDelete,
  onAnalyze,
  onUpdatePage,
  onRemoveUncheckedPages,
  onRefresh,
}: FileRowProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [showEditName, setShowEditName] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handlePreview = async () => {
    try {
      const { data, error } = await supabase.storage
        .from('quote-files')
        .createSignedUrl(file.storage_path, 3600);

      if (error) throw error;
      setPreviewUrl(data.signedUrl);
      setShowPreview(true);
    } catch (error) {
      console.error('Preview error:', error);
      toast.error('Failed to load preview');
    }
  };

  const handleDownload = async () => {
    try {
      const { data, error } = await supabase.storage
        .from('quote-files')
        .createSignedUrl(file.storage_path, 3600);

      if (error) throw error;

      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = file.original_filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download file');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${file.original_filename}"? This cannot be undone.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  const uncheckedCount = file.pages.filter(p => !p.is_included).length;

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* File Header */}
        <div
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
            )}
            <FileText className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 truncate">{file.original_filename}</p>
              <p className="text-sm text-gray-500">
                {file.pages.length} {file.pages.length === 1 ? 'page' : 'pages'} • {formatFileSize(file.file_size)}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2 mr-4">
            {!file.hasAnalysis && (
              <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Not analyzed
              </span>
            )}
            {file.hasAnalysis && (
              <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Analyzed
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handlePreview}
              className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded"
              title="Preview"
            >
              <Eye className="w-4 h-4" />
            </button>

            {!readOnly && (
              <button
                onClick={() => setShowEditName(true)}
                className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded"
                title="Edit filename"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={handleDownload}
              className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>

            {!readOnly && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                title="Delete"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            )}

            {!readOnly && (
              <button
                onClick={onAnalyze}
                disabled={isAnalyzing}
                className="ml-2 px-3 py-1.5 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3" />
                    {file.hasAnalysis ? 'Re-analyze' : 'Analyze'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Expanded Page Table */}
        {isExpanded && (
          <div className="border-t p-4 bg-gray-50">
            <PageTable
              pages={file.pages}
              readOnly={readOnly}
              onUpdatePage={onUpdatePage}
            />

            {/* Summary & Remove Button */}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <span className="font-medium">Included:</span>{' '}
                {file.totalWords.toLocaleString()} words • {file.totalBillable.toFixed(2)} billable pages
              </div>

              {!readOnly && uncheckedCount > 0 && (
                <button
                  onClick={onRemoveUncheckedPages}
                  className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200"
                >
                  Remove {uncheckedCount} Unchecked Page{uncheckedCount > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showPreview && previewUrl && (
        <DocumentPreviewModal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          fileUrl={previewUrl}
          fileName={file.original_filename}
        />
      )}

      {showEditName && (
        <EditFilenameModal
          file={file}
          onClose={() => setShowEditName(false)}
          onSaved={() => {
            setShowEditName(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}

export default FileRow;
