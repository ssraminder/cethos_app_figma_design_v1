// client/components/pdf-manager/PageToolbar.tsx
// Actions toolbar: Delete Selected, Select All, Split, Insert Pages

import { useState } from 'react';
import {
  Trash2,
  CheckSquare,
  Square,
  Scissors,
  Plus,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { saveAs } from 'file-saver';
import { usePdfManager } from '../../context/PdfManagerContext';
import { usePdfOperations } from '../../hooks/usePdfOperations';
import SplitPdfDialog from './SplitPdfDialog';
import InsertPagesDialog from './InsertPagesDialog';

export default function PageToolbar() {
  const { state, dispatch, addFiles } = usePdfManager();
  const { removeFilePages, reorderFilePages, getPageCount, isProcessing } = usePdfOperations();
  const [splitOpen, setSplitOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);

  const hasSelection = state.selectedPageIndices.length > 0;
  const hasPages = state.pages.length > 0;
  const selectedFile = state.selectedFileIndex !== null ? state.files[state.selectedFileIndex] : null;

  const handleDeleteSelected = async () => {
    if (!selectedFile || !hasSelection) return;

    const result = await removeFilePages(selectedFile.file, state.selectedPageIndices);
    if (result) {
      const pageCount = await getPageCount(result);
      // Update the file in state
      const updatedFiles = [...state.files];
      updatedFiles[state.selectedFileIndex!] = {
        ...updatedFiles[state.selectedFileIndex!],
        file: result,
        pageCount,
      };
      dispatch({ type: 'REMOVE_SELECTED_PAGES' });
      // Re-trigger by re-selecting
      dispatch({ type: 'SELECT_FILE', index: state.selectedFileIndex });
      // Replace files array
      dispatch({ type: 'RESET' });
      updatedFiles.forEach((f) => {
        dispatch({
          type: 'ADD_FILES',
          files: [f],
        });
      });
      dispatch({ type: 'SELECT_FILE', index: state.selectedFileIndex });
    }
  };

  const handleApplyReorder = async () => {
    if (!selectedFile || state.pages.length === 0) return;

    const newOrder = state.pages.map((p) => p.pageIndex);
    // Check if order actually changed
    const isOriginalOrder = newOrder.every((val, idx) => val === idx);
    if (isOriginalOrder) {
      toast.info('Page order unchanged');
      return;
    }

    const result = await reorderFilePages(selectedFile.file, newOrder);
    if (result) {
      const pageCount = await getPageCount(result);
      toast.success('Page order applied');
      // Update file
      const updatedFiles = [...state.files];
      updatedFiles[state.selectedFileIndex!] = {
        ...updatedFiles[state.selectedFileIndex!],
        file: result,
        pageCount,
      };
      dispatch({ type: 'RESET' });
      updatedFiles.forEach((f) => {
        dispatch({ type: 'ADD_FILES', files: [f] });
      });
      dispatch({ type: 'SELECT_FILE', index: state.selectedFileIndex });
    }
  };

  const handleDownloadCurrent = () => {
    if (!selectedFile) return;
    saveAs(selectedFile.file, selectedFile.name);
  };

  const allSelected = hasPages && state.selectedPageIndices.length === state.pages.length;

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Select All / Deselect */}
        <button
          onClick={() => dispatch({ type: allSelected ? 'DESELECT_ALL_PAGES' : 'SELECT_ALL_PAGES' })}
          disabled={!hasPages}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {allSelected ? <Square className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>

        {/* Delete Selected */}
        <button
          onClick={handleDeleteSelected}
          disabled={!hasSelection || isProcessing}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Delete ({state.selectedPageIndices.length})
        </button>

        {/* Apply Reorder */}
        <button
          onClick={handleApplyReorder}
          disabled={!hasPages || isProcessing}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-teal-300 text-teal-700 hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply Order
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Split */}
        <button
          onClick={() => setSplitOpen(true)}
          disabled={!selectedFile || isProcessing}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Scissors className="h-3.5 w-3.5" />
          Split
        </button>

        {/* Insert Pages */}
        <button
          onClick={() => setInsertOpen(true)}
          disabled={!selectedFile || isProcessing}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" />
          Insert Pages
        </button>

        <div className="flex-1" />

        {/* Download Current */}
        <button
          onClick={handleDownloadCurrent}
          disabled={!selectedFile}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>

        {hasPages && (
          <span className="text-xs text-gray-400 ml-2">
            {state.pages.length} page{state.pages.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Dialogs */}
      {selectedFile && (
        <>
          <SplitPdfDialog
            open={splitOpen}
            onOpenChange={setSplitOpen}
            file={selectedFile}
          />
          <InsertPagesDialog
            open={insertOpen}
            onOpenChange={setInsertOpen}
            targetFile={selectedFile}
          />
        </>
      )}
    </>
  );
}
