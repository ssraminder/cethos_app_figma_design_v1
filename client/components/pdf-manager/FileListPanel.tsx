// client/components/pdf-manager/FileListPanel.tsx
// Sortable file list with drag-to-reorder using HTML5 DnD

import { useRef, useState, useCallback } from 'react';
import { FileText, Image, GripVertical, X, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { usePdfManager } from '../../context/PdfManagerContext';
import type { PdfFile } from '../../types/pdf-manager';

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

interface FileItemProps {
  file: PdfFile;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
}

function FileItem({
  file,
  index,
  isSelected,
  onSelect,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: FileItemProps) {
  const isPdf = file.file.type === 'application/pdf';

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors group ${
        isSelected
          ? 'bg-teal-50 border border-teal-300'
          : 'bg-white border border-gray-200 hover:bg-gray-50'
      }`}
    >
      <GripVertical className="h-4 w-4 text-gray-400 cursor-grab shrink-0" />

      {isPdf ? (
        <FileText className="h-4 w-4 text-red-500 shrink-0" />
      ) : (
        <Image className="h-4 w-4 text-blue-500 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
        <p className="text-xs text-gray-500">
          {file.pageCount} page{file.pageCount !== 1 ? 's' : ''} — {formatSize(file.file.size)}
        </p>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="p-1 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove"
      >
        <X className="h-3.5 w-3.5 text-red-500" />
      </button>
    </div>
  );
}

export default function FileListPanel() {
  const { state, removeFile, reorderFiles, selectFile } = usePdfManager();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    setDropIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      reorderFiles(dragIndex, dropIndex);
    }
    setDragIndex(null);
    setDropIndex(null);
  }, [dragIndex, dropIndex, reorderFiles]);

  if (state.files.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No files added yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Files ({state.files.length})
        </h3>
        <span className="text-xs text-gray-400">
          {state.files.reduce((sum, f) => sum + f.pageCount, 0)} pages total
        </span>
      </div>

      {state.files.map((file, index) => (
        <FileItem
          key={file.clientId}
          file={file}
          index={index}
          isSelected={state.selectedFileIndex === index}
          onSelect={() => selectFile(index)}
          onRemove={() => removeFile(file.clientId)}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  );
}
