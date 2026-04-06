// client/components/pdf-manager/PageThumbnailGrid.tsx
// CSS grid of page thumbnails with lazy loading via IntersectionObserver

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { usePdfManager } from '../../context/PdfManagerContext';
import { generateAllThumbnails } from '../../utils/pdfOperations';
import PageThumbnailCard from './PageThumbnailCard';
import type { PageThumbnail } from '../../types/pdf-manager';

export default function PageThumbnailGrid() {
  const { state, dispatch } = usePdfManager();
  const [loading, setLoading] = useState(false);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Load thumbnails when a file is selected
  useEffect(() => {
    if (state.selectedFileIndex === null) return;
    const file = state.files[state.selectedFileIndex];
    if (!file || file.file.type !== 'application/pdf') return;

    let cancelled = false;
    setLoading(true);

    async function loadPages() {
      try {
        const ab = await file.file.arrayBuffer();
        const thumbs = await generateAllThumbnails(ab, 0.3);

        if (!cancelled) {
          const pages: PageThumbnail[] = thumbs.map((t) => ({
            pageIndex: t.pageIndex,
            thumbnailUrl: t.thumbnailUrl,
            width: t.width,
            height: t.height,
            selected: false,
          }));
          dispatch({ type: 'SET_PAGES', pages });
        }
      } catch (err) {
        console.error('Failed to load page thumbnails:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPages();
    return () => { cancelled = true; };
  }, [state.selectedFileIndex, state.files, dispatch]);

  // Intersection observer for lazy loading
  useEffect(() => {
    if (!gridRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const newVisible = new Set(visiblePages);
        entries.forEach((entry) => {
          const idx = Number(entry.target.getAttribute('data-page-index'));
          if (entry.isIntersecting) {
            newVisible.add(idx);
          }
        });
        setVisiblePages(newVisible);
      },
      { root: gridRef.current, rootMargin: '200px', threshold: 0 }
    );

    const cards = gridRef.current.querySelectorAll('[data-page-index]');
    cards.forEach((card) => observerRef.current?.observe(card));

    return () => observerRef.current?.disconnect();
  }, [state.pages.length]);

  // DnD handlers
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => setDragIndex(index), []);
  const handleDragOver = useCallback((index: number) => setDropIndex(index), []);
  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      dispatch({ type: 'REORDER_PAGES', fromIndex: dragIndex, toIndex: dropIndex });
    }
    setDragIndex(null);
    setDropIndex(null);
  }, [dragIndex, dropIndex, dispatch]);

  if (state.selectedFileIndex === null) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-teal-600 animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Loading pages...</span>
      </div>
    );
  }

  if (state.pages.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No pages to display
      </div>
    );
  }

  return (
    <div ref={gridRef} className="overflow-auto max-h-[calc(100vh-14rem)]">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 p-2">
        {state.pages.map((page, idx) => (
          <div key={`page-${idx}`} data-page-index={idx}>
            <PageThumbnailCard
              pageIndex={idx}
              thumbnailUrl={page.thumbnailUrl}
              width={page.width}
              height={page.height}
              isSelected={state.selectedPageIndices.includes(idx)}
              onToggleSelect={() => dispatch({ type: 'TOGGLE_PAGE_SELECTION', pageIndex: idx })}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              isVisible={visiblePages.has(idx) || idx < 20}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
