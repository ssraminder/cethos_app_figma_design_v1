# Frontend Pricing Investigation Report

**Date:** 2026-02-13
**Scope:** Entire frontend codebase — is the backend-calculated effective rate being used, or is pricing being recalculated with a hardcoded $65?

---

## Executive Summary

**The frontend has widespread pricing issues.** The backend `process-quote-documents` edge function hardcodes `$65` and does NOT apply the language multiplier at all. Multiple frontend files also fetch `base_rate` from `app_settings` (always $65) and recalculate pricing locally, sometimes with and sometimes without the language multiplier. The result is an inconsistent pricing stack where:

1. The backend stores `base_rate: 65` and `line_total: billablePages * 65` (no language multiplier).
2. Some frontend pages read those stored values (displaying $65-based totals).
3. Other frontend pages re-fetch $65 from `app_settings` and apply the language multiplier client-side.
4. One critical page (`Step4ReviewCheckout.tsx`) recalculates everything with `app_settings` base_rate × language_multiplier — overriding stored DB values.

---

## Section 1: Files That READ Pricing From the Database (Correct Behavior)

These files read `line_total`, `base_rate`, and/or `calculated_totals` from the database and display them without recalculating.

### 1.1 `client/hooks/useQuotePricing.ts` — CORRECT
- **Lines 71-100:** Reads `calculated_totals` JSONB from `quotes` table (source of truth for totals).
- **Lines 112-131:** Reads `line_total`, `billable_pages`, `certification_price` from `ai_analysis_results`.
- **Lines 137-149:** Maps DB values directly to `DocumentAnalysis` objects, including `lineTotal: r.line_total`.
- **Verdict:** This hook is clean — it reads stored values and does NOT recalculate.

### 1.2 `client/pages/Checkout.tsx` — CORRECT
- **Line 143:** Displays `analysis?.line_total?.toFixed(2)` directly from DB.
- **Lines 151-155:** Displays `totals.translation_total` from `useQuotePricing` (which reads from `calculated_totals`).
- **Verdict:** Reads from DB via `useQuotePricing`. No recalculation.

### 1.3 `client/pages/quote/QuoteReviewPage.tsx` — MOSTLY CORRECT
- **Lines 245-263:** Reads `line_total`, `billable_pages`, `certification_price` from `ai_analysis_results` and maps them to `QuoteDocument`.
- **Lines 266-289:** Uses `calculated_totals` from the quote if available. Falls back to summing stored `line_total` values if not — this fallback is correct since it still uses DB-stored values.
- **Line 716:** Displays `doc.line_total.toFixed(2)`.
- **Verdict:** Correct — reads stored values. The fallback calculation sums stored per-document totals.

### 1.4 `client/components/admin/OcrAnalysisModal.tsx` — CORRECT
- **Line 137:** Selects `base_rate, certification_price, line_total` from `ai_analysis_results`.
- **Lines 630, 697, 703:** Displays stored `line_total` and `base_rate` values.
- **Verdict:** Reads and displays DB-stored pricing.

### 1.5 `client/components/shared/analysis/DocumentAnalysisPanel.tsx` — CORRECT
- **Line 298:** Displays `currentAnalysis.base_rate` from DB.
- **Line 311:** Displays `currentAnalysis.line_total` from DB.
- **Verdict:** Read-only display of stored values.

### 1.6 `client/components/shared/analysis/EditableDocumentAnalysisPanel.tsx` — CORRECT
- **Line 742:** Displays `currentAnalysis.base_rate?.toFixed(2)` from DB.
- **Line 755:** Displays `currentAnalysis.line_total?.toFixed(2)` from DB.
- **Verdict:** Read-only display of stored values.

### 1.7 Various Summary/Display Components — CORRECT
- `client/components/shared/document-groups/DocumentGroupCard.tsx` — Line 113, 245: Displays `group.line_total`.
- `client/components/shared/document-editor/DocumentGroupsSummary.tsx` — Lines 128, 221, 287: Displays `group.line_total`.
- `client/components/shared/document-editor/FileCard.tsx` — Line 345: Displays `analysisResult.line_total`.

---

