// client/components/admin/hitl-file-list/hooks/usePdfPages.ts

import { useCallback } from 'react';

export function usePdfPages() {
  const countPages = useCallback(async (file: File): Promise<number> => {
    // For images, return 1 page
    if (file.type.startsWith('image/')) {
      return 1;
    }

    // For PDFs, use PDF.js
    if (file.type === 'application/pdf') {
      try {
        // Dynamic import to avoid SSR issues
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        return pdf.numPages;
      } catch (error) {
        console.error('Error counting PDF pages:', error);
        return 1;
      }
    }

    return 1;
  }, []);

  const convertImageToPdf = useCallback(async (imageFile: File): Promise<File> => {
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
            const pdfFilename = imageFile.name.replace(/\.(jpg|jpeg|png)$/i, '.pdf');
            const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });

            resolve(pdfFile);
          } catch (error) {
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
