# CETHOS Database Schema Reference

**Generated:** 2026-02-03
**Database:** Supabase (PostgreSQL)
**Total Tables:** 40+
**Total Views:** 2
**Total Functions:** 25+

---

## Quick Reference

### Core Business Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `quotes` | Customer quotes | id, quote_number, customer_id, status, total |
| `orders` | Paid orders | id, order_number, quote_id, status, total_amount |
| `customers` | Customer info | id, email, full_name, phone, credit_balance |
| `quote_files` | Uploaded documents | id, quote_id, original_filename, storage_path |
| `ai_analysis_results` | AI document analysis | id, quote_file_id, detected_language, word_count |

### Payment & Invoicing Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `customer_invoices` | Generated invoices | id, invoice_number, order_id, total_amount |
| `customer_payments` | Bulk payments | id, customer_id, amount, payment_method_id |
| `payment_methods` | Payment options | id, code, name, is_online |
| `payment_requests` | Stripe payment links | id, customer_id, amount, stripe_payment_link_url |
| `refunds` | Refund tracking | id, order_id, amount, status |

### Document Grouping Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `quote_document_groups` | Document groups | id, quote_id, group_number, complexity, line_total |
| `quote_page_group_assignments` | Page-to-group mapping | id, group_id, file_id, page_id |
| `quote_pages` | Individual pages | id, quote_file_id, page_number, word_count |

### Reference Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `languages` | Supported languages | id, name, code, tier, multiplier |
| `certification_types` | Certification options | id, code, name, price |
| `tax_rates` | Provincial tax rates | id, region_code, rate |
| `delivery_options` | Delivery methods | id, code, name, price |

---

## Table: quotes

Main table for customer quotes/orders before payment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| quote_number | text | NO | | Format: QT-YYYY-NNNNN |
| status | text | NO | 'draft' | See status values below |
| customer_id | uuid | YES | | FK → customers.id |
| source_language_id | uuid | YES | | FK → languages.id |
| target_language_id | uuid | YES | | FK → languages.id |
| intended_use_id | uuid | YES | | FK → intended_uses.id |
| country_of_issue | text | YES | | Country where docs issued |
| special_instructions | text | YES | | Customer notes |
| subtotal | decimal(10,2) | YES | | Pre-tax total |
| certification_total | decimal(10,2) | YES | | Total certification fees |
| rush_fee | decimal(10,2) | YES | 0 | Rush delivery fee |
| tax_rate_id | uuid | YES | | FK → tax_rates.id |
| tax_rate | decimal(6,4) | YES | 0.05 | Tax rate decimal |
| tax_amount | decimal(10,2) | YES | | Calculated tax |
| total | decimal(10,2) | YES | | Grand total |
| calculated_totals | jsonb | YES | | Cached totals for frontend |
| is_rush | boolean | YES | false | Rush delivery flag |
| turnaround_type | varchar(20) | YES | 'standard' | standard/rush/same_day |
| payment_method_id | uuid | YES | | FK → payment_methods.id |
| payment_confirmed_at | timestamptz | YES | | When payment confirmed |
| payment_confirmed_by_staff_id | uuid | YES | | FK → staff_users.id |
| billing_address | jsonb | YES | | Billing address object |
| shipping_address | jsonb | YES | | Shipping address object |
| selected_pickup_location_id | uuid | YES | | FK → pickup_locations.id |
| physical_delivery_option_id | uuid | YES | | FK → delivery_options.id |
| digital_delivery_options | uuid[] | YES | [] | Array of delivery option IDs |
| language_multiplier_override | decimal(4,2) | YES | | Staff override multiplier |
| deleted_at | timestamptz | YES | | Soft delete timestamp |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Quote Status Values:**
- `draft` - Initial state, documents being uploaded
- `details_pending` - Waiting for customer to fill details
- `quote_ready` - Quote calculated, awaiting payment
- `awaiting_payment` - Payment initiated
- `paid` - Payment received
- `in_progress` - Translation in progress
- `completed` - Work delivered

**Foreign Keys:**
- customer_id → customers.id
- source_language_id → languages.id
- target_language_id → languages.id
- intended_use_id → intended_uses.id
- tax_rate_id → tax_rates.id
- payment_method_id → payment_methods.id
- selected_pickup_location_id → pickup_locations.id
- physical_delivery_option_id → delivery_options.id

---

## Table: quote_files

Uploaded files for quotes.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| quote_id | uuid | NO | | FK → quotes.id |
| original_filename | text | NO | | Original file name |
| storage_path | text | NO | | Supabase storage path |
| file_size | integer | NO | | File size in bytes |
| mime_type | text | NO | | MIME type |
| upload_status | text | NO | 'pending' | pending/uploaded/failed |
| ai_processing_status | varchar(20) | YES | 'skipped' | pending/processing/completed/failed/skipped |
| file_category_id | uuid | YES | | FK → file_categories.id |
| deleted_at | timestamptz | YES | | Soft delete |
| created_at | timestamptz | YES | NOW() | |

**Foreign Keys:**
- quote_id → quotes.id (CASCADE)
- file_category_id → file_categories.id