## Section 2: Files That RECALCULATE Pricing (Potential Bugs)

### 2.1 `client/components/quote/Step4ReviewCheckout.tsx` — BUG (recalculates with app_settings $65)

This is the **customer-facing checkout page**. It is the most critical pricing bug.

- **Line 241:** `const [baseRate, setBaseRate] = useState(65);`
- **Lines 860-866:** Fetches `base_rate` from `app_settings` (always $65):
  ```ts
  const { data: baseRateSetting } = await supabase
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "base_rate")
    .single();
  const fetchedBaseRate = parseFloat(baseRateSetting?.setting_value || "65");
  ```
- **Lines 907-910:** Calculates effective rate client-side: `Math.ceil(fetchedBaseRate * fetchedMultiplier / 2.5) * 2.5`
- **Lines 914-919:** **RECALCULATES translation total from scratch:** `totalBillablePages * calculatedEffectiveRate`
- **Lines 929-933:** **OVERRIDES stored `line_total`** from DB for each document:
  ```ts
  const recalculatedDocuments = mergedData.map(doc => ({
    ...doc,
    base_rate: calculatedEffectiveRate,
    line_total: (doc.billable_pages * calculatedEffectiveRate).toFixed(2),
  }));
  ```
- **Analysis:** This file fetches `base_rate` from `app_settings`, multiplies by the language multiplier, and overwrites the DB-stored `line_total`. This means the customer sees a **different price** than what the backend stored. Specifically:
  - Backend stores: `billablePages * 65` (no language multiplier)
  - This page shows: `billablePages * ceil(65 * langMultiplier / 2.5) * 2.5`
  - For a Tier 2 language (multiplier=1.2): backend stores `$65/page`, frontend shows `$80/page`
  - **The frontend recalculation is actually MORE CORRECT than the backend** — it applies the language multiplier. But the values don't match what's in the DB.

### 2.2 `client/components/steps/Step2Details.tsx` — INFORMATIONAL (pre-quote estimate)

- **Line 41:** `const [baseRate, setBaseRate] = useState(65);`
- **Lines 130-158:** Fetches `base_rate` from `app_settings`.
- **Lines 184-186:** Calculates effective rate: `Math.ceil(baseRate * multiplier / 2.5) * 2.5`
- **Lines 195-198:** Stores calculated effective rate in quote state.
- **Analysis:** This is an early step in the quote flow (language selection). It calculates an effective rate for display/preview purposes. It's acceptable here since no documents have been priced yet. However, it fetches from `app_settings` and would use $65 as the base.

### 2.3 `client/components/admin/EditDocumentModal.tsx` — BUG (recalculates with `base_rate_per_page` from app_settings, no language multiplier)

- **Line 67:** `const [baseRate, setBaseRate] = useState(65);`
- **Line 91:** Fetches `base_rate_per_page` from `app_settings` (different key than `base_rate`!).
- **Line 99:** `if (s.setting_key === "base_rate_per_page") setBaseRate(parseFloat(s.setting_value) || 65);`
- **Line 124:** Recalculates: `const rawTranslationCost = billablePages * baseRate;`
- **Line 125:** Rounds: `const translationCost = Math.ceil(rawTranslationCost / 2.5) * 2.5;`
- **Lines 128-141:** Saves the recalculated `line_total` back to the document.
- **Analysis:** This modal **does NOT apply any language multiplier at all**. It uses plain `$65 * billablePages` (rounded to $2.50). This is a definite bug — editing a document resets its pricing to $65/page regardless of language.

### 2.4 `client/components/shared/document-flow/utils/calculations.ts` — RECALCULATES (used by DocumentFlowEditor)

- **Lines 42-50:** `calculateTranslationCost(billablePages, baseRate, languageMultiplier)` — recalculates with: `billablePages * ceil(baseRate * languageMultiplier / 2.5) * 2.5`
- **Lines 122-142:** `recalculateGroup()` — full recalculation of group totals using `baseRate` and `languageMultiplier` parameters.
- **Analysis:** The math is correct (applies language multiplier with $2.50 rounding). But the `baseRate` parameter comes from `app_settings` (always $65) via `usePricingCalculations` → `pricingSettings.base_rate`.

