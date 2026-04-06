// client/components/pdf-manager/PdfTextEditor.tsx
// Full text editor: canvas background + text layer overlay + save with flattening
// - Renders page as image background
// - Extracts text positions with pdfjs-dist getTextContent()
// - Overlays editable divs at those positions
// - On save: rasterizes modified pages + redraws text with pdf-lib drawText()
// - Unmodified pages copied as-is (no quality loss)

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Type } from 'lucide-react';
import { toast } from 'sonner';
import { usePdfManager } from '../../context/PdfManagerContext';
import {
  extractTextItems,
  renderPageToCanvas,
  applyTextEdits,
  pdfBytesToFile,
  getPageCount as getPageCountFn,
  type TextItem,
  type TextEdit,
} from '../../utils/pdfOperations';
import TextLayerOverlay from './TextLayerOverlay';
import TextEditToolbar from './TextEditToolbar';

const RENDER_SCALE = 1.5; // Scale for canvas rendering

export default function PdfTextEditor() {
  const { state, dispatch } = usePdfManager();
  const selectedFile = state.selectedFileIndex !== null ? state.files[state.selectedFileIndex] : null;

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Page render state
  const [bgDataUrl, setBgDataUrl] = useState<string | null>(null);
  const [bgWidth, setBgWidth] = useState(0);
  const [bgHeight, setBgHeight] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);

  // Text items per page
  const [allEdits, setAllEdits] = useState<Map<number, TextItem[]>>(new Map());
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Editing state
  const [fontSize, setFontSize] = useState(12);
  const [editColor, setEditColor] = useState('#000000');

  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<File | null>(null);
  const fileBytesRef = useRef<ArrayBuffer | null>(null);

  // Load file bytes
  useEffect(() => {
    if (!selectedFile || selectedFile.file === fileRef.current) return;

    fileRef.current = selectedFile.file;
    setAllEdits(new Map());
    setCurrentPage(1);

    async function load() {
      const ab = await selectedFile!.file.arrayBuffer();
      fileBytesRef.current = ab;

      const pdfDoc = await (await import(/* @vite-ignore */ 'pdfjs-dist')).getDocument({ data: new Uint8Array(ab) }).promise;
      setTotalPages(pdfDoc.numPages);
      pdfDoc.destroy();
    }

    load();
  }, [selectedFile]);

  // Load current page
  useEffect(() => {
    if (!fileBytesRef.current || totalPages === 0) return;

    let cancelled = false;
    setLoading(true);

    async function loadPage() {
      const bytes = fileBytesRef.current!;

      // Render background
      const bg = await renderPageToCanvas(bytes, currentPage, RENDER_SCALE);

      // Check if we have cached edits for this page
      const cachedItems = allEdits.get(currentPage);

      if (!cancelled) {
        setBgDataUrl(bg.dataUrl);
        setBgWidth(bg.width);
        setBgHeight(bg.height);
        setPageWidth(bg.width / bg.scale);
        setPageHeight(bg.height / bg.scale);

        if (cachedItems) {
          setTextItems(cachedItems);
        } else {
          // Extract fresh text items
          const result = await extractTextItems(bytes, currentPage);
          if (!cancelled) {
            setTextItems(result.items);
          }
        }

        setSelectedItemId(null);
        setLoading(false);
      }
    }

    loadPage();
    return () => { cancelled = true; };
  }, [currentPage, totalPages, allEdits]);

  // Save current page items to allEdits map when navigating away
  const saveCurrPageItems = useCallback(() => {
    if (textItems.length > 0) {
      setAllEdits((prev) => {
        const next = new Map(prev);
        next.set(currentPage, textItems);
        return next;
      });
    }
  }, [currentPage, textItems]);

  const handlePageChange = useCallback((page: number) => {
    if (page < 1 || page > totalPages) return;
    saveCurrPageItems();
    setCurrentPage(page);
  }, [totalPages, saveCurrPageItems]);

  const handleItemChange = useCallback((id: string, newText: string) => {
    setTextItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, text: newText, isModified: newText !== item.originalText }
          : item
      )
    );
  }, []);

  const hasEdits = useCallback((): boolean => {
    // Check current page
    if (textItems.some((i) => i.isModified)) return true;
    // Check other cached pages
    for (const [, items] of allEdits) {
      if (items.some((i) => i.isModified)) return true;
    }
    return false;
  }, [textItems, allEdits]);

  const handleDiscard = useCallback(() => {
    setAllEdits(new Map());
    setTextItems((prev) =>
      prev.map((item) => ({ ...item, text: item.originalText, isModified: false }))
    );
    toast.info('Edits discarded');
  }, []);

  const handleSave = useCallback(async () => {
    if (!fileBytesRef.current || !selectedFile) return;

    // Save current page first
    saveCurrPageItems();

    setIsSaving(true);
    try {
      // Collect all edits
      const currentItems = new Map(allEdits);
      currentItems.set(currentPage, textItems);

      const edits: TextEdit[] = [];
      for (const [pageNum, items] of currentItems) {
        if (items.some((i) => i.isModified)) {
          edits.push({ pageNumber: pageNum, items });
        }
      }

      if (edits.length === 0) {
        toast.info('No changes to save');
        setIsSaving(false);
        return;
      }

      const resultBytes = await applyTextEdits(fileBytesRef.current, edits);
      const resultFile = pdfBytesToFile(resultBytes, selectedFile.name);
      const newPageCount = await getPageCountFn(resultFile);

      // Update file in state
      const updatedFiles = state.files.map((f, i) =>
        i === state.selectedFileIndex
          ? { ...f, file: resultFile, pageCount: newPageCount }
          : f
      );

      dispatch({ type: 'RESET' });
      updatedFiles.forEach((f) => dispatch({ type: 'ADD_FILES', files: [f] }));
      dispatch({ type: 'SELECT_FILE', index: state.selectedFileIndex });

      // Reset edit state
      fileRef.current = resultFile;
      fileBytesRef.current = await resultFile.arrayBuffer();
      setAllEdits(new Map());

      toast.success(`Saved text edits (${edits.length} page(s) flattened)`);
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [selectedFile, state, currentPage, textItems, allEdits, saveCurrPageItems, dispatch]);

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <Type className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Select a PDF to edit text</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Text edit toolbar */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white">
        <TextEditToolbar
          currentPage={currentPage}
          totalPages={totalPages}
          fontSize={fontSize}
          color={editColor}
          hasEdits={hasEdits()}
          isSaving={isSaving}
          onPageChange={handlePageChange}
          onFontSizeChange={setFontSize}
          onColorChange={setEditColor}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      </div>

      {/* Editor area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-4"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 text-teal-600 animate-spin" />
            <span className="ml-2 text-sm text-gray-500">Loading page...</span>
          </div>
        ) : (
          <div
            className="relative shadow-lg"
            style={{ width: bgWidth, height: bgHeight }}
          >
            {/* Background image (rasterized PDF page) */}
            {bgDataUrl && (
              <img
                src={bgDataUrl}
                alt={`Page ${currentPage}`}
                className="absolute inset-0 w-full h-full"
                draggable={false}
              />
            )}

            {/* Text layer overlay */}
            <TextLayerOverlay
              items={textItems}
              scale={RENDER_SCALE}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              onItemChange={handleItemChange}
              onItemSelect={setSelectedItemId}
              selectedItemId={selectedItemId}
              editColor={editColor}
            />
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="px-4 py-1.5 bg-amber-50 border-t border-amber-200 text-xs text-amber-700">
        Text editing flattens modified pages (image + text overlay). Unedited pages remain vector.
        Works best on simple text-based PDFs. Font substitution may occur.
      </div>
    </div>
  );
}
