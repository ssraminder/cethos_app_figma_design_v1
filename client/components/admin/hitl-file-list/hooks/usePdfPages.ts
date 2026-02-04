// client/components/admin/hitl-file-list/hooks/usePdfPages.ts

import { useCallback } from 'react';

export function usePdfPages() {
  const countPages = useCallback(async (file: File): Promise<number> => {
    // For images, return 1 page
    if (file.type.startsWith('image/')) {
      console.log('[usePdfPages] Image file, returning 1 page');
      return 1;
    }

    // For PDFs, use PDF.js
    if (file.type === 'application/pdf') {
      try {
        console.log('[usePdfPages] Counting PDF pages for:', file.name);

        // Dynamic import to avoid SSR issues
        const pdfjsLib = await import('pdfjs-dist');

        // Set worker path - use CDN with .js extension (cdnjs only has .js, not .mjs)
        const version = pdfjsLib.version;
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;

        console.log('[usePdfPages] PDF.js version:', version);
        console.log('[usePdfPages] Worker src:', pdfjsLib.GlobalWorkerOptions.workerSrc);

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;

        console.log('[usePdfPages] PDF has', numPages, 'pages');
        return numPages;
      } catch (error) {
        console.error('[usePdfPages] Error counting PDF pages:', error);
        // Fallback: try to estimate from file size (rough guess)
        // Average PDF page is ~100KB
        const estimatedPages = Math.max(1, Math.round(file.size / 100000));
        console.log('[usePdfPages] Fallback estimate:', estimatedPages, 'pages');
        return estimatedPages;
      }
    }

    console.log('[usePdfPages] Unknown file type:', file.type);
    return 1;
  }, []);

  const convertImageToPdf = useCallback(async (imageFile: File): Promise<File> => {
    console.log('[usePdfPages] Converting image to PDF:', imageFile.name);

    // Dynamic import jsPDF
    const { default: jsPDF } = await import('jspdf');

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();

        img.onload = () => {
          try {
            // Create PDF with image dimensions
            const pdf = new jsPDF({
              orientation: img.width > img.height ? 'landscape' : 'portrait',
              unit: 'px',
              format: [img.width, img.height],
            });

            pdf.addImage(
              img,
              imageFile.type === 'image/png' ? 'PNG' : 'JPEG',
              0,
              0,
              img.width,
              img.height
            );

            const pdfBlob = pdf.output('blob');
            const pdfFilename = imageFile.name.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '.pdf');
            const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });

            console.log('[usePdfPages] Converted to PDF:', pdfFilename);
            resolve(pdfFile);
          } catch (error) {
            console.error('[usePdfPages] PDF conversion error:', error);
            reject(error);
          }
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(imageFile);
    });
  }, []);

  return { countPages, convertImageToPdf };
}
