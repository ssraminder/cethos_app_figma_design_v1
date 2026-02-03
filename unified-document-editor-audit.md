# UnifiedDocumentEditor Audit Report

**Date:** 2026-02-03
**File Location:** `client/components/shared/document-editor/UnifiedDocumentEditor.tsx`
**File Size:** 1,150 lines
**Folder:** `client/components/shared/document-editor/`

---

## 1. Feature Matrix

| Feature                 | Exists? | Location (line #)        | Notes                                              |
|------------------------|---------|--------------------------|---------------------------------------------------|
| File Upload            | Yes     | Lines 36-56, 85-86, 296-424 | Drag-and-drop + file input, uploads to Supabase storage |
| Category Selection     | Yes     | Lines 74, 192-197, 520-543 | File categories (To Translate, Reference, etc.) |
| AI Analysis Trigger    | Yes     | Lines 79, 495-515        | Invokes `process-document` edge function         |
| Manual Entry           | No      | -                        | No manual entry mode exists                       |
| Per-Page Word Count    | Yes     | Lines 229, 282           | Handled via `quote_pages` table, editable in PageBreakdownTable |
| Complexity Selection   | Yes     | Lines 678, 700-702       | Easy/Medium/Hard with multipliers (1.0/1.15/1.25) |
| Document Grouping      | Yes     | Lines 73, 170-178, 656-772 | Full group CRUD with CreateGroupModal           |
| One/Multi Doc Toggle   | Yes     | FileCard.tsx:351-365     | Checkbox in expanded file view for multi-doc mode |
| Pricing Calculation    | Yes     | Lines 274-291            | `calculateTotals()` - subtotal, cert total, pages, words |
| Certification Selection| Yes     | Lines 75, 200-207, 680-712 | CertificationType selection per group           |
| Submit/Save            | No      | -                        | No explicit submit button - changes save immediately |

---

## 2. Props Summary

### UnifiedDocumentEditorProps (from `types/document-editor.ts:285-292`)

| Prop             | Type                           | Required | Description                              |
|-----------------|--------------------------------|----------|------------------------------------------|
| `quoteId`       | `string`                       | Yes      | The quote ID to load/save documents for  |
| `mode`          | `EditorMode`                   | Yes      | `"hitl"` \| `"manual-quote"` \| `"order-edit"` |
| `reviewId`      | `string`                       | No       | HITL review ID (for hitl mode)           |
| `orderId`       | `string`                       | No       | Order ID (for order-edit mode)           |
| `onPricingUpdate` | `(totals: QuoteTotals) => void` | No    | Callback when pricing totals change      |
| `readOnly`      | `boolean`                      | No       | Disables all editing (default: false)    |
| `onFilesChange` | `() => void`                   | No       | Callback when files are added/removed (extended prop) |

### EditorMode Values
- `"hitl"` - HITL Review mode
- `"manual-quote"` - Staff manual quote creation
- `"order-edit"` - Order editing mode

---

## 3. State Summary

### Data State
| State Variable       | Type                        | Purpose                            |
|---------------------|-----------------------------|------------------------------------|
| `files`             | `QuoteFileWithRelations[]`  | All files for the quote            |
| `groups`            | `DocumentGroupWithItems[]`  | All document groups with items     |
| `fileCategories`    | `FileCategory[]`            | Available file categories          |
| `certificationTypes`| `CertificationType[]`       | Available certification types      |

### UI State
| State Variable       | Type              | Purpose                              |
|---------------------|-------------------|--------------------------------------|
| `isLoading`         | `boolean`         | Initial data loading indicator       |
| `isAnalyzing`       | `boolean`         | AI analysis in progress              |
| `selectedFileIds`   | `Set<string>`     | Files selected for batch operations  |
| `expandedFileId`    | `string \| null`  | Currently expanded file card         |
| `showCreateGroupModal` | `boolean`      | Create group modal visibility        |

### Upload State
| State Variable       | Type              | Purpose                            |
|---------------------|-------------------|------------------------------------|
| `isDragging`        | `boolean`         | Drag-and-drop active state         |
| `uploadingFiles`    | `UploadingFile[]` | Files currently being uploaded     |

---

## 4. Dependencies

### Child Components (same folder)
| Component                | File                       | Purpose                           |
|-------------------------|----------------------------|-----------------------------------|
| `FileListWithGroups`    | `FileListWithGroups.tsx`   | Renders list of files with group assignments |
| `DocumentGroupsSummary` | `DocumentGroupsSummary.tsx`| Displays groups with pricing summary |
| `CreateGroupModal`      | `CreateGroupModal.tsx`     | Modal for creating new groups     |
| `FileCard`              | `FileCard.tsx`             | Individual file card (expandable) |
| `PageBreakdownTable`    | `PageBreakdownTable.tsx`   | Per-page word count table         |

### External Dependencies
| Dependency           | Source                    | Purpose                           |
|---------------------|---------------------------|-----------------------------------|
| `supabase`          | `@/lib/supabase`          | Database & storage operations     |
| `toast` (sonner)    | `sonner`                  | User notifications                |
| Lucide icons        | `lucide-react`            | UI icons                          |
| Document editor types | `@/types/document-editor` | Type definitions & helpers       |

### UI Components
- Checkbox (`@/components/ui/checkbox`)
- Select components (`@/components/ui/select`)
- Input (`@/components/ui/input`)

---

## 5. Current Usage

| File                                            | Mode           | Context                            |
|------------------------------------------------|----------------|------------------------------------|
| `client/pages/admin/HITLReviewDetail.tsx:4921` | `"hitl"`       | HITL document review workflow      |
| `client/pages/admin/AdminOrderDetail.tsx:764`  | `"order-edit"` | Order document editing             |
| `client/components/admin/manual-quote/StaffFileUploadForm.tsx:2274` | `"manual-quote"` | Staff quote creation |

---

## 6. Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    UnifiedDocumentEditor                      │
├──────────────────────────────────────────────────────────────┤
│  Fetches:                                                     │
│  - quote_files (with ai_analysis_results, quote_pages)       │
│  - quote_document_groups                                      │
│  - quote_page_group_assignments                               │
│  - file_categories                                            │
│  - certification_types                                        │
├──────────────────────────────────────────────────────────────┤
│  Invokes:                                                     │
│  - process-document (Supabase Edge Function for AI analysis) │
├──────────────────────────────────────────────────────────────┤
│  Updates:                                                     │
│  - quote_files (category, storage)                           │
│  - quote_document_groups (CRUD)                              │
│  - quote_page_group_assignments                              │
│  - quote_pages (word counts)                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. Render Structure

```
<div className="space-y-6">

  {/* 1. Header with Refresh Button */}
  <div> Document Management + Refresh </div>

  {/* 2. File Upload Section (drag-drop zone) */}
  {!readOnly && <UploadDropzone />}

  {/* 3. File List Section */}
  <div className="bg-white border rounded-lg">
    <Header> Files ({count}) </Header>
    {files.length === 0 ? <EmptyState /> : (
      <FileListWithGroups
        files, groups, fileCategories
        onAnalyzeSelected, onFileTypeChange, onGroupChange
      />
    )}
    {/* Analyze Selected Button */}
    {selectedFileIds.size > 0 && <AnalyzeButton />}
  </div>

  {/* 4. Document Groups Section */}
  <div className="bg-white border rounded-lg">
    <Header> Document Groups ({count}) + Add Group Button </Header>
    <DocumentGroupsSummary
      groups, certificationTypes
      onEditGroup, onReAnalyze, onUnassignItems, onDeleteGroup
      onCertificationChange
    />
  </div>

  {/* 5. Pricing Summary (if groups exist) */}
  {groups.length > 0 && (
    <PricingSummaryCard>
      Groups, Total Pages, Translation, Certifications, Subtotal
    </PricingSummaryCard>
  )}

  {/* 6. Create Group Modal */}
  <CreateGroupModal />

</div>
```

---

## 8. Key Functions

| Function                | Lines       | Purpose                                    |
|------------------------|-------------|--------------------------------------------|
| `fetchData`            | 151-264     | Fetches all data for the quote             |
| `calculateTotals`      | 274-291     | Computes pricing totals for groups         |
| `handleFilesSelected`  | 296-350     | Processes files for upload                 |
| `uploadSingleFile`     | 355-424     | Uploads file to Supabase storage + creates record |
| `handleAnalyzeSelected`| 495-515     | Triggers AI analysis on selected files     |
| `handleFileTypeChange` | 520-543     | Updates file category                      |
| `handleDeleteFile`     | 546-580     | Deletes file from storage + database       |
| `handleCreateGroup`    | 586-654     | Creates new document group                 |
| `handleGroupChange`    | 656-772     | Assigns file to group with pricing update  |
| `handleDeleteGroup`    | 774-819     | Deletes group and unassigns items          |
| `handleCertificationChange` | 821-867 | Updates group certification type           |

---

## 9. Recommendations

### Keep
1. **Core architecture** - Clean separation of concerns with sub-components
2. **Type definitions** - Well-typed with `types/document-editor.ts`
3. **File upload handling** - Robust drag-drop with progress indicators
4. **AI analysis integration** - `process-document` edge function integration
5. **Pricing calculation** - Automatic totals with certification pricing
6. **Document grouping system** - Full CRUD with group assignments
7. **Multi-doc toggle** - Per-file toggle for multi-document handling
8. **Per-page word count editing** - PageBreakdownTable with inline editing

### Modify
1. **File size** - At 1,150 lines, consider extracting more logic into hooks
2. **State management** - Multiple useState calls could benefit from useReducer
3. **Callback refs pattern** - `onPricingUpdateRef` pattern is complex, could simplify
4. **Error handling** - Some error paths only log to console, not toast
5. **Mode-specific behavior** - Logic for different modes is interleaved, could be cleaner

### Add
1. **Manual Entry mode** - No support for manual document entry (flagged as missing)
2. **Complexity selection UI** - Currently read-only from AI, no manual override in main UI
3. **Validation feedback** - No validation before operations (e.g., group creation)
4. **Undo/Redo** - No undo capability for destructive operations
5. **Batch operations** - Limited batch operations beyond "Analyze Selected"
6. **File preview modal** - Preview button exists but not implemented (line 374: TODO)

### Remove
1. **Dead code** - Check for any unused handler stubs
2. **Console.log statements** - Line 374 has a `console.log` for preview
3. **Redundant calculations** - Some calculations are repeated across components

---

## 10. File Structure Summary

```
client/components/shared/document-editor/
├── index.ts                     (51 lines)  - Exports & re-exports
├── UnifiedDocumentEditor.tsx   (1,150 lines) - Main component
├── FileListWithGroups.tsx       (248 lines) - File list with group dropdowns
├── FileCard.tsx                 (434 lines) - Expandable file card
├── PageBreakdownTable.tsx       (207 lines) - Per-page word count table
├── DocumentGroupsSummary.tsx    (469 lines) - Group list with pricing
└── CreateGroupModal.tsx         (268 lines) - New group creation modal
```

**Total:** ~2,827 lines across 7 files

---

## 11. Database Tables Used

| Table                          | Operations                     |
|-------------------------------|--------------------------------|
| `quote_files`                 | SELECT, INSERT, UPDATE, DELETE |
| `quote_document_groups`       | SELECT, INSERT, UPDATE, DELETE |
| `quote_page_group_assignments`| SELECT, INSERT, DELETE         |
| `quote_pages`                 | SELECT (via join), UPDATE      |
| `ai_analysis_results`         | SELECT (via join)              |
| `file_categories`             | SELECT                         |
| `certification_types`         | SELECT                         |

---

## 12. Edge Functions Used

| Function              | Purpose                              |
|----------------------|--------------------------------------|
| `process-document`   | AI analysis: OCR, language detection, complexity assessment, holder extraction |

---

*End of Audit Report*
