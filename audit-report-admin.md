# Admin Panel Audit Report — 2026-03-25

## Summary
- 7 issues found (1 critical, 6 minor)

## Critical Issues (will cause runtime errors)

### Issue 1: Dead `assign_vendor` action for internal staff assignment
**File:** `client/components/admin/OrderWorkflowSection.tsx:1712`
**Current:**
```tsx
handleStepAction(step.id, "assign_vendor", { vendor_id: staffId })
```
**Should be:**
```tsx
handleStepAction(step.id, "direct_assign", { vendor_id: staffId })
```
**Impact:** When an admin assigns an internal staff member to a step, the backend will return a 400 error because `assign_vendor` is no longer a valid action in `update-workflow-step` v4. The valid actions are `direct_assign`, `offer_vendor`, `offer_multiple`, and `retract_offers`.

## Minor Issues (dead code, display gaps)

### Issue 2: `template_name` not used — falls back to `template_code`
**File:** `client/components/admin/OrderWorkflowSection.tsx:1397`
**Current:**
```tsx
{workflow.template_code.replace(/_/g, " ")}
```
**Should be:**
```tsx
{workflow.template_name || workflow.template_code.replace(/_/g, " ")}
```
**Impact:** The `Workflow` interface (line 88) does not include `template_name`. The API response `workflow.template_name` field is never read. The header displays a munged code string (e.g. "standard translation") instead of the human-readable template name (e.g. "Standard Translation Workflow"). Cosmetic only.

### Issue 3: `declined_reason` on offers is defined but never rendered
**File:** `client/components/admin/OrderWorkflowSection.tsx:68` (type), not rendered anywhere
**Current:** The `declined_reason` field exists in the `offers[]` type definition and is presumably returned by the API, but the pipeline only shows a count of declined offers (line 1609–1612). The actual reason text is never displayed.
**Should be:** Show `declined_reason` in a tooltip or expanded view on the declined offer count, e.g.:
```tsx
{step.offers.filter(o => o.status === "declined").map(o => (
  <div key={o.id}>{o.vendor_name}: {o.declined_reason || "No reason given"}</div>
))}
```
**Impact:** Admins cannot see why vendors declined offers without checking the database directly.

### Issue 4: `steps[].declined_reason` (top-level step field) not in the type
**File:** `client/components/admin/OrderWorkflowSection.tsx:21–73`
**Current:** The `WorkflowStep` interface does not include a top-level `declined_reason` field. The API v4 spec says `steps[].declined_reason` is returned, but the component only has `rejection_reason` (line 51). These may be separate fields or the API may have renamed `rejection_reason` → `declined_reason`.
**Should be:** Confirm with backend whether `declined_reason` and `rejection_reason` are the same or different fields. If different, add `declined_reason` to the interface and render it.

### Issue 5: `min_vendor_margin_percent` fetched but not passed to margin indicator
**File:** `client/components/admin/OrderWorkflowSection.tsx:1959, 728–734`
**Current:** `minMarginPercent` is fetched from `app_settings` (line 1989–1998) and stored in state (line 1959), but it is **never passed** to `VendorAssignModal` or `WorkflowPipeline`. Both components use hardcoded thresholds: `>= 50` (green), `>= 30` (yellow), `< 30` (red) — see lines 728–734 and 1440–1444.
**Should be:** Pass `minMarginPercent` as a prop and use it for the threshold boundaries instead of hardcoding 30/50.
**Impact:** If the admin changes the margin threshold in settings, the UI won't reflect it.

### Issue 6: No offer expiry countdown on `WorkflowPipeline` offer chips — hours-based only
**File:** `client/components/admin/OrderWorkflowSection.tsx:1596–1604`
**Current:** The expiry display shows hours rounded via `Math.round(... / 3600000)`. For offers expiring within the hour, this shows "0h left" or "(expired)" with no live countdown.
**Should be:** Consider showing minutes when < 1 hour remains (e.g. "23m left") for more precise tracking. This is a minor UX gap — the feature exists but lacks granularity.

