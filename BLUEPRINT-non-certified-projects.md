# Blueprint: Non-Certified Translation Projects

**Status:** Approved in principle (2026-04-21). Blueprint **revised after live-schema inspection** — most proposed scaffolding already exists.
**Goal:** Retire XTRF by moving all project management (certified + non-certified) into the portal.

---

## ⚠️ Critical revision note (2026-04-21)

Initial blueprint assumed we needed to build:
- a new `service_type` enum column on quotes/orders
- a new `billing_unit` column on line items
- new `customers.is_approved_for_credit` + `credit_terms` fields
- new workflow templates for each service type

**Reality (after querying the live database):**
- A comprehensive `services` table **already exists** with 40+ services covering the full XTRF taxonomy and more, with `default_calculation_units` already encoding per_word / per_page / per_hour / per_minute.
- `quotes.service_id` and `orders.service_id` **already exist**. 72% of quotes and 57% of orders already reference a service.
- `workflow_templates` table is **already linked to services** via `service_id`. 9 templates exist today.
- `customers.is_ar_customer` (boolean) and `customers.payment_terms` (VARCHAR, default `'net_30'`) **already exist**. `credit_limit` and `ar_contact_email` also exist.
- `orders.invoice_status` exists (values used: `unbilled`, `invoiced`).

**Consequence:** the scope shrinks dramatically. Most work is now wiring, seeding gaps, and UI. Schema changes are minimal.

---

## 1. Decisions (locked — unchanged from original)

| # | Decision | Outcome |
|---|---|---|
| 1 | Service type taxonomy | Use existing `services` table. Retire XTRF names 1:1; map to existing service codes. |
| 2 | Direct-order auto-invoice trigger | Invoice on delivery by default. Ad-hoc manual invoice available at any time against an open order. No phase/milestone system. |
| 3 | Quote→order flow for non-certified | Both pay-link AND net-terms invoice flows supported (same as certified). |
| 4 | Who can create direct orders | All staff users. Not role-gated. |
| 5 | Non-certified pricing | Billing unit per line item: page / word / hour / flat (and existing per_minute). Surcharge / discount / rush / delivery all still apply. Rates not tier-specific yet, but schema supports tier-specific pricing via per-service rate tables later. |
| 6 | Customer eligibility for direct orders | `customers.is_ar_customer = true` (single gate). `customer_type` values already supported include individual/business/corporate/sme/lsp/government_federal/government_provincial/government_municipal/non_profit/legal/immigration/educational/registry — no constraint change needed. |
| 7 | CAT-tool breakdown | Deferred to final phase (post-cutover). |
| 8 | Interpreting | Already a `category='interpretation'` cluster in services (consecutive, simultaneous, OPI, VRI, sign, escort). No dedicated fulfillment UI — treated as generic non-certified order. |
| 9 | ISC program | Dropped (no dedicated service_type). |
| 10 | XTRF duplicate names | Consolidated via mapping (see §3). |

---

## 2. What the database already has

### 2.1 `services` table (40+ rows, populated)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `code` | text | e.g. `certified_translation`, `standard_translation`, `mtpe` |
| `name`, `name_fr` | text | Display names |
| `description` | text | |
| `category` | text | `translation`, `review_qa`, `interpretation`, `multimedia`, `technology`, `other` |
| `default_calculation_units` | text[] | e.g. `['per_word','per_page']` or `['per_hour']` |
| `customer_facing` | bool | Is this selectable by customers? |
| `vendor_facing` | bool | Is this assignable to vendors? |
| `xtrf_job_type_id`, `xtrf_job_type_name` | int/text | XTRF mapping (all NULL today — to be backfilled from XTRF export) |
| `is_active` | bool | |
| `sort_order` | int | |

Existing services cover (grouped by category):

- **translation:** `certified_translation`, `standard_translation`, `technical_translation`, `legal_translation`, `medical_translation`, `financial_translation`, `marketing_translation`, `literary_translation`, `software_localization`, `website_localization`, `sworn_translation`
- **review_qa:** `proofreading`, `review`, `mtpe`, `lqa`, `quality_management`, `editing`, `back_translation`, `cognitive_debriefing`, `clinician_review`, `post_cognitive_debriefing_review`, `post_clinician_review`
- **interpretation:** `consecutive_interpretation`, `simultaneous_interpretation`, `telephone_interpretation`, `video_remote_interpretation`, `sign_language_interpretation`, `escort_interpretation`
- **multimedia:** `transcription`, `transcription_translation`, `subtitling`, `subtitling_translation`, `closed_captioning`, `voiceover`, `dubbing`
- **technology:** `dtp`, `terminology_management`, `translation_memory`, `localization_testing`, `cultural_consulting`
- **other:** `document_review`, `content_writing`, `transcreation`, `rush_handling`, `other_service`