---

## Table: quote_pages

Individual pages extracted from quote files.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| quote_file_id | uuid | NO | | FK → quote_files.id |
| page_number | integer | NO | | 1-indexed page number |
| word_count | integer | YES | 0 | OCR word count |
| thumbnail_path | text | YES | | Storage path for thumbnail |
| storage_path | text | YES | | Storage path for page image |
| ocr_text | text | YES | | Raw OCR text |
| created_at | timestamptz | YES | NOW() | |

**Foreign Keys:**
- quote_file_id → quote_files.id (CASCADE)

**Constraints:**
- UNIQUE(quote_file_id, page_number)

---

## Table: ai_analysis_results

AI document analysis results.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| quote_id | uuid | NO | | FK → quotes.id |
| quote_file_id | uuid | YES | | FK → quote_files.id (null for manual entries) |
| file_id | uuid | YES | | Alias for quote_file_id |
| detected_language | text | YES | | ISO 639-1 code |
| language_confidence | decimal(5,4) | YES | | AI confidence score |
| detected_document_type | text | YES | | e.g. "Birth Certificate" |
| document_type_other | text | YES | | Custom type when "Other" |
| document_type_confidence | decimal(5,4) | YES | | AI confidence score |
| assessed_complexity | varchar(10) | YES | 'easy' | easy/medium/hard |
| complexity_multiplier | decimal(5,2) | YES | 1.0 | 1.0/1.15/1.25 |
| complexity_confidence | decimal(5,4) | YES | | AI confidence score |
| word_count | integer | YES | 0 | Total words |
| page_count | integer | YES | 1 | Total pages |
| billable_pages | decimal(10,2) | YES | | words / 225 * complexity |
| base_rate | decimal(10,2) | YES | 65.00 | Per-page rate |
| line_total | decimal(10,2) | YES | | billable_pages * base_rate + cert |
| certification_type_id | uuid | YES | | FK → certification_types.id |
| certification_price | decimal(10,2) | YES | 0 | Certification fee |
| extracted_holder_name | text | YES | | Document holder name |
| extracted_holder_name_normalized | text | YES | | Lowercase normalized |
| extracted_holder_dob | text | YES | | Date of birth |
| extracted_document_number | text | YES | | Doc number |
| extracted_issuing_country | text | YES | | Country code |
| holder_extraction_confidence | decimal(5,4) | YES | | AI confidence |
| country_of_issue | text | YES | | Country where issued |
| is_multi_document | boolean | YES | false | Multiple docs in file |
| processing_status | varchar(20) | YES | 'pending' | |
| ocr_provider | text | YES | | google_document_ai, etc. |
| ocr_confidence | decimal(5,2) | YES | | OCR confidence |
| llm_model | text | YES | | AI model used |
| processing_time_ms | integer | YES | | Processing duration |
| manual_filename | text | YES | | Name for manual entries |
| is_staff_created | boolean | YES | false | Staff-created flag |
| created_by_staff_id | uuid | YES | | FK → staff_users.id |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Foreign Keys:**
- quote_id → quotes.id (CASCADE)
- quote_file_id → quote_files.id (CASCADE)
- certification_type_id → certification_types.id

---

## Table: quote_document_groups

Document groups for grouping pages/files by document.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| quote_id | uuid | NO | | FK → quotes.id |
| group_number | integer | NO | | Sequential group number |
| group_label | varchar(255) | YES | | e.g. "Birth Certificate - Maria" |
| document_type | varchar(100) | YES | | Document type |
| complexity | varchar(50) | YES | 'easy' | easy/medium/hard |
| complexity_multiplier | decimal(5,2) | YES | 1.0 | |
| total_pages | integer | YES | 0 | Cached page count |
| total_word_count | integer | YES | 0 | Cached word count |
| billable_pages | decimal(10,2) | YES | 0 | Cached billable pages |
| line_total | decimal(10,2) | YES | 0 | Cached line total |
| certification_type_id | uuid | YES | | FK → certification_types.id |
| certification_price | decimal(10,2) | YES | 0 | |
| is_ai_suggested | boolean | YES | false | AI-created group |
| ai_confidence | decimal(5,4) | YES | | AI confidence |
| analysis_status | varchar(50) | YES | 'pending' | |
| last_analyzed_at | timestamptz | YES | | |
| created_by_staff_id | uuid | YES | | FK → staff_users.id |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Foreign Keys:**
- quote_id → quotes.id (CASCADE)
- certification_type_id → certification_types.id

**Constraints:**
- UNIQUE(quote_id, group_number)

---

## Table: quote_page_group_assignments

Links files/pages to document groups.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| quote_id | uuid | NO | | FK → quotes.id |
| group_id | uuid | NO | | FK → quote_document_groups.id |
| file_id | uuid | YES | | FK → quote_files.id (XOR with page_id) |
| page_id | uuid | YES | | FK → quote_pages.id (XOR with file_id) |
| sequence_order | integer | YES | 0 | Order within group |
| word_count_override | integer | YES | | Manual word count |
| assigned_by_ai | boolean | YES | false | AI-assigned flag |
| assigned_by_staff_id | uuid | YES | | FK → staff_users.id |
| assigned_at | timestamptz | YES | NOW() | |

