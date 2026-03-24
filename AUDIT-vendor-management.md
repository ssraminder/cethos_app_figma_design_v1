# Audit: Admin Panel — Vendor Management Features

Performed: 2026-03-24 (updated)

Comprehensive audit of the Cethos translation management app — what vendor management features are built vs missing. Covers Supabase backend (tables, edge functions) and React frontend (admin pages, components). Verified against live Supabase database and 143 deployed edge functions.

---

## Backend (Supabase) — Database Tables

| Table | Exists | Rows | RLS | Notes |
|-------|--------|------|-----|-------|
| `vendors` | YES | 1,463 | yes | Full profile schema incl. preferred_rate_currency, tax_id, tax_rate, certifications JSONB |
| `vendor_language_pairs` | YES | 5,185 | no | vendor_id, source_language, target_language, is_active, notes |
| `vendor_rates` | YES | 762 | no | vendor_id, service_id, calculation_unit, rate, currency, rate_cad, minimum_charge, source, is_active, valid_from, valid_until, added_by |
| `vendor_payment_info` | YES | 0 | no | vendor_id, payment_currency, payment_method, payment_details JSONB, invoice_notes. Tax fields removed (now on vendors) |
| `vendor_auth` | YES | 1 | yes | Password hash storage |
| `vendor_otp` | YES | 4 | yes | OTP codes |
| `vendor_sessions` | YES | 8 | yes | Session tokens |
| `services` | YES | 45 | no | 6 categories: translation, review_qa, interpretation, multimedia, technology, other |
| `currencies` | YES | 78 | no | 26 BoC-tracked with live rates, rest static estimates |
| `xtrf_language_map` | YES | 314 | no | XTRF language ID to ISO code |
| `vendor_jobs` | **NO** | -- | -- | Does not exist as dedicated table |

### Workflow Engine Tables

| Table | Exists | Rows | Notes |
|-------|--------|------|-------|
| `workflow_templates` | YES | 9 | Reusable process definitions |
| `workflow_template_steps` | YES | 33 | Ordered steps within templates |
| `order_workflows` | YES | 0 | Runtime instances per order |
| `order_workflow_steps` | YES | 0 | Concrete vendor jobs/tasks per order |

---

## Backend (Supabase) — Edge Functions

### Vendor Auth & Portal (all 18 deployed)

| Function | Deployed | Source in Repo |
|----------|----------|----------------|
| `vendor-auth-otp-send` | YES | YES |
| `vendor-auth-otp-verify` | YES | no |
| `vendor-auth-password` | YES | no |
| `vendor-auth-session` | YES | no |
| `vendor-auth-logout` | YES | no |
| `vendor-auth-check` | YES | no |
| `vendor-auth-activate` | YES | no |
| `vendor-auth-invite` | YES | no |
| `vendor-set-password` | YES | no |
| `vendor-update-profile` | YES | no |
| `vendor-verify-phone` | YES | no |
| `vendor-invitation-reminder` | YES | YES |
| `import-applicant-vendors` | YES | no |
| `import-vendor-lang-rates` | YES | no |
| `xtrf-sync-vendor-lp` | YES | no |
| `xtrf-sync-vendors` | YES | no |
| `cvp-prescreen-application` | YES | no |
| `cvp-submit-application` | YES | no |

**Source code gap:** Only 2 of 18 have source in this repo.

### Workflow Engine Functions (all 4 deployed)

| Function | Deployed | Source in Repo | Called in Frontend |
|----------|----------|----------------|-------------------|
| `assign-order-workflow` | YES | no | YES (OrderWorkflowSection.tsx:586) |
| `get-order-workflow` | YES | no | YES (OrderWorkflowSection.tsx:771) |
| `update-workflow-step` | YES | no | YES (OrderWorkflowSection.tsx:791) |
| `manage-workflow-templates` | YES | no | NO (no UI exists) |

