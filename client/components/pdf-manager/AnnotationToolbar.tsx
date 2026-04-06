// client/components/pdf-manager/AnnotationToolbar.tsx
// Mode toggle: Comment, Highlight, Freehand, Sticky Note, Stamp, Shape + color/save

import { useState } from 'react';
import {
  MessageCircle,
  Highlighter,
  Pencil,
  StickyNote,
  Stamp,
  Shapes,
  MousePointer2,
  Palette,
  Save,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { AnnotationType } from '../../types/pdf-manager';

export type AnnotationMode = AnnotationType | 'select';

interface AnnotationToolbarProps {
  mode: AnnotationMode;
  onModeChange: (mode: AnnotationMode) => void;
  color: string;
  onColorChange: (color: string) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onBurnIn: () => void;
  isBurning: boolean;
  annotationCount: number;
}

const TOOLS: { mode: AnnotationMode; icon: typeof MessageCircle; label: string }[] = [
  { mode: 'select', icon: MousePointer2, label: 'Select' },
  { mode: 'comment', icon: MessageCircle, label: 'Comment' },
  { mode: 'highlight', icon: Highlighter, label: 'Highlight' },
  { mode: 'freehand', icon: Pencil, label: 'Draw' },
  { mode: 'sticky_note', icon: StickyNote, label: 'Sticky Note' },
  { mode: 'stamp', icon: Stamp, label: 'Stamp' },
  { mode: 'shape', icon: Shapes, label: 'Shape' },
];

const COLORS = ['#FFEB3B', '#FF5722', '#2196F3', '#4CAF50', '#9C27B0', '#000000'];

export default function AnnotationToolbar({
  mode,
  onModeChange,
  color,
  onColorChange,
  currentPage,
  totalPages,
  onPageChange,
  onBurnIn,
  isBurning,
  annotationCount,
}: AnnotationToolbarProps) {
  const [showColors, setShowColors] = useState(false);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-gray-600 min-w-[60px] text-center">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="w-px h-5 bg-gray-200" />

      {/* Tool buttons */}
      {TOOLS.map(({ mode: m, icon: Icon, label }) => (
        <button
          key={m}
          onClick={() => onModeChange(m)}
          className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
            mode === m
              ? 'bg-teal-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          title={label}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}

      <div className="w-px h-5 bg-gray-200" />

      {/* Color picker */}
      <div className="relative">
        <button
          onClick={() => setShowColors(!showColors)}
          className="flex items-center gap-1 px-2 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
        >
          <div
            className="w-3.5 h-3.5 rounded-sm border border-gray-300"
            style={{ backgroundColor: color }}
          />
          <Palette className="h-3.5 w-3.5 text-gray-500" />
        </button>
        {showColors && (
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { onColorChange(c); setShowColors(false); }}
                className={`w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform ${
                  color === c ? 'border-teal-500 scale-110' : 'border-gray-200'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {annotationCount > 0 && (
        <span className="text-xs text-gray-400">
          {annotationCount} annotation{annotationCount !== 1 ? 's' : ''}
        </span>
      )}

      {/* Burn-in (flatten to PDF) */}
      <button
        onClick={onBurnIn}
        disabled={isBurning || annotationCount === 0}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isBurning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Burn In & Download
      </button>
    </div>
  );
}
