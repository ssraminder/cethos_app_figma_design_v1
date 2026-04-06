// client/components/pdf-manager/SplitPdfDialog.tsx
// Dialog to configure split points: by page ranges or every N pages

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Scissors } from 'lucide-react';
import { usePdfManager } from '../../context/PdfManagerContext';
import { usePdfOperations } from '../../hooks/usePdfOperations';
import type { PdfFile } from '../../types/pdf-manager';

interface SplitPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: PdfFile;
}

export default function SplitPdfDialog({ open, onOpenChange, file }: SplitPdfDialogProps) {
  const { addFiles } = usePdfManager();
  const { splitFile, isProcessing, getPageCount } = usePdfOperations();
  const [mode, setMode] = useState<'ranges' | 'every_n'>('ranges');
  const [ranges, setRanges] = useState('');
  const [everyN, setEveryN] = useState('1');

  const handleSplit = async () => {
    const results = await splitFile(file.file, {
      mode,
      ranges: mode === 'ranges' ? ranges : undefined,
      everyN: mode === 'every_n' ? parseInt(everyN, 10) : undefined,
    });

    if (results.length > 0) {
      const pdfFiles: PdfFile[] = [];
      for (const f of results) {
        const pageCount = await getPageCount(f);
        pdfFiles.push({
          clientId: `split_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          name: f.name,
          pageCount,
        });
      }
      addFiles(pdfFiles);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-teal-600" />
            Split PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-600">
            Splitting: <span className="font-medium">{file.name}</span>{' '}
            ({file.pageCount} pages)
          </p>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('ranges')}
              className={`flex-1 py-2 px-3 text-sm rounded-md border transition-colors ${
                mode === 'ranges'
                  ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              By Page Ranges
            </button>
            <button
              onClick={() => setMode('every_n')}
              className={`flex-1 py-2 px-3 text-sm rounded-md border transition-colors ${
                mode === 'every_n'
                  ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Every N Pages
            </button>
          </div>

          {mode === 'ranges' ? (
            <div className="space-y-1.5">
              <Label htmlFor="ranges">Page Ranges</Label>
              <Input
                id="ranges"
                placeholder="e.g. 1-3, 5, 7-10"
                value={ranges}
                onChange={(e) => setRanges(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Comma-separated ranges. Each range becomes a separate file.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="everyN">Split every</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="everyN"
                  type="number"
                  min="1"
                  max={file.pageCount}
                  value={everyN}
                  onChange={(e) => setEveryN(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-gray-600">page(s)</span>
              </div>
              <p className="text-xs text-gray-500">
                Creates {Math.ceil(file.pageCount / Math.max(1, parseInt(everyN, 10) || 1))} file(s)
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSplit}
            disabled={isProcessing || (mode === 'ranges' && !ranges.trim())}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
            Split
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