### Vendor Portal Self-Service Functions (discovered, not in original checklist)

| Function | Deployed |
|----------|----------|
| `vendor-accept-job` | YES |
| `vendor-decline-job` | YES |
| `vendor-get-invoice-pdf` | YES |
| `vendor-get-invoices` | YES |
| `vendor-get-jobs` | YES |
| `vendor-get-profile` | YES |
| `vendor-get-source-files` | YES |
| `vendor-update-availability` | YES |
| `vendor-update-language-pairs` | YES |
| `vendor-update-rates` | YES |
| `vendor-update-payment-info` | YES |
| `vendor-upload-certification` | YES |
| `vendor-upload-delivery` | YES |

### Admin Functions — NOT BUILT

| Function | Status | Notes |
|----------|--------|-------|
| `get-vendors-list` | **NO** | Frontend queries DB directly via Supabase client |
| `get-vendor-detail` | **NO** | Frontend queries DB directly via Supabase client |
| `update-vendor-rates` (admin) | **NO** | `vendor-update-rates` exists for self-service only |
| `update-vendor-payment-info` (admin) | **NO** | `vendor-update-payment-info` exists for self-service only |
| `find-matching-vendors` | **NO** | No LP+service+availability matching |
| Vendor performance/rating calc | **NO** | No automated system |

---

## Frontend — Audit Results

### Admin Vendor List Page

- **Route:** `/admin/vendors` — YES (`client/App.tsx:327`)
- **Component:** `AdminVendorsList` — YES (`client/pages/admin/AdminVendorsList.tsx`, 890 lines)

| Feature | Status | Notes |
|---------|--------|-------|
| Table/grid showing vendor list | **YES** | Name, Email, Languages, Country, Jobs, Last Active, Rates, Status, Availability, Portal, Actions |
| Search by name/email | **YES** | Also searches city, country |
| Filter by status | **YES** | active, inactive, pending_review, suspended, applicant |
| Filter by language pair | **YES** | Target language filter |
| Filter by service type | **NO** | Not implemented (has vendor_type filter: translator/reviewer/both) |
| Filter by country | **YES** | Dynamic from DB |
| Pagination | **YES** | 25 per page |
| Quick actions (activate/deactivate) | **NO** | Only "Edit" link to detail page |
| Quick action: send invitation | **YES** | Bulk send via checkbox selection |
| Link to vendor detail | **YES** | Click row or edit icon |

### Admin Vendor Detail Page

- **Route:** `/admin/vendors/:vendorId` — YES (`client/App.tsx:328`)
- **Component:** `AdminVendorDetail` — YES (`client/pages/admin/AdminVendorDetail.tsx`, 1055 lines)
- **Layout:** Single scrolling page with Cards — **NOT tabbed**

#### Profile Section

| Feature | Status | Notes |
|---------|--------|-------|
| Display name, email, phone, country, city, province | **YES** | All present. Inline editing for all except email |
| Display vendor_type, years_experience, rating | **YES** | rating is read-only StarRating component |
| Display certifications (JSONB) | **NO** | In TypeScript interface but never rendered |
| Display notes | **YES** | Internal Notes card, read/write |
| Edit all profile fields inline | **YES** | Edit/Save/Cancel button toggle |
| Activate/deactivate toggle | **PARTIAL** | Status dropdown (not a simple toggle) |
| Preferred rate currency dropdown | **NO** | Not present |
| Tax ID (GST/HST/VAT) text field | **NO** | Not present |
| Tax rate numeric field | **NO** | Not present |
| Country — searchable dropdown | **NO** | Plain text input, not searchable dropdown |

#### Languages Section

| Feature | Status | Notes |
|---------|--------|-------|
| List all language pairs | **YES** | Read-only table |
| Show source (xtrf vs self_reported) | **NO** | Only shows "Language data synced from XTRF" message |
| Add new language pair | **NO** | No add UI |
| Remove/deactivate language pair | **NO** | No remove UI |
| Same source+target validation | **N/A** | No add functionality exists |

