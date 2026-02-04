// client/components/admin/hitl-file-list/types.ts

import { Complexity } from "@/types/document-editor";

export interface QuoteFile {
  id: string;
  quote_id: string;
  original_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  page_count?: number;
  ai_processing_status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | null;
  category_id?: string;
  category?: { slug: string; name: string };
  created_at: string;
  updated_at?: string;
}

export interface QuotePage {
  id: string;
  quote_file_id: string;
  page_number: number;
  word_count: number;
  billable_pages: number;
  complexity: Complexity;
  complexity_multiplier: number;
  is_included: boolean;
}

export interface FileWithPages extends QuoteFile {
  pages: QuotePage[];
  hasAnalysis: boolean;
  totalWords: number;
  totalBillable: number;
}

export interface HITLFileListProps {
  quoteId: string;
  readOnly?: boolean;
  onTotalsChange?: (totals: FileTotals) => void;
}

export interface FileTotals {
  totalFiles: number;
  totalPages: number;
  totalWords: number;
  totalBillable: number;
}

export interface PageUpdateData {
  pageId: string;
  field: 'word_count' | 'billable_pages' | 'complexity' | 'is_included';
  value: number | string | boolean;
}

export interface FileCategory {
  id: string;
  name: string;
  slug: string;
  is_billable: boolean;
}

export const COMPLEXITY_OPTIONS = [
  { value: 'easy' as Complexity, label: 'Easy', multiplier: 1.0 },
  { value: 'medium' as Complexity, label: 'Medium', multiplier: 1.15 },
  { value: 'hard' as Complexity, label: 'Hard', multiplier: 1.25 },
];
