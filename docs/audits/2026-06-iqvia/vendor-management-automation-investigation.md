# Vendor-Management Automation — Investigation & Right-Sized Plan

**Date:** 2026-06-24 · **Project:** Supabase `lmzoyezvsjgsxveoakdr` · **Scope:** individual translator vendors only
**Method:** edge-function source review (~65 `cvp-*` functions across 3 reading passes), live `cvp_applications` / `qms.*` data, `cron.job` schedule + 30-day run stats, `cvp_system_config` toggles, and the ISO 17100 competence rubric (`competence-qualification-model.md`).
**Status:** PLAN ONLY — no build. Ends with a recommendation for human approval.

> **SUPERSEDED IN PART (2026-06-24):** the §"Open questions" are now answered in `vendor-management-decisions-record.md`, which overrides three points below: (1) §15 "retire the bulk machinery" is **deferred** — it's kept for a planned ~2000/month surge (D3); (2) the "`auto_approve` stays OFF / human click is the sole activation" stance is **amended** — a narrow, deterministic, regulated-domains-excluded surge auto-slice with retrospective sample-audit is approved (D4/D5); (3) the legacy-vendor question is **in scope now** (D6/D7). Read that record alongside this one.

> This supersedes the situational picture in `recruitment-automation-audit.md` / `recruitment-automation-spec.md` (2026-06-17). The bridges those docs proposed as "NEW" (auto-advance, `info_requested`, auto-doc-request) **have since shipped**. The problem today is no longer "nothing is automated" — it is **sprawl, open loops, and a decision layer that doesn't scale.**

---

## 0. TL;DR

1. **The system is not under-automated; it is over-built and under-converged.** ~65 `cvp-*` functions, three different `decide()`-style code paths, three parallel assessment instruments (test / quiz / COA), and an `EdgeRuntime`/cron mesh already exist. Prescreen coverage is 100%. The failure is that **loops don't close** and the **decision/qualification layer is a manual ceiling**.
2. **The funnel is clogged, not idle.** Of ~900 translator applicants, **17 are approved**. ~770 sit in three buckets: `prescreened` (334), `references_requested` (279), `test_sent` (158). Requests fire; responses don't come back and aren't chased to completion.
3. **Scale does not justify agents — or even most of what's here.** Steady-state is **tens to low-hundreds of individual translator applications per month** (Apr 115 / May 34; June's 835 was a one-off ProZ campaign). A thin state machine + 4 LLM judgment calls + one human ratifying a decision dossier is the right size. **A multi-agent swarm is the wrong answer, and the current sprawl already demonstrates why.**
4. **Verdict on "one agent per task + manager agent": No.** Not warranted by volume, and it would amplify the exact disease the codebase already has (divergent logic, races, open loops). The fix points the other way — **consolidate toward one explicit state machine.**
5. The data model is **sound and largely reusable**; this is a consolidation + loop-closing job, not a rebuild. The ISO rubric is already correctly encoded **at the final gate** — the weakness is throughput *into* that gate and the sprawl *around* it.

---

# PHASE 1 — CURRENT-STATE ASSESSMENT

## 1. Scale (the number that sizes everything)

| Month | Total apps | Translator | Notes |
|---|---:|---:|---|
| 2026-04 | 115 | 112 | pipeline launch (~Apr 24) |
| 2026-05 | 34 | 34 | normal cadence |
| 2026-06 | 835 | 772 | **one-off campaign spike (ProZ blast)** |

**Read:** the recruitment pipeline is ~2 months old. Steady-state individual-translator volume is **~30–115/month**; June's 772 was a deliberate sourcing blast, not the baseline. **Design target: tens–low-hundreds/month, burst-tolerant to ~800 over a few weeks.** This is a small operation. Any design whose *operational surface* (number of moving services to run, monitor, and keep in sync) exceeds what a manual reviewer + a handful of cron jobs would need is over-engineered for this volume.

## 2. Outcome data — the effectiveness diagnosis

Current `cvp_applications` status distribution (translator counts):

| Status | Translators | What it means | Read |
|---|---:|---|---|
| prescreened | **334** | passed AI prescreen, awaiting instrument choice | **stuck — biggest pool** |
| references_requested | **279** | refs requested, not returned | **open loop** |
| test_sent | **158** | test/quiz sent, not submitted | **open loop** |
| info_requested | 82 | docs/lang-pair requested (now a real status) | working as intended |
| references_in_progress | 14 | refs partially in | |
| test_in_progress | 11 | some tests open | |
| references_received | 8 | refs back, awaiting reassess | thin — loop barely closes |
| rejected | 8 | terminal | |
| staff_review | 5 | genuine human exceptions | **healthy — narrowed well** |
| approved | **17** | qualified vendor created | **~2% of translator applicants** |

