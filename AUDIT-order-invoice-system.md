# REPORT: CETHOS Order/Invoice Infrastructure Audit

**Date:** 2026-02-15
**Auditor:** Claude Code (read-only audit)
**Scope:** Order status flow, invoice system, delivery pipeline, customer invoice access

---

## 1. orders table

### Columns Present

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| order_number | text | NO | — (Format: ORD-YYYY-NNNNN) |
| quote_id | uuid | NO | FK → quotes.id |
| customer_id | uuid | NO | FK → customers.id |
| status | text | NO | — |
| work_status | text | YES | — |
| subtotal | decimal(10,2) | YES | — |
| certification_total | decimal(10,2) | YES | — |
| rush_fee | decimal(10,2) | YES | — |
| delivery_fee | decimal(10,2) | YES | — |
| tax_rate | decimal(5,4) | YES | 0.05 |
| tax_amount | decimal(10,2) | YES | — |
| total_amount | decimal(10,2) | NO | — |
| amount_paid | decimal(10,2) | YES | 0 |
| balance_due | decimal(10,2) | YES | 0 |
| balance_payment_link | text | YES | — |
| balance_payment_session_id | varchar(255) | YES | — |
| balance_payment_requested_at | timestamptz | YES | — |
| refund_amount | decimal(10,2) | YES | 0 |
| refund_status | varchar(50) | YES | — |
| overpayment_credit | decimal(10,2) | YES | 0 |
| delivery_hold | boolean | YES | — |
| cancelled_at | timestamptz | YES | — |
| created_at | timestamptz | YES | NOW() |
| updated_at | timestamptz | YES | NOW() |

**Note:** Additional columns referenced in frontend code (but not in schema reference doc) include: `is_rush`, `delivery_option`, `estimated_delivery_date`, `actual_delivery_date`, `surcharge_type`, `surcharge_value`, `surcharge_total`, `discount_type`, `discount_value`, `discount_total`, `shipping_name`, `shipping_address_line1/2`, `shipping_city`, `shipping_state`, `shipping_postal_code`, `shipping_country`, `tracking_number`. These may exist in the live database but aren't documented in the migration files.

### Status Values (from AdminOrderDetail.tsx ORDER_STATUSES)

| Value | Label | Color | Notes |
|-------|-------|-------|-------|
| pending | Pending | gray | Order created |
| paid | Paid | green | Payment received |
| balance_due | Balance Due | amber | Partial payment, balance outstanding |
| in_production | In Production | blue | Translation work in progress |
| ready_for_delivery | Ready for Delivery | teal | Work complete, awaiting delivery |
| delivered | Delivered | green | Delivered to customer |
| completed | Completed | green | Fully finished |
| cancelled | Cancelled | red | Order cancelled |
| refunded | Refunded | red | Payment refunded |

**Schema reference doc lists different values:** `pending`, `processing`, `quality_check`, `ready_for_delivery`, `delivered`, `completed`, `cancelled` — these differ from what the frontend implements. The frontend is authoritative since it's the running code.

### Work Status Values (from AdminOrderDetail.tsx WORK_STATUSES)

| Value | Label | Color |
|-------|-------|-------|
| queued | Queued | gray |
| in_progress | In Progress | blue |
| review | Review | amber |
| completed | Completed | green |

### Has CHECK Constraints

**No.** No CHECK constraints found on the orders table in any migration file. Status values are enforced only at the application level.

### Has Triggers

**No triggers found** on the orders table in any migration file.

### Sample Data

No live database access — schema reference shows format: `ORD-YYYY-NNNNN` for order_number.

---

## 2. customer_invoices table

### Exists: YES (in schema reference doc)

**IMPORTANT CAVEAT:** The `customer_invoices` table is defined in the schema reference document (`cethos-database-schema-reference.md`) and is referenced in frontend code (`InvoicesTab.tsx`, `AccountsReceivable.tsx`). However, there is **NO SQL migration file** in `supabase/migrations/` that creates this table. This means either:
- It was created manually in the Supabase SQL editor
- It was created via an earlier migration that isn't in the repo
- It exists only as a planned schema and hasn't been created yet