#### Rates Section

| Feature | Status | Notes |
|---------|--------|-------|
| List all rates grouped by service | **YES** | Read-only table, service_name column |
| Show rate, unit, currency | **YES** | rate.toFixed(4), calculation_unit, currency |
| Rates in preferred_rate_currency | **NO** | Shown in original currency |
| Add new rate | **NO** | No add UI |
| Edit existing rate | **NO** | No edit UI |
| Deactivate rate | **NO** | No deactivate UI (only shows is_active=true) |

#### Payment Section

| Feature | Status | Notes |
|---------|--------|-------|
| Read/write vendor_payment_info | **NO** | Only payment_method field on vendors table |
| Payment currency dropdown | **NO** | Not present |
| Payment method selector | **PARTIAL** | Simple text input, not a dropdown with predefined options |
| Dynamic payment details form | **NO** | No payment_details form at all |
| Invoice notes field | **NO** | Not present |
| No tax fields on payment tab | **YES** (correct) | Tax fields absent everywhere |

#### Portal Access Section

| Feature | Status | Notes |
|---------|--------|-------|
| Show invitation status | **PARTIAL** | sent_at and reminder_count shown; accepted_at NOT displayed |
| Show auth status | **PARTIAL** | password_set_at and must_reset shown; no last_login |
| Re-send invitation button | **YES** | Calls vendor-auth-otp-send |
| Send reminder button | **NO** | Reminders are cron-only |
| Force password reset | **YES** | Present |
| Revoke portal access | **YES** | Present |

### Admin Vendor Create/Import

| Feature | Status | Notes |
|---------|--------|-------|
| New vendor creation form | **STUB** | "Add Vendor" button opens modal saying "Coming soon" |
| Bulk vendor import from CSV | **NO** | Not implemented |

### Admin Order Detail — Workflow Pipeline

| Feature | Status | File |
|---------|--------|------|
| WorkflowPipeline visual component | **YES** | OrderWorkflowSection.tsx:663-758 |
| TemplateSelector (no workflow assigned) | **YES** | OrderWorkflowSection.tsx:567-659 |
| StepDetailPanel (click step to edit) | **YES** | OrderWorkflowSection.tsx:247-563 |
| VendorPickerModal (assign vendor) | **YES** | OrderWorkflowSection.tsx:142-243 |
| Calls get-order-workflow | **YES** | Line 771 |
| Calls assign-order-workflow | **YES** | Line 586 |
| Calls update-workflow-step | **YES** | Line 791 |

### Admin Vendor-Related Settings

| Feature | Status | Notes |
|---------|--------|-------|
| Services management page | **NO** | No ServicesSettings component exists |
| Workflow template management | **NO** | manage-workflow-templates deployed but no UI calls it |
| Language pairs management (global) | **YES** | `/admin/settings/languages` |
| Payment methods settings | **YES** | `/admin/settings/payment-methods` |

### Reusable Components — Currency & Language Dropdowns

| Feature | Status | Notes |
|---------|--------|-------|
| Reusable currency dropdown (from currencies table) | **NO** | Only hardcoded CURRENCY_MAP in VendorInvoices (4 currencies) |
| Currency format "CAD - Canadian Dollar ($)" | **NO** | Only shows codes |
| Searchable language dropdown with locales | **NO** | Basic text filter in LanguagesSettings, no locale grouping |
| Language locale grouping (EN-US, FR-CA, etc.) | **NO** | Not implemented |

### Additional Vendor Page

- **Vendor Invoices:** `/admin/invoices/vendor` -> `VendorInvoices.tsx` (XTRF invoice cache display)

---

## Summary: What's Built vs Missing