**The shape of the problem:** the automation is excellent at *issuing* the next request (prescreen → instrument invite, request-documents, request-references) and poor at *closing* the resulting loop. Three open-loop pools (`prescreened` 334, `references_requested` 279, `test_sent` 158) hold ~85% of all live translator applications.

## 3. What actually runs (cron + toggles — ground truth)

**Active recruitment crons (last 30 d):**

| Job | Cadence | Calls | Health |
|---|---|---|---|
| `cvp-auto-advance` | */10 min | cvp-auto-advance | ✅ 754 runs, 0 fail |
| `cvp-check-test-followups-hourly` | hourly | cvp-check-test-followups | ✅ |
| `cvp-send-queued-rejections-hourly` | hourly | cvp-send-queued-rejections | ✅ |
| `cvp-process-feedback-auto-send` | */5 min | feedback round auto-send | ✅ |
| `cvp-drain-test-library` | */5 min | **cvp-seed-library-refs (Opus)** | ⚠️ Opus generation every 5 min — cost/abuse smell |
| `cvp-choice-reminders` | every 3 h | cvp-send-choice-reminders | ⚠️ **`domains` filter = `[coa, life_sciences, pharmaceutical, medical]` only** → general translators never nudged |
| `cvp-reference-reminders-daily` | daily 15:00 | cvp-reference-reminders | ⚠️ created 2026-06-23 → only **1 run** (refs went un-chased for weeks) |
| `cvp-check-grading-followups` | daily | grading nudges | ✅ |
| `cvp-daily-recruitment-status` | daily | digest email | ✅ |
| `evidence-screen-12h` | */12 h | **cvp-evidence-screen-backfill** | ❌ **3/3 FAILED** — the document-evidence screener is broken |
| `evidence-screen-switch-to-48h` | one-shot Jul 4 | `evidence_screen_switch_to_48h()` | pending |
| `qms-requalification-maintenance` | monthly | `qms_run_requalification_maintenance(60)` | not yet fired |

**Config toggles (`cvp_system_config`):**

| Key | State | Effect |
|---|---|---|
| `auto_approve` | **OFF** | final approval stays human ✅ (correct) |
| `auto_doc_request` | **ON** | prescreen auto-emails for missing docs → `info_requested` |
| `auto_evidence_sweep` | **ON** | auto-advance Phase C2 requests refs on passed-but-unreferenced apps |
| `choice_reminders_enabled` | ON | choice nudges live (but domain-limited, see above) |
| `inbound_frontdesk` / `inbound_auto_triage` / `inbound_received_ack` | ON | AI front-desk handling inbound mail |
| `safe_mode` | **lapsed** | started 2026-04-24, 30-day window elapsed → the auto-advances/emails it gated are now live |

**Implication:** the operation is currently running in **near-full-auto for everything up to approval** — which is exactly per the earlier spec's intent. The pile-ups are therefore *not* "a human forgot to push the button"; they are **structural: the loops that should pull applicants forward after a request don't reliably fire or don't have a return path.**

## 4. Function inventory (grouped; ~65 `cvp-*` + `qms-*`)

Rather than 65 rows, grouped by lifecycle role with a keep/retire lens. (Full per-function notes captured during the audit; summarized here.)

**A. Intake / prescreen (keep — core):**
`cvp-submit-application` (public form → `submitted`, seeds `cvp_test_combinations`), `cvp-prescreen-application` (**LLM: Sonnet 4.5 base / Opus reassess** — CV+form review → `prescreened` | `staff_review`; auto-doc + auto-instrument-invite branches), `cvp-check-email`, `cvp-get-application-summary`, `cvp-get-cv-url`, `cvp-get-my-domains`.

**B. Document / NDA collection (keep — core):**
`cvp-request-documents`, `cvp-request-documents-bulk`, `cvp-request-info` (**LLM: Opus** prose), `cvp-applicant-portal-invite`, `cvp-applicant-sign-nda` (clickwrap → `vendor_nda_signatures`), `cvp-doc-upload-followup` (one-shot backfill — **retire after drain**).

