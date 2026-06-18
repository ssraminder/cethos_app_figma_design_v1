# Recruitment Automation — Implementation Spec

**Date:** 2026-06-17 · Companion to `recruitment-automation-audit.md`.
**Principle:** automate every transition and log it; **only** the final approval decision and the activation/welcome email stay human.

> NOTE: function-internal details are finalized once the background source-pull lands the `cvp-*` code in git. This spec fixes the architecture, statuses, triggers, logging, and human gates.

---

## 1. Status model (target)

| Status | Producer (today) | Change |
|---|---|---|
| submitted | cvp-submit-application | keep |
| prescreening | cvp-prescreen-application | keep |
| prescreened | cvp-prescreen-application | keep |
| **info_requested** | *(phantom — nobody writes it)* | **WIRE as real status** (documents/info auto-requested) |
| references_requested | cvp-request-references | keep (now also auto-fired) |
| references_received | *(verify producer)* | ensure produced on reference completion |
| test_sent / test_in_progress / test_submitted / test_assessed | test flow | keep |
| **ready_for_approval** | *(none)* | **NEW** — all evidence + test complete, human decision pending |
| staff_review | cvp-prescreen-application | **narrow** to genuine exceptions only (AI error, CV contradictions) |
| approved / rejected / waitlisted / archived | terminal | keep |

Migration: if `cvp_applications.status` has a CHECK/enum, extend it with `info_requested`, `ready_for_approval`. (Confirm type first.)

## 2. One decision engine (single source of truth)

Consolidate "what's missing / what next" into one `decide(application)` used by BOTH `cvp-prescreen-application` and `cvp-reassess-application` (today prescreen and the iso-autoapprove scorer each have their own logic — that divergence is part of the problem). Outcomes:

1. **Strong + documented** → `prescreened` → auto instrument-choice (test/quiz). *(existing)*
2. **Credible, missing document evidence** (degree/cert not on file) → auto `cvp-request-documents` / `cvp-request-info` → `info_requested`. **[NEW BRIDGE]**
3. **Experience claim needing references** → auto `cvp-request-references` → `references_requested`. **[NEW BRIDGE]**
4. **Clearly unqualified** → queue rejection (existing `cvp-send-queued-rejections`, hourly cron) → `rejected`. *(wire prescreen→queue)*
5. **Genuine ambiguity / AI extraction error / CV-vs-form contradiction** → `staff_review`. *(narrowed — the only human-needed branch pre-decision)*

This is the §3.1.4 evidence logic from `cvp-iso-autoapprove-check.decide()`, promoted from "dry-run, records only" to "actually fires the request + sets status."

## 3. Auto-reassess on evidence arrival (close the loop)

Today nothing advances an application once documents/references come back (79 stuck at references_requested). Add:

- **Documents uploaded** (applicant uses the secure link) → upload handler / DB trigger calls `cvp-reassess-application` → re-run `decide()`.
- **References received** → on `cvp-submit-reference-feedback` completion → set `references_received` → `cvp-reassess-application`.
- **Test assessed** (`cvp-assess-test`) → if pass + evidence complete → `ready_for_approval`.

## 4. Convergence + the human gate

When **competence evidence complete** AND **test passed/waived** AND **references satisfied (if required)** → status = `ready_for_approval` → surfaces in "Needs Attention."

**Human-only (per your instruction):**
- The approve/reject **decision** — staff click on RecruitmentDetail.
- The **activation/welcome email** + vendor creation — `cvp-approve-application`, triggered by that click.
- Keep `cvp_system_config.auto_approve` **OFF** so no path auto-approves or emails an applicant to activate. The pipeline drives everything *up to* `ready_for_approval` and stops.

## 5. Logging (ISO / IQVIA traceability)

Every automated transition writes one audit row — reuse `cvp_application_decisions` or add `cvp_pipeline_events`:
`application_id · from_status · to_status · action · actor ('system:<function>') · reason/basis · created_at`.
So an auditor can see exactly why each application moved, and that automated steps are attributable + reproducible.

## 6. Status-accuracy fix (your "not showing actual step")

- The `info_requested` wiring (above) makes the documents stage visible — biggest single fix.
- Ensure **every** step writes status (no silent stalls), so the badge never lags reality.
- In `RecruitmentList`, show a derived **current step** that reconciles application status with per-combo (`cvp_test_combinations`) state for the test phase (the "Tests to Review" tab already computes this — generalize it), so the status column stops contradicting the combos.

## 7. Phasing

- **Phase 0 (in progress):** pull `cvp-*` into git.
- **Phase 1 (core):** decision engine + auto doc/reference bridge + `info_requested` + logging. Highest value — kills the manual doc-request.
- **Phase 2:** auto-reassess on evidence arrival (upload trigger + references-received).
- **Phase 3:** `ready_for_approval` convergence + narrow `staff_review` + UI current-step accuracy.
- **Phase 4 (separate):** feature-bloat keep/retire/merge classification.

## 8. Safety / testing

- Build + test with `@example.com` test applicants (per established pattern); no real-applicant emails fire during development.
- `--no-verify-jwt` on edge-function deploys; `supabase.functions.invoke` from UI.
- Each phase = its own PR; verify on live after merge.
- Backfill: after Phase 1+2 ship, run a one-time reassess over the 79 `references_requested` + 42 `staff_review` to unstick the existing backlog (logged).