### 2.2 Existing workflow templates (9 rows)

| Template code | Service code | Steps | Default? |
|---|---|---|---|
| `certified_translation` | certified_translation | 3 | yes |
| `standard_tep` | standard_translation | 4 | yes |
| `translation_only` | standard_translation | 2 | no |
| `translation_review` | standard_translation | 3 | no |
| `medical_back_translation` | medical_translation | 5 | yes |
| `software_localization` | software_localization | 5 | yes |
| `mtpe_review` | mtpe | 3 | yes |
| `subtitling` | subtitling | 4 | yes |
| `transcription_translation` | transcription | 4 | yes |

**Templates missing** (services without any workflow template): technical/legal/financial/marketing/literary/website localization/sworn translation, all review_qa except mtpe, all interpretation, most multimedia, all technology, all other. Seeding at least a minimal `service_default` template for each is needed for them to be usable.

### 2.3 `customers` table — AR fields already present

| Column | Type | Default |
|---|---|---|
| `is_ar_customer` | boolean | `false` |
| `payment_terms` | varchar(20) | `'net_30'` |
| `credit_limit` | numeric | `0` |
| `credit_balance` | numeric | `0` |
| `ar_contact_email` | varchar(255) | — |
| `ar_notes` | text | — |
| `requires_po` | boolean | `false` |
| `requires_client_project_number` | boolean | `false` |

Actual `customer_type` values in use: `'individual'`, `'business'`, `'legal'` (no `'lsp'` or `'government_*'` yet).

### 2.4 `quotes` and `orders` columns relevant here

- `quotes.service_id` uuid → services (497 of 686 populated)
- `orders.service_id` uuid → services (122 of 213 populated)
- `orders.invoice_status` text (`'unbilled'`, `'invoiced'`)
- `orders.quote_id` uuid **NOT NULL** — every order must currently link to a quote
- `quotes.is_manual_quote`, `quotes.created_by_staff_id`, `quotes.entry_point` — already support "staff-created" flows

### 2.5 `ai_analysis_results` — the line-items table (misnamed)

Currently the line-item storage but geared to the AI/OCR pipeline. Key pricing fields:
- `billable_pages` numeric (default 1.00)
- `word_count` integer
- `base_rate` numeric (default 65.00 — reflects per-page certified pricing)
- `complexity_multiplier` numeric
- `line_total` numeric
- `certification_type_id`, `certification_price`

**No `calculation_unit` column.** All pricing logic assumes `line_total = billable_pages × base_rate × complexity_multiplier`.

---

## 3. XTRF → portal service mapping (consolidated)

| XTRF name | Target service code |
|---|---|
| Certified Translation | `certified_translation` |
| Premium Translation, Translation Premium + DTP | `standard_translation` + DTP add-on (or new `premium_translation` if desired — see §9 open items) |
| Standard Translation, Translation Premium | `standard_translation` (workflow: `standard_tep`) |
| Translation Plus, Basic Translation | `standard_translation` (workflow: `translation_review` or `translation_only`) |
| Translation | `standard_translation` (workflow: `translation_only`) |
| Back Translation | `back_translation` |
| Editing | `editing` |
| Lingval trans (linguistic validation) | `review` or new service (TBD — see §9) |
| Proofreading | `proofreading` |
| Revision, Proof Recon | `review` |
| Quality Management | `quality_management` |
| Formatting check | `review` |
| MTPE | `mtpe` |
| Localization | `software_localization` (or `website_localization` depending on context) |
| Clinician Review | `clinician_review` |
| Medical review | `clinician_review` or `review` |
| Cognitive Debriefing | `cognitive_debriefing` |
| Reconciliation, Harmonization, Migration, Migration QM, Screenshot Review | *Create new services in `review_qa` category* — see §5 |
| Interpreting | `consecutive_interpretation` (default; staff picks specific sub-type) |
| Translation for Immigrant Services Calgary | **Dropped** (client inactive) |

---

## 4. Actual schema changes needed (much smaller than original plan)

### 4.1 New columns

