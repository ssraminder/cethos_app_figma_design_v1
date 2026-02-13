// Document Group Editor - Shared components for Manual Quote and Order Edit (HITL deprecated — replaced by review_required tag)

export { default as DocumentGroupEditor } from "./DocumentGroupEditor";
export { default as DocumentGroupCard } from "./DocumentGroupCard";
export { default as UnassignedItemsPool } from "./UnassignedItemsPool";

// Types
export type {
  EditorMode,
  AssignedItem,
  DocumentGroup,
  UnassignedItem,
  QuoteFile,
  CertificationType,
  DocumentGroupEditorProps,
  GroupCardProps,
  UnassignedItemsPoolProps,
  AssignItemsModalProps,
  CreateGroupModalProps,
  EditGroupModalProps,
} from "./types";

// Constants
export { DEFAULT_DOCUMENT_TYPES, COMPLEXITY_OPTIONS } from "./types";
