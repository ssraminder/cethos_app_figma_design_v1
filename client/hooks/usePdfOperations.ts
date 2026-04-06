// client/hooks/usePdfOperations.ts
// React hook wrapping pdfOperations.ts for use in components

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  mergePdfs,
  splitPdf,
  splitPdfEveryN,
  reorderPages,
  removePages,
  insertPages,
  generateThumbnail,
  generateAllThumbnails,
  getPageCount,
  pdfBytesToFile,
  parsePageRanges,
} from '../utils/pdfOperations';
import type { PdfFile, SplitConfig } from '../types/pdf-manager';

export function usePdfOperations() {
  const [isProcessing, setIsProcessing] = useState(false);

  const mergeFiles = useCallback(async (files: PdfFile[]): Promise<File | null> => {
    if (files.length < 2) {
      toast.error('Select at least 2 files to combine');
      return null;
    }

    setIsProcessing(true);
    try {
      const rawFiles = files.map(f => f.file);
      const mergedBytes = await mergePdfs(rawFiles);
      const name = `Combined_${files.length}_files.pdf`;
      const result = pdfBytesToFile(mergedBytes, name);
      toast.success(`Combined ${files.length} files (${result.size > 1024 * 1024 ? (result.size / 1024 / 1024).toFixed(1) + 'MB' : (result.size / 1024).toFixed(0) + 'KB'})`);
      return result;
    } catch (err: any) {
      toast.error(`Combine failed: ${err.message}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const splitFile = useCallback(async (
    file: File,
    config: SplitConfig
  ): Promise<File[]> => {
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      let results: Uint8Array[];

      if (config.mode === 'every_n' && config.everyN) {
        results = await splitPdfEveryN(arrayBuffer, config.everyN);
      } else if (config.mode === 'ranges' && config.ranges) {
        const pageCount = await getPageCount(file);
        const ranges = parsePageRanges(config.ranges, pageCount);
        if (ranges.length === 0) {
          toast.error('No valid page ranges');
          return [];
        }
        results = await splitPdf(arrayBuffer, ranges);
      } else {
        toast.error('Invalid split configuration');
        return [];
      }

      const baseName = file.name.replace(/\.pdf$/i, '');
      const files = results.map((bytes, i) =>
        pdfBytesToFile(bytes, `${baseName}_part${i + 1}.pdf`)
      );

      toast.success(`Split into ${files.length} files`);
      return files;
    } catch (err: any) {
      toast.error(`Split failed: ${err.message}`);
      return [];
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const reorderFilePages = useCallback(async (
    file: File,
    newOrder: number[]
  ): Promise<File | null> => {
    setIsProcessing(true);
    try {
      const bytes = await reorderPages(await file.arrayBuffer(), newOrder);
      return pdfBytesToFile(bytes, file.name);
    } catch (err: any) {
      toast.error(`Reorder failed: ${err.message}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const removeFilePages = useCallback(async (
    file: File,
    pageIndices: number[]
  ): Promise<File | null> => {
    setIsProcessing(true);
    try {
      const bytes = await removePages(await file.arrayBuffer(), pageIndices);
      const result = pdfBytesToFile(bytes, file.name);
      toast.success(`Removed ${pageIndices.length} page(s)`);
      return result;
    } catch (err: any) {
      toast.error(`Remove pages failed: ${err.message}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const insertFilePages = useCallback(async (
    target: File,
    source: File,
    sourcePageIndices: number[],
    insertAt: number
  ): Promise<File | null> => {
    setIsProcessing(true);
    try {
      const bytes = await insertPages(
        await target.arrayBuffer(),
        await source.arrayBuffer(),
        sourcePageIndices,
        insertAt
      );
      return pdfBytesToFile(bytes, target.name);
    } catch (err: any) {
      toast.error(`Insert pages failed: ${err.message}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    isProcessing,
    mergeFiles,
    splitFile,
    reorderFilePages,
    removeFilePages,
    insertFilePages,
    generateThumbnail,
    generateAllThumbnails,
    getPageCount,
  };
}
