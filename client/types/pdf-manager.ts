// client/types/pdf-manager.ts
// TypeScript interfaces for the PDF Manager module

export interface PdfFolder {
  id: string;
  name: string;
  parent_folder_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Computed client-side
  children?: PdfFolder[];
  document_count?: number;
}

export interface PdfDocument {
  id: string;
  name: string;
  storage_path: string;
  file_size: number;
  page_count: number;
  mime_type: string;
  folder_id: string | null;
  version: number;
  is_latest_version: boolean;
  parent_version_id: string | null;
  thumbnail_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AnnotationType = 'comment' | 'highlight' | 'freehand' | 'sticky_note' | 'stamp' | 'shape';

export interface PdfAnnotation {
  id: string;
  document_id: string;
  page_number: number;
  type: AnnotationType;
  content: string | null;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  color: string;
  svg_path: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SharePermission = 'view' | 'annotate' | 'edit';

export interface PdfShare {
  id: string;
  document_id: string;
  share_token: string;
  permission: SharePermission;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

// --- Working state types (client-side only) ---

export interface PdfFile {
  /** Unique client-side ID for drag-and-drop tracking */
  clientId: string;
  file: File;
  name: string;
  pageCount: number;
  thumbnailUrl?: string;
  /** Set after upload to Supabase */
  documentId?: string;
}

export interface PageThumbnail {
  pageIndex: number; // 0-based
  thumbnailUrl: string;
  width: number;
  height: number;
  selected: boolean;
}

export interface PdfOperation {
  type: 'merge' | 'split' | 'reorder' | 'delete_pages' | 'insert_pages';
  description: string;
  timestamp: number;
  /** State snapshot for undo */
  previousState?: unknown;
}

export interface SplitConfig {
  mode: 'ranges' | 'every_n';
  /** e.g. "1-3,5,7-10" */
  ranges?: string;
  /** Split every N pages */
  everyN?: number;
}

export interface PdfManagerState {
  files: PdfFile[];
  selectedFileIndex: number | null;
  pages: PageThumbnail[];
  selectedPageIndices: number[];
  undoStack: PdfOperation[];
  redoStack: PdfOperation[];
  isProcessing: boolean;
  currentFolder: string | null;
}
