// client/components/pdf-manager/PageThumbnailCard.tsx
// Individual page card with selection checkbox and drag handle

import { useRef, useEffect, useState } from 'react';
import { GripVertical, FileText } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface PageThumbnailCardProps {
  pageIndex: number;
  thumbnailUrl: string | null;
  width: number;
  height: number;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  /** For lazy loading — only render thumbnail when visible */
  isVisible?: boolean;
}

export default function PageThumbnailCard({
  pageIndex,
  thumbnailUrl,
  width,
  height,
  isSelected,
  onToggleSelect,
  onDragStart,
  onDragOver,
  onDragEnd,
  isVisible = true,
}: PageThumbnailCardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(pageIndex)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(pageIndex); }}
      onDragEnd={onDragEnd}
      className={`relative group rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing ${
        isSelected
          ? 'border-teal-500 bg-teal-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* Selection checkbox */}
      <div className="absolute top-1.5 left-1.5 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect()}
          className="h-4 w-4 bg-white/90 border-gray-400 data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600"
        />
      </div>

      {/* Drag handle */}
      <div className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>

      {/* Thumbnail */}
      <div
        className="flex items-center justify-center p-1.5 pt-6"
        onClick={onToggleSelect}
      >
        {isVisible && thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Page ${pageIndex + 1}`}
            className="max-h-36 w-auto rounded shadow-sm object-contain"
            loading="lazy"
          />
        ) : (
          <div className="h-36 w-24 rounded bg-gray-100 flex items-center justify-center">
            <FileText className="h-8 w-8 text-gray-300" />
          </div>
        )}
      </div>

      {/* Page number badge */}
      <div className="text-center pb-1.5">
        <span className={`text-xs font-medium ${isSelected ? 'text-teal-700' : 'text-gray-500'}`}>
          {pageIndex + 1}
        </span>
      </div>
    </div>
  );
}