**Foreign Keys:**
- quote_id → quotes.id (CASCADE)
- group_id → quote_document_groups.id (CASCADE)
- file_id → quote_files.id (CASCADE)
- page_id → quote_pages.id (CASCADE)

**Constraints:**
- CHECK: (file_id IS NOT NULL AND page_id IS NULL) OR (file_id IS NULL AND page_id IS NOT NULL)
- UNIQUE(quote_id, file_id)
- UNIQUE(quote_id, page_id)

---

## Table: orders

Paid orders converted from quotes.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| order_number | text | NO | | Format: ORD-YYYY-NNNNN |
| quote_id | uuid | NO | | FK → quotes.id |
| customer_id | uuid | NO | | FK → customers.id |
| status | text | NO | | Order status |
| subtotal | decimal(10,2) | YES | | |
| certification_total | decimal(10,2) | YES | | |
| rush_fee | decimal(10,2) | YES | | |
| delivery_fee | decimal(10,2) | YES | | |
| tax_rate | decimal(5,4) | YES | 0.05 | |
| tax_amount | decimal(10,2) | YES | | |
| total_amount | decimal(10,2) | NO | | |
| amount_paid | decimal(10,2) | YES | 0 | |
| balance_due | decimal(10,2) | YES | 0 | |
| balance_payment_link | text | YES | | Stripe checkout URL |
| balance_payment_session_id | varchar(255) | YES | | Stripe session ID |
| balance_payment_requested_at | timestamptz | YES | | |
| refund_amount | decimal(10,2) | YES | 0 | Total refunded |
| refund_status | varchar(50) | YES | | pending/processing/completed/failed |
| overpayment_credit | decimal(10,2) | YES | 0 | Credited amount |
| cancelled_at | timestamptz | YES | | Cancellation timestamp |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Order Status Values:**
- `pending` - Order created
- `processing` - In translation
- `quality_check` - QC in progress
- `ready_for_delivery` - Ready to deliver
- `delivered` - Delivered to customer
- `completed` - Finished
- `cancelled` - Cancelled

**Foreign Keys:**
- quote_id → quotes.id
- customer_id → customers.id

---

## Table: customers

Customer records.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| auth_user_id | uuid | YES | | FK → auth.users.id |
| email | text | NO | | Customer email |
| full_name | text | NO | | Full name |
| phone | text | YES | | Phone number |
| customer_type | text | NO | 'individual' | individual/business |
| company_name | text | YES | | For business customers |
| credit_balance | decimal(10,2) | YES | 0 | Account credit |
| is_ar_customer | boolean | YES | false | AR customer flag |
| payment_terms | varchar(20) | YES | 'immediate' | immediate/net_15/net_30/net_60 |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

---

## Table: languages

Supported languages with pricing tiers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| name | text | NO | | English name |
| native_name | text | YES | | Native script name |
| code | varchar(10) | NO | | ISO 639-1/639-2 code |
| tier | integer | YES | 1 | Complexity tier 1-3 |
| multiplier | decimal(4,2) | YES | 1.0 | Price multiplier |
| is_active | boolean | YES | true | |
| created_at | timestamptz | YES | NOW() | |

**Language Tiers:**
- Tier 1 (1.0x): Latin script languages (en, es, fr, de, etc.)
- Tier 2 (1.25x): Complex scripts (zh, ja, ko, ar, hi, etc.)
- Tier 3 (1.5x): Rare/specialized languages

---

## Table: staff_users

Staff/admin users.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| auth_user_id | uuid | NO | | FK → auth.users.id |
| email | text | NO | | Staff email |
| full_name | text | NO | | Full name |
| role | text | NO | | admin/super_admin/reviewer/senior_reviewer/accountant |
| is_active | boolean | YES | true | |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Staff Roles:**
- `super_admin` - Full system access
- `admin` - Administrative access
- `senior_reviewer` - Senior HITL reviewer
- `reviewer` - HITL reviewer
- `accountant` - Financial access

---

## Table: certification_types

Available certification options.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| code | varchar(50) | NO | | Unique code |
| name | text | NO | | Display name |
| description | text | YES | | Description |
| price | decimal(10,2) | NO | | Certification fee |
| is_default | boolean | YES | false | Default selection |
| is_active | boolean | YES | true | |
| sort_order | integer | YES | 0 | Display order |
| created_at | timestamptz | YES | NOW() | |

---

## Table: tax_rates

Provincial/regional tax rates.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| region_type | varchar(20) | NO | | 'province', 'country' |
| region_code | varchar(10) | NO | | AB, BC, ON, etc. |
| region_name | text | NO | | Full name |
| tax_name | text | NO | | GST, HST, GST+PST, etc. |
| rate | decimal(6,4) | NO | | Decimal rate (0.05 = 5%) |
| is_active | boolean | YES | true | |
| effective_from | date | YES | | |

**Canadian Rates:**
- AB: GST 5%
- BC: GST+PST 12%
- ON: HST 13%
- QC: GST+QST 14.975%