**C. Assessment — three parallel instruments (CONSOLIDATE):**
- Production test: `cvp-send-tests`, `cvp-send-targeted-test`, `cvp-request-test`, `cvp-get-test`, `cvp-submit-test`, `cvp-save-test-draft`, `cvp-assess-test` (**LLM: Sonnet 4.6, MQM rubric** — the real competence grade), `cvp-record-tm-submission`, `cvp-reconcile-tm-stuck` (one-shot), `cvp-harvest-translation`.
- ISO quiz: `cvp-get-quiz`, `cvp-preview-quiz`, `cvp-submit-quiz` (**deterministic answer-key** — correctly not an LLM task).
- COA clinical: `cvp-coa-assess-translation` (**LLM: Opus, reference-free MQM**).
- Choice routing: `cvp-record-instrument-choice`, `cvp-send-instrument-choice-invitation`, `cvp-send-instrument-reminder`, `cvp-send-choice-reminders`.
- Feedback sub-system (6+ fns — **over-built**): `cvp-send-test-feedback-request`, `cvp-submit-test-feedback`, `cvp-triage-test-feedback` (**LLM: Sonnet**), `cvp-get-test-feedback-context`, `cvp-render-feedback-email-preview`, `cvp-save-flag-feedback`, `cvp-process-feedback-auto-send`.

**D. References (keep — core, but loop is leaky):**
`cvp-request-references` (**LLM: Opus draft**), `cvp-bulk-request-references`, `cvp-submit-reference-contacts`, `cvp-submit-reference-feedback` (**LLM: Opus** — sentiment/year/domain corroboration), `cvp-reference-reminders`, `cvp-seed-library-refs` (**Opus, on */5 cron — review**).

**E. Decision / qualification (CONSOLIDATE — the ceiling):**
`cvp-auto-advance` (**deterministic 7-phase cron** — the de-facto state machine), `cvp-iso-autoapprove-check` (**Haiku CV-extraction + deterministic route a/b/c scorer; dry-run**), `cvp-reassess-application` (**Sonnet 4.6** advisory verdict), `cvp-approve-application` (**the irreversible gate** + `qms_bridge_cvp_competence` RPC; **LLM: Opus** welcome-prose only), `cvp-reject-application` (**Opus** prose) + `cvp-send-queued-rejections`, `cvp-waitlist-application`, `cvp-provisional-onboard-batch`, `recruitment-approval-queue` (read view), `qms-suggest-qualification` (**Haiku** advisory).

**F. One-shot / migration / backfill still deployed (RETIRE/ARCHIVE):**
`cvp-reprocess-prescreens`, `cvp-backfill-auto-send-general`, `cvp-backfill-regrade-and-send-v22`, `cvp-reconcile-tm-stuck`, `cvp-doc-email-redirect-backfill`, `cvp-tms-migration-enqueue/-send`, `cvp-send-test-recovery`, `cvp-seed-library-refs` (move off */5), `cvp-evidence-screen-backfill` (**currently failing**).

## 5. Diagnosis — *why* it's ineffective (structural vs. data-model)

**This is mostly a STRUCTURAL + HANDOFF problem, not a data-model problem.** The schema would carry forward almost unchanged. Root causes:

1. **No single state machine; `decide()` is smeared across ≥4 places** — `cvp-prescreen-application`, `cvp-iso-autoapprove-check`, `cvp-auto-advance` (7 phases), and `cvp-approve-application` each embed their own "what's missing / what next" logic. They drift. The 2026-06-17 spec warned about exactly this ("that divergence is part of the problem") and it has since *grown* (auto-advance added a 7-phase engine *next to*, not *replacing*, the others).
2. **Open loops — requests fire, returns aren't pulled forward.** `references_requested` (279) has a weak return path (`cvp-reference-reminders` ran once; reassess-on-arrival is thin). `prescreened` (334) stalls because **choice reminders are domain-filtered to 4 clinical domains** — general translators are never nudged to pick an instrument. `test_sent` (158) relies on completion that isn't happening.
3. **The decision layer is a manual ceiling.** Approvals are hand-run batches (route-a degree verification by one person). 17 approved is the throughput of a human reading dossiers one at a time, with no LLM step that *assembles and proposes* a per-domain/per-pair determination for fast ratification.
4. **Instrument sprawl.** Three assessment paths (test / quiz / COA) + a 6-function feedback sub-system create combinatorial surface and per-combo status that contradicts the coarse application badge (the long-standing "status doesn't show the real step" complaint).
5. **A broken judgment step.** The document-evidence screener (`evidence-screen-12h` → `cvp-evidence-screen-backfill`) fails every run — so uploaded degrees/certs are not being machine-classified into evidence; that work falls back to humans, feeding the approval ceiling.
6. **Qualification coverage gap (ISO-critical).** Only **179 / 1519** active vendors (12%) have a QMS role qualification; all 227 qualifications + 973 evidence rows are <30 days old. The qualification layer is new and sparse — the audit trail the rubric depends on barely exists for the legacy base.

