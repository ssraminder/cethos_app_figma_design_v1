// client/components/admin/hitl-file-list/HITLFileList.tsx

import React, { useEffect } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { useFileList } from './hooks/useFileList';
import FileUploadZone from './FileUploadZone';
import FileRow from './FileRow';
import { HITLFileListProps } from './types';

export function HITLFileList({
  quoteId,
  readOnly = false,
  onTotalsChange,
}: HITLFileListProps) {
  const {
    files,
    isLoading,
    error,
    expandedFileId,
    analyzingFileIds,
    categories,
    selectedCategoryId,
    setSelectedCategoryId,
    fetchFiles,
    uploadFile,
    deleteFile,
    updatePage,
    addPage,
    removeUncheckedPages,
    analyzeFile,
    setExpandedFile,
    totals,
  } = useFileList(quoteId);

  // Notify parent of totals change
  useEffect(() => {
    if (onTotalsChange) {
      onTotalsChange(totals);
    }
  }, [totals, onTotalsChange]);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin mx-auto" />
        <p className="mt-2 text-gray-600">Loading files...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-medium">Error loading files</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchFiles}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Totals */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Documents ({files.length})
        </h3>
        <div className="text-sm text-gray-600">
          {totals.totalPages} pages • {totals.totalWords.toLocaleString()} words • {totals.totalBillable.toFixed(2)} billable
        </div>
      </div>

      {/* Upload Zone */}
      {!readOnly && (
        <FileUploadZone
          onUpload={uploadFile}
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onCategoryChange={setSelectedCategoryId}
        />
      )}

      {/* File List */}
      {files.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">No files uploaded yet</p>
          <p className="text-sm text-gray-500">Upload PDF, JPG, or PNG files</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              isExpanded={expandedFileId === file.id}
              isAnalyzing={analyzingFileIds.has(file.id)}
              readOnly={readOnly}
              onToggleExpand={() => setExpandedFile(
                expandedFileId === file.id ? null : file.id
              )}
              onDelete={() => deleteFile(file.id)}
              onAnalyze={() => analyzeFile(file.id)}
              onUpdatePage={updatePage}
              onAddPage={() => addPage(file.id)}
              onRemoveUncheckedPages={() => removeUncheckedPages(file.id)}
              onRefresh={fetchFiles}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default HITLFileList;
