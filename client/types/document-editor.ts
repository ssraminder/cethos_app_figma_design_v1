// Types for the Unified Document Editor components
// Used across HITL Review, Manual Quote, and Order Editing

export type EditorMode = "hitl" | "manual-quote" | "order-edit";

export type FileProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";

export type FileCategoryCode =
  | "to_translate"
  | "reference"
  | "supporting"
  | "do_not_translate";

export type Complexity = "easy" | "medium" | "hard";

// ============================================
// FILE TYPES
// ============================================

export interface QuoteFile {
  id: string;
  quote_id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  file_category_id: string | null;
  ai_processing_status: FileProcessingStatus | null;
  created_at: string;
  updated_at?: string;
}

export interface FileCategory {
  id: string;
  name: string;
  slug: FileCategoryCode;
  description?: string;
  is_billable: boolean;
  display_order?: number;
  is_active?: boolean;
}

// ============================================
// AI ANALYSIS TYPES
// ============================================

export interface AIAnalysisResult {
  id: string;
  quote_file_id: string;
  quote_id: string;
  // Language detection
  detected_language: string;
  language_name?: string;
  language_confidence?: number;
  // Document type
  detected_document_type: string;
  document_type_confidence?: number;
  // Complexity
  assessed_complexity: Complexity;
  complexity_multiplier: number;
  complexity_confidence?: number;
  // Word/page counts
  word_count: number;
  page_count: number;
  billable_pages: number;
  // Pricing
  base_rate: number;
  line_total: number;
  // Holder extraction (new in v37)
  extracted_holder_name: string | null;
  extracted_holder_name_normalized: string | null;
  extracted_holder_dob: string | null;
  extracted_document_number: string | null;
  extracted_issuing_country: string | null;
  holder_extraction_confidence: number | null;
  // Processing metadata
  processing_status: string;
  ocr_provider?: string;
  ocr_confidence?: number;
  llm_model?: string;
  processing_time_ms?: number;
  created_at?: string;
}

// ============================================
// PAGE TYPES
// ============================================

export interface QuotePage {
  id: string;
  quote_file_id: string;
  page_number: number;
  word_count: number;
  ocr_raw_text: string | null;
  detected_language: string | null;
  language_name?: string;
  created_at?: string;
}

// ============================================
// DOCUMENT GROUP TYPES
// ============================================

export interface DocumentGroup {
  id: string;
  quote_id: string;
  group_number: number;
  group_label: string;
  document_type: string;
  // Holder info (new in v37)
  holder_name: string | null;
  holder_name_normalized: string | null;
  holder_dob: string | null;
  document_number: string | null;
  issuing_country: string | null;
  // Complexity
  complexity: Complexity;
  complexity_multiplier: number;
  // Counts
  total_word_count: number;
  billable_pages: number;
  // Pricing
  base_rate: number;
  line_total: number;
  certification_type_id: string | null;
  certification_price: number;
  // Metadata
  is_ai_suggested?: boolean;
  ai_confidence?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PageGroupAssignment {
  id: string;
  quote_id: string;
  group_id: string;
  file_id: string | null;
  page_id: string | null;
  sequence_order: number;
}

// ============================================
// CERTIFICATION TYPES
// ============================================

export interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
  is_default?: boolean;
  is_active?: boolean;
}

// ============================================
// VIEW TYPES (from database views)
// ============================================

export interface UnassignedQuoteItem {
  quote_id: string;
  item_type: "file" | "page";
  item_id: string;
  file_id: string | null;
  page_id: string | null;
  page_number: number | null;
  word_count: number;
  file_name: string;
  storage_path: string;
  has_analysis: boolean;
  analysis_id: string | null;
  page_count: number;
  detected_document_type: string | null;
  detected_language: string | null;
  assessed_complexity: Complexity | null;
}

export interface DocumentGroupWithItems extends DocumentGroup {
  assigned_items: AssignedItem[];
  certification_type_name?: string;
}

export interface AssignedItem {
  assignment_id: string;
  file_id: string | null;
  page_id: string | null;
  sequence_order: number;
  item_type: "file" | "page";
  page_number: number | null;
  word_count: number;
  file_name: string;
  storage_path: string;
}

// ============================================
// EXTENDED FILE TYPE (with relations)
// ============================================

export interface QuoteFileWithRelations extends QuoteFile {
  ai_analysis_results?: AIAnalysisResult | null;
  quote_pages?: QuotePage[];
  file_category?: FileCategory | null;
}

// ============================================
// COMPONENT PROPS TYPES
// ============================================

export interface FileListWithGroupsProps {
  quoteId: string;
  files: QuoteFileWithRelations[];
  groups: DocumentGroup[];
  fileCategories: FileCategory[];
  selectedFileIds: Set<string>;
  onSelectionChange: (fileIds: Set<string>) => void;
  onAnalyzeSelected: (fileIds: string[]) => Promise<void>;
  onFileTypeChange: (fileId: string, categoryId: string) => void;
  onGroupChange: (fileId: string, groupId: string | "auto" | "new") => void;
  onCreateGroup: () => void;
  onFileExpand: (fileId: string) => void;
  expandedFileId: string | null;
  isLoading?: boolean;
  isAnalyzing?: boolean;
  mode: EditorMode;
}