```sql
-- orders: direct-order marker + progress-invoice tracking
-- NOTE: no orders.payment_terms — customers.payment_terms is the source of truth via
-- calculate_invoice_due_date(customer_id), which already exists.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_direct_order BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoiced_total DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_is_direct_order ON orders(is_direct_order) WHERE is_direct_order = true;

-- ai_analysis_results: generalize line-item billing
ALTER TABLE ai_analysis_results
  ADD COLUMN IF NOT EXISTS calculation_unit VARCHAR(20) NOT NULL DEFAULT 'per_page'
    CHECK (calculation_unit IN ('per_page','per_word','per_hour','per_minute','flat')),
  ADD COLUMN IF NOT EXISTS unit_quantity DECIMAL(12,4);
-- semantics: line_total = unit_quantity × base_rate × complexity_multiplier
-- 'per_page' back-compat: unit_quantity mirrors billable_pages
-- 'flat': unit_quantity = 1
```

### 4.2 No changes needed (already present)

- ❌ ~~`quotes.service_type` enum~~ → use `quotes.service_id` (already there)
- ❌ ~~`orders.service_type` enum~~ → use `orders.service_id` (already there)
- ❌ ~~`customers.is_approved_for_credit`~~ → use `customers.is_ar_customer` (already there)
- ❌ ~~`customers.credit_terms`~~ → use `customers.payment_terms` (already there)
- ❌ ~~new billing_unit column~~ → services.default_calculation_units drives UI; ai_analysis_results.calculation_unit stores chosen unit
- ❌ ~~`orders.billing_terms`~~ → renamed to `orders.payment_terms` to match customers convention

### 4.3 Backfill

```sql
-- 1. orders.payment_terms = 'prepaid' (all legacy orders were fully paid up-front)
--    (default covers it; no statement needed)

-- 2. orders.invoiced_total = sum of non-voided invoices per order
UPDATE orders o SET invoiced_total = COALESCE(
  (SELECT SUM(total_amount) FROM customer_invoices
   WHERE order_id = o.id AND voided_at IS NULL), 0
);

-- 3. ai_analysis_results.calculation_unit defaults to 'per_page'; unit_quantity = billable_pages
UPDATE ai_analysis_results SET
  unit_quantity = billable_pages
WHERE unit_quantity IS NULL;

-- 4. Orders with NULL service_id: assume certified_translation
UPDATE orders SET service_id = (SELECT id FROM services WHERE code='certified_translation')
WHERE service_id IS NULL;

UPDATE quotes SET service_id = (SELECT id FROM services WHERE code='certified_translation')
WHERE service_id IS NULL;
```

### 4.4 Function changes

**Current signature** (from [20260328_fix_invoice_branch_numbering.sql](supabase/migrations/20260328_fix_invoice_branch_numbering.sql)):
```
create_invoice_from_order(p_order_id uuid, p_trigger_type varchar DEFAULT 'delivery') RETURNS jsonb
```
- Uses branch-aware numbering via `next_invoice_number(branch_id)`
- Uses customer-level terms via `calculate_invoice_due_date(customer_id)` (supports `immediate`, `net_15`, `net_30`, `net_60`)
- **Blocks duplicate invoices** for the same order (must be removed to allow progress invoicing)
- Returns `jsonb { success, invoice_id, invoice_number, due_date, total_amount, balance_due }`

**New signature** (back-compatible; adds 3rd optional param):
```
create_invoice_from_order(
  p_order_id      uuid,
  p_trigger_type  varchar DEFAULT 'delivery',
  p_amount        decimal(12,2) DEFAULT NULL
) RETURNS jsonb
```

Behavior changes:
- If `p_amount IS NULL` → bill the remaining balance (`orders.total_amount - orders.invoiced_total`).
- Reject over-invoicing when `p_amount > remaining`.
- Reject zero / negative amounts.
- Drop the "invoice already exists" early-return — **allow multiple invoices per order** (this is the core enabler for progress invoicing).
- Atomically bump `orders.invoiced_total` on success.
- Preserve branch-aware numbering + `calculate_invoice_due_date` lookup unchanged.
- Existing 2-arg callers ([crm-create-order](supabase/functions/crm-create-order/index.ts), [review-draft-file](supabase/functions/review-draft-file/index.ts)) keep working.

### 4.5 Workflow template seeding

Add minimal default templates for services that don't have one (deferred to Phase 2 — admin can add them through the UI as needed).

---

## 5. Services that may need to be added (for XTRF parity)

From clinical/pharma domain, present in XTRF but absent from current services:
- `reconciliation` (category: review_qa)
- `harmonization` (category: review_qa)
- `linguistic_validation_migration` (category: review_qa)
- `linguistic_validation_migration_qm` (category: review_qa)
- `screenshot_review` (category: review_qa)

Decision needed: add these now, or roll into existing `review` service? (See §9 open items.)

---

## 6. Edge functions

### 6.1 New

**`admin-create-order`** (modeled on [crm-create-order](supabase/functions/crm-create-order/index.ts))