### FULLY BUILT
1. Vendor list page with search, filters, pagination, stats
2. Vendor detail — profile editing (name, phone, location, status, type, availability, notes)
3. Portal access management (invitations, password reset, revoke)
4. Workflow pipeline UI (visual steps, template picker, step detail panel, vendor picker)
5. All 18 original vendor edge functions deployed
6. All 4 workflow engine edge functions deployed
7. 13 vendor portal self-service edge functions deployed
8. Language and payment method settings pages

### PARTIALLY BUILT
1. Language pairs section — display only, no CRUD
2. Rates section — display only, no CRUD
3. Payment section — payment_method text input only, no payment_details/currency/invoice_notes
4. Add Vendor — button exists, modal is "Coming soon" stub
5. Invitation status — missing accepted_at display and manual reminder button

### NOT BUILT — Frontend
- **Vendor Detail — Profile:**
  - Certifications display/management
  - Preferred rate currency dropdown (from currencies table)
  - Tax ID field, Tax rate field
  - Country as searchable dropdown (currently plain text)
  - Tabbed layout (currently single scrolling page)
- **Vendor Detail — Languages:**
  - Add/remove/deactivate language pairs
  - Source indicator (xtrf vs self_reported)
  - Searchable language dropdowns with locale grouping
  - Same source+target validation
- **Vendor Detail — Rates:**
  - Add/edit/deactivate rates
  - Display in preferred_rate_currency
- **Vendor Detail — Payment:**
  - Payment currency dropdown from currencies table
  - Payment method selector (predefined options)
  - Dynamic payment details form (Interac/Wire/PayPal/Direct Deposit/Wise/Cheque)
  - Invoice notes field
- **Vendor List:**
  - Service type filter
  - Quick activate/deactivate from list
- **Vendor Create/Import:**
  - Manual vendor creation form
  - Bulk CSV import
- **Settings:**
  - Services management page (CRUD on services table)
  - Workflow template management UI
- **Reusable Components:**
  - Currency searchable dropdown (from currencies table, format: "CAD - Canadian Dollar ($)")
  - Language searchable dropdown with locale grouping

### NOT BUILT — Backend
- `get-vendors-list` edge function (admin search/filter/paginate)
- `get-vendor-detail` edge function (admin full profile with joins)
- `update-vendor-rates` (admin version)
- `update-vendor-payment-info` (admin version)
- `find-matching-vendors` edge function
- Vendor performance/rating calculation system

### SOURCE CODE GAP
16 of 18 vendor auth edge functions + all 4 workflow functions + all 13 vendor portal functions are deployed to Supabase but have NO source code in this repository. Only `vendor-auth-otp-send` and `vendor-invitation-reminder` have local source.

---

## Key Files

| File | Purpose |
|------|---------|
| `client/App.tsx` | Route definitions (lines 327-328 for vendor routes) |
| `client/pages/admin/AdminVendorsList.tsx` | Vendor list page (890 lines) |
| `client/pages/admin/AdminVendorDetail.tsx` | Vendor detail page (1055 lines) |
| `client/components/admin/OrderWorkflowSection.tsx` | Workflow pipeline + vendor assignment (852 lines) |
| `client/pages/admin/invoices/VendorInvoices.tsx` | Vendor invoice display |
| `client/lib/supabase.ts` | Supabase client config |
| `supabase/functions/vendor-auth-otp-send/index.ts` | Invitation sending |
| `supabase/functions/vendor-invitation-reminder/index.ts` | Cron reminder emails |
| `supabase/migrations/20260324_vendor_invitation_tracking.sql` | Invitation tracking schema |

---

## Verification
Audit performed by:
1. Querying live Supabase for all 143 deployed edge functions — confirmed all vendor/workflow functions exist
2. Querying live Supabase for all tables with row counts and schemas
3. Full read of AdminVendorDetail.tsx (1055 lines), AdminVendorsList.tsx (890 lines), OrderWorkflowSection.tsx (852 lines)
4. Codebase-wide search for currency dropdowns, language dropdowns, services settings, workflow template management