---

## Table: payment_methods

Available payment options.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| code | varchar(50) | NO | | Unique code |
| name | varchar(100) | NO | | Display name |
| description | text | YES | | |
| is_online | boolean | YES | false | Online payment flag |
| requires_staff_confirmation | boolean | YES | false | Needs staff confirm |
| is_active | boolean | YES | true | |
| display_order | integer | YES | 0 | |
| icon | varchar(50) | YES | | Icon name |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Payment Method Codes:**
- `online` - Online card payment (Stripe)
- `cash` - Cash at office
- `terminal` - Card terminal at office
- `etransfer` - Interac e-Transfer
- `cheque` - Cheque payment
- `invoice` - Invoice (Net 30) for AR customers

---

## Table: delivery_options

Delivery method options.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| code | varchar(50) | NO | | Unique code |
| name | text | NO | | Display name |
| description | text | YES | | |
| price | decimal(10,2) | YES | 0 | Delivery fee |
| estimated_days | integer | YES | | Estimated delivery days |
| is_physical | boolean | YES | false | Physical delivery |
| requires_address | boolean | YES | false | Needs shipping address |
| delivery_type | varchar(20) | YES | 'digital' | online/ship/pickup |
| delivery_group | varchar(20) | YES | 'digital' | digital/physical |
| category | varchar(50) | YES | 'delivery' | delivery/turnaround |
| multiplier | decimal(4,2) | YES | 1.00 | Price multiplier |
| days_reduction | integer | YES | 0 | Days faster |
| is_rush | boolean | YES | false | Rush delivery flag |
| is_always_selected | boolean | YES | false | Auto-selected |
| is_active | boolean | YES | true | |
| sort_order | integer | YES | 0 | |
| created_at | timestamptz | YES | NOW() | |

**Delivery Option Codes:**
- `email` - Email delivery (digital)
- `online_portal` - Portal download (digital)
- `pickup` - Office pickup (physical)
- `regular_mail` - Regular mail (physical)
- `priority_mail` - Priority mail (physical)
- `express_courier` - Express courier (physical)
- `standard` - Standard turnaround
- `rush` - Rush (+30%, 1 day faster)
- `same_day` - Same-day (+100%)

---

## Table: customer_invoices

Generated invoices for orders.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| invoice_number | varchar(50) | NO | | Format: INV-YYYY-NNNNNN |
| order_id | uuid | NO | | FK → orders.id |
| customer_id | uuid | NO | | FK → customers.id |
| quote_id | uuid | YES | | FK → quotes.id |
| subtotal | decimal(10,2) | NO | 0 | |
| certification_total | decimal(10,2) | YES | 0 | |
| rush_fee | decimal(10,2) | YES | 0 | |
| delivery_fee | decimal(10,2) | YES | 0 | |
| tax_rate | decimal(5,4) | YES | 0.05 | |
| tax_amount | decimal(10,2) | YES | 0 | |
| total_amount | decimal(10,2) | NO | 0 | |
| amount_paid | decimal(10,2) | YES | 0 | |
| balance_due | decimal(10,2) | NO | 0 | |
| status | varchar(20) | NO | 'issued' | draft/issued/sent/partial/paid/void/cancelled |
| invoice_date | date | NO | CURRENT_DATE | |
| due_date | date | NO | | |
| paid_at | timestamptz | YES | | |
| voided_at | timestamptz | YES | | |
| pdf_storage_path | text | YES | | |
| pdf_generated_at | timestamptz | YES | | |
| trigger_type | varchar(20) | YES | 'order' | order/delivery/manual |
| notes | text | YES | | |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Foreign Keys:**
- order_id → orders.id (RESTRICT)
- customer_id → customers.id
- quote_id → quotes.id

---

## Table: customer_payments

Bulk customer payments.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| customer_id | uuid | NO | | FK → customers.id |
| amount | decimal(10,2) | NO | | Payment amount |
| payment_method_id | uuid | YES | | FK → payment_methods.id |
| payment_method_code | varchar(50) | YES | | |
| payment_method_name | varchar(100) | YES | | |
| payment_date | date | NO | | |
| reference_number | varchar(255) | YES | | Cheque #, transaction ID |
| notes | text | YES | | |
| confirmed_by_staff_id | uuid | YES | | FK → staff_users.id |
| confirmed_at | timestamptz | YES | | |
| ai_allocated | boolean | YES | false | AI-allocated flag |
| ai_confidence | decimal(3,2) | YES | | |
| paystub_filename | text | YES | | |
| paystub_storage_path | text | YES | | |
| status | varchar(20) | YES | 'completed' | pending/completed/cancelled/refunded |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Foreign Keys:**
- customer_id → customers.id (CASCADE)
- payment_method_id → payment_methods.id

---

## Table: customer_payment_allocations

Links payments to invoices.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| payment_id | uuid | NO | | FK → customer_payments.id |
| invoice_id | uuid | NO | | FK → customer_invoices.id |
| allocated_amount | decimal(10,2) | NO | | Amount applied |
| is_ai_matched | boolean | YES | false | AI-matched flag |
| created_at | timestamptz | YES | NOW() | |