### 2.5 `client/components/shared/document-flow/hooks/usePricingCalculations.ts` — PASSES app_settings base_rate

- **Line 20:** Uses `pricingSettings.base_rate` for recalculation.
- **Line 32:** Returns `baseRate: pricingSettings.base_rate`.
- **Analysis:** This hook receives `pricingSettings` which is loaded from `app_settings` in `useDocumentFlow.ts`.

### 2.6 `client/components/shared/document-flow/hooks/useDocumentFlow.ts` — FETCHES $65 from app_settings

- **Lines 138-160:** Fetches `base_rate`, `words_per_page`, etc. from `app_settings` and builds a `PricingSettings` object.
- **Analysis:** This is the source of the $65 base_rate that feeds into `usePricingCalculations` → `calculations.ts` → `DocumentFlowEditor`.

### 2.7 `client/components/shared/document-flow/DocumentFlowEditor.tsx` — RECALCULATES with app_settings

- **Line 51:** `const { totals, recalculate, baseRate } = usePricingCalculations(...)` — baseRate comes from `app_settings`.
- **Lines 394-398:** When recalculating groups after re-analysis, uses `pricingSettings.base_rate` (from `app_settings`).
- **Line 296:** Calls `recalculate_quote_totals` RPC after saving groups — this SQL function sums `line_total` from `ai_analysis_results`, so if the groups were saved with correct rates, the totals will be correct.

### 2.8 `client/components/shared/analysis/ManualEntryModal.tsx` — RECALCULATES with app_settings

- **Line 69:** Default settings: `base_rate: 65.0`
- **Lines 183-196:** Loads `base_rate` from `app_settings`.
- **Lines 353-354:** Calculates per-page rate: `calculatePerPageRate(quoteLanguageMultiplier, settings.base_rate)` — this applies language multiplier with $2.50 rounding, which is correct.
- **Lines 370-375:** Calculates line total using the multiplier.
- **Line 430:** Saves `base_rate: settings.base_rate` (the raw $65, not effective rate) to the DB.
- **Line 469:** Calls `recalculate_quote_totals` RPC afterward.
- **Analysis:** The line_total calculation is correct (applies language multiplier), but `base_rate` saved to DB is the raw $65 from settings, not the effective rate. This is inconsistent with the stated goal of storing the effective rate in `base_rate`.

### 2.9 `client/components/shared/analysis/OcrResultsModal.tsx` — RECALCULATES with app_settings (admin pricing tab)

- **Lines 1160-1167:** Fetches `base_rate` from `app_settings` (always $65).
- **Lines 1188:** Fallback: `setPricingBaseRate(65)`
- **Lines 1230-1233:** Uses saved `pricing_base_rate` per-row if available, otherwise falls back to `pricingBaseRate` ($65 from settings).
- **Lines 584-591:** `calcTranslationCost()` — applies `ceil(baseRate * languageMultiplier / 2.5) * 2.5`.
- **Line 1309:** `calcTranslationCost(billable, baseRate)` — note: called with **only one argument** beyond billable, so `languageMultiplier` defaults to `1.0`. This means for rows without a saved `pricing_base_rate`, the translation cost is `billable * ceil(65 / 2.5) * 2.5 = billable * 65`.
- **Line 1629:** When adding a manual document: `const baseRate = pricingBaseRate || 65;`
- **Line 1647:** Saves `base_rate: baseRate` (raw $65).
- **Lines 3107-3109 (Summary tab):** Recalculates: `const lineTotal = billablePages * baseRate * multiplier;` — this formula is WRONG — it doesn't apply the $2.50 rounding that should be used.
- **Line 3164:** Same wrong formula in totals footer.
- **Line 3176:** Hardcoded display text: `<p><strong>Rate:</strong> $65.00/page base rate</p>`
- **Analysis:** Multiple issues:
  1. The pricing tab uses $65 from settings when no saved rate exists.
  2. The `calcTranslationCost` calls from row initialization don't pass `languageMultiplier`, so it defaults to 1.0.
  3. The summary/review tab uses a different formula (`billable * base * mult`) instead of the correct `billable * ceil(base * mult / 2.5) * 2.5`.
  4. Hardcoded "$65.00/page base rate" text in the info section.

