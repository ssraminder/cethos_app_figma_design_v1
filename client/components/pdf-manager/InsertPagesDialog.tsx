// client/components/pdf-manager/InsertPagesDialog.tsx
// Dialog to select source PDF, pick pages, and choose insertion point

import { useCallback, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { usePdfManager } from '../../context/PdfManagerContext';
import { usePdfOperations } from '../../hooks/usePdfOperations';
import { getPageCount as getPageCountUtil, parsePageRanges } from '../../utils/pdfOperations';
import type { PdfFile } from '../../types/pdf-manager';

interface InsertPagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetFile: PdfFile;
}

export default function InsertPagesDialog({ open, onOpenChange, targetFile }: InsertPagesDialogProps) {
  const { state, dispatch } = usePdfManager();
  const { insertFilePages, getPageCount, isProcessing } = usePdfOperations();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePageCount, setSourcePageCount] = useState(0);
  const [pageRanges, setPageRanges] = useState('');
  const [insertPosition, setInsertPosition] = useState('');

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      return;
    }

    setSourceFile(file);
    try {
      const count = await getPageCountUtil(file);
      setSourcePageCount(count);
      setPageRanges(`1-${count}`); // Default: all pages
    } catch {
      toast.error('Could not read PDF');
    }
  }, []);

  const handleInsert = async () => {
    if (!sourceFile) {
      toast.error('Select a source PDF first');
      return;
    }

    const pos = parseInt(insertPosition, 10);
    if (isNaN(pos) || pos < 0 || pos > targetFile.pageCount) {
      toast.error(`Insert position must be between 0 and ${targetFile.pageCount}`);
      return;
    }

    // Parse page ranges to get 0-based indices
    const ranges = parsePageRanges(pageRanges || `1-${sourcePageCount}`, sourcePageCount);
    if (ranges.length === 0) {
      toast.error('No valid page ranges specified');
      return;
    }

    // Convert ranges to flat 0-based index array
    const indices: number[] = [];
    for (const [start, end] of ranges) {
      for (let i = start - 1; i < end; i++) {
        indices.push(i);
      }
    }

    const result = await insertFilePages(targetFile.file, sourceFile, indices, pos);
    if (result) {
      const newPageCount = await getPageCount(result);

      // Update the target file in state
      const updatedFiles = state.files.map((f, i) =>
        i === state.selectedFileIndex
          ? { ...f, file: result, pageCount: newPageCount }
          : f
      );

      dispatch({ type: 'RESET' });
      updatedFiles.forEach((f) => dispatch({ type: 'ADD_FILES', files: [f] }));
      dispatch({ type: 'SELECT_FILE', index: state.selectedFileIndex });

      toast.success(`Inserted ${indices.length} page(s) at position ${pos}`);
      onOpenChange(false);

      // Reset state
      setSourceFile(null);
      setSourcePageCount(0);
      setPageRanges('');
      setInsertPosition('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-teal-600" />
            Insert Pages
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-600">
            Target: <span className="font-medium">{targetFile.name}</span>{' '}
            ({targetFile.pageCount} pages)
          </p>

          {/* Source file picker */}
          <div className="space-y-1.5">
            <Label>Source PDF</Label>
            {sourceFile ? (
              <div className="flex items-center gap-2 p-2 rounded border border-gray-200 bg-gray-50">
                <FileText className="h-4 w-4 text-red-500 shrink-0" />
                <span className="text-sm truncate flex-1">{sourceFile.name}</span>
                <span className="text-xs text-gray-500">{sourcePageCount} pages</span>
                <button
                  onClick={() => { setSourceFile(null); setSourcePageCount(0); }}
                  className="text-xs text-red-500 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg text-center hover:border-teal-400 hover:bg-gray-50 transition-colors"
              >
                <Upload className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                <span className="text-sm text-gray-600">Click to select a PDF</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Page ranges from source */}
          {sourceFile && (
            <div className="space-y-1.5">
              <Label htmlFor="pageRanges">Pages to insert</Label>
              <Input
                id="pageRanges"
                placeholder={`e.g. 1-${sourcePageCount}`}
                value={pageRanges}
                onChange={(e) => setPageRanges(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Leave blank or use "1-{sourcePageCount}" for all pages
              </p>
            </div>
          )}

          {/* Insert position */}
          <div className="space-y-1.5">
            <Label htmlFor="insertPos">Insert at position</Label>
            <div className="flex items-center gap-2">
              <Input
                id="insertPos"
                type="number"
                min="0"
                max={targetFile.pageCount}
                placeholder="0"
                value={insertPosition}
                onChange={(e) => setInsertPosition(e.target.value)}
                className="w-24"
              />
              <span className="text-xs text-gray-500">
                0 = beginning, {targetFile.pageCount} = end
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={isProcessing || !sourceFile}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Insert
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