**What is NOT broken:** the data model, the ISO rubric encoding at the final gate (route a/b/c OR-gate; experience routes b/c are *blocked* at approval until references corroborate the years — a 409; only evidenced domains qualified), prescreen coverage, and audit logging (`cvp_application_decisions` captures every action with AI input/output + actor).

## 6. Data model map (what exists, what the target needs)

**Per-applicant spine:** `cvp_applications` (`status`, `role_type`, `qualification_basis` + `_recorded_at/_by`, `instrument_choice`, prescreen result, rate card). **This already carries the lifecycle status field** the target needs — no new spine required.

**Evidence & assessment:** `cvp_test_combinations` (per domain×pair state — the real progress), `cvp_test_submissions` (+ `ai_score`, MQM result), `cvp_quiz_submissions`, `cvp_coa_translation_responses`, `cvp_application_iso_evidence` (uploaded-doc evidence), `cvp_application_references` / `_reference_requests` (+ `reference_confirmed_start_year`, `reference_confirmed_domains`), `vendor_nda_signatures`.

**Decision & audit:** `cvp_application_decisions` (append-only action log w/ AI I/O + actor), `cvp_approval_queue` view (readiness keyed on QMS evidence), `cvp_iso_autoapprove_runs/_results`.

**Qualification of record (ISO §6.1):** `qms.role_qualifications`, `qms.competence_evidence`, `qms.language_pair_qualifications`, `qms.subject_matter_qualifications`, `qms.competence_bases`, `qms.qualification_audit_log` (append-only; `audit_log_no_mutate`), `qms.nda_agreements`. Actor columns FK `auth.users` → resolve via `qms_resolve_actor()`.

**Gap to close in schema (small):** one explicit, enumerated `lifecycle_state` + a `state_history` (or reuse `cvp_application_decisions` with `from_state`/`to_state`). Everything else is reuse.

## 7. Constraints

- **Stack:** Supabase (Postgres + RLS + Deno edge functions + `pg_cron` + `pg_net`). Email via Brevo (bulk) + Mailgun. LLM = Anthropic (Haiku/Sonnet/Opus). No separate app server — logic lives in edge functions and SQL.
- **Auth:** edge functions deploy `--no-verify-jwt`; UI calls via `supabase.functions.invoke`; cron calls carry `x-cron-secret` from `vault`. Applicant/reference/test access is **token-keyed** (no login required for the assessment/reference flows).
- **Document submission:** portal upload (vendor-certifications bucket → QMS locker) is the system of record; email-attachment is fallback (inbound webhook redirects to portal).
- **Integrable vs replace:** everything is integrable — this is consolidation in place. The only "replace" candidates are the **retire/merge** functions in §4F and the **broken evidence screener**.
- **Hard rule:** onboarding/qualification is **IRREVERSIBLE** (append-only `qms.qualification_audit_log`). No trial onboardings on prod.

## 8. Unknowns / access still needed

- **Per-stage dwell time & true conversion** (e.g. % of `test_sent` that ever submit; median days in `references_requested`). Needs a cohort query over `cvp_application_decisions` timestamps — straightforward, not yet run.
- **Why `cvp-evidence-screen-backfill` fails** (3/3). Function source not in the read set / possibly deleted-but-cron-left — needs `get_logs` + function fetch.
- **Public apply form** lives in the **vendor repo** (`join.cethos.com`, `apps/recruitment`), not this repo — confirm its exact payload/validation there before changing intake.
- **Intended role of the 6-function feedback sub-system** in the ISO story (is applicant test-feedback an audit requirement, or product nicety?) — a human/product call.
- **Legacy 1,340 unqualified active vendors** — in or out of scope? (Retroactive qualification is a separate, large workstream; `qms.v_retroactive_qualification_candidates` exists.)

---