### Columns (from schema reference)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| invoice_number | varchar(50) | NO | Format: INV-YYYY-NNNNNN |
| order_id | uuid | NO | FK → orders.id (RESTRICT) |
| customer_id | uuid | NO | FK → customers.id |
| quote_id | uuid | YES | FK → quotes.id |
| subtotal | decimal(10,2) | NO | 0 |
| certification_total | decimal(10,2) | YES | 0 |
| rush_fee | decimal(10,2) | YES | 0 |
| delivery_fee | decimal(10,2) | YES | 0 |
| tax_rate | decimal(5,4) | YES | 0.05 |
| tax_amount | decimal(10,2) | YES | 0 |
| total_amount | decimal(10,2) | NO | 0 |
| amount_paid | decimal(10,2) | YES | 0 |
| balance_due | decimal(10,2) | NO | 0 |
| status | varchar(20) | NO | 'issued' |
| invoice_date | date | NO | CURRENT_DATE |
| due_date | date | NO | — |
| paid_at | timestamptz | YES | — |
| voided_at | timestamptz | YES | — |
| pdf_storage_path | text | YES | — |
| pdf_generated_at | timestamptz | YES | — |
| trigger_type | varchar(20) | YES | 'order' |
| notes | text | YES | — |
| created_at | timestamptz | YES | NOW() |
| updated_at | timestamptz | YES | NOW() |

### Invoice Status Values

`draft`, `issued`, `sent`, `partial`, `paid`, `void`, `cancelled`

### Trigger Types

`order`, `delivery`, `manual`

### Invoice Number Format

`INV-YYYY-NNNNNN` (6-digit zero-padded sequence)

### Row Count / Any PDFs Generated

**Unknown** — no live database access. No migration creates test data.

---

## 3. invoice_generation_queue

### Exists: YES (in schema reference doc)

Same caveat as above — defined in schema reference but **no migration file creates it**.

### Columns

| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| order_id | uuid | FK → orders.id |
| trigger_type | varchar(20) | 'delivery' |
| status | varchar(20) | 'pending' |
| error_message | text | — |
| processed_at | timestamptz | — |
| created_at | timestamptz | NOW() |

### Constraints

- UNIQUE(order_id) — one queue entry per order

### Status Values

`pending`, `processing`, `completed`, `failed`

### Row Count

**Unknown** — no live database access.

---

## 4. accounts_receivable + payments

### accounts_receivable table

- **Exists:** YES (in schema reference)
- **No migration file** creates it
- **Columns:** id, customer_id, invoice_id (FK → customer_invoices), original_amount, amount_due, amount_paid, status, due_date, created_at, updated_at
- **Status values:** outstanding, paid, partial, overdue
- **Row count:** Unknown

### payments table

- **Not explicitly defined** in schema reference or migrations
- Referenced in frontend code (e.g., `OrderSuccess.tsx` looks up by `stripe_checkout_session_id`)
- **Inferred columns:** id, order_id, amount, status, payment_method, stripe_checkout_session_id, stripe_payment_intent_id, receipt_url, created_at
- **Row count:** Unknown

### customer_payments table

- **Exists:** YES (in schema reference)
- **No migration file** creates it
- **Key columns:** id, customer_id, amount, payment_method_id/code/name, payment_date, reference_number, notes, confirmed_by_staff_id, confirmed_at, ai_allocated, ai_confidence, paystub_filename, paystub_storage_path, status, created_at, updated_at
- **Status values:** pending, completed, cancelled, refunded

### customer_payment_allocations table

- **Exists:** YES (in schema reference)
- **No migration file** creates it
- **Columns:** id, payment_id (FK → customer_payments), invoice_id (FK → customer_invoices), allocated_amount, is_ai_matched, created_at
- **Constraint:** CHECK(allocated_amount > 0)
- **Linked to invoices:** YES — directly links customer_payments to customer_invoices

### ar_payments table

- **Exists:** YES (in schema reference)
- **Columns:** id, ar_id (FK → accounts_receivable), amount, payment_method_id/code/name, payment_date, reference_number, notes, recorded_by, recorded_at, created_at

---

## 5. Edge Functions

### Deployed Functions (6 total)

| Function | Purpose | Touches Orders | Touches Invoices | Touches Payments |
|----------|---------|----------------|------------------|------------------|
| process-inbound-email | Parse customer email replies via Mailgun | NO | NO | NO |
| process-quote-documents | OCR/AI document analysis | NO | NO | NO |
| send-customer-login-otp | Magic link authentication | NO | NO | NO |
| send-email | Generic Brevo transactional email | NO | NO | NO |
| send-staff-message | Staff→customer messaging | NO | NO | NO |
| verify-customer-login-otp | Validate magic link token | NO | NO | NO |

### stripe-webhook: DOES NOT EXIST