**Constraints:**
- CHECK(allocated_amount > 0)

---

## Table: customer_credit_log

Customer credit balance history.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| customer_id | uuid | NO | | FK → customers.id |
| amount | decimal(10,2) | NO | | Credit change (+ or -) |
| type | varchar(20) | NO | | credit_added/credit_used/credit_expired/credit_refunded |
| source | varchar(50) | YES | | overpayment/refund/promo/manual/order_applied |
| payment_id | uuid | YES | | |
| order_id | uuid | YES | | FK → orders.id |
| invoice_id | uuid | YES | | FK → customer_invoices.id |
| notes | text | YES | | |
| created_by_staff_id | uuid | YES | | FK → staff_users.id |
| created_at | timestamptz | YES | NOW() | |

---

## Table: payment_requests

Stripe payment links for collecting balances.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| customer_id | uuid | NO | | FK → customers.id |
| order_id | uuid | YES | | FK → orders.id |
| invoice_id | uuid | YES | | FK → customer_invoices.id |
| original_payment_id | uuid | YES | | FK → customer_payments.id |
| amount | decimal(10,2) | NO | | Requested amount |
| reason | varchar(100) | YES | | shortfall/order_edit/balance_due |
| stripe_payment_link_id | varchar(100) | YES | | |
| stripe_payment_link_url | text | YES | | |
| stripe_payment_intent_id | varchar(100) | YES | | |
| expires_at | timestamptz | YES | | |
| status | varchar(20) | YES | 'pending' | pending/paid/expired/cancelled |
| paid_at | timestamptz | YES | | |
| email_sent_at | timestamptz | YES | | |
| email_sent_to | varchar(255) | YES | | |
| reminder_sent_at | timestamptz | YES | | |
| created_by_staff_id | uuid | YES | | FK → staff_users.id |
| created_at | timestamptz | YES | NOW() | |

---

## Table: refunds

Refund tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| order_id | uuid | YES | | FK → orders.id |
| customer_id | uuid | NO | | FK → customers.id |
| original_payment_id | uuid | YES | | |
| payment_id | uuid | YES | | FK → customer_payments.id |
| invoice_id | uuid | YES | | FK → customer_invoices.id |
| amount | decimal(10,2) | NO | | Refund amount |
| stripe_refund_id | varchar(100) | YES | | |
| refund_method | varchar(20) | YES | 'manual' | stripe/manual/check/bank_transfer/credit |
| status | varchar(20) | YES | 'pending' | pending/processing/completed/failed |
| reason | text | YES | | |
| failure_reason | text | YES | | |
| processed_at | timestamptz | YES | | |
| created_by_staff_id | uuid | YES | | FK → staff_users.id |
| created_at | timestamptz | YES | NOW() | |

---

## Table: quote_adjustments

Discounts and surcharges on quotes.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| quote_id | uuid | NO | | FK → quotes.id |
| adjustment_type | varchar(20) | NO | | 'discount' or 'surcharge' |
| value_type | varchar(20) | NO | | 'percentage' or 'fixed' |
| value | decimal(10,2) | NO | | Adjustment value |
| calculated_amount | decimal(10,2) | YES | | Calculated $ amount |
| reason | text | YES | | |
| added_by | uuid | YES | | FK → staff_users.id |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Constraints:**
- CHECK(adjustment_type IN ('discount', 'surcharge'))
- CHECK(value_type IN ('percentage', 'fixed'))
- CHECK(value >= 0)

---

## Table: quote_certifications

Quote-level certifications (separate from document-level).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| quote_id | uuid | NO | | FK → quotes.id |
| certification_type_id | uuid | NO | | FK → certification_types.id |
| price | decimal(10,2) | NO | | |
| quantity | integer | YES | 1 | |
| added_by | uuid | YES | | FK → staff_users.id |
| notes | text | YES | | |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

---

## Table: order_cancellations

Order cancellation records.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| order_id | uuid | NO | | FK → orders.id |
| cancelled_by | uuid | YES | | FK → staff_users.id |
| reason_code | text | NO | | customer_request/payment_failed/document_issue/service_unavailable/duplicate_order/fraud_suspected/other |
| reason_text | text | NO | | |
| additional_notes | text | YES | | |
| refund_type | text | NO | | full/partial/none |
| refund_amount | decimal(10,2) | YES | 0 | |
| refund_method | text | YES | | stripe/cash/bank_transfer/cheque/e_transfer/store_credit/original_method/other |
| refund_status | text | YES | 'not_applicable' | not_applicable/pending/processing/completed/failed |
| refund_reference | text | YES | | |
| refund_notes | text | YES | | |
| refund_completed_at | timestamptz | YES | | |
| refund_completed_by | uuid | YES | | FK → staff_users.id |
| stripe_refund_id | text | YES | | |
| stripe_error | text | YES | | |
| original_payment_method | text | YES | | |
| original_payment_id | uuid | YES | | |
| email_sent | boolean | YES | false | |
| email_sent_at | timestamptz | YES | | |
| email_error | text | YES | | |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

---

