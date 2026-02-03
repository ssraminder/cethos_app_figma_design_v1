# CETHOS Codebase Investigation Report

**Date:** February 3, 2026
**Purpose:** Investigation to understand current codebase before implementing new document flow

---

## Executive Summary

All 9 investigations have been completed. The CETHOS codebase has a **partially mature** implementation for document management in the HITL workflow. Key findings include a robust file upload system, partial document grouping functionality, and pricing calculation inconsistencies that need attention.

---

## Investigation 1: File Upload Components

### Summary Table

| Aspect | Current Implementation |
|--------|----------------------|
| Component file | `DocumentManagementPanel.tsx` |
| Location | `/client/components/admin/hitl/` |
| Props accepted | `quoteId`, `staffId?`, `files`, `onFilesUploaded` |
| Category support | **No** (only in StaffFileUploadForm) |
| Edge function called | `upload-staff-quote-file` |
| After upload callback | `onFilesUploaded()` → `fetchAllData()` |
| Progress indicator | **Yes** - 0-100% visual bar |
| Error handling | **Yes** - Alert dialog with message |

### Key Implementation Details

- Uses native drag-and-drop with `onDragOver`, `onDragLeave`, `onDrop` handlers
- File validation: 50MB max, accepts PDF/images/Word docs
- FormData submission to Supabase edge function
- Real-time progress tracking via XHR

### What Needs to Change

- Add category selection dropdown to upload flow
- Integrate file category on upload rather than post-upload

---

## Investigation 2: File List Display

### Component: `DocumentFilesPanel.tsx`

**Data Structure Expected:**
```typescript
interface QuoteFile {
  id: string;
  original_filename: string;
  file_size: number;
  created_at: string;
  ai_processing_status?: string;
  storage_path?: string;
  mime_type: string;
}
```

### UI Actions Per File

| Icon | Action | Description |
|------|--------|-------------|
| Pencil | Manual Entry | Opens ManualEntryModal for manual data entry |
| Eye | Preview | Opens DocumentPreviewModal |
| Download | Download | Downloads file from Supabase storage |
| Trash | Delete | Deletes file from DB, storage, and AI analysis results |

### Key Findings

- **Category grouping:** Not implemented - flat list
- **Brain icon (Analyze):** Not present in DocumentFilesPanel - exists in AdminOrderDetail context
- **Preview:** Modal-based - PDF via iframe, images with zoom controls (50%-200%)
- **Status polling:** 10-second intervals, max 24 polls (4 minutes)

### UI Structure

```
┌─ Header: "Documents (N files)"
├─ Files List (scrollable, max-h-64)
│  └─ File Row
│     ├─ [FileText Icon]
│     ├─ File Info (filename, size, date, status badge)
│     └─ Action Buttons (Pencil, Eye, Download, Trash)
└─ Footer Stats (Total Files, Total Size)
```

---

## Investigation 3: Analysis Results & Page Data

### Data Fetching Locations

| Data | Location | Lines |
|------|----------|-------|
| `ai_analysis_results` | `HITLReviewDetail.tsx` | 728-735 |
| `quote_pages` | `HITLReviewDetail.tsx` | 757-770 |
| Analysis trigger | `AnalyzeDocumentModal.tsx` | Various |

### Fields Used from Analysis Results

**Display Fields:**
- `detected_language`
- `detected_document_type`
- `assessed_complexity`
- `word_count`
- `page_count`

**Pricing Fields:**
- `complexity_multiplier`
- `billable_pages`
- `line_total`
- `certification_price`

**Confidence Fields:**
- `ocr_confidence`
- `language_confidence`
- `document_type_confidence`
- `complexity_confidence`

### Per-Page Data

- Fetched separately per file
- Displayed in AnalyzeDocumentModal and DocumentCardV2
- Editable word counts per page

---

## Investigation 4: Document Grouping Current State

### Status: **PARTIAL**

| Aspect | Status |
|--------|--------|
| Table used | `quote_page_group_assignments` |
| UI for combining | **No** |
| UI for splitting | **No** |
| Backend support | **Yes** |

### Implemented Features

- Create/edit/delete document groups
- Assign files or pages to groups
- Automatic total calculation
- Group-level analysis results

### Database Functions Available

```sql
get_unassigned_items(p_quote_id)
create_document_group(p_quote_id, p_name, p_document_type)
assign_item_to_group(p_group_id, p_item_id, p_item_type)
recalculate_group_from_assignments(p_group_id)
```

### Not Implemented

- Combine/merge pages UI
- Split document UI
- Drag-and-drop grouping

---

## Investigation 5: Certification Selection

### Architecture: Two-Tier System

| Level | Table | Components |
|-------|-------|-----------|
| Quote-level | `quote_certifications` | EditablePricingSummaryPanel, EditableQuoteCertificationPanel |
| Document-level | `document_certifications` | DocumentCardV2, HITLReviewDetail |

