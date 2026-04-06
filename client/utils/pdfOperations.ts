// client/utils/pdfOperations.ts
// Reusable PDF operations built on pdf-lib and pdfjs-dist

import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Merge multiple PDF files into a single PDF.
 * Based on AdminOrderDetail.tsx mergeChunkPdfs pattern.
 */
export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();

    if (file.type === 'application/pdf') {
      const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    } else if (file.type.startsWith('image/')) {
      // Embed image as a full page (from FileUpload.tsx consolidateImagesToPdf pattern)
      const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';
      const image = isJpeg
        ? await mergedPdf.embedJpg(new Uint8Array(arrayBuffer))
        : await mergedPdf.embedPng(new Uint8Array(arrayBuffer));

      const page = mergedPdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }
  }

  return mergedPdf.save();
}

/**
 * Split a PDF into multiple PDFs based on page ranges.
 * @param ranges - Array of [startPage, endPage] tuples (1-based inclusive)
 */
export async function splitPdf(
  fileBytes: ArrayBuffer,
  ranges: [number, number][]
): Promise<Uint8Array[]> {
  const sourcePdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
  const results: Uint8Array[] = [];

  for (const [start, end] of ranges) {
    const newPdf = await PDFDocument.create();
    // Convert 1-based inclusive to 0-based indices
    const indices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
    const pages = await newPdf.copyPages(sourcePdf, indices);
    pages.forEach(page => newPdf.addPage(page));
    results.push(await newPdf.save());
  }

  return results;
}

/**
 * Split a PDF every N pages.
 */
export async function splitPdfEveryN(
  fileBytes: ArrayBuffer,
  n: number
): Promise<Uint8Array[]> {
  const sourcePdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
  const totalPages = sourcePdf.getPageCount();
  const ranges: [number, number][] = [];

  for (let start = 1; start <= totalPages; start += n) {
    const end = Math.min(start + n - 1, totalPages);
    ranges.push([start, end]);
  }

  return splitPdf(fileBytes, ranges);
}

/**
 * Reorder pages in a PDF.
 * @param newOrder - Array of 0-based page indices in the desired order
 */
export async function reorderPages(
  fileBytes: ArrayBuffer,
  newOrder: number[]
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  const pages = await newPdf.copyPages(sourcePdf, newOrder);
  pages.forEach(page => newPdf.addPage(page));
  return newPdf.save();
}

/**
 * Remove specific pages from a PDF.
 * @param pageIndices - 0-based indices of pages to remove
 */
export async function removePages(
  fileBytes: ArrayBuffer,
  pageIndices: number[]
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
  const totalPages = sourcePdf.getPageCount();
  const removeSet = new Set(pageIndices);
  const keepIndices = Array.from({ length: totalPages }, (_, i) => i)
    .filter(i => !removeSet.has(i));

  const newPdf = await PDFDocument.create();
  const pages = await newPdf.copyPages(sourcePdf, keepIndices);
  pages.forEach(page => newPdf.addPage(page));
  return newPdf.save();
}

/**
 * Insert pages from one PDF into another at a specific position.
 * @param targetBytes - The PDF to insert into
 * @param sourceBytes - The PDF to insert from
 * @param sourcePageIndices - 0-based indices of pages to copy from source
 * @param insertAt - 0-based position in target to insert at
 */
export async function insertPages(
  targetBytes: ArrayBuffer,
  sourceBytes: ArrayBuffer,
  sourcePageIndices: number[],
  insertAt: number
): Promise<Uint8Array> {
  const targetPdf = await PDFDocument.load(targetBytes, { ignoreEncryption: true });
  const sourcePdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();

  const totalTargetPages = targetPdf.getPageCount();
  const beforeIndices = Array.from({ length: insertAt }, (_, i) => i);
  const afterIndices = Array.from({ length: totalTargetPages - insertAt }, (_, i) => insertAt + i);

  // Copy pages before insertion point
  if (beforeIndices.length > 0) {
    const pages = await newPdf.copyPages(targetPdf, beforeIndices);
    pages.forEach(page => newPdf.addPage(page));
  }

  // Copy source pages
  const insertedPages = await newPdf.copyPages(sourcePdf, sourcePageIndices);
  insertedPages.forEach(page => newPdf.addPage(page));

  // Copy pages after insertion point
  if (afterIndices.length > 0) {
    const pages = await newPdf.copyPages(targetPdf, afterIndices);
    pages.forEach(page => newPdf.addPage(page));
  }

  return newPdf.save();
}

/**
 * Generate a thumbnail for a specific PDF page.
 * Based on compressPdf.ts canvas rendering pattern.
 * @param scale - Render scale (0.3 = thumbnail, 1.0 = full size)
 */
export async function generateThumbnail(
  fileBytes: ArrayBuffer,
  pageNumber: number = 1,
  scale: number = 0.3
): Promise<string> {
  const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(fileBytes) }).promise;
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport } as any).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

  // Cleanup
  pdfDoc.destroy();

  return dataUrl;
}

/**
 * Generate thumbnails for all pages of a PDF.
 */
export async function generateAllThumbnails(
  fileBytes: ArrayBuffer,
  scale: number = 0.3
): Promise<{ pageIndex: number; thumbnailUrl: string; width: number; height: number }[]> {
  const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(fileBytes) }).promise;
  const thumbnails: { pageIndex: number; thumbnailUrl: string; width: number; height: number }[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport } as any).promise;

    thumbnails.push({
      pageIndex: i - 1,
      thumbnailUrl: canvas.toDataURL('image/jpeg', 0.7),
      width: viewport.width,
      height: viewport.height,
    });
  }

  pdfDoc.destroy();
  return thumbnails;
}

