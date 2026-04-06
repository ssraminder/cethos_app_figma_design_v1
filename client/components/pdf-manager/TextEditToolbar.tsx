// client/components/pdf-manager/TextEditToolbar.tsx
// Toolbar for text editing: font size, color picker, save, navigation

import { useState } from 'react';
import {
  Type,
  Palette,
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  AlertTriangle,
  Undo2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface TextEditToolbarProps {
  currentPage: number;
  totalPages: number;
  fontSize: number;
  color: string;
  hasEdits: boolean;
  isSaving: boolean;
  onPageChange: (page: number) => void;
  onFontSizeChange: (size: number) => void;
  onColorChange: (color: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}

const PRESET_COLORS = [
  { label: 'Black', value: '#000000' },
  { label: 'Dark Gray', value: '#374151' },
  { label: 'Red', value: '#DC2626' },
  { label: 'Blue', value: '#2563EB' },
  { label: 'Green', value: '#16A34A' },
  { label: 'Teal', value: '#0D9488' },
];

export default function TextEditToolbar({
  currentPage,
  totalPages,
  fontSize,
  color,
  hasEdits,
  isSaving,
  onPageChange,
  onFontSizeChange,
  onColorChange,
  onSave,
  onDiscard,
}: TextEditToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
    <div className="flex items-center gap-2 flex-wrap">
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
          Page {currentPage} / {totalPages}
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

      {/* Font size */}
      <div className="flex items-center gap-1">
        <Type className="h-3.5 w-3.5 text-gray-500" />
        <Input
          type="number"
          min={6}
          max={72}
          value={fontSize}
          onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10) || 12)}
          className="w-16 h-7 text-xs"
        />
        <span className="text-xs text-gray-400">pt</span>
      </div>

      <div className="w-px h-5 bg-gray-200" />

      {/* Color picker */}
      <div className="relative">
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
        >
          <div
            className="w-3.5 h-3.5 rounded-sm border border-gray-300"
            style={{ backgroundColor: color }}
          />
          <Palette className="h-3.5 w-3.5 text-gray-500" />
        </button>

        {showColorPicker && (
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => { onColorChange(c.value); setShowColorPicker(false); }}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  color === c.value ? 'border-teal-500 scale-110' : 'border-gray-200'
                }`}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 p-0"
              title="Custom color"
            />
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Warning about flattening */}
      {hasEdits && (
        <div className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Edited pages will be flattened</span>
        </div>
      )}

      {/* Discard / Save */}
      {hasEdits && (
        <button
          onClick={onDiscard}
          disabled={isSaving}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Discard
        </button>
      )}

      <button
        onClick={onSave}
        disabled={!hasEdits || isSaving}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save Edits
      </button>
    </div>
  );
}