### Certification Flow

```
certification_types (source)
    │
    ├─→ Quote-Level (applies to all documents)
    │   └─ EditablePricingSummaryPanel
    │
    └─→ Document-Level (per document)
        ├─ Primary: One per document
        └─ Secondary: Multiple additional certs
```

### Default Setting

Uses `is_default` flag from `certification_types` table, sorted by `sort_order`.

### Recalculation

`recalculate_quote_totals()` SQL function triggered on change, separates:
- Primary certs (via `ai_analysis_results.certification_price`)
- Secondary certs (via `document_certifications` with `is_primary = false`)

### Identified Gaps

1. **Dual-entry problem** - Quote vs document level overlap without clear precedence
2. **No warning** when overwriting per-document certifications with quote-level change
3. **Schema inconsistency** - Some code uses `analysis_id`, some uses `quote_file_id`
4. **Secondary certs** not visible in quote-level panel

---

## Investigation 6: Pricing Calculations

### ⚠️ CRITICAL: Formula Discrepancy Found

| Aspect | Edge Functions | Database Functions |
|--------|---------------|-------------------|
| Words per page | **225** | **250** |
| Rounding | `CEIL(...× 10) / 10` | No decimal rounding |

### Billable Pages Formula

**Edge Functions (`calculate-manual-quote-pricing`):**
```
billable_pages = CEIL((words / 225) × complexity × 10) / 10
```

**Database Functions:**
```sql
billable_pages = GREATEST(1, CEIL(words / 250 × complexity))
```

### Line Total Formula

**Edge Functions:**
```
line_total = billable_pages × CEIL((base_rate × lang_mult) / 2.50) × 2.50 × complexity
```

**Database:**
```sql
line_total = billable_pages × $65 + certification_price
-- Note: No language multiplier at line level
```

### Recalculation Triggers

- `recalculate_quote_totals()` - Main quote recalculation
- `recalculate_group_from_assignments()` - Group totals
- `recalculate_document_group()` - Single group update

---

## Investigation 7: process-document Edge Function

### Request Interface

```typescript
interface ProcessDocumentRequest {
  quoteId?: string;      // Process all pending files for quote
  fileId?: string;       // Process single file
  fileIds?: string[];    // Process multiple files (array)
}
```

### Response Interface

```typescript
interface ProcessingResponse {
  success: boolean;
  documentsProcessed: number;
  results: ProcessingResult[];
  processingTime: number;
}

interface ProcessingResult {
  success: boolean;
  fileId?: string;
  fileName?: string;
  detectedLanguage?: string;
  pageCount?: number;
  wordCount?: number;
  documentType?: string;
  processingTime?: number;
  error?: string;
}
```

### Feature Support

| Feature | Supported |
|---------|-----------|
| Per-page word counts returned | **No** - aggregate only |
| Holder name/country of issue | **No** - not extracted |
| Single file processing | **Yes** - via `fileId` |
| Batch processing | **Yes** - via `quoteId` |
| Image grouping | **No** - each file independent |

### Tables Written

| Table | Operation |
|-------|-----------|
| `quote_files` | UPDATE `ai_processing_status` |
| `ai_analysis_results` | UPSERT (quote_id, quote_file_id, etc.) |
| `quotes` | UPDATE status to "quote_ready" (conditional) |

---

## Investigation 8: HITLReviewDetail State Management

### State Overview

**Total useState declarations:** 62

### Key State Categories

| Category | Examples |
|----------|----------|
| Core data | `reviewData`, `quoteFiles`, `analysisResults`, `pageData` |
| Settings | `certificationTypes`, `languages`, `baseRate`, `wordsPerPage` |
| UI/Modals | ~20 modal/visibility states |
| Document Grouping | `documentGroups`, `unassignedItems`, `selectedGroupForAssign` |

### Refresh Triggers

- Initial load via `fetchAllData()`
- Polling every 10s when files are processing (max 9 polls = 90s)
- Manual refresh via callbacks (`onRefreshFiles`)

### Global State

`AdminAuthContext` provides:
- Session management
- Authentication
- Role checks

### State Flow

```
HITLReviewDetail (page)
  │
  ├─ fetchAllData() on mount
  │
  ├─ Props to children:
  │   ├─ quoteFiles → DocumentFilesPanel
  │   ├─ analysisResults → DocumentCardV2
  │   └─ onRefresh callbacks
  │
  └─ Polling loop for processing status
```

---

## Investigation 9: File Categories Table

### Current Usage

| Question | Answer |
|----------|--------|
| `file_categories` queried? | **Yes** - 3 locations |
| `category_id` on `quote_files`? | **Yes** - `file_category_id` column |
| UI for category on upload? | **Partial** - Staff only |

### Query Locations

1. `StaffFileUploadForm.tsx` - Staff upload with category
2. `FileCard.tsx` - Display category badge
3. `UnifiedDocumentEditor.tsx` - Document editing