export interface FileCardProps {
  file: QuoteFileWithRelations;
  analysisResult: AIAnalysisResult | null;
  pages: QuotePage[];
  groups: DocumentGroup[];
  fileCategories: FileCategory[];
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onWordCountChange: (pageId: string, wordCount: number) => void;
  onPageGroupChange: (pageId: string, groupId: string) => void;
  onMultiDocToggle: (isMultiDoc: boolean) => void;
  onFileTypeChange: (categoryId: string) => void;
  onGroupChange: (groupId: string | "auto" | "new") => void;
  isMultiDoc: boolean;
  mode: EditorMode;
  readOnly?: boolean;
}

export interface PageBreakdownTableProps {
  pages: QuotePage[];
  groups: DocumentGroup[];
  pageGroupAssignments: Map<string, string>; // pageId -> groupId
  isMultiDoc: boolean;
  wordsPerPage: number;
  complexityMultiplier: number;
  onWordCountChange: (pageId: string, wordCount: number) => void;
  onPageGroupChange?: (pageId: string, groupId: string) => void;
  readOnly?: boolean;
}

export interface DocumentGroupsSummaryProps {
  quoteId: string;
  groups: DocumentGroupWithItems[];
  certificationTypes: CertificationType[];
  onEditGroup: (groupId: string) => void;
  onReAnalyze: (groupId: string) => void;
  onUnassignItems: (groupId: string) => void;
  onCertificationChange: (groupId: string, certTypeId: string) => void;
  onAddGroup: () => void;
  readOnly?: boolean;
}

export interface UnifiedDocumentEditorProps {
  quoteId: string;
  mode: EditorMode;
  reviewId?: string;
  orderId?: string;
  onPricingUpdate?: (totals: QuoteTotals) => void;
  readOnly?: boolean;
}

export interface QuoteTotals {
  subtotal: number;
  certificationTotal: number;
  groupCount: number;
  fileCount: number;
  totalPages: number;
  totalWords: number;
}

// ============================================
// CONSTANTS
// ============================================

export const DEFAULT_WORDS_PER_PAGE = 225;
export const DEFAULT_BASE_RATE = 65.00;

export const COMPLEXITY_MULTIPLIERS: Record<Complexity, number> = {
  easy: 1.0,
  medium: 1.15,
  hard: 1.25,
};

export const COMPLEXITY_OPTIONS = [
  { value: "easy" as Complexity, label: "Easy", multiplier: 1.0 },
  { value: "medium" as Complexity, label: "Medium", multiplier: 1.15 },
  { value: "hard" as Complexity, label: "Hard", multiplier: 1.25 },
];

export const DEFAULT_DOCUMENT_TYPES = [
  "Passport",
  "Driver's License",
  "ID Card",
  "Birth Certificate",
  "Marriage Certificate",
  "Death Certificate",
  "Diploma/Degree",
  "Academic Transcript",
  "Work Permit",
  "Residence Permit",
  "Visa",
  "Bank Statement",
  "Employment Letter",
  "Power of Attorney",
  "Court Document",
  "Medical Records",
  "Immigration Document",
  "Corporate Document",
  "Contract",
  "Other",
];

export const FILE_CATEGORY_DISPLAY: Record<FileCategoryCode, { label: string; color: string }> = {
  to_translate: { label: "To Translate", color: "bg-teal-100 text-teal-800" },
  reference: { label: "Reference", color: "bg-blue-100 text-blue-800" },
  supporting: { label: "Supporting", color: "bg-purple-100 text-purple-800" },
  do_not_translate: { label: "Do Not Translate", color: "bg-gray-100 text-gray-800" },
};

export const PROCESSING_STATUS_DISPLAY: Record<FileProcessingStatus, { label: string; color: string; icon?: string }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  processing: { label: "Processing", color: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", color: "bg-green-100 text-green-800" },
  failed: { label: "Failed", color: "bg-red-100 text-red-800" },
  skipped: { label: "Skipped", color: "bg-gray-100 text-gray-600" },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate billable pages from word count
 */
export function calculateBillablePages(
  wordCount: number,
  wordsPerPage: number = DEFAULT_WORDS_PER_PAGE
): number {
  return Math.round((wordCount / wordsPerPage) * 100) / 100;
}

/**
 * Calculate line total for a document/group
 */
export function calculateLineTotal(
  billablePages: number,
  baseRate: number = DEFAULT_BASE_RATE,
  complexityMultiplier: number = 1.0
): number {
  return Math.round(billablePages * baseRate * complexityMultiplier * 100) / 100;
}

/**
 * Generate group label from document type and holder name
 */
export function generateGroupLabel(
  documentType: string,
  holderName: string | null
): string {
  if (holderName) {
    return `${documentType} - ${holderName}`;
  }
  return documentType;
}

/**
 * Normalize holder name for comparison/matching
 */
export function normalizeHolderName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
