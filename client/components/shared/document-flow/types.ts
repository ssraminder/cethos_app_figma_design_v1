// ============================================
// DOCUMENT FLOW EDITOR - TYPE DEFINITIONS
// ============================================

// ---------- ENUMS ----------

// DEPRECATED: "hitl" mode removed — kept in union for backward compat until Category 2 cleanup
export type EditorMode = 'hitl' | 'order-edit' | 'manual-quote';

export type FileStatus = 'pending' | 'uploading' | 'uploaded' | 'analyzing' | 'analyzed' | 'error';

export type Complexity = 'easy' | 'medium' | 'hard';

// ---------- BASE TYPES ----------

export interface FileCategory {
  id: string;
  name: string;
  slug: string;
  is_billable: boolean;
  display_order: number;
}

export interface CertificationType {
  id: string;
  name: string;
  code: string;
  price: number;
  is_default: boolean;
  sort_order: number;
}

export interface DocumentType {
  id: string;
  name: string;
  code: string;
}

// ---------- FILE TYPES ----------

export interface QuotePage {
  id: string;
  quote_file_id: string;
  page_number: number;
  word_count: number;
  complexity: Complexity;
  complexity_multiplier: number;
  document_group_id?: string;
}

export interface AnalysisResult {
  id: string;
  quote_id: string;
  quote_file_id: string;
  detected_document_type: string | null;
  detected_language: string | null;
  holder_name: string | null;
  country_of_issue: string | null;
  assessed_complexity: Complexity;
  complexity_multiplier: number;
  word_count: number;
  page_count: number;
  billable_pages: number;
  line_total: number;
  certification_price: number;
  certification_type_id: string | null;
  ocr_confidence: number;
  is_multi_document: boolean;
}

export interface QuoteFile {
  id: string;
  quote_id: string;
  original_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  file_category_id: string | null;
  file_category?: FileCategory;
  ai_processing_status: FileStatus;
  analysis?: AnalysisResult;
  pages: QuotePage[];
}

// ---------- DOCUMENT GROUP TYPES ----------

export interface DocumentGroup {
  id: string;
  name: string;
  document_type: string;
  holder_name: string | null;
  country_of_issue: string | null;
  source_file_id: string;
  source_filename: string;
  page_ids: string[];
  pages: GroupPage[];
  certification_type_id: string;
  certification_name: string;
  certification_price: number;
  total_words: number;
  total_billable_pages: number;
  translation_cost: number;
  group_total: number;
}

export interface GroupPage {
  id: string;
  page_number: number;
  word_count: number;
  complexity: Complexity;
  complexity_multiplier: number;
  billable_pages: number;
}

// ---------- PRICING TYPES ----------

export interface PricingSettings {
  base_rate: number;
  words_per_page: number;
  min_billable_pages: number;
  rounding_precision: number;
  complexity_easy: number;
  complexity_medium: number;
  complexity_hard: number;
}

export interface PricingTotals {
  total_documents: number;
  total_pages: number;
  total_words: number;
  total_billable_pages: number;
  translation_subtotal: number;
  certification_subtotal: number;
  subtotal: number;
}

// ---------- COMPONENT PROPS ----------

export interface DocumentFlowEditorProps {
  mode: EditorMode;
  quoteId: string;
  reviewId?: string;
  orderId?: string;
  staffId?: string; // Required for file uploads via edge function
  languageMultiplier?: number;
  onPricingChange?: (totals: PricingTotals) => void;
  onSave?: (groups: DocumentGroup[]) => Promise<void>;
  onCancel?: () => void;
  readOnly?: boolean;
  showPricing?: boolean;
  allowUpload?: boolean;
}

// ---------- STATE TYPES ----------

export interface DocumentFlowState {
  files: QuoteFile[];
  groups: DocumentGroup[];
  categories: FileCategory[];
  certificationTypes: CertificationType[];
  documentTypes: DocumentType[];
  pricingSettings: PricingSettings;
  languageMultiplier: number;
  isLoading: boolean;
  error: string | null;
  expandedFileId: string | null;
  analyzingFileIds: Set<string>;
  submittedFileIds: Set<string>;
}

export type DocumentFlowAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_DATA'; payload: Partial<DocumentFlowState> }
  | { type: 'SET_FILES'; payload: QuoteFile[] }
  | { type: 'SET_GROUPS'; payload: DocumentGroup[] }
  | { type: 'ADD_FILE'; payload: QuoteFile }
  | { type: 'UPDATE_FILE'; payload: { id: string; updates: Partial<QuoteFile> } }
  | { type: 'REMOVE_FILE'; payload: string }
  | { type: 'SET_EXPANDED_FILE'; payload: string | null }
  | { type: 'SET_ANALYZING'; payload: { fileId: string; isAnalyzing: boolean } }
  | { type: 'SET_SUBMITTED'; payload: { fileId: string; isSubmitted: boolean } }
  | { type: 'ADD_GROUP'; payload: DocumentGroup }
  | { type: 'UPDATE_GROUP'; payload: { id: string; updates: Partial<DocumentGroup> } }
  | { type: 'REMOVE_GROUP'; payload: string };

// ---------- HELPER TYPES ----------

export interface UploadProgress {
  fileId: string;
  filename: string;
  progress: number;
  status: 'uploading' | 'complete' | 'error';
  error?: string;
}

export interface PageGrouping {
  pageId: string;
  groupId: string;
  groupName: string;
}

export interface LocalDocumentGroup {
  id: string;
  name: string;
  pageIds: string[];
}

// ---------- CONSTANTS ----------

export const COMPLEXITY_MULTIPLIERS: Record<Complexity, number> = {
  easy: 1.0,
  medium: 1.15,
  hard: 1.25,
};

// Fallback defaults — only used when app_settings values are unavailable.
// In normal operation, the effective per-document rate is stored in
// ai_analysis_results.base_rate and includes the language multiplier.
export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  base_rate: 65,
  words_per_page: 225,
  min_billable_pages: 1.0,
  rounding_precision: 0.1,
  complexity_easy: 1.0,
  complexity_medium: 1.15,
  complexity_hard: 1.25,
};