## Table: order_adjustments

Price adjustments from order edits.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| order_id | uuid | NO | | FK → orders.id |
| adjustment_type | varchar(20) | NO | | discount/surcharge/waive/price_change |
| amount | decimal(10,2) | NO | | |
| original_total | decimal(10,2) | YES | | |
| new_total | decimal(10,2) | YES | | |
| reason | text | YES | | |
| handling_method | varchar(30) | YES | | stripe_request/ar/waive/refund |
| payment_request_id | uuid | YES | | FK → payment_requests.id |
| refund_id | uuid | YES | | FK → refunds.id |
| created_by_staff_id | uuid | YES | | FK → staff_users.id |
| created_at | timestamptz | YES | NOW() | |

---

## Table: ocr_results

Raw OCR results with per-page breakdown.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| quote_file_id | uuid | NO | | FK → quote_files.id |
| ocr_provider | text | NO | | google_document_ai/aws_textract/azure_form_recognizer/mistral |
| total_pages | integer | NO | 1 | |
| total_words | integer | NO | 0 | |
| pages | jsonb | NO | '[]' | [{page_number, text, word_count}] |
| raw_response | jsonb | YES | | Full provider response |
| confidence_score | numeric(5,2) | YES | | |
| processing_time_ms | integer | YES | | |
| created_at | timestamptz | NO | NOW() | |
| updated_at | timestamptz | NO | NOW() | |

**Foreign Keys:**
- quote_file_id → quote_files.id (CASCADE)

---

## Table: staff_corrections

HITL correction tracking with knowledge base integration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| quote_id | uuid | NO | | FK → quotes.id |
| analysis_id | uuid | YES | | FK → ai_analysis_results.id |
| field_name | varchar(100) | NO | | Field corrected |
| ai_value | text | YES | | Original AI value |
| corrected_value | text | NO | | Staff correction |
| correction_reason | text | YES | | Why corrected |
| confidence_impact | varchar(50) | YES | | low_confidence/incorrect/customer_requested |
| submit_to_knowledge_base | boolean | YES | false | Flag for AI learning |
| knowledge_base_comment | text | YES | | Note for AI |
| knowledge_base_submitted_at | timestamptz | YES | | |
| created_by_staff_id | uuid | NO | | FK → staff_users.id |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Allowed field_name values:**
- detected_language, detected_document_type, assessed_complexity
- word_count, page_count, billable_pages
- certification_type, line_total
- customer_email, customer_phone, customer_full_name
- payment_method, shipping_address, billing_address
- tax_rate, discount, surcharge, delivery_option

---

## Table: email_templates

Email template storage.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| template_code | text | NO | | Unique identifier |
| template_name | text | NO | | Display name |
| description | text | YES | | |
| sender_name | text | NO | 'CETHOS Translations' | |
| sender_email | text | NO | 'noreply@cethos.com' | |
| reply_to_email | text | YES | 'support@cethos.com' | |
| subject | text | NO | | Email subject |
| html_content | text | NO | | HTML body |
| text_content | text | YES | | Plain text body |
| available_variables | text[] | YES | '{}' | Template variables |
| is_active | boolean | YES | true | |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Template Codes:**
- `order_cancellation` - Order cancelled notification
- `balance_due_request` - Payment required notification

---

## Table: file_categories

Categories for uploaded files.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| name | text | NO | | Display name |
| slug | text | NO | | Unique identifier |
| description | text | YES | | |
| is_billable | boolean | YES | false | Include in pricing |
| display_order | integer | YES | 0 | |
| is_active | boolean | YES | true | |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Default Categories:**
- `to_translate` - Documents requiring translation (billable)
- `reference` - Supporting context (not billable)
- `source` - Original source files (not billable)
- `glossary` - Terminology lists (not billable)
- `style_guide` - Style preferences (not billable)
- `final_deliverable` - Completed output (not billable)

---

## Table: same_day_eligibility

Matrix for same-day delivery eligibility.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| source_language | varchar(10) | NO | | Language code |
| target_language | varchar(10) | NO | | Language code |
| document_type | varchar(100) | NO | | Document type |
| intended_use | varchar(50) | NO | | Use case |
| is_active | boolean | YES | true | |
| additional_fee | decimal(10,2) | YES | 0 | Extra fee |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Constraints:**
- UNIQUE(source_language, target_language, document_type, intended_use)

---

## Table: pickup_locations

Physical pickup locations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| name | varchar(100) | NO | | Location name |
| address_line1 | varchar(255) | NO | | |
| address_line2 | varchar(255) | YES | | |
| city | varchar(100) | NO | | |
| province | varchar(100) | NO | | |
| postal_code | varchar(20) | NO | | |
| country | varchar(100) | YES | 'Canada' | |
| phone | varchar(50) | YES | | |
| hours | text | YES | | Business hours |
| is_active | boolean | YES | true | |
| sort_order | integer | YES | 0 | |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

---

## Table: holidays

Holiday calendar for turnaround calculations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| holiday_date | date | NO | | Holiday date |
| name | varchar(100) | NO | | Holiday name |
| is_active | boolean | YES | true | |
| created_at | timestamptz | YES | NOW() | |