### Issue 7: Workflow header shows `template_code` not `template_name`
**(Duplicate detail of Issue 2)** The `Workflow` interface (line 88–101) has `template_code: string` but no `template_name` field. The `get-order-workflow` v4 response includes `workflow.template_name`, but it is never destructured or stored. The interface should be extended:
```tsx
interface Workflow {
  // ...existing fields
  template_name?: string;
}
```

## Checklist
- [x] CHECK 1: assign_vendor references — **1 critical bug found** at line 1712 (staff assignment uses dead `assign_vendor` action)
- [x] CHECK 2: VendorFinderModal exists — **PASS.** `VendorFinderModal` (line 202) + `VendorAssignModal` (line 632) both exist. No `VendorPickerModal` or `vendorPickerStep` references found. State uses `finderStep` (line 1949). Service dropdown shows names grouped by category via `<optgroup>` (line 394–398). Calls `find-matching-vendors` via POST (line 255).
- [x] CHECK 3: Offers display — **Mostly PASS.** Offers array is rendered with vendor name chips (line 1581–1615). "Send More Offers" button exists on `offered` steps (line 1720–1728). "Retract Offers" calls `retract_offers` action correctly (line 1736). Offer expiry countdowns shown in hours (line 1596–1604). **Minor gap:** `declined_reason` text not displayed, only count.
- [x] CHECK 4: Step management — **PASS.** `manage-order-workflow-steps` is called for add/remove/reorder (lines 2021, 2149). `AddStepModal` exists with service dropdown (line 998). Pending steps show ↑↓ reorder (lines 1522–1545) and ✕ remove buttons (lines 1549–1562). "+" Add Step button exists in workflow header (line 1401–1406) and between steps (line 1457–1468, 1922–1934).
- [x] CHECK 5: Margin display — **Partial PASS.** `min_vendor_margin_percent` is fetched from `app_settings` (line 1992–1994). `order_financials` is extracted from response (line 1972–1975). `VendorAssignModal` shows margin indicator with green/yellow/red (lines 728–734, 902–928). Workflow header shows "Customer subtotal / Vendor cost / Margin" (lines 1426–1448). **Minor gap:** Fetched `minMarginPercent` is not used; thresholds are hardcoded at 30/50.
- [x] CHECK 6: Assign vs Offer buttons — **PASS.** Three separate buttons based on mode: "Assign" → `direct_assign` (line 750–751), "Send Offer" → `offer_vendor` (line 752–753), "Send Offers (N)" → `offer_multiple` (line 754–758). No single "Assign & Offer" button. Submit labels defined at lines 770–775.
- [x] CHECK 7: v4 API fields used — **Partial PASS.** `order_financials` ✅ (line 1972–1975). `total_vendor_cost` ✅ (line 1977). `steps[].offers[]` ✅ (line 1581). `steps[].active_offer_count` ✅ (line 1734). `steps[].offer_count` ✅ (line 1687). `steps[].source_language` / `target_language` ✅ (line 1633). **Missing:** `workflow.template_name` (not in interface, not rendered). `steps[].declined_reason` (not in interface; offer-level `declined_reason` defined but not rendered).
- [x] CHECK 8: StepDetailPanel removed — **PASS.** No `StepDetailPanel` component found. No `selectedStep` state. All step details are inline in pipeline cards with expansion toggle (line 1842–1917).
- [x] CHECK 9: TemplateSelector — **PASS.** Suggested template appears first via sort (line 1213–1217) with ★ prefix (line 1261). Calls `assign-order-workflow` (line 1228). Shows template preview with step pipeline (line 1268–1285).

## Fix Priority
1. **[CRITICAL] Fix `assign_vendor` → `direct_assign`** at line 1712 — runtime 400 error on every internal staff assignment
2. **[Minor] Add `template_name` to `Workflow` interface** and render it in the header instead of `template_code`
3. **[Minor] Use `minMarginPercent` from settings** instead of hardcoded 30/50 thresholds in margin indicators
4. **[Minor] Display `declined_reason`** on declined offer entries (currently only shows count)
5. **[Minor] Clarify `declined_reason` vs `rejection_reason`** — confirm with backend if these are the same or different fields
6. **[Minor] Improve expiry countdown granularity** — show minutes when < 1 hour
