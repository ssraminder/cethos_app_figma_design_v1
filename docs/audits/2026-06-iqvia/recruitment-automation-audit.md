# Recruitment Pipeline — Automation Audit & Remediation Plan

**Date:** 2026-06-17 · **Project:** Supabase `lmzoyezvsjgsxveoakdr`
**Method:** deployed edge-function source review (~50 `cvp-*` functions), `cvp_applications` status data, `cron.job` schedule, and the admin UI source (`RecruitmentList.tsx`). *Live UI walkthrough pending portal login (OTP).*
**Goal:** make recruitment automatic end-to-end — **only** the final approval decision + the activation email stay human; everything else automated and logged.

---

## 1. Current pipeline (what's automated vs manual)

```
submitted ─AUTO→ prescreening ─AUTO→ prescreened ─AUTO(chooser)→ test_sent → test_submitted → test_assessed
                          └────AUTO→ staff_review ──── STOPS (human) ────┐
test_assessed ── MANUAL → negotiation → approved | rejected | waitlisted │
document / reference requesting ───────────── FULLY MANUAL ──────────────┘
```

- **Automated today:** application submit → auto-prescreen (Claude CV review) → either `prescreened` (auto-sends the test/quiz instrument-choice invite) or `staff_review`. Test reminders, grading-followup nudges, queued rejections, and a daily digest all run on cron.
- **Prescreening coverage:** 100% — every one of the 188 applications has an `ai_prescreening_result`.

## 2. Live status data (the pile-ups)

| Status | Count | Latest | Read |
|---|---:|---|---|
| references_requested | 79 | 2026-05-27 | **stuck** — nothing moved in 3 weeks |
| staff_review | 42 | 2026-06-17 | human dead-end queue, actively growing |
| test_sent | 25 | 2026-06-15 | waiting on applicant |
| test_in_progress | 12 | 2026-06-11 | |
| references_in_progress | 6 | 2026-04-29 | stale |
| prescreened | 7 | 2026-06-16 | |
| approved | 4 | | |

## 3. Issues & gaps (root causes)

### GAP 1 — Document/reference requesting is 100% manual *(your main complaint)*
- `cvp-request-documents` is invoked **only** by a manual admin button. **No function auto-calls it.**
- The *intent* exists but is orphaned: `cvp-iso-autoapprove-check` computes a **"pending — request references to qualify"** verdict for plausible-but-undocumented CVs, but only **writes it to a table and emails no one**.
- `cvp-prescreen-application` has exactly two endings: auto-advance to `prescreened`, or park in `staff_review`. There is **no branch** that says *"CV is credible but missing documented evidence → auto-request the documents."* That decision is left entirely to a human reading each application.

### GAP 2 — Status doesn't reflect the actual step *(your second complaint)*
- **`info_requested` is a phantom status:** it's defined in the UI (`STATUS_LABELS`, "Needs Attention" tab) and the daily digest, but **no function ever writes it.** So the "documents requested" stage is invisible — applications waiting on documents sit in `staff_review` or `references_requested` instead, with no distinct state.
- **Application status ≠ per-combination reality.** Real progress lives in `cvp_test_combinations` (per domain/language), but the list shows a single coarse `cvp_applications.status` badge. The "Tests to Review" tab has to *recompute* from combos because the application status lies (e.g. status `test_in_progress` while a combo is already auto-approved). That mismatch is the "status not showing the actual step."
- **`references_requested` has no auto-exit:** 79 applications entered this state and stopped — there's no automated progression when references arrive (and `references_received` is also barely produced).

### GAP 3 — Feature bloat (~50 `cvp-*` functions) *(your "too many features" hunch — confirmed)*
- Live one-off / migration / backfill functions still deployed (some on aggressive crons): `cvp-tms-migration-send` (**every 3 min**), `cvp-seed-library-refs` (every 5 min), `cvp-backfill-auto-send-general`, `cvp-backfill-regrade-and-send-v22`, `cvp-reprocess-prescreens`, `cvp-reconcile-tm-stuck`, `cvp-harvest-translation`.
- Overlapping feedback/test machinery: `cvp-process-feedback-auto-send`, `cvp-send-test-feedback-request`, `cvp-triage-test-feedback`, `cvp-save-flag-feedback`, `cvp-render-feedback-email-preview`, `cvp-submit-test-feedback`, `cvp-send-test-recovery`.
- Stale logic comments (e.g. `cvp-send-tests` says "automatically after pre-screen" — superseded by 2026-05-15 instrument-choice routing). The sprawl hides the happy path and is why the flow "feels" broken.
- **Source-control gap:** the `cvp-*` recruitment functions are **deployed but not in this repo** (only `cvp-suggest-vendor-rate` is on disk). Changing them safely means pulling deployed source into git first.

## 4. Target automated flow (only approval + activation email stay human)

```
submitted ─AUTO→ prescreening ─AUTO→ decide():
   • strong + documented        → prescreened → AUTO send test/quiz
   • credible, missing evidence  → AUTO cvp-request-documents  → status = info_requested      [NEW BRIDGE]
   • experience claim, no refs   → AUTO cvp-request-references  → status = references_requested  [NEW BRIDGE]
   • clearly unqualified         → AUTO queue rejection (existing cvp-send-queued-rejections)
docs/refs arrive (upload/webhook) → AUTO cvp-reassess-application → re-enter decide()           [NEW BRIDGE]
test passed + evidence complete   → status = ready_for_approval  (→ Needs Attention)            [NEW status]
   →► HUMAN: approve  →► HUMAN/clicked: activation email (cvp-approve-application)               [STAYS MANUAL]
```

**New pieces required:**
1. **Auto-request bridge** — extend `cvp-prescreen-application` (and/or a small new `cvp-auto-advance` step) so the `decide()` outcome that means "missing evidence" actually fires `cvp-request-documents` / `cvp-request-references`, sets the matching status, and logs to `cvp_outbound_messages` + an audit row.
2. **Wire `info_requested`** as a real produced status (the phantom becomes real) so the documents stage is visible.
3. **Auto-reassess on evidence arrival** — when an applicant uploads documents or references come back, auto-call `cvp-reassess-application` to re-run `decide()` and move the application forward (no human touch).
4. **`ready_for_approval` gate** — a single, honest "everything's done, human decision needed" status feeding "Needs Attention," replacing the `staff_review` catch-all for completed-evidence cases.
5. **Status accuracy** — derive the displayed status from the furthest-along reality (combine application status + per-combo state) OR collapse the redundant statuses so the badge can't lie.
6. **Logging** — every automated transition writes an audit row (who/what/when, decision basis) for ISO/IQVIA traceability.

**Stays human (by your instruction):** the final approve/reject decision and the activation email — both already live in `cvp-approve-application`, triggered from the RecruitmentDetail page. Add an explicit gate so nothing activates a vendor or emails them without a click.

## 5. Feature-bloat cleanup (separate from automation)
- Inventory the ~50 `cvp-*` functions → classify keep / retire / merge. Retire/disable one-off migration + backfill crons (`cvp-tms-migration-send` every 3 min, `cvp-seed-library-refs`, backfills). Consolidate the 6–7 feedback functions.
- Pull all kept `cvp-*` sources into git (close the source-control gap) before refactoring.

## 6. Open / pending
- **Live UI confirmation** of the status-display issue is pending portal login (OTP) — code analysis already explains it; a Chrome-MCP walkthrough will confirm visually.
- Confirm producers of `references_received` / `negotiation` (set outside the 8 core functions).
- Decide build scope/sequence with Raminder before implementing (plan-first).