Input:
```json
{
  "customer_id": "uuid",
  "service_id": "uuid",
  "source_language_id": "uuid",
  "target_language_id": "uuid",
  "line_items": [
    { "description": "Contract translation",
      "calculation_unit": "per_word", "unit_quantity": 4200, "base_rate": 0.18 }
  ],
  "surcharge": null, "discount": null,
  "is_rush": false,
  "payment_terms": "net_30",
  "estimated_delivery_date": "2026-05-15",
  "notes": "..."
}
```

Behavior:
- Verify staff auth.
- Verify customer eligibility: `is_ar_customer = true` AND `customer_type IN ('business','legal')`.
- Create `quotes` row: `status='paid'`, `entry_point='admin_direct_order'`, `is_manual_quote=true`, `service_id` set.
- Create `orders` row: `is_direct_order=true`, `service_id`, `payment_terms` set, `quote_id` linked.
- Insert line items into `ai_analysis_results` with `is_staff_created=true`, `calculation_unit`, `unit_quantity`.
- **Do not** create invoice on creation — delivery flow handles that. Ad-hoc invoicing uses existing UI.

### 6.2 Modified

- **[create-fast-quote/index.ts](supabase/functions/create-fast-quote/index.ts)** — accept `service_id` + line-item `calculation_unit`, `unit_quantity`. Stop defaulting to per-page semantics when unit is different.
- **[create-fast-quote-kiosk/index.ts](supabase/functions/create-fast-quote-kiosk/index.ts)** — same.
- **[get-order-workflow/index.ts](supabase/functions/get-order-workflow/index.ts)** — already matches by service; verify it handles services without templates gracefully.

---

## 7. UI changes

### 7.1 New page `/admin/orders/new` — `AdminCreateOrder.tsx`

- Toggle at top: **Quote** vs **Direct Order** (Direct Order disabled if customer ineligible, with tooltip: *"Customer must be AR-approved and classified as business or legal — create a quote instead."*)
- **Service selector** (dropdown grouped by category) — drives:
  - Available `calculation_unit` options per line item (from `services.default_calculation_units`)
  - Whether certification picker appears (only when service code contains `certified` or `sworn`)
  - Default workflow template suggestion downstream
- Line-item rows with: description, `calculation_unit` dropdown, `unit_quantity`, `base_rate`, auto-computed `line_total`.
- `payment_terms` dropdown (direct-order mode only) — defaults from `customer.payment_terms`.
- Submit:
  - Quote mode → existing `create-fast-quote`
  - Direct Order mode → new `admin-create-order`

### 7.2 Modified

- **[FastQuoteCreate.tsx](client/pages/admin/FastQuoteCreate.tsx)** — add service selector; show/hide certification UI based on service; add calculation_unit dropdown per line item.
- **[KioskShell.tsx](client/pages/kiosk/KioskShell.tsx)** — add service selector (optional — kiosk is 99% certified today, but non-blocking).
- **[AdminOrderDetail.tsx](client/pages/admin/AdminOrderDetail.tsx)** — show service, payment_terms, invoiced_total, remaining balance. Add **"Issue invoice now"** button routing to CreateInvoice pre-filled.
- **[AccountsReceivable.tsx](client/pages/admin/AccountsReceivable.tsx)** — add service-category filter; non-certified breakout for cutover monitoring.
- **[QuoteReviewPage.tsx](client/pages/quote/QuoteReviewPage.tsx)** — label quote by service name (avoid "certified" copy when not).

---

## 8. Phased implementation (revised)

### Phase 1 — Schema (1 migration file, much smaller than originally planned)
- Add `orders.payment_terms`, `orders.is_direct_order`, `orders.invoiced_total`.
- Add `ai_analysis_results.calculation_unit`, `ai_analysis_results.unit_quantity`.
- Backfill existing rows (`service_id` defaults, `invoiced_total` recomputed).
- Replace `create_invoice_from_order()` with extended version.

### Phase 2 — Services + workflow templates data
- Add any missing XTRF services (reconciliation, harmonization, linguistic_validation_migration, screenshot_review) — pending §9 decisions.
- Seed minimal workflow templates for services without one.
- Backfill `services.xtrf_job_type_id` from XTRF export.

### Phase 3 — Edge functions
- New `admin-create-order`.
- Update `create-fast-quote*` to honor `service_id` + unit fields.

### Phase 4 — Admin UI
- New `AdminCreateOrder.tsx`.
- Updates to `FastQuoteCreate.tsx`, `AdminOrderDetail.tsx`.