**Constraints:**
- UNIQUE(holiday_date)

---

## Table: app_settings

Application configuration settings.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| setting_key | varchar(100) | NO | | Unique key |
| setting_value | text | NO | | Value |
| setting_type | varchar(20) | YES | 'string' | string/number/boolean/json |
| description | text | YES | | |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

**Key Settings:**
- `same_day_multiplier` = '2.00' (100% surcharge)
- `same_day_cutoff_hour` = '14' (2 PM MST)
- `rush_cutoff_hour` = '16' (4 PM MST)
- `turnaround_base_days` = '2'
- `turnaround_pages_per_day` = '2'
- `words_per_page` = '225'
- `base_rate` = '65.00'

---

## Table: accounts_receivable

AR invoice tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| customer_id | uuid | NO | | FK → customers.id |
| invoice_id | uuid | YES | | FK → customer_invoices.id |
| original_amount | decimal(10,2) | YES | | Initial amount |
| amount_due | decimal(10,2) | NO | | Current balance |
| amount_paid | decimal(10,2) | YES | 0 | Total paid |
| status | varchar(20) | YES | 'outstanding' | outstanding/paid/partial/overdue |
| due_date | date | YES | | |
| created_at | timestamptz | YES | NOW() | |
| updated_at | timestamptz | YES | NOW() | |

---

## Table: ar_payments

Payments against AR invoices.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| ar_id | uuid | NO | | FK → accounts_receivable.id |
| amount | decimal(10,2) | NO | | Payment amount |
| payment_method_id | uuid | YES | | FK → payment_methods.id |
| payment_method_code | varchar(50) | YES | | |
| payment_method_name | varchar(100) | YES | | |
| payment_date | date | NO | | |
| reference_number | varchar(255) | YES | | |
| notes | text | YES | | |
| recorded_by | uuid | YES | | FK → staff_users.id |
| recorded_at | timestamptz | YES | NOW() | |
| created_at | timestamptz | YES | NOW() | |

---

## Table: customer_statements

Monthly customer statements.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| statement_number | varchar(50) | NO | | Format: STMT-YYYYMM-NNNN |
| customer_id | uuid | NO | | FK → customers.id |
| period_start | date | NO | | Statement start date |
| period_end | date | NO | | Statement end date |
| opening_balance | decimal(10,2) | YES | 0 | |
| total_invoiced | decimal(10,2) | YES | 0 | |
| total_paid | decimal(10,2) | YES | 0 | |
| closing_balance | decimal(10,2) | YES | 0 | |
| current_amount | decimal(10,2) | YES | 0 | |
| days_30_amount | decimal(10,2) | YES | 0 | 30-day aging |
| days_60_amount | decimal(10,2) | YES | 0 | 60-day aging |
| days_90_plus_amount | decimal(10,2) | YES | 0 | 90+ day aging |
| pdf_storage_path | text | YES | | |
| pdf_generated_at | timestamptz | YES | | |
| status | varchar(20) | YES | 'draft' | draft/queued/sent/cancelled |
| sent_at | timestamptz | YES | | |
| sent_by_staff_id | uuid | YES | | FK → staff_users.id |
| sent_to_email | varchar(255) | YES | | |
| created_at | timestamptz | YES | NOW() | |

---

## Table: invoice_generation_queue

Queue for invoice generation.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| order_id | uuid | NO | | FK → orders.id |
| trigger_type | varchar(20) | YES | 'delivery' | |
| status | varchar(20) | YES | 'pending' | pending/processing/completed/failed |
| error_message | text | YES | | |
| processed_at | timestamptz | YES | | |
| created_at | timestamptz | YES | NOW() | |

**Constraints:**
- UNIQUE(order_id)

---

## Database Views

### View: v_unassigned_quote_items

Files and pages not yet assigned to any document group.

```sql
SELECT
  quote_id,
  item_type,        -- 'file' or 'page'
  item_id,
  file_id,
  page_id,
  page_number,
  word_count,
  file_name,
  storage_path,
  has_analysis,
  analysis_id,
  page_count,
  detected_document_type,
  detected_language,
  assessed_complexity
FROM v_unassigned_quote_items
WHERE quote_id = 'uuid'
```

### View: v_document_groups_with_items

Document groups with their assigned items and calculated totals.

```sql
SELECT
  group_id,
  quote_id,
  group_number,
  group_label,
  document_type,
  complexity,
  complexity_multiplier,
  certification_type_id,
  certification_type_name,
  certification_price,
  is_ai_suggested,
  ai_confidence,
  analysis_status,
  total_pages,
  total_word_count,
  billable_pages,
  line_total,
  assigned_items     -- JSONB array of items
FROM v_document_groups_with_items
WHERE quote_id = 'uuid'
```

---

## Key Database Functions

### Pricing Functions

```sql
-- Recalculate all quote totals
SELECT recalculate_quote_totals('quote-uuid');

-- Recalculate document group totals
SELECT recalculate_group_from_assignments('group-uuid');
```

### Document Group Functions

