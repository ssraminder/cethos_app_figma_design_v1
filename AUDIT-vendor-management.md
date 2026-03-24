# Audit: Admin Panel — Vendor Management Features

## Context
Comprehensive audit of the Cethos translation management app to identify what vendor management features are built vs missing. This covers the Supabase backend (tables, edge functions) and the React frontend (admin pages, components). The audit was performed against the live Supabase database and deployed edge functions, cross-referenced with the codebase.

---

## Backend (Supabase) — Database Tables

| Table | Status | Rows | Notes |
|-------|--------|------|-------|
| `vendors` | **EXISTS** | 1,463 | Full profile schema (name, email, phone, country, status, rating, etc.) |
| `vendor_language_pairs` | **EXISTS** | 5,185 | vendor_id, source_language, target_language, notes |
| `vendor_rates` | **EXISTS** | 762 | vendor_id, service_id, calculation_unit, rate, currency |
| `vendor_payment_info` | **EXISTS** | 0 | vendor_id, preferred_currency, payment_method, payment_details JSONB, tax_id, tax_rate, invoice_notes — table exists but unpopulated |
| `vendor_auth` | **EXISTS** | 1 | Password hash storage |
| `vendor_otp` | **EXISTS** | 4 | OTP codes for vendor login |
| `vendor_sessions` | **EXISTS** | 8 | Session tokens |
| `services` | **EXISTS** | 45 | Master reference for billable services |
| `xtrf_language_map` | **EXISTS** | 314 | XTRF language ID → ISO code mappings |
| `vendor_jobs` | **MISSING** | — | Job assignment schema does not exist |

---

## Backend (Supabase) — Edge Functions

### Auth & Portal Functions — All EXIST
- [x] `vendor-auth-otp-send` — send OTP / invitation to vendor email (single + bulk mode)
- [x] `vendor-auth-otp-verify` — verify OTP code
- [x] `vendor-auth-password` — password login
- [x] `vendor-auth-session` — validate session token
- [x] `vendor-auth-logout` — end session
- [x] `vendor-auth-check` — check if vendor email exists
- [x] `vendor-auth-activate` — activate vendor account
- [x] `vendor-auth-invite` — send portal invitation email
- [x] `vendor-set-password` — set/reset password
- [x] `vendor-update-profile` — vendor self-update profile
- [x] `vendor-verify-phone` — phone verification
- [x] `vendor-invitation-reminder` — cron-triggered daily reminders (graduated schedule: days 3, 7, 15, 21, 30, then monthly)

### Import & Sync Functions — All EXIST
- [x] `import-applicant-vendors` — import vendors from external source
- [x] `import-vendor-lang-rates` — import language pairs and rates
- [x] `xtrf-sync-vendor-lp` — sync vendor competencies from XTRF API
- [x] `xtrf-sync-vendors` — sync vendor records from XTRF

### Vendor Application Functions — All EXIST
- [x] `cvp-prescreen-application` — prescreen new vendor application
- [x] `cvp-submit-application` — submit new vendor application

### Admin CRUD Functions — MISSING
- [ ] `get-vendors-list` — **NOT NEEDED**: frontend queries Supabase directly with filters/pagination
- [ ] `get-vendor-detail` — **NOT NEEDED**: frontend queries Supabase directly
- [ ] `update-vendor-rates` — admin CRUD on vendor_rates table **MISSING**
- [ ] `update-vendor-payment-info` — admin write to vendor_payment_info **MISSING**
- [ ] `find-matching-vendors` — find vendors by LP + service + availability for job assignment **MISSING**
- [ ] `assign-vendor-job` — create job assignment (requires vendor_jobs table first) **MISSING**
- [ ] `notify-vendor-job-offer` — email vendor about new job offer **MISSING**
- [ ] Vendor performance/rating calculation system **MISSING**

---

## Frontend — Admin Vendor List Page

**Route:** `/admin/vendors` — **EXISTS**
**Component:** `AdminVendorsList.tsx` (`client/pages/admin/AdminVendorsList.tsx`)

### Features Checklist
- [x] Table/grid showing vendor list (name, email, status, languages, rates, country, projects, last active, portal status)
- [x] Search by name/email (also searches city/country)
- [x] Filter by status (active, inactive, pending_review, suspended, applicant)
- [x] Filter by language pair (target language text input)
- [ ] Filter by service type — **MISSING**
- [x] Filter by country (dropdown populated from DB)
- [x] Pagination (25 items per page)
- [x] Quick actions — link to detail page, bulk invitation sending
- [ ] Quick actions — activate/deactivate directly from list — **MISSING** (must go to detail page)
- [x] Link to vendor detail page
- [x] Additional filters: vendor type, availability status, portal access
- [x] Summary stats cards (total, active, with portal access, with jobs)

---

## Frontend — Admin Vendor Detail Page

**Route:** `/admin/vendors/:vendorId` — **EXISTS**
**Component:** `AdminVendorDetail.tsx` (`client/pages/admin/AdminVendorDetail.tsx`)

### Profile Section
- [x] Display vendor name, email, phone, country, city, province
- [x] Display vendor_type, years_experience, rating (1-5 stars)
- [ ] Display certifications (JSONB) — **MISSING** from UI (field exists in DB)
- [x] Display/edit notes (internal notes section)
- [x] Edit profile fields inline (full_name, phone, country, province_state, city, status, vendor_type, availability, years_experience)
- [x] Activate/deactivate toggle (status field)

