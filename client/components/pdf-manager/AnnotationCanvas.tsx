// client/components/pdf-manager/AnnotationCanvas.tsx
// SVG overlay on PDF canvas for all annotation types
// Renders comment pins, highlights, freehand paths, sticky notes, stamps, shapes

import { useCallback, useRef, useState } from 'react';
import type { AnnotationMode } from './AnnotationToolbar';
import type { PdfAnnotation, AnnotationType } from '../../types/pdf-manager';

interface AnnotationCanvasProps {
  annotations: PdfAnnotation[];
  mode: AnnotationMode;
  color: string;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (annotation: Omit<PdfAnnotation, 'id' | 'document_id' | 'created_by' | 'created_at' | 'updated_at'>) => void;
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onUpdateContent: (id: string, content: string) => void;
  currentPage: number;
}

// Stamp options
const STAMPS = ['APPROVED', 'REJECTED', 'DRAFT', 'CONFIDENTIAL', 'FINAL', 'REVIEW'];

// Shape options
type ShapeType = 'rectangle' | 'circle' | 'arrow' | 'line';

export default function AnnotationCanvas({
  annotations,
  mode,
  color,
  pageWidth,
  pageHeight,
  scale,
  selectedId,
  onSelect,
  onAdd,
  onMove,
  onDelete,
  onUpdateContent,
  currentPage,
}: AnnotationCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPath, setDrawPath] = useState<string>('');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [shapeType] = useState<ShapeType>('rectangle');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [stampIndex, setStampIndex] = useState(0);

  const getCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }, [scale]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode === 'select') return;

    const { x, y } = getCoords(e);

    if (mode === 'freehand') {
      setIsDrawing(true);
      setDrawPath(`M ${x} ${y}`);
      return;
    }

    if (mode === 'shape') {
      setIsDrawing(true);
      setDrawStart({ x, y });
      return;
    }

    if (mode === 'highlight') {
      setIsDrawing(true);
      setDrawStart({ x, y });
      return;
    }

    // Single-click placement modes
    if (mode === 'comment') {
      onAdd({
        page_number: currentPage,
        type: 'comment',
        content: '',
        position_x: x,
        position_y: y,
        width: 24,
        height: 24,
        color,
        svg_path: null,
        metadata: {},
      });
    }

    if (mode === 'sticky_note') {
      onAdd({
        page_number: currentPage,
        type: 'sticky_note',
        content: 'Note...',
        position_x: x,
        position_y: y,
        width: 150,
        height: 100,
        color,
        svg_path: null,
        metadata: {},
      });
    }

    if (mode === 'stamp') {
      onAdd({
        page_number: currentPage,
        type: 'stamp',
        content: STAMPS[stampIndex % STAMPS.length],
        position_x: x,
        position_y: y,
        width: 120,
        height: 40,
        color,
        svg_path: null,
        metadata: {},
      });
      setStampIndex((i) => i + 1);
    }
  }, [mode, color, currentPage, getCoords, onAdd, stampIndex]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);

    if (mode === 'freehand') {
      setDrawPath((p) => `${p} L ${x} ${y}`);
    }
  }, [isDrawing, mode, getCoords]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const { x, y } = getCoords(e);

    if (mode === 'freehand' && drawPath) {
      onAdd({
        page_number: currentPage,
        type: 'freehand',
        content: null,
        position_x: 0,
        position_y: 0,
        width: null,
        height: null,
        color,
        svg_path: drawPath,
        metadata: {},
      });
      setDrawPath('');
    }

    if ((mode === 'shape' || mode === 'highlight') && drawStart) {
      const w = Math.abs(x - drawStart.x);
      const h = Math.abs(y - drawStart.y);
      if (w > 5 || h > 5) {
        const type: AnnotationType = mode === 'highlight' ? 'highlight' : 'shape';
        onAdd({
          page_number: currentPage,
          type,
          content: mode === 'shape' ? shapeType : null,
          position_x: Math.min(drawStart.x, x),
          position_y: Math.min(drawStart.y, y),
          width: w,
          height: h,
          color,
          svg_path: null,
          metadata: mode === 'shape' ? { shapeType } : {},
        });
      }
      setDrawStart(null);
    }
  }, [isDrawing, mode, color, currentPage, drawPath, drawStart, shapeType, getCoords, onAdd]);

  const handleBgClick = useCallback((e: React.MouseEvent) => {
    if (mode === 'select' && e.target === svgRef.current) {
      onSelect(null);
    }
  }, [mode, onSelect]);

  const scaledW = pageWidth * scale;
  const scaledH = pageHeight * scale;

  return (
    <svg
      ref={svgRef}
      width={scaledW}
      height={scaledH}
      viewBox={`0 0 ${pageWidth} ${pageHeight}`}
      className="absolute inset-0"
      style={{ cursor: mode === 'select' ? 'default' : 'crosshair' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleBgClick}
    >
      {/* Render existing annotations */}
      {annotations
        .filter((a) => a.page_number === currentPage)
        .map((a) => (
          <AnnotationElement
            key={a.id}
            annotation={a}
            isSelected={a.id === selectedId}
            isEditing={a.id === editingNoteId}
            onSelect={() => onSelect(a.id)}
            onDoubleClick={() => {
              if (a.type === 'sticky_note' || a.type === 'comment') {
                setEditingNoteId(a.id);
              }
            }}
          />
        ))}

      {/* Live drawing preview */}
      {isDrawing && mode === 'freehand' && drawPath && (
        <path d={drawPath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      )}

      {isDrawing && (mode === 'shape' || mode === 'highlight') && drawStart && (
        <rect
          x={drawStart.x}
          y={drawStart.y}
          width={1}
          height={1}
          fill={mode === 'highlight' ? `${color}40` : 'none'}
          stroke={color}
          strokeWidth={mode === 'highlight' ? 0 : 2}
          strokeDasharray={mode === 'shape' ? '4' : '0'}
        />
      )}
    </svg>
  );
}

// --- Annotation renderer ---

interface AnnotationElementProps {
  annotation: PdfAnnotation;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
}

function AnnotationElement({ annotation: a, isSelected, onSelect, onDoubleClick }: AnnotationElementProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  switch (a.type) {
    case 'comment':
      return (
        <g onClick={handleClick} onDoubleClick={onDoubleClick} style={{ cursor: 'pointer' }}>
          <circle
            cx={a.position_x + 12}
            cy={a.position_y + 12}
            r={12}
            fill={a.color}
            stroke={isSelected ? '#0D9488' : '#00000030'}
            strokeWidth={isSelected ? 2 : 1}
          />
          <text x={a.position_x + 8} y={a.position_y + 17} fontSize={12} fill="white" fontWeight="bold">
            ?
          </text>
        </g>
      );

    case 'highlight':
      return (
        <rect
          x={a.position_x}
          y={a.position_y}
          width={a.width || 100}
          height={a.height || 20}
          fill={`${a.color}40`}
          stroke={isSelected ? '#0D9488' : 'none'}
          strokeWidth={isSelected ? 1 : 0}
          onClick={handleClick}
          style={{ cursor: 'pointer' }}
        />
      );

    case 'freehand':
      return a.svg_path ? (
        <path
          d={a.svg_path}
          fill="none"
          stroke={a.color}
          strokeWidth={2}
          strokeLinecap="round"
          onClick={handleClick}
          style={{ cursor: 'pointer' }}
          opacity={isSelected ? 1 : 0.8}
        />
      ) : null;

    case 'sticky_note':
      return (
        <g onClick={handleClick} onDoubleClick={onDoubleClick} style={{ cursor: 'pointer' }}>
          <rect
            x={a.position_x}
            y={a.position_y}
            width={a.width || 150}
            height={a.height || 100}
            fill={a.color}
            stroke={isSelected ? '#0D9488' : '#00000020'}
            strokeWidth={isSelected ? 2 : 1}
            rx={4}
          />
          <foreignObject
            x={a.position_x + 8}
            y={a.position_y + 8}
            width={(a.width || 150) - 16}
            height={(a.height || 100) - 16}
          >
            <div style={{ fontSize: 11, color: '#333', wordBreak: 'break-word', overflow: 'hidden' }}>
              {a.content || 'Note...'}
            </div>
          </foreignObject>
        </g>
      );

    case 'stamp':
      return (
        <g onClick={handleClick} style={{ cursor: 'pointer' }}>
          <rect
            x={a.position_x}
            y={a.position_y}
            width={a.width || 120}
            height={a.height || 40}
            fill="none"
            stroke={a.color}
            strokeWidth={3}
            rx={6}
            opacity={0.8}
          />
          <text
            x={a.position_x + (a.width || 120) / 2}
            y={a.position_y + (a.height || 40) / 2 + 5}
            textAnchor="middle"
            fontSize={16}
            fontWeight="bold"
            fill={a.color}
            opacity={0.8}
          >
            {a.content || 'STAMP'}
          </text>
        </g>
      );

    case 'shape': {
      const shapeType = (a.metadata as any)?.shapeType || 'rectangle';
      if (shapeType === 'circle') {
        const cx = a.position_x + (a.width || 50) / 2;
        const cy = a.position_y + (a.height || 50) / 2;
        return (
          <ellipse
            cx={cx}
            cy={cy}
            rx={(a.width || 50) / 2}
            ry={(a.height || 50) / 2}
            fill="none"
            stroke={a.color}
            strokeWidth={2}
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
          />
        );
      }
      return (
        <rect
          x={a.position_x}
          y={a.position_y}
          width={a.width || 50}
          height={a.height || 50}
          fill="none"
          stroke={a.color}
          strokeWidth={2}
          onClick={handleClick}
          style={{ cursor: 'pointer' }}
        />
      );
    }

    default:
      return null;
  }
}
