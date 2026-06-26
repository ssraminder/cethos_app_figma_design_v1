# External-contractor onboarding & compliance package — online e-sign (2026-06-25)

**Goal:** the 23 IQVIA external contractors (`@ext.cethos.com`, `status=inactive`) e-sign a
personalized **7-document Onboarding & Compliance Package** online (clickwrap), recorded for audit,
signed copy on profile, then activate. User-approved approach: per-contractor package clickwrap +
explicit supersession clause. NOT the global NDA/GVSA.

## Source
- 23 personalized `.docx` packages: `C:\Users\RaminderShah\Downloads\Cethos_Onboarding_Packages\`.
- Designed for OFFLINE signing originally; converted to ONLINE clickwrap.
- 7 docs: Services Agreement, NDA, Data Security Attestation, Conflict of Interest, Training Ack,
  Code of Conduct Ack, Qualifications Declaration.

## Content decisions (user-approved 2026-06-25)
- **Added explicit Supersession clause** (Doc 1 §11): the package supersedes/replaces all prior NDA +
  services/GSA agreements with Cethos Inc. AND its predecessor sole-proprietorship, from the
  contractor's engagement date. (The `.docx` only had generic "Entire Agreement" boilerplate.)
- **Haruto Tanaka (CSV2351) pre-incorporation fix**: engagement 30 Jun 2019 predates the Inc.
  (10 Jul 2019) → his Doc 1/Doc 2 reframed as a predecessor-firm engagement continued by the Company
  (flag `pre_incorp=true`). All others use "made as of {engagement date}".
- Offline mechanics removed; one online clickwrap acknowledgement covers all 7 docs; fill-in blanks
  (conflict / native language / qualification basis) reworded to attestations referencing the CV on file.

## SHIPPED + VERIFIED
- **DB (prod, via MCP):** `vendor_onboarding_packages` (per-contractor MERGE FIELDS; body rendered in
  code, not stored). `vendor_nda_signatures` extended: `nda_template_id` nullable, new
  `onboarding_package_id`, `agreement_type` CHECK + `'onboarding'`, ref-integrity CHECK. New
  `vendors.onboarding_signed_at`. RLS = `is_active_staff()`, no anon. **23 merge-field rows loaded**
  (1 current per vendor; CSV2351 pre_incorp). Migrations committed:
  `supabase/migrations/20260625_vendor_onboarding_packages_*.sql`. Load SQL: `tmp/onboarding-build/sql/load_mergefields.sql`.
- **Vendor portal (D:\cethos-vendor, PR #274 MERGED → Netlify live):**
  - `apps/vendor/netlify/functions/_lib/onboarding-template.ts` — renders package HTML from merge
    fields (h2/h3/p/ul/li, matches nda_templates). **Byte-for-byte identical to the approved render
    (verified md5, 15,886 chars for Georgi).** EDIT HERE to change wording (only affects future signers;
    signed snapshots are frozen).
  - `get-onboarding-package` / `sign-onboarding-package` — serve + sign. Reuses the **sign-nda OTP gate**
    (channels `nda_email`/`nda_phone`, verify within 30 min). Signing inserts
    `vendor_nda_signatures(agreement_type='onboarding', onboarding_package_id, signed_html_snapshot=rendered)`,
    sets `onboarding_signed_at`, and **waives the global NDA/GVSA gate** (`nda_waived_until=2099`) since
    the package incorporates+supersedes both.
  - `OnboardingPackagePage` + route **`/onboarding-package`** (separate from the existing CV/NDA/GVSA
    `/onboarding` checklist). Agreement-gate modal hidden on it. `/onboarding-package` returns 200 on prod.
- **Invite email (admin repo):** `vendor-send-onboarding-invite` edge fn (deployed --no-verify-jwt).
  `dry_run` + `test_email` + `notification_log` (event `vendor_onboarding_invite`). Links to
  `vendor.cethos.com/onboarding-package`. Dry-run = **23 candidates**. **Preview sent to
  ss.raminder@gmail.com** (user chose preview-to-own-inbox first).

## GOTCHAS
- There was ALREADY an `/onboarding` route + `OnboardingPage` (CV/NDA/GVSA checklist) — do NOT collide;
  the package route is `/onboarding-package`.
- Bulk-setting `nda_waived_until` for all 23 was DENIED by the auto-mode classifier (overstepped "test one
  first"). Set it per-contractor at test/send time (sign-onboarding-package also sets it on sign). It's NOT
  required just to REACH /onboarding-package (non-gated route), only to avoid a bounce to /onboarding if
  they hit a gated route pre-sign.
- DB writes go via MCP only (no psql, http extension not installed, `db push` too risky). Store merge
  fields not 16KB HTML to avoid huge tool payloads.

## PENDING (next)
1. **One-contractor LIVE test** (needs USER — OTP goes to the @ext.cethos.com M365 mailbox the user reads):
   pick one, set their `nda_waived_until` (1 row), send real invite to that one
   (`vendor-send-onboarding-invite` with `vendor_ids:[id]`), confirm inactive login + sign + audit + PDF/HTML.
   **CONFIRM an inactive vendor can log in + reach /onboarding-package** (asserted by user, not yet proven).
2. On success: send the 23 (Brevo, throttled), track `vendor_nda_signatures` onboarding sigs.
3. **Activate** each (`status=active`) after they sign (onboarding_signed_at set).
4. Admin display: surface the onboarding signature on the vendor profile (it lands in
   `vendor_nda_signatures` agreement_type=onboarding; check VendorNdaTab shows it).
5. CVs were already uploaded (23/23 verified in `vendor-cvs`) — the user's "not uploaded" belief was wrong;
   they show in admin Documents → "CV — vendor uploads" (· by staff).

## 23 contractors (vendor_id → code)
089e2706…=CSV2351(Haruto,pre_incorp) · 5c66e160…=CSCD4903 · b368b13f…=CSCD5620 · 64dc4279…=CSV0133 ·
b63e0d7b…=CSV0314 · 61acaec6…=CSV0570 · 53e8af3a…=CSV1032 · 299aa850…=CSV1115(Georgi=sample) ·
bea5ab32…=CSV1471 · 1b5d3216…=CSV2498 · 1e0e9a01…=CSV2987 · 8d2c3514…=CSV3648 · 71d2fb07…=CSV4601 ·
2812a989…=CSV4857 · bc1c9574…=CSV4894 · ac3c22c5…=CSV5222 · 5107a882…=CSV7631 · 904993d8…=CSV7920 ·
8a353ecd…=CSV7967 · 3713f36c…=CSV8177 · da1fb914…=CSV8208 · bc3ed83b…=CSV8793 · fd30ccb5…=CSV9750.
Build scripts: `tmp/onboarding-build/` (render_packages.py = canonical content; manifest.json).