```sql
-- Create new document group
SELECT create_document_group(
  'quote-uuid',     -- quote_id
  'Birth Cert',     -- label
  'Birth Certificate', -- document_type
  'easy',           -- complexity
  'staff-uuid'      -- staff_id
);

-- Assign item to group
SELECT assign_item_to_group(
  'group-uuid',     -- group_id
  'file',           -- item_type ('file' or 'page')
  'item-uuid',      -- item_id
  'staff-uuid',     -- staff_id
  NULL              -- word_count_override
);

-- Unassign item
SELECT unassign_item_from_group('assignment-uuid');

-- Delete group
SELECT delete_document_group('group-uuid');

-- Update group
SELECT update_document_group(
  'group-uuid',
  'New Label',      -- group_label
  'Passport',       -- document_type
  'medium',         -- complexity
  'cert-type-uuid'  -- certification_type_id
);
```

### Invoice Functions

```sql
-- Generate invoice number
SELECT generate_invoice_number();
-- Returns: INV-2026-000001

-- Create invoice from order
SELECT create_invoice_from_order('order-uuid', 'delivery');

-- Calculate due date based on customer terms
SELECT calculate_invoice_due_date('customer-uuid');
```

### Credit Functions

```sql
-- Apply customer credit
SELECT apply_customer_credit(
  'customer-uuid',
  100.00,           -- amount to apply
  'order-uuid',     -- order_id (optional)
  'invoice-uuid',   -- invoice_id (optional)
  'staff-uuid'      -- staff_id (optional)
);
```

### Purge Functions

```sql
-- Purge old draft quotes (older than 14 days)
SELECT * FROM purge_old_draft_quotes();
```

---

## Pricing Constants

| Setting | Value | Description |
|---------|-------|-------------|
| words_per_page | 225 | Words per billable page |
| base_rate | $65.00 | Per-page rate |
| complexity_easy | 1.0 | Easy multiplier |
| complexity_medium | 1.15 | Medium multiplier (+15%) |
| complexity_hard | 1.25 | Hard multiplier (+25%) |
| rush_multiplier | 1.30 | Rush delivery (+30%) |
| same_day_multiplier | 2.00 | Same-day (+100%) |

### Billable Pages Formula

```
billable_pages = CEIL(word_count / 225 * complexity_multiplier)
```

### Line Total Formula

```
line_total = (billable_pages * base_rate * language_multiplier) + certification_price
```

---

## Sequences

| Sequence | Current | Format |
|----------|---------|--------|
| invoice_number_seq | Auto | INV-YYYY-NNNNNN |
| statement_number_seq | Auto | STMT-YYYYMM-NNNN |

---

## Row-Level Security (RLS)

All tables have RLS enabled with policies for:
- `authenticated` users (logged-in customers and staff)
- `anon` users (public access where appropriate)
- `service_role` (backend/edge functions)

Staff-only tables check for staff membership:
```sql
EXISTS (SELECT 1 FROM staff_users WHERE auth_user_id = auth.uid())
```

---

## Common Query Patterns

### Get quote with all related data

```sql
SELECT
  q.*,
  c.email as customer_email,
  c.full_name as customer_name,
  sl.name as source_language_name,
  tl.name as target_language_name
FROM quotes q
LEFT JOIN customers c ON c.id = q.customer_id
LEFT JOIN languages sl ON sl.id = q.source_language_id
LEFT JOIN languages tl ON tl.id = q.target_language_id
WHERE q.id = 'uuid';
```

### Get order with invoice

```sql
SELECT
  o.*,
  i.invoice_number,
  i.status as invoice_status,
  i.balance_due
FROM orders o
LEFT JOIN customer_invoices i ON i.order_id = o.id
WHERE o.id = 'uuid';
```

### Get customer with balance

```sql
SELECT
  c.*,
  COALESCE(c.credit_balance, 0) as available_credit,
  (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as total_orders,
  (SELECT SUM(balance_due) FROM customer_invoices WHERE customer_id = c.id AND status NOT IN ('paid', 'void', 'cancelled')) as outstanding_balance
FROM customers c
WHERE c.id = 'uuid';
```

### Get document groups for a quote

```sql
SELECT * FROM v_document_groups_with_items
WHERE quote_id = 'uuid'
ORDER BY group_number;
```

### Get unassigned items for a quote

```sql
SELECT * FROM get_unassigned_items('quote-uuid');
```

---

## Notes

1. **UUID Primary Keys**: All tables use UUID primary keys generated by `gen_random_uuid()`

2. **Timestamps**: All tables use `TIMESTAMPTZ` (timestamp with timezone) for datetime fields

3. **Soft Deletes**: Some tables (quotes, quote_files) use `deleted_at` for soft deletion

4. **Cascading Deletes**: Child tables cascade delete on parent deletion

5. **Pricing Calculations**: Always use database functions (`recalculate_quote_totals`, `recalculate_group_from_assignments`) for consistency

6. **Status Transitions**: Use application logic to enforce valid status transitions

7. **Currency**: All amounts are in CAD (Canadian Dollars)

---

*This document is auto-generated and should be kept in sync with database migrations.*