### Default Categories

| Slug | Billable |
|------|----------|
| `to_translate` | Yes |
| `reference` | No |
| `source` | No |
| `glossary` | No |
| `style_guide` | No |
| `final_deliverable` | No |

### ⚠️ Type Mismatch Bug

**TypeScript interface (`document-editor.ts`):**
```typescript
interface FileCategory {
  id: string;
  name: string;
  code: string;  // ← Wrong field name
}
```

**Database field:** `slug` (not `code`)

**Affected file:** `FileCard.tsx:88`

---

## Final Recommendations

### 1. Reusable Components (Keep As-Is)

- `DocumentManagementPanel.tsx` - File upload (extend for categories)
- `DocumentFilesPanel.tsx` - File list display
- `DocumentPreviewModal.tsx` - PDF/image preview
- `AnalyzeDocumentModal.tsx` - AI analysis trigger
- Database functions for grouping

### 2. Components to Modify

| Component | Changes Needed |
|-----------|---------------|
| `DocumentManagementPanel.tsx` | Add category dropdown on upload |
| `FileCard.tsx:88` | Fix `code` → `slug` field reference |
| `document-editor.ts` | Fix `FileCategory` interface |
| Database functions | Standardize words-per-page (225 vs 250) |

### 3. New Components Needed

- Combine/Merge documents UI modal
- Split document UI modal
- Customer-facing category selection (if needed)

### 4. Edge Function Changes

| Function | Change |
|----------|--------|
| `process-document` | Add holder name, country extraction (optional) |
| `process-document` | Add per-page word counts in response (optional) |
| All pricing functions | Standardize calculation formulas |

### 5. Database Changes

| Change | Priority |
|--------|----------|
| Standardize `words_per_page` (225 vs 250) | **HIGH** |
| Add language multiplier to line-level calculation | Medium |
| Fix `document_certifications` schema consistency | Medium |
| Create explicit `document_certifications` migration | Low |

---

## Priority Action Items

### HIGH Priority

1. **Fix pricing formula discrepancy** - 225 vs 250 words/page causing calculation mismatches
2. **Fix FileCategory type mismatch** - `code` vs `slug` field name

### MEDIUM Priority

3. Add category selection to `DocumentManagementPanel`
4. Resolve certification dual-entry problem
5. Add language multiplier consistency

### LOW Priority

6. Build combine/split document UI
7. Add holder name/country extraction to process-document
8. Improve per-page data handling

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HITL Review Flow                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐ │
│  │ Upload           │    │ Process          │    │ Display       │ │
│  │                  │    │                  │    │               │ │
│  │ DocumentMgmt     │───▶│ process-document │───▶│ DocumentFiles │ │
│  │ Panel            │    │ edge function    │    │ Panel         │ │
│  └──────────────────┘    └──────────────────┘    └───────────────┘ │
│           │                       │                      │          │
│           ▼                       ▼                      ▼          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Database Tables                           │  │
│  │  quote_files │ ai_analysis_results │ quote_pages │ quotes    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           │                       │                      │          │
│           ▼                       ▼                      ▼          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐ │
│  │ Group            │    │ Certify          │    │ Price         │ │
│  │                  │    │                  │    │               │ │
│  │ DocumentGroup    │    │ Certification    │    │ Pricing       │ │
│  │ Card             │    │ Panels           │    │ Panels        │ │
│  └──────────────────┘    └──────────────────┘    └───────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Key File Locations

### Client Components

| File | Purpose |
|------|---------|
| `client/pages/admin/HITLReviewDetail.tsx` | Main HITL page (2500+ lines) |
| `client/components/admin/hitl/DocumentManagementPanel.tsx` | File upload |
| `client/components/admin/hitl/DocumentFilesPanel.tsx` | File list display |
| `client/components/admin/hitl/DocumentCardV2.tsx` | Document details card |
| `client/components/admin/hitl/DocumentGroupCard.tsx` | Document grouping |
| `client/components/admin/hitl/EditablePricingSummaryPanel.tsx` | Pricing summary |
| `client/components/admin/hitl/AnalyzeDocumentModal.tsx` | AI analysis modal |

### Edge Functions

| Function | Purpose |
|----------|---------|
| `supabase/functions/process-document/index.ts` | AI document processing |
| `supabase/functions/upload-staff-quote-file/index.ts` | File upload handler |
| `supabase/functions/save-hitl-correction/index.ts` | Save HITL corrections |
| `supabase/functions/calculate-manual-quote-pricing/index.ts` | Pricing calculations |

### Database

| Location | Purpose |
|----------|---------|
| `supabase/migrations/` | Schema definitions |
| Key tables: `quote_files`, `ai_analysis_results`, `quote_pages`, `document_certifications`, `quote_document_groups` |

---

*End of Investigation Report*
