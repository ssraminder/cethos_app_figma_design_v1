// client/components/pdf-manager/PdfManagerLayout.tsx
// Main layout: sidebar (upload + file list + combine preview) + content area
// Content area toggles between Preview and Page Management views

import { useState, useEffect, useCallback } from 'react';
import {
  Merge,
  Download,
  Save,
  Loader2,
  FolderOpen,
  Undo2,
  Redo2,
  Eye,
  LayoutGrid,
  Type,
  MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { saveAs } from 'file-saver';
import { usePdfManager } from '../../context/PdfManagerContext';
import { usePdfOperations } from '../../hooks/usePdfOperations';
import { useCreateDocument, uploadPdfToStorage } from '../../hooks/usePdfDocuments';
import PdfUploadZone from './PdfUploadZone';
import FileListPanel from './FileListPanel';
import CombinePreview from './CombinePreview';
import PageThumbnailGrid from './PageThumbnailGrid';
import PageToolbar from './PageToolbar';
import PdfTextEditor from './PdfTextEditor';
import PdfAnnotationEditor from './PdfAnnotationEditor';

type ViewMode = 'preview' | 'pages' | 'edit' | 'annotate';

export default function PdfManagerLayout() {
  const { state, canUndo, canRedo, undo, redo, addFiles } = usePdfManager();
  const { mergeFiles, isProcessing, getPageCount } = usePdfOperations();
  const createDocument = useCreateDocument();
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Delete' && state.selectedPageIndices.length > 0 && viewMode === 'pages') {
        // Delete key handled by PageToolbar — no-op here to avoid double-fire
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, state.selectedPageIndices, viewMode]);

  const handleCombine = async () => {
    const result = await mergeFiles(state.files);
    if (result) {
      const pageCount = await getPageCount(result);
      addFiles([{
        clientId: `combined_${Date.now()}`,
        file: result,
        name: result.name,
        pageCount,
      }]);
    }
  };

  const handleDownload = () => {
    if (state.files.length === 0) {
      toast.error('No files to download');
      return;
    }

    if (state.files.length === 1) {
      saveAs(state.files[0].file, state.files[0].name);
      return;
    }

    toast.info('Combine files first, then download the combined result');
  };

  const handleSaveToStorage = async () => {
    if (state.files.length === 0) {
      toast.error('No files to save');
      return;
    }

    setIsSaving(true);
    try {
      for (const pdfFile of state.files) {
        const { path, size } = await uploadPdfToStorage(
          pdfFile.file,
          pdfFile.name,
          state.currentFolder
        );

        await createDocument.mutateAsync({
          name: pdfFile.name,
          storage_path: path,
          file_size: size,
          page_count: pdfFile.pageCount,
          folder_id: state.currentFolder,
        });
      }

      toast.success(`Saved ${state.files.length} file(s) to library`);
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const hasSelectedFile = state.selectedFileIndex !== null && state.files[state.selectedFileIndex];

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      {/* Left sidebar */}
      <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
        <PdfUploadZone />
        <FileListPanel />
        <CombinePreview />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Top toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
          <button
            onClick={handleCombine}
            disabled={state.files.length < 2 || isProcessing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
            Combine
          </button>

          <button
            onClick={handleDownload}
            disabled={state.files.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Download
          </button>

          <button
            onClick={handleSaveToStorage}
            disabled={state.files.length === 0 || isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save to Library
          </button>

          <div className="flex-1" />

          {/* View mode toggle */}
          {hasSelectedFile && (
            <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('preview')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                onClick={() => setViewMode('pages')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'pages'
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Pages
              </button>
              <button
                onClick={() => setViewMode('edit')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Type className="h-3.5 w-3.5" />
                Edit Text
              </button>
              <button
                onClick={() => setViewMode('annotate')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'annotate'
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Annotate
              </button>
            </div>
          )}

          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* Page management toolbar — shown only in pages view */}
        {hasSelectedFile && viewMode === 'pages' && (
          <div className="px-4 py-2 border-b border-gray-100 bg-white">
            <PageToolbar />
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          {state.files.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center text-gray-400 p-8">
              <div>
                <FolderOpen className="h-16 w-16 mx-auto mb-4 opacity-40" />
                <h3 className="text-lg font-medium text-gray-500 mb-1">No files loaded</h3>
                <p className="text-sm">Upload PDFs or images to get started</p>
              </div>
            </div>
          ) : !hasSelectedFile ? (
            <div className="flex items-center justify-center h-full text-center text-gray-400 p-8">
              <div>
                <FileListIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select a file from the list to preview</p>
                <p className="text-xs mt-1">Or combine multiple files with the Combine button</p>
              </div>
            </div>
          ) : viewMode === 'preview' ? (
            <div className="w-full h-full p-4">
              <iframe
                src={URL.createObjectURL(state.files[state.selectedFileIndex!].file)}
                className="w-full h-full rounded border border-gray-200"
                title="PDF Preview"
              />
            </div>
          ) : viewMode === 'pages' ? (
            <PageThumbnailGrid />
          ) : viewMode === 'edit' ? (
            <PdfTextEditor />
          ) : (
            /* Annotate view */
            <PdfAnnotationEditor />
          )}
        </div>
      </div>
    </div>
  );
}

function FileListIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}