# PHASE 2 — RECOMMENDED TARGET SYSTEM

## 9. Shape: one state machine + one `decide()` + one decision-dossier step

Not a rebuild. **Collapse the sprawl into three named things**, keep the good deterministic plumbing, and add the one LLM step that's actually missing (the manager dossier).

```
                         ┌─────────────────── deterministic plumbing (code) ───────────────────┐
 received → prescreening → screened → { needs_documents | needs_references | assessment | escalated | rejected_pending }
                │              │                       │                          │
            [LLM: prescreen] [decide()]          (inbound events re-enter decide(): doc uploaded / ref returned / test graded)
                                                       ▼
                                          evidence_complete → ready_for_decision
                                                       │
                                          [LLM: manager dossier]  → per-domain × per-pair determination
                                                       ▼
                                                 manager_review  ──HUMAN──►  approve → qualified (QMS)  |  reject  |  waitlist
```

- **One state machine.** `cvp_applications.lifecycle_state` is the single source of truth; **a state change is the only thing that triggers the next step** (via DB trigger → `pg_net`, or the existing */10 `cvp-auto-advance` tick reading state). No function embeds its own routing.
- **One `decide(application) → next_state` pure function** (Postgres or a single edge module) used by **every** entry point (post-prescreen, on-evidence-arrival, on-test-graded). This replaces the divergent logic in prescreen / iso-autoapprove-check / auto-advance's 7 phases. It is **deterministic** — it reads evidence rows and returns the next state; it never calls an LLM.
- **One decision-dossier step** (the "manager"): an **LLM call** that, at `ready_for_decision`, assembles all evidence and emits the rubric's structured per-domain/per-pair determination for a human to ratify. This is the missing piece that breaks the 17-approved ceiling.

## 10. Lifecycle states & transitions (individual translator)

| State | Entered by | Step type | Reads / Writes |
|---|---|---|---|
| `received` | submit (public form) | code | writes app + seeds combos |
| `prescreening` | trigger on `received` | **LLM (prescreen)** | reads CV+form; writes `ai_prescreening_*` |
| `screened` | prescreen done | **code: `decide()`** | branches on evidence completeness |
| `needs_documents` | decide() | code | fires doc/info request; sets state; logs |
| `needs_references` | decide() | code | fires reference request; sets state; logs |
| `assessment` | decide() | code | dispatches instrument (test/quiz/COA) |
| → on submit | applicant | **LLM (grade test / COA)** or **code (quiz key)** | writes score + combo state |
| `evidence_review` | inbound event (doc/ref/grade) | **code: `decide()`** | re-evaluates; loops back or advances |
| `ready_for_decision` | decide(): evidence complete | **LLM (manager dossier)** | writes structured determination |
| `manager_review` | dossier ready | **HUMAN** | reviewer ratifies / edits / escalates |
| `approved` → `qualified` | human click | code (`approve-application` + QMS bridge) | creates vendor + `qms.*` records |
| `rejected` / `waitlisted` / `escalated` | human or narrow code | code | terminal / hold / human queue |

**Code vs LLM — and why:**

| Step | Type | Justification |
|---|---|---|
| Request docs / refs, send reminders, dispatch instrument, expire tokens, move state, send PO/welcome | **code** | rules + cron + queue workers. *An LLM must not decide whether to send a day-3 reminder.* |
| Quiz grading | **code** | answer key — deterministic, reproducible, free. |
| **Prescreen** (CV+form triage) | **LLM** | judgment: is the CV credible, does it corroborate the form, what's missing. |
| **Document review** (classify each upload, extract degree field/issuer/field-of-study) | **LLM** | judgment: is this a *translation* degree (route a) vs other field (route b); extract verbatim. **(Currently broken — must be fixed.)** |
| **Reference review** (corroboration, independence, year/domain confirmation) | **LLM** | judgment: does the referee actually corroborate the claim; is it independent; any red flag. |
| **Production-test grading** (MQM) | **LLM** | judgment: translation quality against rubric. (COA Part-2 likewise.) |
| **Manager decision dossier** (apply rubric → per-domain/per-pair determination) | **LLM** | judgment: assemble heterogeneous evidence and map to routes a/b/c + §6.1.6 domain gates, flag ESCALATE. **Proposes; does not decide.** |

Every other step is deterministic. That is **4 LLM judgment points + the existing prescreen** — five LLM steps total, each at a genuine judgment boundary. Nothing autonomous; nothing polling.

