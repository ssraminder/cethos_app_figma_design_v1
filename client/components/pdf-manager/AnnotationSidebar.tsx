// client/components/pdf-manager/AnnotationSidebar.tsx
// Right sidebar: list of all annotations with page navigation and delete

import {
  MessageCircle,
  Highlighter,
  Pencil,
  StickyNote,
  Stamp,
  Shapes,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import type { PdfAnnotation } from '../../types/pdf-manager';

interface AnnotationSidebarProps {
  annotations: PdfAnnotation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onGoToPage: (page: number) => void;
}

const TYPE_ICONS: Record<string, typeof MessageCircle> = {
  comment: MessageCircle,
  highlight: Highlighter,
  freehand: Pencil,
  sticky_note: StickyNote,
  stamp: Stamp,
  shape: Shapes,
};

const TYPE_LABELS: Record<string, string> = {
  comment: 'Comment',
  highlight: 'Highlight',
  freehand: 'Drawing',
  sticky_note: 'Sticky Note',
  stamp: 'Stamp',
  shape: 'Shape',
};

export default function AnnotationSidebar({
  annotations,
  selectedId,
  onSelect,
  onDelete,
  onGoToPage,
}: AnnotationSidebarProps) {
  if (annotations.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm">
        No annotations yet
      </div>
    );
  }

  // Group by page
  const byPage = new Map<number, PdfAnnotation[]>();
  annotations.forEach((a) => {
    const list = byPage.get(a.page_number) ?? [];
    list.push(a);
    byPage.set(a.page_number, list);
  });

  const sortedPages = Array.from(byPage.keys()).sort((a, b) => a - b);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Annotations ({annotations.length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedPages.map((pageNum) => (
          <div key={pageNum}>
            <button
              onClick={() => onGoToPage(pageNum)}
              className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 border-b border-gray-100"
            >
              Page {pageNum}
              <ChevronRight className="h-3 w-3 ml-auto" />
            </button>

            {byPage.get(pageNum)?.map((a) => {
              const Icon = TYPE_ICONS[a.type] || MessageCircle;
              return (
                <div
                  key={a.id}
                  onClick={() => { onSelect(a.id); onGoToPage(a.page_number); }}
                  className={`flex items-start gap-2 px-3 py-2 border-b border-gray-50 cursor-pointer transition-colors group ${
                    selectedId === a.id ? 'bg-teal-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div
                    className="mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center"
                    style={{ backgroundColor: `${a.color}30` }}
                  >
                    <Icon className="h-3 w-3" style={{ color: a.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">
                      {TYPE_LABELS[a.type] || a.type}
                    </p>
                    {a.content && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {a.content}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(a.id); }}
                    className="p-0.5 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