/**
 * Get the page count of a PDF file.
 */
export async function getPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const count = pdfDoc.numPages;
  pdfDoc.destroy();
  return count;
}

/**
 * Create a File object from PDF bytes.
 */
export function pdfBytesToFile(bytes: Uint8Array, fileName: string): File {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  return new File([blob], fileName, { type: 'application/pdf' });
}

/**
 * Parse a page range string like "1-3,5,7-10" into [start, end] tuples.
 */
export function parsePageRanges(rangeStr: string, totalPages: number): [number, number][] {
  const ranges: [number, number][] = [];
  const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = Math.max(1, parseInt(startStr, 10));
      const end = Math.min(totalPages, parseInt(endStr, 10));
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        ranges.push([start, end]);
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        ranges.push([page, page]);
      }
    }
  }

  return ranges;
}

// --- Text Editing Utilities ---

export interface TextItem {
  /** Unique ID for this text span */
  id: string;
  /** Original text content */
  originalText: string;
  /** Edited text (starts same as original) */
  text: string;
  /** Position in PDF units (unscaled) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Font size in PDF points */
  fontSize: number;
  /** Font family name from PDF */
  fontFamily: string;
  /** Whether user has modified this item */
  isModified: boolean;
}

/**
 * Extract text items with positions from a PDF page using pdfjs-dist.
 * Returns items in PDF coordinate space.
 */
export async function extractTextItems(
  fileBytes: ArrayBuffer,
  pageNumber: number
): Promise<{ items: TextItem[]; pageWidth: number; pageHeight: number }> {
  const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(fileBytes) }).promise;
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();

  let idCounter = 0;
  const items: TextItem[] = [];

  for (const item of textContent.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const ti = item as any;

    // pdfjs transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
    const tx = ti.transform[4];
    const ty = ti.transform[5];
    const fontSize = Math.abs(ti.transform[3]) || Math.abs(ti.transform[0]) || 12;
    const fontFamily = ti.fontName || 'sans-serif';

    // Convert from PDF coords (origin bottom-left) to top-left for CSS
    const x = tx;
    const y = viewport.height - ty;
    const width = ti.width || item.str.length * fontSize * 0.6;
    const height = fontSize * 1.2;

    items.push({
      id: `text_${pageNumber}_${idCounter++}`,
      originalText: item.str,
      text: item.str,
      x,
      y: y - height, // adjust so top of text is at y
      width,
      height,
      fontSize,
      fontFamily,
      isModified: false,
    });
  }

  pdfDoc.destroy();

  return {
    items,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
  };
}

/**
 * Render a PDF page to a canvas and return the data URL.
 * Used as background for text editing.
 */
export async function renderPageToCanvas(
  fileBytes: ArrayBuffer,
  pageNumber: number,
  scale: number = 1.5
): Promise<{ dataUrl: string; width: number; height: number; scale: number }> {
  const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(fileBytes) }).promise;
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport } as any).promise;
  const dataUrl = canvas.toDataURL('image/png');

  pdfDoc.destroy();

  return {
    dataUrl,
    width: viewport.width,
    height: viewport.height,
    scale,
  };
}

export interface TextEdit {
  pageNumber: number; // 1-based
  items: TextItem[];
}

/**
 * Apply text edits to a PDF. Modified pages are flattened (rasterized background + redrawn text).
 * Unmodified pages are copied as-is with no quality loss.
 */
export async function applyTextEdits(
  fileBytes: ArrayBuffer,
  edits: TextEdit[]
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  const totalPages = sourcePdf.getPageCount();

  const editMap = new Map<number, TextEdit>();
  edits.forEach((e) => editMap.set(e.pageNumber, e));

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const edit = editMap.get(pageNum);
    const hasModifiedItems = edit?.items.some((i) => i.isModified);

    if (!edit || !hasModifiedItems) {
      // Copy page as-is — no quality loss
      const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageNum - 1]);
      newPdf.addPage(copiedPage);
    } else {
      // Flatten: rasterize background + draw edited text
      const sourcePage = sourcePdf.getPage(pageNum - 1);
      const { width: pageWidth, height: pageHeight } = sourcePage.getSize();

      // Render background at 150 DPI
      const bgScale = 150 / 72;
      const bgResult = await renderPageToCanvas(fileBytes, pageNum, bgScale);

      // Embed background image
      const bgImageBytes = await fetch(bgResult.dataUrl).then((r) => r.arrayBuffer());
      const bgImage = await newPdf.embedPng(new Uint8Array(bgImageBytes));

      const page = newPdf.addPage([pageWidth, pageHeight]);

      // Draw background (rasterized original)
      page.drawImage(bgImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });

      // Draw edited text items on top
      // Note: We use pdf-lib's built-in fonts since we can't embed arbitrary fonts
      const font = await newPdf.embedFont('Helvetica' as any);

      for (const item of edit.items) {
        if (!item.text.trim()) continue;

        const fontSize = Math.max(6, Math.min(72, item.fontSize));
        // Convert from CSS top-left coords back to PDF bottom-left coords
        const pdfY = pageHeight - item.y - item.height;

        page.drawText(item.text, {
          x: item.x,
          y: pdfY,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  return newPdf.save();
}