## 11. The four LLM judgment steps (I/O + owned fields)

1. **Document review** — *in:* uploaded file (PDF/image) + declared credentials. *out (structured):* `{doc_type, is_translation_degree, field_of_study, issuer, conferred_year, confidence, extracted_quote, flags[]}`. *owns:* `cvp_application_iso_evidence` rows (classification + extraction). **Fix the failing screener and make it event-triggered on upload, not a 12-h backfill cron.**
2. **Reference review** — *in:* referee's verbatim answers + applicant's claim. *out:* `{corroborates: bool, independent: bool, confirmed_start_year, confirmed_domains[], sentiment, red_flags[], confidence}`. *owns:* `cvp_application_references.{reference_confirmed_*, *_verification, analysis}`. (Already implemented in `cvp-submit-reference-feedback` — keep.)
3. **Production-test grading** — *in:* source + applicant translation (no reference leaked). *out:* MQM `{score, dimension_scores, errors[], pass}`. *owns:* `cvp_test_submissions.ai_assessment_*`, `cvp_test_combinations.{ai_score,status}`. (Already implemented in `cvp-assess-test` / `cvp-coa-assess-translation` — keep; bounds enforced server-side.)
4. **Manager decision dossier** *(new — consolidates `iso-autoapprove-check` + `reassess-application`)* — *in:* assembled evidence (prescreen, doc classifications, references, test/quiz/COA scores, NDA, declared domains×pairs). *out (the rubric's structured determination):*
   ```
   { qualification_basis: {route: a|b|c|null, evidence_refs:[...], confidence},
     determinations: [ { domain, source_lang, target_lang,
                         qualified: bool, basis: "test"|"coa"|"cert"|"declared_unverified",
                         evidence_refs:[...], recommendation: APPROVE|ESCALATE|REJECT, rationale } ],
     overall_recommendation: APPROVE|ESCALATE|REJECT,
     escalation_reasons:[...] }
   ```
   *owns:* a `decision_dossier` record (reuse `cvp_iso_autoapprove_results` or a new `cvp_decision_dossiers`). **It writes a proposal; the human ratifies; `cvp-approve-application` executes.** `auto_approve` stays OFF.

## 12. The decision layer (how the rubric is applied — not redesigned)

The manager step **applies** `competence-qualification-model.md` exactly as written:
- **Basis = OR-gate over routes a/b/c**, established in order; route a = verified translation degree (from the document-review step); b = other degree + ≥2 yrs corroborated; c = ≥5 yrs corroborated (from the reference-review step). Experience routes require **reference-corroborated** years — the dossier marks them ESCALATE if corroboration is thin, and `cvp-approve-application` still hard-blocks (409) without it.
- **Per-domain (§6.1.6):** qualify a high-risk domain only on a passed domain test, passed COA quiz, or verified cert; everything else → `declared_unverified` (never qualified). The dossier emits one determination per declared domain×pair.
- **Per-language-pair:** determinations are pair-scoped; `qms.language_pair_qualifications` is written per approved pair.
- **Operational gates kept separate from competence:** NDA + active status are gates the bridge checks (`qms_promote_provisional_if_verified`), not competence evidence.

The human reviewer sees the dossier as a checklist (domain×pair rows with APPROVE/ESCALATE/REJECT + evidence links) and ratifies in one screen — turning today's slow per-applicant reading into fast per-row confirmation. **The criteria are unchanged; only the assembly + presentation are automated.**

## 13. Human-in-the-loop

| Reaches a human | When | Format |
|---|---|---|
| **Manager dossier** | every applicant at `ready_for_decision` | one screen: basis + per-domain/pair rows + evidence links + recommendation |
| **ESCALATE cases** | dossier flags ambiguous experience, regulated-domain thin evidence, or integrity flags | same screen, sorted to top, reason shown |
| **`escalated` state** | prescreen genuine ambiguity (AI error, CV-vs-form contradiction) | narrow exception queue (today's `staff_review`, kept small) |
| **Nothing else** | — | the pipeline drives everything up to the dossier and stops |

Activation/welcome email + vendor creation fire only on the human click (existing `cvp-approve-application`). `auto_approve` remains OFF.

## 14. Trigger model, reliability, integrity

- **Event/state-driven, not polling.** State change → DB trigger → `pg_net` call (or the existing */10 tick reads state and acts). The only "polling" is the reminder cadence (day-3/6/9), which is inherently time-based and fine.
- **Idempotency (the current open-loop fix):** `decide()` is pure and re-runnable; **never re-request evidence already received** (guard on `cvp_application_iso_evidence` / `cvp_application_references` presence). Reminders dedupe on `message_id` + per-slot stamps (already done). On-arrival reassessment must be idempotent so a doc upload can't double-advance.
- **Retries/failure:** LLM steps retry once then route to `escalated` (already the pattern in prescreen/assess) — fail to a human, never silently drop.
- **Audit = the ISO trail:** every state change writes `from_state → to_state, action, actor ('system:<fn>' or staff id), basis, AI input+output, timestamp` to `cvp_application_decisions` (already the shape). This *is* the §6.1 reproducibility evidence.
- **Integrity controls for tests (gap to add):** today there is token expiry (7 d), draft autosave, and view tracking — but **no per-attempt timebox and no MT/AI-use detection.** Add: (a) a start→submit clock with a bounded window per attempt; (b) MT/AI-use signals on the production test (paste-burst/latency telemetry + an LLM "is this machine-translated?" check) so the one human-authored artifact is meaningful. Quiz is MCQ so timebox only.

## 15. What to retire / merge (cuts maintenance below the manual cost it replaces)

- **Retire one-shots/backfills** (§4F) — archive the deployed functions and delete their crons.
- **Move `cvp-seed-library-refs` off the */5 Opus cron** to on-demand seeding (an LLM generating reference translations every 5 minutes is cost/abuse surface for no live need).
- **Collapse the 6-function feedback sub-system** to (issue → submit → triage) once the product role is confirmed.
- **Fold `cvp-iso-autoapprove-check` + `cvp-reassess-application` into the single manager-dossier step.**
- **Fold the 7-phase `cvp-auto-advance` logic into `decide()`** so there is one router, not two.
- **Un-filter `cvp-choice-reminders`** (drop the 4-clinical-domain restriction) so general translators at `prescreened` get nudged — likely the single highest-yield unblock for the 334 pool.

---

# DELIVERABLE 3 — END-TO-END WALKTHROUGH (one applicant)

**Applicant:** Maria, FR→EN, claims an MA in Translation + 6 yrs freelance, declares General + Medical.

1. **Submit** (code) — public form → `received`; seeds combos {General FR→EN, Medical FR→EN} as `pending`; confirmation email.
2. **Prescreen** (LLM) — Sonnet reads CV+form → credible, degree claimed but file not yet classified → `screened`.
3. **decide()** (code) — degree not yet machine-verified → `needs_documents`; auto-emails Maria to upload her diploma; logs the transition. *No human touched it.*
4. **Upload → Document review** (LLM, event-triggered) — classifies the PDF: `is_translation_degree=true, field="Translation", conferred 2018, confidence 0.93` → writes `cvp_application_iso_evidence`. Fires `decide()`.
5. **decide()** (code) — route **a** now satisfiable; General needs a competence signal → dispatch instrument-choice → `assessment`. Medical is high-risk → stays `declared_unverified` pending a domain test/COA/cert.
6. **Test** (LLM grade) — Maria picks the production test; submits; `cvp-assess-test` MQM-scores 82 → General FR→EN combo `approved` (`test_submission_id`+`ai_score`). (Had she been a clinical applicant, COA Part-2 → `cvp-coa-assess-translation`.)
7. **References** — because basis is route **a**, references are *not* required for basis; decide() sees evidence complete for General → `ready_for_decision`. (If she'd relied on route b/c, decide() would have gone `needs_references` and the reference-review LLM would corroborate the years first.)
8. **Manager dossier** (LLM) — assembles: basis=route a (degree evidence ref), General FR→EN = APPROVE (test 82), Medical FR→EN = ESCALATE/declared_unverified (no domain evidence). Writes the structured determination.
9. **manager_review** (HUMAN) — reviewer sees two rows, ratifies General, leaves Medical unqualified, clicks Approve.
10. **approve → qualified** (code) — `cvp-approve-application` creates the vendor + `cvp_translators` + `vendor_language_pairs` + rates; `qms_bridge_cvp_competence` writes `role_qualifications` (basis a), `competence_evidence` (test), `language_pair_qualifications` (FR→EN); welcome email fires. Medical remains declared-only until earned.

Acts at each step: **code** at 1,3,5,7,10; **LLM** at 2,4,6,8; **human** only at 9.

---

# DELIVERABLE 4 — VERDICT ON THE MULTI-AGENT QUESTION

**No. A pack of one-LLM-agent-per-task pollers + a manager agent is the wrong architecture here — on three independent grounds:**

1. **Scale.** Tens–low-hundreds of individual translator applications per month, with 17 approvals to date. The entire monthly decision load fits comfortably in one reviewer ratifying dossiers. Autonomous agents earn their keep when work is high-volume, open-ended, and parallel across unknown shape — none of which holds.
2. **The failure is already the agent failure mode.** The codebase is *effectively* a loose collection of ~65 semi-independent functions with divergent `decide()` logic and time-based wakeups. It already exhibits the pathologies the prompt warns about: races between paths, duplicate/triple instrument handling, open loops, and status that contradicts reality. **Adding autonomous agents would deepen exactly this disease.** The remedy is the opposite vector: one explicit state machine, one router, one decision step.
3. **Determinism is a feature here, not a limitation.** This is an ISO 17100 / IQVIA-audited process. "Why did this applicant advance?" must have a reproducible, rule-based answer. An autonomous agent *choosing* whether to send a reminder or advance a state is unauditable and unnecessary. LLMs belong **only** at the four judgment boundaries (document, reference, test, manager-dossier) + prescreen — each producing structured output a human or a deterministic rule consumes.

**Right-sized answer:** a thin state machine (mostly the code that already exists, consolidated) + 5 LLM calls at judgment points + one human ratifying a per-domain/per-pair dossier. No autonomous agents, no shared-DB pollers, no manager agent.

---

# DELIVERABLE 5 — RISKS, OPEN QUESTIONS, PHASED SEQUENCE

## Risks
- **Irreversibility:** qualification is append-only. Any `decide()`/dossier change must be validated on a single record before batch use; never trial-onboard on prod.
- **Consolidation regression:** folding 4 routers into 1 risks behavior drift. Mitigate with a shadow/dry-run: run new `decide()` alongside current and diff outcomes before cut-over.
- **LLM over-reach into the gate:** the manager step must *propose only*. Keep `auto_approve` OFF; the human click stays the sole activation.
- **Integrity blind spot:** without MT/AI-use detection, a machine-translated test passes as human competence — a real ISO validity risk.
- **Legacy debt:** 1,340 active vendors without qualification records is a standing audit exposure independent of this redesign.

## Open questions needing a human decision
1. **Steady-state target volume** to design for — confirm tens–low-hundreds/month + burst tolerance (drives how much, if any, of the bulk machinery to keep).
2. **Reference policy** — current policy lets references approve *any* domain incl. COA (corroboration, not a gate). Keep, or require a test/cert for high-risk domains regardless of references? (Affects the dossier's domain logic.)
3. **Feedback sub-system** — ISO requirement or product nicety? (Determines retire vs keep.)
4. **Legacy 1,340 unqualified vendors** — in scope now, or a separate retroactive-qualification workstream?
5. **Route-c rigor (rubric Gap 7)** — add the "full-time / annual volume" reference question before recording basis c? (Already on the rubric roadmap.)

## Phased build sequence (each = its own PR, verify live, plan-first)
- **Phase 0 — Stop the bleeding (days, high yield, low risk):** un-filter `cvp-choice-reminders` (unblock the 334 `prescreened`); fix/replace the broken `cvp-evidence-screen` step and make document review **event-triggered on upload**; confirm `cvp-reference-reminders` is actually chasing the 279. *No architecture change — pure loop-closing.*
- **Phase 1 — One `decide()`:** extract a single pure router; run it in **shadow mode** against `cvp-prescreen` + `cvp-auto-advance` + `cvp-iso-autoapprove-check`; diff; then cut those paths over to it. Add explicit `lifecycle_state` + `state_history`.
- **Phase 2 — Manager dossier:** build the LLM decision-dossier step (folding in `iso-autoapprove-check` + `reassess`); surface as the one-screen ratification UI on the approval page. Breaks the 17-approved ceiling.
- **Phase 3 — Integrity:** add test timebox + MT/AI-use detection.
- **Phase 4 — Cleanup:** retire one-shots/backfills, move seed-refs off cron, collapse the feedback sub-system, fold auto-advance's phases into `decide()`.
- **Phase 5 (separate track):** legacy retroactive qualification.

**Do not proceed to build until the §"Open questions" are answered and this plan is approved.**
