// client/components/pdf-manager/TextLayerOverlay.tsx
// Positioned editable divs from pdfjs text content extraction
// Each text span is an editable div that the user can click and modify

import { useState, useCallback, useRef, useEffect } from 'react';
import type { TextItem } from '../../utils/pdfOperations';

interface TextLayerOverlayProps {
  items: TextItem[];
  scale: number;
  pageWidth: number;
  pageHeight: number;
  onItemChange: (id: string, newText: string) => void;
  onItemSelect: (id: string | null) => void;
  selectedItemId: string | null;
  editColor: string;
}

export default function TextLayerOverlay({
  items,
  scale,
  pageWidth,
  pageHeight,
  onItemChange,
  onItemSelect,
  selectedItemId,
  editColor,
}: TextLayerOverlayProps) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        width: pageWidth * scale,
        height: pageHeight * scale,
      }}
      onClick={(e) => {
        // Deselect if clicking the overlay background (not a text item)
        if (e.target === e.currentTarget) {
          onItemSelect(null);
        }
      }}
    >
      {items.map((item) => (
        <TextItemDiv
          key={item.id}
          item={item}
          scale={scale}
          isSelected={item.id === selectedItemId}
          onSelect={() => onItemSelect(item.id)}
          onChange={(newText) => onItemChange(item.id, newText)}
          editColor={editColor}
        />
      ))}
    </div>
  );
}

interface TextItemDivProps {
  item: TextItem;
  scale: number;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (newText: string) => void;
  editColor: string;
}

function TextItemDiv({ item, scale, isSelected, onSelect, onChange, editColor }: TextItemDivProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    setIsEditing(true);
  }, [onSelect]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  }, [onSelect]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (divRef.current) {
      const newText = divRef.current.textContent || '';
      if (newText !== item.text) {
        onChange(newText);
      }
    }
  }, [item.text, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
    if (e.key === 'Escape') {
      // Revert
      if (divRef.current) {
        divRef.current.textContent = item.text;
      }
      setIsEditing(false);
    }
  }, [item.text]);

  // Focus when editing starts
  useEffect(() => {
    if (isEditing && divRef.current) {
      divRef.current.focus();
      // Select all text
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(divRef.current);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);

  const scaledFontSize = item.fontSize * scale;

  return (
    <div
      ref={divRef}
      contentEditable={isEditing}
      suppressContentEditableWarning
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="absolute pointer-events-auto whitespace-pre"
      style={{
        left: item.x * scale,
        top: item.y * scale,
        minWidth: item.width * scale,
        minHeight: item.height * scale,
        fontSize: `${scaledFontSize}px`,
        lineHeight: 1.2,
        fontFamily: 'Helvetica, Arial, sans-serif',
        color: item.isModified ? editColor : 'transparent',
        backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.15)' : isEditing ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
        border: isSelected ? '1px solid rgba(20, 184, 166, 0.5)' : '1px solid transparent',
        borderRadius: 2,
        cursor: isEditing ? 'text' : 'pointer',
        outline: 'none',
        padding: '0 1px',
        transition: 'background-color 0.15s, border-color 0.15s',
        // Show original text as invisible overlay for click targeting
        ...(item.isModified ? {} : { caretColor: 'black' }),
      }}
    >
      {item.text}
    </div>
  );
}