### Phase 5 — AR / reporting / customer-facing copy
- `AccountsReceivable.tsx` filter.
- `QuoteReviewPage.tsx` service-aware copy.
- Invoice PDF template service-aware.

### Phase 6 — Vendor portal (separate repo `D:\cethos-vendor`)
- Labels reflect service name, not "certified translation".

### Phase 7 — XTRF cutover
- Migrate active XTRF projects into portal orders.
- Turn off XTRF for new work.

### Phase 8 — Deferred
- CAT-tool breakdown on line items.
- Tier-specific / subscription rate tables.
- Interpreting-specific scheduling UI.

---

## 9. Open items (decisions needed before Phase 2)

1. **Premium Translation with DTP** — existing XTRF "Premium Translation" / "Translation Premium + DTP" maps to T+E+P+DTP. No single `premium_translation` service exists today. Options:
   - (a) Add `premium_translation` service + `premium_translation_dtp` workflow template.
   - (b) Represent as `standard_translation` order + separate `dtp` line item.
   - Recommendation: (b) — avoids service bloat, makes DTP reusable.

2. **Clinical/pharma specialty services** — add `reconciliation`, `harmonization`, `linguistic_validation_migration`, `linguistic_validation_migration_qm`, `screenshot_review`? Or fold into existing `review`?
   - Since you said this is a real ongoing business line, recommend **adding them as distinct services** for reporting clarity.

3. **`customer_type` for government clients** — today only `'individual','business','legal'` exist. Need `'government_federal'`, `'government_provincial'`? If so, migration also adjusts the type constraint.

4. **AR eligibility rule** — original spec said business/LSP/gov. Given actual `customer_type` values, the rule becomes: `is_ar_customer = true AND customer_type IN ('business','legal')`. Confirm this covers your real AR customer base.

---

## 10. Risks

- **Backfill of `service_id`** — 91 orders / 189 quotes have NULL `service_id`. Defaulting all of them to `certified_translation` is safe for historical certified data but wrong if any legacy non-certified data exists without a service link. Spot-check before running.
- **`ai_analysis_results` misnomer** — reusing this AI-pipeline-named table for manual non-certified line items is pragmatic but confusing. Flagged for future rename / split into `order_line_items`.
- **Invoice PDF template** — likely hardcodes "Certified Translation" text.
- **Vendor portal parity** — separate repo needs coordinated release.
- **`ai_analysis_results.base_rate` default of 65.00** — per-page certified rate. When `calculation_unit != 'per_page'`, the UI must set an explicit rate; don't fall back to the default.

---

## 11. Out of scope (explicit)

- Phase/milestone tracking on orders (rejected in favor of ad-hoc invoicing)
- Role-gating for direct-order creation (all staff allowed)
- ISC service_type (client discontinued)
- Separate rate tables per service tier (deferred to subscription-model phase)
- XTRF archival beyond read-only

---

## 12. Reference: current code touchpoints

| Concern | File |
|---|---|
| Quote creation (staff) | [client/pages/admin/FastQuoteCreate.tsx](client/pages/admin/FastQuoteCreate.tsx), [supabase/functions/create-fast-quote/index.ts](supabase/functions/create-fast-quote/index.ts) |
| Quote creation (kiosk) | [client/pages/kiosk/KioskShell.tsx](client/pages/kiosk/KioskShell.tsx), [supabase/functions/create-fast-quote-kiosk/index.ts](supabase/functions/create-fast-quote-kiosk/index.ts) |
| Direct order reference pattern | [supabase/functions/crm-create-order/index.ts](supabase/functions/crm-create-order/index.ts) |
| Customer quote review | [client/pages/quote/QuoteReviewPage.tsx](client/pages/quote/QuoteReviewPage.tsx) |
| Order detail (staff) | [client/pages/admin/AdminOrderDetail.tsx](client/pages/admin/AdminOrderDetail.tsx) |
| Workflow assignment | [supabase/functions/assign-order-workflow/index.ts](supabase/functions/assign-order-workflow/index.ts), [supabase/functions/get-order-workflow/index.ts](supabase/functions/get-order-workflow/index.ts) |
| Manual invoice UI | [client/pages/admin/invoices/CreateInvoice.tsx](client/pages/admin/invoices/CreateInvoice.tsx) |
| AR dashboard | [client/pages/admin/AccountsReceivable.tsx](client/pages/admin/AccountsReceivable.tsx) |
| Invoice RPC (to be replaced) | [supabase/migrations/20260215_order_status_invoice.sql](supabase/migrations/20260215_order_status_invoice.sql) |

---

*End of revised blueprint. Next step: resolve §9 open items, then Phase 1 migration.*
