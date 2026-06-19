# Applicant login + NDA-before-test + GSA-at-approval — design & build spec

**Decided 2026-06-19 (Raminder).** Build all phases, then switch the NDA gate on together at a single cutover. Roll out fully before flipping (do NOT hot-swap into the live ProZ blast piecemeal).

## Problem
Today applicant and vendor are two records: the apply form creates a `cvp_applications` row with **no login**; the `vendors` row + `vendor_auth` are created only at approval. So applicants can't log in or sign an NDA during the application — the NDA only happens post-approval, *after* they've already taken a test built on confidential COA/clinical content. Desired lifecycle: **apply → log in (day 1) → sign NDA → take test → approve → sign GSA**, one identity throughout.

## Decided design
- **Applicant = a `vendors` row in `status='applicant'`** from submit (the status enum already supports it; the CD-consultant flow already parks vendors there).
- **SAME vendor portal + SAME vendor auth** (Raminder, 2026-06-19) — do NOT build a new OTP/applicant login. At submit, create `vendor_auth` and send the existing password-setup / login link so the applicant logs into vendor.cethos.com exactly like a vendor. Reuse whatever login the vendor portal already uses.
- **Workflow exclusion is the only special-casing:** `applicant`-status vendors must NOT appear in admin job-assignment / VendorFinder / active-vendor pools. (Portal itself is the same; just hide them from work allocation. Optionally disable vendor-only *mutations* — create-invoice etc. — for applicant status as a safety guardrail.)
- **NDA gates the test** — no test/quiz issued until the NDA is signed.
- **GSA = Master Services Agreement — ALREADY EXISTS in the vendor portal** (Raminder, 2026-06-19). Do NOT build a new GSA flow; reuse the existing one. It applies once the applicant becomes an `active` vendor at approval. Build task = just verify the existing GSA step triggers/gates correctly on status `applicant`→`active` (don't show GSA to applicants; show it once active).
- **Cutover:** build Phases 1–3, then enable the NDA-before-test gate in one coordinated change once login + reminders are live.

## Phase 1 — Applicant identity + login (additive, low-risk)
- **cvp-submit-application:** after inserting the application, also create a `vendors` row `status='applicant'`, `vendor_type=role_type`, link both ways (e.g. `vendors.cvp_application_id` + `cvp_applications.vendor_id`, or reuse existing linkage). Idempotent: if a vendor already exists for the email, link to it (the dup-email guard already blocks true duplicates, so this is the new-applicant path).
- **Auth (REUSE — no new build):** create `vendor_auth` for the new row (password-setup token / whatever the vendor login already uses) and send the existing setup/login email. Applicant logs into the SAME vendor portal as vendors. Confirm the vendor login flow accepts `status='applicant'` (not just `active`) — adjust the login gate if it hard-filters to active.
- **Vendor portal (D:\cethos-vendor):** SAME portal. No separate applicant view required. Recommended guardrail: for `status='applicant'`, hide/disable vendor-only mutations (create invoice, accept jobs) since they have none — but otherwise the portal is unchanged. NDA + document upload must be reachable.
- **Admin workflow exclusion:** ensure VendorFinder / job-assignment / active-vendor queries exclude `status='applicant'` (they largely filter on status/qualification already — verify + enforce). Admin vendor list should default-hide `applicant` status (or clearly badge it).
- **Dedup/messaging:** the `cvp-check-email` / submit-guard "application exists" branch message changes from "watch your inbox" → "log in to your account to check status & sign your NDA" (since they now CAN log in). Keep the vendor-exists branch as-is.

## Phase 2 — NDA before the test
- NDA signing in the applicant view → `vendor_nda_signatures` (vendor_id exists) + `qms.nda_agreements` via the existing `trg_qms_sync_nda` trigger.
- **Gate:** `cvp-auto-advance` / `cvp-send-instrument-choice-invitation` must NOT issue the test/quiz until a signed, active NDA exists for the applicant's vendor. Add an NDA-pending holding state + reminder nudges (email + in-portal).
- ⚠️ Cutover risk: turning this on mid-blast stalls everyone who hasn't signed. Enable only after Phase 1 is live + reminders wired.

## Phase 3 — Approval → GSA (reuse existing)
- At `cvp-approve-application`: flip `vendors.status` `applicant`→`active` + create the QMS qualification (existing bridge). The **GSA flow already exists in the vendor portal** — no new build. Just verify it triggers/gates on becoming `active` (and is NOT shown to `applicant`-status). Gate full vendor access / first assignment on GSA signed (per the existing GSA gating).
- No GSA document or e-sign build needed — already set up.

## Cross-cutting
- **Migration:** the ~300+/hr applicants arriving now have NO vendor row. Backfill `applicant`-status vendor rows for existing in-flight `cvp_applications` (non-terminal) at cutover so they can log in too.
- **Assignment/lists:** confirm active-vendor pools + VendorFinder exclude `status='applicant'` (assignment already filters by status/qualification — verify).
- **Volume:** every applicant becomes a vendor row — hundreds/day during the blast. Acceptable; ensure admin vendor list can filter out `applicant` status by default.
- **Repos:** admin `D:\cethos\portal\cethos_app_figma_design_v1` (submit, auth fns, pipeline gate, approval/GSA, migration) + vendor `D:\cethos-vendor` (applicant portal view + login UI). Supabase project `lmzoyezvsjgsxveoakdr`.

## Verified hooks (2026-06-19, read-only investigation)
- **Auth reuse confirmed:** vendor OTP login `vendor-auth-otp-send` / `vendor-auth-otp-verify` (+ `vendor-auth-session`/`-check`, `vendor-set-password`) looks the vendor up by email/phone and does NOT gate on `status='active'` → an `applicant`-status vendor can log into the existing vendor portal with the existing auth. No new login build. (Re-confirm `vendor-auth-check`/`-session` don't filter to active before relying on it.)
- **NDA flow exists:** `vendor-sign-nda` + `vendor-get-nda-status` (writes `vendor_nda_signatures`; the `trg_qms_sync_nda` trigger mirrors to `qms.nda_agreements`).
- **Workflow exclusion already done:** `VendorFinderModal` queries `.eq("status","active")` (lines ~283/315) → applicant-status auto-excluded from assignment. (Spot-check the split-step modal + any get-vendors edge fn use the same filter.)
- **Remaining build = small:** (1) feature-flagged change to `cvp-submit-application` to create the `applicant`-status vendor + send the existing OTP-login/welcome email; (2) NDA-before-test gate in `cvp-auto-advance`/instrument routing + reminders; (3) approval already flips a vendor to active (verify it reuses the existing applicant-vendor by email rather than creating a duplicate); GSA reused; (4) backfill + cutover.
- ⚠️ **Cutover caution:** `cvp-submit-application` is the LIVE hot path (~300 submits/hr during the blast). Do the live deploy/flip in a controlled window, not mid-surge.

## CUTOVER RUNBOOK (run in a controlled window, NOT mid-surge)
Everything below is built and deployed FLAGGED OFF (`APPLICANT_LOGIN_ENABLED`). To go live:
1. **Backfill login for in-flight applicants** (creates applicant-status vendor rows so existing applicants can log in too):
   ```sql
   INSERT INTO vendors (full_name, email, additional_emails, phone, country, city, vendor_type,
     rate_currency, preferred_rate_currency, certifications, years_experience, status, availability_status, total_projects)
   SELECT a.full_name, a.email, '{}', a.phone, a.country, a.city, a.role_type,
     'CAD','CAD','{}', NULL, 'applicant','available',0
   FROM cvp_applications a
   WHERE a.status NOT IN ('approved','rejected','archived','withdrawn')
     AND a.email IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM vendors v WHERE lower(v.email)=lower(a.email));
   ```
2. **Set the flag** `APPLICANT_LOGIN_ENABLED=true` on `cvp-submit-application` + `cvp-auto-advance` (Supabase function secrets) and redeploy those two. From then on: new applicants get an applicant-vendor + the login/NDA email; the test is held until NDA signed.
3. **Verify:** submit a test application (fresh email) → applicant-vendor created + confirmation email has the login CTA; log in, sign NDA → cvp-auto-advance then issues the test; approve → vendor flips active + GSA applies.
4. **Reminders (follow-up):** add an NDA-pending nudge so `held_nda_pending` applicants are reminded to sign (otherwise they sit until they do). Reuse `vendor-send-cv-nda-reminder` or a small new cron.
5. To roll back: set the flag false + redeploy (applicant-vendors already created stay as harmless `applicant` rows, excluded from assignment).

## Status
Design approved 2026-06-19; feasibility verified. **Phases 1–3 BUILT + deployed FLAGGED OFF** (admin PRs #1018 applicant-vendor-at-submit, #1019 NDA-gate, #1020 approval-flip, + email login CTA). Cutover (above) is the only remaining live step — do it in a controlled window. GSA reused (no build). NOT yet built — recommended as a focused multi-PR build (auth is security-sensitive; verify live each phase). Awaiting GSA document. See [[project-iqvia-audit-2026-06-29]].