### 2.10 `client/components/shared/document-editor/UnifiedDocumentEditor.tsx` — HARDCODES $65

- **Line 709:** When creating a new document group: `base_rate: DEFAULT_BASE_RATE` (which is `65.00` from `client/types/document-editor.ts:309`).
- **Analysis:** New document groups are always created with `base_rate: 65.00`, not the effective rate.

### 2.11 `client/pages/admin/AdminQuoteDetail.tsx` — RECALCULATES for display

- **Line 2490:** `const baseRate = Number(currentAnalysis.base_rate || 65);` — reads from DB but falls back to 65.
- **Line 2492:** `return (Math.ceil(baseRate * langMult / 2.5) * 2.5).toFixed(2);` — recalculates per-page rate for display.
- **Line 2509:** Displays stored `line_total` from DB.
- **Analysis:** The per-page rate display recalculates from `base_rate` (which is stored as $65 by the backend). The line_total display uses the stored value (which is `billable * 65`, no multiplier). These two values are inconsistent — the displayed "per page rate" will be higher than what was used to calculate the stored `line_total`.

---

## Section 3: Files With Hardcoded $65

| File | Line | Code |
|------|------|------|
| `client/utils/pricing.ts` | 2 | `export const BASE_RATE_PER_PAGE = 65.00;` |
| `client/types/document-editor.ts` | 309 | `export const DEFAULT_BASE_RATE = 65.00;` |
| `client/hooks/useSupabase.ts` | 338 | `const subtotal = fileCount * 65;` (Phase 1 placeholder) |
| `client/components/steps/Step2Details.tsx` | 41 | `const [baseRate, setBaseRate] = useState(65);` |
| `client/components/quote/Step4ReviewCheckout.tsx` | 241 | `const [baseRate, setBaseRate] = useState(65);` |
| `client/components/quote/Step4ReviewCheckout.tsx` | 246 | `const [effectiveRate, setEffectiveRate] = useState(65);` |
| `client/components/admin/EditDocumentModal.tsx` | 67 | `const [baseRate, setBaseRate] = useState(65);` |
| `client/components/shared/document-flow/types.ts` | 218 | `base_rate: 65` (DEFAULT_PRICING_SETTINGS) |
| `client/components/shared/document-groups/DocumentGroupEditor.tsx` | 457 | `baseRate = 65` (default parameter) |
| `client/components/shared/document-groups/DocumentGroupCard.tsx` | 35 | `perPageRate = 65` (default prop) |
| `client/components/shared/document-flow/components/DocumentGroupCard.tsx` | 133 | `$(baseRate ?? 65).toFixed(2)` (display fallback) |
| `client/components/shared/analysis/OcrResultsModal.tsx` | 1167 | `?.setting_value \|\| "65"` (fallback) |
| `client/components/shared/analysis/OcrResultsModal.tsx` | 1188 | `setPricingBaseRate(65);` (error fallback) |
| `client/components/shared/analysis/OcrResultsModal.tsx` | 1629 | `const baseRate = pricingBaseRate \|\| 65;` |
| `client/components/shared/analysis/OcrResultsModal.tsx` | 2189 | `baseRate: row.baseRate \|\| 65.0` |
| `client/components/shared/analysis/OcrResultsModal.tsx` | 3107 | `const baseRate = analysis.pricing_base_rate \|\| 65.00;` |
| `client/components/shared/analysis/OcrResultsModal.tsx` | 3164 | `const br = a.pricing_base_rate \|\| 65.00;` |
| `client/components/shared/analysis/OcrResultsModal.tsx` | 3176 | `"$65.00/page base rate"` (hardcoded display text) |
| `client/components/shared/analysis/ManualEntryModal.tsx` | 69 | `base_rate: 65.0` (DEFAULT_SETTINGS) |
| `client/components/shared/document-editor/UnifiedDocumentEditor.tsx` | 709 | `base_rate: DEFAULT_BASE_RATE` (= 65.00) |
| `client/pages/admin/settings/PricingSettings.tsx` | 23, 29 | `base_rate: 65.0` (defaults) |
| `client/pages/admin/settings/ComplexitySettings.tsx` | 25, 31 | `base_rate: 65.0` (defaults) |
| `client/pages/admin/AdminQuoteDetail.tsx` | 2490 | `Number(currentAnalysis.base_rate \|\| 65)` |
| `supabase/functions/process-quote-documents/index.ts` | 156 | `const baseRate = 65.0;` |

