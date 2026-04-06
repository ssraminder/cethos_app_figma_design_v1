// client/components/pdf-manager/PdfAnnotationEditor.tsx
// Full annotation editor: PDF canvas + SVG overlay + sidebar
// Supports: comment pins, highlights, freehand, sticky notes, stamps, shapes
// "Burn in" flattens annotations into the PDF for download

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { saveAs } from 'file-saver';
import { PDFDocument, rgb } from 'pdf-lib';
import { usePdfManager } from '../../context/PdfManagerContext';
import { renderPageToCanvas } from '../../utils/pdfOperations';
import AnnotationToolbar, { type AnnotationMode } from './AnnotationToolbar';
import AnnotationCanvas from './AnnotationCanvas';
import AnnotationSidebar from './AnnotationSidebar';
import type { PdfAnnotation, AnnotationType } from '../../types/pdf-manager';

const RENDER_SCALE = 1.5;

export default function PdfAnnotationEditor() {
  const { state } = usePdfManager();
  const selectedFile = state.selectedFileIndex !== null ? state.files[state.selectedFileIndex] : null;

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isBurning, setIsBurning] = useState(false);

  // Render state
  const [bgDataUrl, setBgDataUrl] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);

  // Annotations (local state — could be connected to Supabase via usePdfAnnotations)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Toolbar state
  const [mode, setMode] = useState<AnnotationMode>('select');
  const [color, setColor] = useState('#FFEB3B');

  const fileBytesRef = useRef<ArrayBuffer | null>(null);
  const fileRef = useRef<File | null>(null);

  // Load file
  useEffect(() => {
    if (!selectedFile || selectedFile.file === fileRef.current) return;
    fileRef.current = selectedFile.file;
    setAnnotations([]);
    setCurrentPage(1);

    async function load() {
      const ab = await selectedFile!.file.arrayBuffer();
      fileBytesRef.current = ab;
      const pdfDoc = await (await import('pdfjs-dist')).getDocument({ data: new Uint8Array(ab) }).promise;
      setTotalPages(pdfDoc.numPages);
      pdfDoc.destroy();
    }
    load();
  }, [selectedFile]);

  // Render page
  useEffect(() => {
    if (!fileBytesRef.current || totalPages === 0) return;
    let cancelled = false;
    setLoading(true);

    async function render() {
      const bg = await renderPageToCanvas(fileBytesRef.current!, currentPage, RENDER_SCALE);
      if (!cancelled) {
        setBgDataUrl(bg.dataUrl);
        setPageWidth(bg.width / bg.scale);
        setPageHeight(bg.height / bg.scale);
        setLoading(false);
      }
    }
    render();
    return () => { cancelled = true; };
  }, [currentPage, totalPages]);

  // Add annotation
  const handleAdd = useCallback((partial: Omit<PdfAnnotation, 'id' | 'document_id' | 'created_by' | 'created_at' | 'updated_at'>) => {
    const newAnnotation: PdfAnnotation = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      document_id: '',
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...partial,
    };
    setAnnotations((prev) => [...prev, newAnnotation]);
    setSelectedId(newAnnotation.id);
  }, []);

  const handleMove = useCallback((id: string, x: number, y: number) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, position_x: x, position_y: y } : a))
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const handleUpdateContent = useCallback((id: string, content: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, content } : a))
    );
  }, []);

  // Burn-in: flatten annotations into PDF
  const handleBurnIn = useCallback(async () => {
    if (!fileBytesRef.current || !selectedFile || annotations.length === 0) return;

    setIsBurning(true);
    try {
      const pdfDoc = await PDFDocument.load(fileBytesRef.current, { ignoreEncryption: true });

      for (const annotation of annotations) {
        const pageIdx = annotation.page_number - 1;
        if (pageIdx < 0 || pageIdx >= pdfDoc.getPageCount()) continue;
        const page = pdfDoc.getPage(pageIdx);
        const { height: ph } = page.getSize();

        // Convert y from top-left CSS to bottom-left PDF
        const pdfY = ph - annotation.position_y - (annotation.height || 20);

        switch (annotation.type) {
          case 'highlight':
            page.drawRectangle({
              x: annotation.position_x,
              y: pdfY,
              width: annotation.width || 100,
              height: annotation.height || 20,
              color: hexToRgb(annotation.color),
              opacity: 0.3,
            });
            break;

          case 'stamp': {
            const font = await pdfDoc.embedFont('Helvetica-Bold' as any);
            const text = annotation.content || 'STAMP';
            page.drawRectangle({
              x: annotation.position_x,
              y: pdfY,
              width: annotation.width || 120,
              height: annotation.height || 40,
              borderColor: hexToRgb(annotation.color),
              borderWidth: 3,
              opacity: 0.8,
            });
            page.drawText(text, {
              x: annotation.position_x + 10,
              y: pdfY + 12,
              size: 16,
              font,
              color: hexToRgb(annotation.color),
              opacity: 0.8,
            });
            break;
          }

          case 'sticky_note':
            page.drawRectangle({
              x: annotation.position_x,
              y: pdfY,
              width: annotation.width || 150,
              height: annotation.height || 100,
              color: hexToRgb(annotation.color),
              opacity: 0.9,
            });
            if (annotation.content) {
              const font = await pdfDoc.embedFont('Helvetica' as any);
              page.drawText(annotation.content.slice(0, 100), {
                x: annotation.position_x + 8,
                y: pdfY + (annotation.height || 100) - 18,
                size: 10,
                font,
                color: rgb(0.2, 0.2, 0.2),
              });
            }
            break;

          case 'comment':
            page.drawCircle({
              x: annotation.position_x + 12,
              y: pdfY + 12,
              size: 12,
              color: hexToRgb(annotation.color),
            });
            break;

          case 'shape':
            page.drawRectangle({
              x: annotation.position_x,
              y: pdfY,
              width: annotation.width || 50,
              height: annotation.height || 50,
              borderColor: hexToRgb(annotation.color),
              borderWidth: 2,
            });
            break;

          // Freehand paths require more complex SVG-to-PDF conversion
          // For now, skip freehand in burn-in
          default:
            break;
        }
      }

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const name = selectedFile.name.replace(/\.pdf$/i, '_annotated.pdf');
      saveAs(blob, name);
      toast.success('Annotated PDF downloaded');
    } catch (err: any) {
      toast.error(`Burn-in failed: ${err.message}`);
    } finally {
      setIsBurning(false);
    }
  }, [selectedFile, annotations]);

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Select a PDF to annotate</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Annotation toolbar */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white">
        <AnnotationToolbar
          mode={mode}
          onModeChange={setMode}
          color={color}
          onColorChange={setColor}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onBurnIn={handleBurnIn}
          isBurning={isBurning}
          annotationCount={annotations.length}
        />
      </div>

      {/* Main area: canvas + sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-teal-600 animate-spin" />
              <span className="ml-2 text-sm text-gray-500">Loading page...</span>
            </div>
          ) : (
            <div
              className="relative shadow-lg"
              style={{
                width: pageWidth * RENDER_SCALE,
                height: pageHeight * RENDER_SCALE,
              }}
            >
              {bgDataUrl && (
                <img
                  src={bgDataUrl}
                  alt={`Page ${currentPage}`}
                  className="absolute inset-0 w-full h-full"
                  draggable={false}
                />
              )}

              <AnnotationCanvas
                annotations={annotations}
                mode={mode}
                color={color}
                pageWidth={pageWidth}
                pageHeight={pageHeight}
                scale={RENDER_SCALE}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAdd={handleAdd}
                onMove={handleMove}
                onDelete={handleDelete}
                onUpdateContent={handleUpdateContent}
                currentPage={currentPage}
              />
            </div>
          )}
        </div>

        {/* Annotation sidebar */}
        <div className="w-64 shrink-0 border-l border-gray-200 bg-white overflow-hidden">
          <AnnotationSidebar
            annotations={annotations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            onGoToPage={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
}

// Helper: hex color to pdf-lib rgb
function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}
