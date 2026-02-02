// Types for the Document Group Editor component

export type EditorMode = "hitl" | "manual_quote" | "order_edit";

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

export interface DocumentGroup {
  group_id: string;
  quote_id: string;
  group_number: number;
  group_label: string;
  document_type: string;
  complexity: string;
  complexity_multiplier: number;
  total_pages: number;
  total_word_count: number;
  billable_pages: number;
  line_total: number;
  certification_type_id: string | null;
  certification_type_name: string | null;
  certification_price: number;
  is_ai_suggested: boolean;
  ai_confidence: number | null;
  analysis_status: string;
  last_analyzed_at: string | null;
  assigned_items: AssignedItem[];
}

export interface UnassignedItem {
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
  assessed_complexity: string | null;
}

export interface QuoteFile {
  id: string;
  quote_id: string;
  original_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  ai_processing_status: string;
  file_category_id: string | null;
  created_at: string;
}

export interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
  is_default?: boolean;
  is_active?: boolean;
}

export interface DocumentGroupEditorProps {
  // Context
  mode: EditorMode;
  quoteId: string;
  orderId?: string;
  reviewId?: string;

  // Data
  files: QuoteFile[];
  groups: DocumentGroup[];
  unassignedItems: UnassignedItem[];
  certificationTypes: CertificationType[];

  // Settings
  baseRate?: number;
  wordsPerPage?: number;

  // State
  isEditable?: boolean;
  isLoading?: boolean;

  // Callbacks
  onRefresh: () => Promise<void>;
  onGroupCreate?: (label: string, documentType: string, complexity: string) => Promise<string | void>;
  onGroupUpdate?: (groupId: string, updates: Partial<DocumentGroup>) => Promise<void>;
  onGroupDelete?: (groupId: string) => Promise<void>;
  onAssignItem?: (groupId: string, items: UnassignedItem[]) => Promise<void>;
  onUnassignItem?: (assignmentId: string) => Promise<void>;
  onAnalyzeGroup?: (groupId: string) => Promise<void>;
  onFileUpload?: (files: File[]) => Promise<void>;

  // Optional staff context
  staffId?: string;
}

export interface GroupCardProps {
  group: DocumentGroup;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAnalyze: () => void;
  onAssignItems: () => void;
  onRemoveItem: (assignmentId: string) => void;
  isAnalyzing: boolean;
  isEditable: boolean;
  perPageRate?: number;
  certificationTypes?: CertificationType[];
  onCertificationChange?: (certTypeId: string) => void;
  onComplexityChange?: (complexity: string) => void;
}

export interface UnassignedItemsPoolProps {
  items: UnassignedItem[];
  onAssignToGroup: (item: UnassignedItem, groupId: string) => void;
  onCreateGroupWithItem: (item: UnassignedItem) => void;
  availableGroups: DocumentGroup[];
  isEditable?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export interface AssignItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupLabel: string;
  unassignedItems: UnassignedItem[];
  onAssign: (groupId: string, items: UnassignedItem[]) => void;
}

export interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (label: string, documentType: string, complexity: string) => void;
  documentTypes?: string[];
}

export interface EditGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: DocumentGroup | null;
  onSave: (updates: Partial<DocumentGroup>) => void;
  documentTypes?: string[];
  certificationTypes?: CertificationType[];
}

// Default document types
export const DEFAULT_DOCUMENT_TYPES = [
  "Driver's License",
  "Passport",
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

// Complexity options with multipliers
export const COMPLEXITY_OPTIONS = [
  { value: "easy", label: "Easy", multiplier: 1.0 },
  { value: "medium", label: "Medium", multiplier: 1.15 },
  { value: "hard", label: "Hard", multiplier: 1.25 },
];
