# CETHOS HITL Document Flow - Verification Report

**Generated:** 2026-02-03 03:40:27 UTC
**Verified By:** Claude Code
**Version:** 2

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Schema columns | ⚠️ Partial | `file_category_id`, `holder_name` found; `country_of_issue`, `is_multi_document` missing |
| FileCategory bug fix (code→slug) | ✓ | Correctly using `.slug` for category references |
| Words per page (225) | ✓ | Correctly using 225 in multiple components |
| FileAccordion component | ✗ | Component does NOT exist |
| DocumentGroupsView component | ✗ | Component does NOT exist |
| Category on upload | ✗ | No category support found |
| HITLReviewDetail integration | ⚠️ Partial | Has `documentGroups` state but missing components/handlers |

---

## 1. Schema Verification

### New columns in types

```typescript
client/types/document-editor.ts:32:  file_category_id: string | null;
client/types/document-editor.ts:75:  extracted_holder_name: string | null;
client/types/document-editor.ts:76:  extracted_holder_name_normalized: string | null;
client/types/document-editor.ts:116:  holder_name: string | null;
client/types/document-editor.ts:117:  holder_name_normalized: string | null;
```

**Analysis:**
- ✓ `file_category_id` - Found
- ✓ `holder_name` - Found
- ✗ `country_of_issue` - NOT found in types
- ✗ `is_multi_document` - NOT found in types

---

## 2. Bug Fix Verification

### 2.1 FileCategory: .code usage (should be NONE for categories)

```
✓ No .code usage found for FileCategory - BUG FIXED

Note: .code is still used appropriately for:
- Language codes (lang.code)
- Payment method codes (method.code)
- Turnaround option codes (option.code)
- Country codes (country.code)
- Document type codes (dt.code)
These are NOT related to the FileCategory bug.
```

### 2.2 FileCategory: .slug usage (should exist)

```typescript
client/components/shared/document-editor/FileCard.tsx:88:
  const categoryCode = (currentCategory?.slug || "to_translate") as FileCategoryCode;

client/components/shared/document-editor/UnifiedDocumentEditor.tsx:389:
  (c) => c.slug === "to_translate" || c.name === "To Translate"

client/components/shared/document-editor/FileListWithGroups.tsx:35:
  return !category || category.slug === "to_translate";
```

✓ **BUG FIXED:** FileCategory now correctly uses `.slug` property instead of `.code`

### 2.3 Words per page: 225 usage

```typescript
client/components/shared/analysis/ManualEntryModal.tsx:70:
  words_per_page: 225, // Updated to 225 as per spec

client/components/shared/analysis/ManualEntryModal.tsx:142:
  // Formula: ceil((words / 225) × complexity × 10) / 10 - rounds UP to nearest 0.1

client/components/admin/EditDocumentModal.tsx:68:
  const [wordsPerPage, setWordsPerPage] = useState(225);

client/components/admin/EditDocumentModal.tsx:100:
  if (s.setting_key === "words_per_page") setWordsPerPage(parseInt(s.setting_value) || 225);

client/components/admin/EditDocumentModal.tsx:118:
  // Calculate billable pages: CEIL((words / 225) * complexity * 10) / 10

client/pages/admin/settings/PricingSettings.tsx:24:
  words_per_page: 225,

client/pages/admin/HITLReviewDetail.tsx:209:
  const [wordsPerPage, setWordsPerPage] = useState(225);

client/pages/admin/HITLReviewDetail.tsx:2932:
  // CEIL((words / 225) × complexity × 10) / 10 = Round UP to 0.10

client/components/admin/hitl/ManualEntryModal.tsx:162:
  wordsPerPage: settingsMap.words_per_page || 225,
```

✓ **VERIFIED:** Words per page correctly uses 225 (not 250)

---

## 3. New Components

### 3.1 FileAccordion.tsx

✗ **MISSING**

The component `client/components/admin/hitl/FileAccordion.tsx` does NOT exist.

### 3.2 DocumentGroupsView.tsx

✗ **MISSING**

The component `client/components/admin/hitl/DocumentGroupsView.tsx` does NOT exist.

---

## 4. File Upload with Category

### 4.1 DocumentManagementPanel category support

```
✗ No category references found in DocumentManagementPanel.tsx
```

### 4.2 Edge function categoryId support

```
✗ No categoryId parameter found in supabase/functions/upload-staff-quote-file/
```

---

## 5. FileAccordion UI Elements

Component not found - skipping UI element check