**Critical finding.** There is no `stripe-webhook` edge function deployed or in the codebase. The entire payment-to-order creation pipeline is unimplemented.

### generate-invoice-pdf: DOES NOT EXIST

Not deployed. Not in the codebase. The `CustomerOrderDetail.tsx` calls it at `${supabaseUrl}/functions/v1/generate-invoice-pdf?order_id=${order?.id}` but this endpoint returns nothing.

### create-checkout-session: DOES NOT EXIST

Referenced in frontend checkout flows but not implemented.

### upload-staff-quote-file: DOES NOT EXIST

Referenced in `AdminOrderDetail.tsx` for staff file uploads but not implemented. The frontend code does direct Supabase storage uploads instead.

### Other Referenced-But-Missing Functions (~30)

The frontend code references numerous edge functions that don't exist:
- `create-payment-link`
- `create-invoice-checkout`
- `cancel-order`
- `handle-order-price-change`
- `confirm-manual-payment`
- `process-manual-payment`
- `record-ar-payment`
- `record-bulk-payment`
- `request-balance-payment`
- `send-payment-email`
- `review-draft-file`
- `ai-allocate-payment`
- `analyze-paystubs`
- And ~18 more

---

## 6. Frontend

### AdminOrderDetail.tsx

- **Has status dropdown:** YES — `<select>` with 9 ORDER_STATUSES values
- **Has work_status dropdown:** YES — `<select>` with 4 WORK_STATUSES values
- **Both are freely editable** via `handleStatusChange()` with a confirmation dialog
- **Delivery Hold Badge:** Displays red badge when `order.delivery_hold === true`
- **Draft file upload:** YES — can upload files as `draft_translation` category
- **Draft review tracking:** YES — shows review_status per draft file
- **"Mark as Delivered" button:** NO dedicated button — uses status dropdown to select "delivered"
- **Invoice UI in admin order detail:** NO — no invoice generation or viewing in AdminOrderDetail
- **`draft_review` status:** NOT present in ORDER_STATUSES array. Not referenced anywhere.

### AdminOrdersList.tsx

- **Status filter dropdown:** pending, paid, processing, completed, delivered, refunded, cancelled
- **Work status filter:** queued, in_progress, review, completed
- **Status badges:** Color-coded badges for each status

### Admin Invoice Pages

- **No dedicated invoice admin pages**
- **AccountsReceivable.tsx** exists with tabs: unpaid quotes, balance_due orders, AR invoices, recent payments, overdue quotes
- References `customer_invoices` and `accounts_receivable` tables

### CustomerOrderDetail.tsx