---

## Section 4: Files Fetching `base_rate` / `base_rate_per_page` From `app_settings`

| File | Line | Setting Key | Used For |
|------|------|-------------|----------|
| `client/components/admin/EditDocumentModal.tsx` | 91 | `base_rate_per_page` | Recalculating line_total (no language multiplier) |
| `client/components/quote/Step4ReviewCheckout.tsx` | 862 | `base_rate` | Recalculating customer-facing pricing |
| `client/components/steps/Step2Details.tsx` | 140 | `base_rate` | Preview effective rate calculation |
| `client/components/shared/analysis/OcrResultsModal.tsx` | 1163 | `base_rate` | Admin pricing tab calculation |
| `client/components/shared/analysis/ManualEntryModal.tsx` | 155 | `base_rate` (via all settings) | Manual entry pricing |
| `client/components/shared/document-flow/hooks/useDocumentFlow.ts` | 142 | `base_rate` | DocumentFlow pricing |
| `client/pages/admin/settings/PricingSettings.tsx` | 48 | `base_rate` | Admin settings display (appropriate) |
| `client/pages/admin/settings/ComplexitySettings.tsx` | 55 | `base_rate` | Admin settings display (appropriate) |

**Note:** `EditDocumentModal.tsx` uses the key `base_rate_per_page` while all other files use `base_rate`. These may or may not be the same setting in the database.

---

## Section 5: SQL Functions Called From Frontend

### 5.1 `recalculate_quote_totals(p_quote_id UUID)`

**Called from:**
- `client/components/shared/document-flow/DocumentFlowEditor.tsx:296`
- `client/components/shared/analysis/ManualEntryModal.tsx:469`

**What it does (from `cethos-migration-turnaround-options.sql:71-214`):**
- **Lines 121-130:** Sums `line_total` from `ai_analysis_results` where `quote_id = p_quote_id`.
- Separates translation total (`line_total - certification_price`) from certification total.
- Calculates rush fee, delivery fee, tax, adjustments.
- Stores everything in `quotes.calculated_totals` JSONB and individual columns.

**Verdict:** This function **reads stored `line_total` values** — it does NOT recalculate them. So if `line_total` in `ai_analysis_results` is wrong (stored as `billable * 65` without language multiplier), the quote totals will also be wrong.

### 5.2 No `recalculate_document_group` or `recalculate_document_totals` RPC calls found.

---

## Section 6: The Backend Problem

### `supabase/functions/process-quote-documents/index.ts`

- **Line 156:** `const baseRate = 65.0;` — HARDCODED, no language multiplier.
- **Line 157:** `const lineTotal = Math.round(billablePages * baseRate * 100) / 100;`
- **Line 177:** Stores `base_rate: baseRate` (= 65) into `ai_analysis_results`.
- **Line 178:** Stores `line_total: lineTotal` (= billablePages * 65) into `ai_analysis_results`.

**This is the root cause.** The backend edge function does NOT:
1. Look up the quote's source language
2. Look up the language multiplier
3. Calculate an effective rate
4. Apply the $2.50 rounding

It simply uses `$65 * billablePages` for every document regardless of language.

---

## Section 7: Summary of Issues

### Critical Bugs