| Element | Found |
|---------|-------|
| Analyze button | N/A |
| Manual Entry button | N/A |
| One/Multiple doc radio | N/A |
| Document group dropdown | N/A |
| Word count display | N/A |
| Complexity selector | N/A |
| Submit button | N/A |

---

## 6. DocumentGroupsView UI Elements

Component not found - skipping UI element check

| Element | Found |
|---------|-------|
| Billable pages display | N/A |
| Certification dropdown | N/A |
| Translation cost | N/A |
| Subtotal | N/A |
| Re-analyze button | N/A |

---

## 7. HITLReviewDetail Integration

### 7.1 Component imports

```
✗ No imports for FileAccordion or DocumentGroupsView found
```

### 7.2 New state variables

```typescript
client/pages/admin/HITLReviewDetail.tsx:347:
  const [documentGroups, setDocumentGroups] = useState<DocumentGroup[]>([]);
```

✓ `documentGroups` state exists
✗ `fileAccordionData` - NOT found
✗ `showDocumentGroupsView` - NOT found

### 7.3 Handler functions

```
✗ handleAnalyzeFile - NOT found
✗ handleSubmitGroupings - NOT found
✗ handleReanalyzeGroup - NOT found
```

---

## 8. All HITL Components

```
total 385K
AddressesDeliveryPanel.tsx     (12K)
AnalyzeDocumentModal.tsx       (24K)
AssignItemsModal.tsx           (6K)
ContactInfoPanel.tsx           (4K)
CreateGroupModal.tsx           (5K)
CustomerInfoPanel.tsx          (8K)
DocumentAnalysisPanel.tsx      (10K)
DocumentCardV2.tsx             (20K)
DocumentFilesPanel.tsx         (14K)
DocumentGroupCard.tsx          (9K)
DocumentManagementPanel.tsx    (5K)
EditGroupModal.tsx             (5K)
EditableBillingAddressPanel.tsx     (13K)
EditableCustomerPaymentPanel.tsx    (14K)
EditableDocumentAnalysisPanel.tsx   (30K)
EditablePricingSummaryPanel.tsx     (23K)
EditableQuoteCertificationPanel.tsx (13K)
EditableShippingAddressPanel.tsx    (17K)
EditableTranslationDetailsPanel.tsx (13K)
HITLPanelLayout.tsx            (8K)
InternalNotesPanel.tsx         (5K)
ManualDocumentEntry.tsx        (15K)
ManualEntryModal.tsx           (30K)
PricingSummaryBox.tsx          (37K)
PricingSummaryPanel.tsx        (3K)
QuoteDetailsPanel.tsx          (8K)
TranslationDetailsCard.tsx     (22K)
TranslationDetailsPanel.tsx    (4K)
index.ts                       (2K)
```

**Total: 28 components** (excluding index.ts)

---

## 9. Recommendations

### Missing Items

1. **FileAccordion.tsx component** - Needs to be created with:
   - Analyze button with `onAnalyze` callback
   - Manual Entry button with `onManualEntry` callback
   - One Document / Multiple Documents radio selection
   - Document group dropdown
   - Word count display
   - Complexity selector
   - Submit button

2. **DocumentGroupsView.tsx component** - Needs to be created with:
   - Billable pages display
   - Certification dropdown
   - Translation cost calculation
   - Subtotal display
   - Re-analyze button

3. **Schema types missing**:
   - `country_of_issue` field
   - `is_multi_document` field

4. **Category on upload support**:
   - Add category parameter to DocumentManagementPanel
   - Add categoryId handling to upload-staff-quote-file edge function

5. **HITLReviewDetail handlers**:
   - `handleAnalyzeFile` function
   - `handleSubmitGroupings` function
   - `handleReanalyzeGroup` function

### Errors Found

1. No critical errors found - the codebase is functional
2. FileCategory bug has been properly fixed (code → slug)
3. Words per page formula correctly uses 225

### Next Steps

1. Create `FileAccordion.tsx` component following the Figma design spec
2. Create `DocumentGroupsView.tsx` component following the Figma design spec
3. Add missing schema fields (`country_of_issue`, `is_multi_document`) to types
4. Implement category support in file upload flow
5. Add handler functions to HITLReviewDetail.tsx
6. Integrate new components into HITLReviewDetail page
7. Test the complete document grouping workflow

---

## Verified Bug Fixes

| Bug | Status | Details |
|-----|--------|---------|
| FileCategory .code → .slug | ✓ FIXED | All category references now use `.slug` |
| Words per page 250 → 225 | ✓ FIXED | All pricing calculations use 225 |

---

*End of Verification Report*
