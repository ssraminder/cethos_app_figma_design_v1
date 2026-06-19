# Applicant login + NDA-before-test + GSA-at-approval — design & build spec

**Decided 2026-06-19 (Raminder).** Build all phases, then switch the NDA gate on together at a single cutover. Roll out fully before flipping (do NOT hot-swap into the live ProZ blast piecemeal).

## Problem
Today applicant and vendor are two records: the apply form creates a `cvp_applications` row with **no login**; the `vendors` row + `vendor_auth` are created only at approval. So applicants can't log in or sign an NDA during the application — the NDA only happens post-approval, *after* they've already taken a test built on confidential COA/clinical content. Desired lifecycle: **apply → log in (day 1) → sign NDA → take test → approve → sign GSA**, one identity throughout.

## Decided design
- **Applicant = a `vendors` row in `status='applicant'`** from submit (the status enum already supports it; the CD-consultant flow already parks vendors there).
- **Passwordless OTP / magic-link login** for `applicant`-status vendors (reuse the customer-portal OTP infra: `send-customer-login-otp` / `verify-customer-login-otp` patterns; do NOT reuse password_setup — keep it frictionless).
- **NDA gates the test** — no test/quiz issued until the NDA is signed.
- **GSA = Master Services Agreement**, clickwrap e-sign at approval (mirror the NDA clickwrap). Doc to be supplied by Raminder.
- **Cutover:** build Phases 1–3, then enable the NDA-before-test gate in one coordinated change once the applicant portal + reminders are live.

## Phase 1 — Applicant identity + login (additive, low-risk)
- **cvp-submit-application:** after inserting the application, also create a `vendors` row `status='applicant'`, `vendor_type=role_type`, link both ways (e.g. `vendors.cvp_application_id` + `cvp_applications.vendor_id`, or reuse existing linkage). Idempotent: if a vendor already exists for the email, link to it (the dup-email guard already blocks true duplicates, so this is the new-applicant path).
- **Auth:** OTP/magic-link login accepting `status IN ('applicant','active',...)`. New or extended edge fns: `applicant-send-otp` / `applicant-verify-otp` (or generalize the vendor login). Session → restricted scope.
- **Vendor portal (D:\cethos-vendor):** an **applicant view** gated by `status='applicant'` — show: application status, NDA, document upload. Hide jobs/payments/rates/assignments until `active`.
- **Dedup/messaging:** the `cvp-check-email` / submit-guard "application exists" branch message changes from "watch your inbox" → "log in to your account to check status & sign your NDA" (since they now CAN log in). Keep the vendor-exists branch as-is.

## Phase 2 — NDA before the test
- NDA signing in the applicant view → `vendor_nda_signatures` (vendor_id exists) + `qms.nda_agreements` via the existing `trg_qms_sync_nda` trigger.
- **Gate:** `cvp-auto-advance` / `cvp-send-instrument-choice-invitation` must NOT issue the test/quiz until a signed, active NDA exists for the applicant's vendor. Add an NDA-pending holding state + reminder nudges (email + in-portal).
- ⚠️ Cutover risk: turning this on mid-blast stalls everyone who hasn't signed. Enable only after Phase 1 is live + reminders wired.

## Phase 3 — Approval → GSA
- At `cvp-approve-application`: flip `vendors.status` `applicant`→`active`, create the QMS qualification (existing bridge), and present the **GSA** for clickwrap e-sign (new `vendor_gsa_signatures` table + clickwrap UI mirroring NDA). Gate full vendor access / first assignment on GSA signed.
- Need from Raminder: the **GSA document text/PDF**.

## Cross-cutting
- **Migration:** the ~300+/hr applicants arriving now have NO vendor row. Backfill `applicant`-status vendor rows for existing in-flight `cvp_applications` (non-terminal) at cutover so they can log in too.
- **Assignment/lists:** confirm active-vendor pools + VendorFinder exclude `status='applicant'` (assignment already filters by status/qualification — verify).
- **Volume:** every applicant becomes a vendor row — hundreds/day during the blast. Acceptable; ensure admin vendor list can filter out `applicant` status by default.
- **Repos:** admin `D:\cethos\portal\cethos_app_figma_design_v1` (submit, auth fns, pipeline gate, approval/GSA, migration) + vendor `D:\cethos-vendor` (applicant portal view + login UI). Supabase project `lmzoyezvsjgsxveoakdr`.

## Status
Design approved 2026-06-19. NOT yet built — recommended as a focused multi-PR build (auth is security-sensitive; verify live each phase). Awaiting GSA document. See [[project-iqvia-audit-2026-06-29]].
