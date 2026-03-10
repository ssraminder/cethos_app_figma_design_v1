import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Point pdf.js worker at the CDN build
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

const COMPRESSION_THRESHOLD_BYTES = 3 * 1024 * 1024; // 3MB — skip small files
const TARGET_DPI = 150;
const BASE_DPI = 72; // pdf.js default
const SCALE = TARGET_DPI / BASE_DPI; // ~2.08
const JPEG_QUALITY = 0.80;

export async function compressPdfIfNeeded(file: File): Promise<File> {
  // Only compress large PDFs
  if (file.type !== 'application/pdf' || file.size < COMPRESSION_THRESHOLD_BYTES) {
    return file;
  }

  try {
    console.log(`🗜️ Compressing ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)...`);

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdfDoc.numPages;

    const newPdf = await PDFDocument.create();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: SCALE });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;

      await page.render({ canvasContext: ctx as any, viewport }).promise;

      const jpegDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const jpegBase64 = jpegDataUrl.split(',')[1];
      const jpegBytes = Uint8Array.from(atob(jpegBase64), c => c.charCodeAt(0));

      const jpegImage = await newPdf.embedJpg(jpegBytes);
      const pdfPage = newPdf.addPage([viewport.width, viewport.height]);
      pdfPage.drawImage(jpegImage, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    }

    const compressedBytes = await newPdf.save();
    const compressedFile = new File(
      [new Blob([compressedBytes], { type: 'application/pdf' })],
      file.name,
      { type: 'application/pdf' }
    );

    console.log(`✅ Compressed: ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(1)}MB`);
    return compressedFile;

  } catch (err: any) {
    console.warn('PDF compression failed, using original:', err.message);
    return file; // silent fallback
  }
}

export function needsCompression(file: File): boolean {
  return file.type === 'application/pdf' && file.size >= COMPRESSION_THRESHOLD_BYTES;
}