| # | Location | Issue | Impact |
|---|----------|-------|--------|
| 1 | `process-quote-documents/index.ts:156` | Backend hardcodes `$65`, ignores language multiplier | All stored `base_rate` and `line_total` values are wrong for non-English languages |
| 2 | `Step4ReviewCheckout.tsx:914-932` | Customer checkout recalculates pricing client-side, overriding DB values | Customer sees correct effective rate, but DB has wrong values; mismatch between displayed and stored pricing |
| 3 | `EditDocumentModal.tsx:91-126` | Fetches `base_rate_per_page` from settings, recalculates without language multiplier | Editing a document resets pricing to $65/page flat |
| 4 | `OcrResultsModal.tsx:3107-3109` | Summary tab uses wrong formula: `billable * base * mult` instead of `billable * ceil(base * mult / 2.5) * 2.5` | Admin summary shows different totals than pricing tab |
| 5 | `OcrResultsModal.tsx:3176` | Hardcoded "$65.00/page base rate" display text | Misleading if base rate changes in settings |
| 6 | `UnifiedDocumentEditor.tsx:709` | New groups hardcoded with `base_rate: DEFAULT_BASE_RATE` ($65) | Groups always start at $65 regardless of language |
| 7 | `useSupabase.ts:338` | Phase 1 placeholder: `fileCount * 65` | Likely dead code but would produce wrong totals if reached |

### Moderate Issues

| # | Location | Issue |
|---|----------|-------|
| 8 | `ManualEntryModal.tsx:430` | Saves raw `settings.base_rate` ($65) to DB, not effective rate |
| 9 | `OcrResultsModal.tsx:1309` | `calcTranslationCost(billable, baseRate)` — omits `languageMultiplier`, defaults to 1.0 |
| 10 | `AdminQuoteDetail.tsx:2490-2492` | Displays recalculated per-page rate (with multiplier) alongside stored line_total (without multiplier) — inconsistent |
| 11 | `DocumentFlowEditor.tsx:396` | Uses `pricingSettings.base_rate` ($65 from app_settings) for recalculation |

### Architectural Issue

The codebase has **two different concepts conflated** under `base_rate`:
1. **Base rate** = the raw rate from settings ($65) — stored in `app_settings`
2. **Effective rate** = base_rate × language_multiplier, rounded to $2.50 — what should be stored per-document

The `ai_analysis_results.base_rate` column is **supposed** to store the effective rate, but the backend always stores `65.0`.

---

## Section 8: Recommended Fixes

### Fix 1 (Critical): Backend `process-quote-documents` must calculate effective rate

The edge function must:
1. Look up the quote's `source_language_id` → `languages.multiplier`
2. Calculate: `effectiveRate = ceil(65 * multiplier / 2.5) * 2.5`
3. Store `base_rate: effectiveRate` and `line_total: billablePages * effectiveRate`

### Fix 2 (Critical): `Step4ReviewCheckout.tsx` should read from DB, not recalculate

After Fix 1, this page should read `line_total` from `ai_analysis_results` instead of recalculating. Remove the `app_settings` fetch for `base_rate` and the client-side recalculation at lines 860-932.

### Fix 3 (Critical): `EditDocumentModal.tsx` must use effective rate

When editing a document:
- Read the document's stored `base_rate` (effective rate) from `ai_analysis_results`
- OR recalculate using language multiplier from the quote's source language
- Do NOT use `base_rate_per_page` from `app_settings` without applying language multiplier

### Fix 4: `OcrResultsModal.tsx` summary tab formula

Change lines 3107-3109 from:
```ts
const lineTotal = billablePages * baseRate * multiplier;
```
To:
```ts
const perPageRate = Math.ceil((baseRate * multiplier) / 2.5) * 2.5;
const lineTotal = billablePages * perPageRate;
```
Also remove the hardcoded "$65.00/page" text at line 3176.

### Fix 5: `OcrResultsModal.tsx` row initialization

Line 1309: Pass `languageMultiplier` to `calcTranslationCost`:
```ts
calcTranslationCost(billable, baseRate, languageMultiplier)
```

### Fix 6: `UnifiedDocumentEditor.tsx` and `ManualEntryModal.tsx`

Store the effective rate (not raw $65) in `base_rate` when creating new groups/documents.

### Fix 7: Remove `useSupabase.ts` placeholder

Remove or update the `fileCount * 65` calculation at line 338 — it's a Phase 1 placeholder that should have been replaced.

### Fix 8: Unify the `base_rate` vs `base_rate_per_page` setting keys

`EditDocumentModal.tsx` fetches `base_rate_per_page` while everything else fetches `base_rate`. Verify these are the same setting or consolidate.