### Languages Section
- [x] List language pairs from vendor_language_pairs (table format: source → target)
- [ ] Show source (xtrf_competencies vs self_reported) — **MISSING**
- [ ] Add new language pair — **MISSING** (display only, synced from XTRF)
- [ ] Remove/deactivate language pair — **MISSING**

### Rates Section
- [x] Display rate_per_page and rate_currency (single rate on vendors table)
- [ ] List all rates from `vendor_rates` table grouped by service — **MISSING** (only uses vendors.rate_per_page, not the full vendor_rates table with 762 rows)
- [ ] Show rate, unit (per_word/per_hour/per_page), currency per service — **MISSING**
- [ ] Add new rate — **MISSING**
- [ ] Edit existing rate — **MISSING**
- [ ] Deactivate rate — **MISSING**

### Payment Section
- [x] Payment method text field (editable on vendors table)
- [ ] Read/write `vendor_payment_info` table — **MISSING** (only uses vendors.payment_method string)
- [ ] Payment method selector (Interac, wire, PayPal, direct deposit, cheque) — **MISSING**
- [ ] Payment details form (bank info, email, etc.) — **MISSING**
- [ ] Tax ID, tax rate fields — **MISSING**
- [ ] Invoice notes field — **MISSING**

### Auth/Invitation Section
- [x] Show portal access status (has auth_user_id or not)
- [x] Show invitation_sent_at date
- [x] Show invitation_reminder_count
- [x] Send invitation button (calls vendor-auth-otp-send)
- [x] Force password reset button (updates vendor_auth.must_reset)
- [x] Revoke portal access button (deletes sessions + auth)
- [ ] Show full invitation history (sent_at, accepted_at, all reminder dates) — **PARTIAL** (shows count but not full history)
- [ ] Send manual reminder button (calls vendor-invitation-reminder for single vendor) — **MISSING**

---

## Frontend — Other Vendor Features

### Admin Vendor Create/Import
- [ ] New vendor creation form (manual) — **MISSING**
- [ ] Bulk vendor import from CSV/file — **MISSING** (edge function `import-applicant-vendors` exists but no UI)

### Admin Order Detail — Vendor Assignment
- [ ] "Assign Vendor" button or modal in order detail — **MISSING**
- [ ] Vendor picker/search within order context — **MISSING**
- [ ] Any reference to vendor_jobs or job assignment — **MISSING** (table doesn't exist)

### Admin Vendor-Related Settings
- [ ] Services management page (CRUD on services table) — **MISSING** (45 services exist but no admin UI)
- [ ] Language pairs management (global, not per-vendor) — **MISSING**

---

## Summary: What Needs to Be Built

### Backend — High Priority
1. **`vendor_jobs` table** — job assignment schema linking vendors to orders/projects
2. **Edge function: `update-vendor-rates`** — admin CRUD on vendor_rates
3. **Edge function: `update-vendor-payment-info`** — admin write to vendor_payment_info
4. **Edge function: `find-matching-vendors`** — match vendors by LP + service + availability
5. **Edge function: `assign-vendor-job`** — create job assignment record
6. **Edge function: `notify-vendor-job-offer`** — email vendor about job offer

### Frontend — High Priority
1. **Vendor rates tab** — full CRUD against vendor_rates table (grouped by service, with rate/unit/currency)
2. **Vendor payment info tab** — full form against vendor_payment_info table
3. **Vendor language pairs CRUD** — add/remove language pairs (not just display)
4. **Certifications display** — show certifications array in vendor detail
5. **New vendor creation form** — manual vendor entry
6. **Services management settings page** — admin CRUD on services table

### Frontend — Medium Priority
7. **Vendor assignment in orders** — picker + assignment workflow
8. **Bulk vendor import UI** — CSV upload triggering import-applicant-vendors
9. **Filter by service type** on vendor list
10. **Quick activate/deactivate** from vendor list
11. **Manual invitation reminder** button on vendor detail

---

## Key File Paths
- `client/pages/admin/AdminVendorsList.tsx` — vendor list page
- `client/pages/admin/AdminVendorDetail.tsx` — vendor detail page
- `client/pages/admin/invoices/VendorInvoices.tsx` — vendor invoices (XTRF cache)
- `client/components/admin/AdminLayout.tsx` — admin nav (vendor menu items)
- `client/App.tsx` — route definitions (lines 80-81 imports, 327-328 routes)
- `supabase/functions/vendor-auth-otp-send/index.ts` — invitation sending
- `supabase/functions/vendor-invitation-reminder/index.ts` — automated reminders
- `supabase/migrations/20260324_vendor_invitation_tracking.sql` — invitation tracking columns

## Verification
- Database tables verified via Supabase MCP `list_tables` — all row counts confirmed
- Edge functions verified via Supabase MCP `list_edge_functions` — all 18 vendor functions confirmed deployed
- Frontend components verified by reading source files and checking route definitions
- Note: `get-vendors-list` and `get-vendor-detail` edge functions are not needed as the frontend queries Supabase directly with proper filtering and pagination
