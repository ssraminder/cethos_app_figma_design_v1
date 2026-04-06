// client/components/pdf-manager/PdfUploadZone.tsx
// Multi-file upload with drag-and-drop, extends FileUpload.tsx pattern

import { useCallback, useRef, useState } from 'react';
import { Upload, FileText, Image, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePdfManager } from '../../context/PdfManagerContext';
import { getPageCount } from '../../utils/pdfOperations';
import { compressPdfIfNeeded } from '../../utils/compressPdf';
import type { PdfFile } from '../../types/pdf-manager';

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export default function PdfUploadZone() {
  const { addFiles, state } = usePdfManager();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const validFiles = files.filter(f => {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        toast.error(`Unsupported file type: ${f.name}`);
        return false;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`File too large: ${f.name} (max 100MB)`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setIsProcessing(true);
    try {
      const pdfFiles: PdfFile[] = [];

      for (const file of validFiles) {
        let processedFile = file;

        // Compress large PDFs
        if (file.type === 'application/pdf') {
          processedFile = await compressPdfIfNeeded(file);
        }

        const pageCount = file.type === 'application/pdf'
          ? await getPageCount(processedFile)
          : 1;

        pdfFiles.push({
          clientId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          file: processedFile,
          name: file.name,
          pageCount,
        });
      }

      addFiles(pdfFiles);
      toast.success(`Added ${pdfFiles.length} file(s)`);
    } catch (err: any) {
      toast.error(`Error processing files: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = ''; // Reset for re-upload of same file
    }
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
        isDragging
          ? 'border-teal-500 bg-teal-50'
          : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'
      } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleFileChange}
      />

      {isProcessing ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
          <p className="text-sm text-gray-600">Processing files...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-gray-500">
            PDF, JPG, PNG — up to 100MB each
          </p>
          {state.files.length > 0 && (
            <p className="text-xs text-teal-600 font-medium mt-1">
              {state.files.length} file(s) loaded —{' '}
              {state.files.reduce((sum, f) => sum + f.pageCount, 0)} total pages
            </p>
          )}
        </div>
      )}
    </div>
  );
}
