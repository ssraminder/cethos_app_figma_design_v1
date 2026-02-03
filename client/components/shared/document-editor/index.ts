// Unified Document Editor Components
// Used across HITL Review, Manual Quote, and Order Editing

export { default as UnifiedDocumentEditor } from "./UnifiedDocumentEditor";
export { default as FileListWithGroups } from "./FileListWithGroups";
export { default as FileCard } from "./FileCard";
export { default as PageBreakdownTable } from "./PageBreakdownTable";
export { default as DocumentGroupsSummary } from "./DocumentGroupsSummary";
export { default as CreateGroupModal } from "./CreateGroupModal";

// Re-export types for convenience
export type {
  EditorMode,
  FileProcessingStatus,
  FileCategoryCode,
  Complexity,
  QuoteFile,
  FileCategory,
  AIAnalysisResult,
  QuotePage,
  DocumentGroup,
  PageGroupAssignment,
  CertificationType,
  UnassignedQuoteItem,
  DocumentGroupWithItems,
  AssignedItem,
  QuoteFileWithRelations,
  FileListWithGroupsProps,
  FileCardProps,
  PageBreakdownTableProps,
  DocumentGroupsSummaryProps,
  UnifiedDocumentEditorProps,
  QuoteTotals,
} from "@/types/document-editor";

// Re-export helpers
export {
  calculateBillablePages,
  calculateLineTotal,
  generateGroupLabel,
  normalizeHolderName,
  formatFileSize,
  DEFAULT_WORDS_PER_PAGE,
  DEFAULT_BASE_RATE,
  COMPLEXITY_MULTIPLIERS,
  COMPLEXITY_OPTIONS,
  DEFAULT_DOCUMENT_TYPES,
  FILE_CATEGORY_DISPLAY,
  PROCESSING_STATUS_DISPLAY,
} from "@/types/document-editor";