- **Shows invoice download:** YES — "Download Invoice" button calling `handleDownloadInvoice()`
- **Implementation:** Calls `generate-invoice-pdf` edge function (which doesn't exist)
- **Opens HTML in new window** for printing (the response is expected to be HTML, not PDF)
- **Status timeline:** Visual progress: Payment Confirmed → In Production → Ready → Out for Delivery → Delivered → Completed

### Customer Invoice Page

- **No standalone invoice page** — no `/dashboard/invoices` route
- **InvoicesTab component** exists (`client/components/customer/InvoicesTab.tsx`):
  - Fetches from `customer_invoices` table
  - Account summary (Total Due, Current Due, Overdue)
  - Invoice list with status badges
  - Download PDF button per invoice (downloads from `invoices` storage bucket)
  - Multi-select with "Pay Selected" button
  - Filters out void/cancelled invoices
- **Not wired into any route** — the component exists but doesn't appear to be mounted in any page

---

## 7. Storage

### Invoices Bucket

- **Referenced in code:** YES — `InvoicesTab.tsx` uses `supabase.storage.from("invoices").download(path)`
- **Defined in supabase/config.toml:** No config.toml found in the repo
- **Whether it exists in the live Supabase instance:** Unknown (no live access)
- **Access pattern:** Private bucket, requires signed URLs or authenticated download

### Existing PDF Files

- **Unknown** — no live database/storage access
- **No `generate-invoice-pdf` function exists** to create them, so likely zero PDFs exist

### Other Storage Buckets Referenced

| Bucket | Purpose |
|--------|---------|
| quote-files | Customer uploaded documents |
| quote-reference-files | Reference/supporting documents |
| ocr-uploads | OCR processing uploads |
| invoices | Generated invoice PDFs (referenced but may not exist) |

---

## 8. Invoice Number Generation

### Sequence

- `invoice_number_seq` — documented in schema reference
- Format: `INV-YYYY-NNNNNN` (year + 6-digit zero-padded)
- **No migration file creates this sequence**

### Database Functions (from schema reference)

| Function | Purpose | Status |
|----------|---------|--------|
| `generate_invoice_number()` | Returns next INV-YYYY-NNNNNN | Documented, no migration creates it |
| `create_invoice_from_order(order_uuid, trigger_type)` | Creates customer_invoice from order | Documented, no migration creates it |
| `calculate_invoice_due_date(customer_uuid)` | Due date based on payment_terms | Documented, no migration creates it |
| `apply_customer_credit(customer_id, amount, order_id, invoice_id, staff_id)` | Apply credit to invoice | Documented, no migration creates it |

---

## 9. Customer Portal Routes

### Defined Routes (from App.tsx)

| Route | Component | Invoice-Related |
|-------|-----------|-----------------|
| /dashboard | CustomerDashboard | Has "View Invoices" link → /dashboard/orders |
| /dashboard/quotes | CustomerQuotes | No |
| /dashboard/quotes/:id | CustomerQuoteDetail | No |
| /dashboard/orders | CustomerOrders | No invoices tab visible |
| /dashboard/orders/:id | CustomerOrderDetail | YES — "Download Invoice" button |
| /dashboard/documents | CustomerDocuments | No |
| /dashboard/messages | CustomerMessages | No |
| /dashboard/profile | CustomerProfile | No |

### Missing Routes

- No `/dashboard/invoices` route
- InvoicesTab component exists but is NOT wired into any page/route

---

## 10. Gaps Identified

### a) `draft_review` Order Status on Draft Upload

| Component | Status |
|-----------|--------|
| `draft_review` in ORDER_STATUSES array | **MISSING** — not in the 9-value array |
| `draft_translation` file category | **EXISTS** in frontend code (used extensively) |
| `draft_translation` in file_categories DB seed | **NOT in schema reference** — listed categories are: to_translate, reference, source, glossary, style_guide, final_deliverable. `draft_translation` is missing from the doc but used in code |
| Auto-status-change on draft upload | **MISSING** — `handleFileUpload` in AdminOrderDetail uploads files but does NOT change order status |
| Customer draft review workflow | **PARTIALLY EXISTS** — CustomerOrderDetail shows drafts with approve/request-changes UI, but `review-draft-file` edge function doesn't exist |

**What's needed:**
1. Add `draft_review` to ORDER_STATUSES array in AdminOrderDetail.tsx
2. Ensure `draft_translation` category exists in file_categories table
3. Create logic (trigger or edge function) that sets `status = 'draft_review'` when a draft_translation file is uploaded
4. Implement the `review-draft-file` edge function for customer approvals

### b) `delivered` Status on Final Upload

| Component | Status |
|-----------|--------|
| `delivered` in ORDER_STATUSES | **EXISTS** — value is present |
| Auto-status-change on final upload | **MISSING** — uploading a `final_deliverable` file does NOT auto-set status to delivered |
| "Mark as Delivered" button | **MISSING** — only manual status dropdown change |

**What's needed:**
1. Logic to auto-set `status = 'delivered'` when final_deliverable file is uploaded (or a dedicated "Deliver" button)
2. Optionally set `actual_delivery_date` on the order

### c) Auto-Invoice Generation

| Component | Status |
|-----------|--------|
| Invoice generation on delivery | **MISSING** — no trigger, no function call |
| `invoice_generation_queue` table | **DESIGNED** in schema reference but no migration creates it |
| `create_invoice_from_order()` DB function | **DESIGNED** in schema reference but no migration creates it |
| Logic: balance=0 → status 'paid', balance>0 → invoice with balance | **NOT IMPLEMENTED** |

**What's needed:**
1. Create `invoice_generation_queue` table (if not already in live DB)
2. Create `create_invoice_from_order()` database function
3. Create trigger or application logic: when order status → `delivered`, queue invoice generation
4. Invoice logic:
   - If `balance_due = 0`: Create invoice with `status = 'paid'`
   - If `balance_due > 0`: Create invoice with `status = 'issued'`, create AR record

### d) Invoice PDF Generation

| Component | Status |
|-----------|--------|
| `generate-invoice-pdf` edge function | **DOES NOT EXIST** |
| PDF template/layout | **DOES NOT EXIST** |
| `invoices` storage bucket | **REFERENCED** in code but may not exist in Supabase |
| `pdf_storage_path` column on customer_invoices | **DESIGNED** in schema |

**What's needed:**
1. Create `generate-invoice-pdf` edge function
2. Design invoice PDF template (company header, line items, tax breakdown, payment history, balance due)
3. Create `invoices` storage bucket in Supabase
4. Store generated PDF path in `customer_invoices.pdf_storage_path`
5. Update `pdf_generated_at` timestamp

### e) Customer Invoice Download from Portal

| Component | Status |
|-----------|--------|
| CustomerOrderDetail "Download Invoice" button | **EXISTS** — but calls non-existent edge function |
| InvoicesTab component | **EXISTS** — fully built with download, multi-select, pay buttons |
| InvoicesTab mounted in customer portal | **NOT WIRED** — component exists but no route/page uses it |
| `/dashboard/invoices` route | **DOES NOT EXIST** |

**What's needed:**
1. Either mount InvoicesTab in CustomerOrders page or create dedicated `/dashboard/invoices` route
2. Ensure `generate-invoice-pdf` edge function exists (see gap d)
3. Fix CustomerOrderDetail to either:
   - Download pre-generated PDF from storage (like InvoicesTab does), OR
   - Call the edge function to generate on-demand

---

## 11. Summary: Built vs. Planned vs. Missing

| Feature | Schema Designed | Migration Exists | Edge Function | Frontend UI | Fully Working |
|---------|:-:|:-:|:-:|:-:|:-:|
| orders table | YES | NO (manual) | — | YES | PARTIAL |
| Order status dropdown | YES | — | — | YES | YES |
| Work status dropdown | YES | — | — | YES | YES |
| `draft_review` status | NO | NO | NO | NO | NO |
| Auto-status on draft upload | NO | NO | NO | NO | NO |
| Auto-status on final delivery | NO | NO | NO | NO | NO |
| customer_invoices table | YES | NO | — | YES | UNKNOWN |
| invoice_generation_queue table | YES | NO | — | NO | NO |
| accounts_receivable table | YES | NO | — | YES | UNKNOWN |
| customer_payments table | YES | NO | — | YES | UNKNOWN |
| payment_allocations table | YES | NO | — | NO | NO |
| generate_invoice_number() | YES | NO | — | — | UNKNOWN |
| create_invoice_from_order() | YES | NO | — | — | UNKNOWN |
| stripe-webhook | — | — | NO | — | NO |
| create-checkout-session | — | — | NO | YES (calls it) | NO |
| generate-invoice-pdf | — | — | NO | YES (calls it) | NO |
| Invoice PDF generation | YES (pdf_storage_path) | NO | NO | YES (download UI) | NO |
| invoices storage bucket | REFERENCED | NO | — | YES (downloads from it) | UNKNOWN |
| Customer invoice list (InvoicesTab) | — | — | — | YES (built) | NOT WIRED |
| Customer invoice download | — | — | NO | YES (button exists) | NO |
| Auto-invoice on delivery | NO | NO | NO | NO | NO |

---

## 12. Critical Path for Implementation

Based on this audit, the implementation order should be:

### Phase 1: Database Foundation
1. Verify/create `customer_invoices` table in live Supabase
2. Verify/create `invoice_generation_queue` table
3. Verify/create `accounts_receivable` table
4. Verify/create `generate_invoice_number()` function
5. Verify/create `create_invoice_from_order()` function
6. Verify/create `invoice_number_seq` sequence
7. Ensure `draft_translation` exists in `file_categories` table
8. Create `invoices` storage bucket if it doesn't exist

### Phase 2: Status Flow
1. Add `draft_review` to ORDER_STATUSES in AdminOrderDetail.tsx and AdminOrdersList.tsx
2. Add logic: on draft_translation upload → set order status to `draft_review`
3. Add logic: on final_deliverable upload → set order status to `delivered`
4. Implement customer draft review (approve/request-changes) edge function

### Phase 3: Invoice Generation
1. Create `generate-invoice-pdf` edge function (HTML → PDF or direct PDF generation)
2. Create invoice-on-delivery logic: when status → `delivered`:
   - Create customer_invoice record
   - If balance_due = 0 → invoice status = 'paid'
   - If balance_due > 0 → invoice status = 'issued', create AR record
3. Generate and store PDF in `invoices` bucket

### Phase 4: Customer Access
1. Wire InvoicesTab into customer portal (new route or tab in CustomerOrders)
2. Fix CustomerOrderDetail invoice download to use stored PDFs
3. Add `/dashboard/invoices` route

---

*End of audit. This report is read-only — no code or data was modified.*
