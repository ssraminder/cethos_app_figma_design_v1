# Vendor-Management Redesign — Decisions Record & Updated Build Direction

**Date:** 2026-06-24 · **Pairs with:** `vendor-management-automation-investigation.md`
**Purpose:** Close out the investigation's §"Open questions" with the principal's decisions, record the compensating controls agreed for each, and update the build sequence. The architecture verdict (one state machine + `decide()` + manager dossier; **no agents**) is unchanged and confirmed.

---

## Decisions

### D1 — Reference policy (high-risk domains)
**Decision:** Keep current behaviour — references can qualify *any* domain, including clinical/COA. References are corroboration, not gated behind a test/cert for high-risk work.
**Compensating control:** Document this in the QMS as a *deliberate, written criterion* ("referee-corroborated domain experience is accepted as domain evidence"), so it reads to an auditor as a consistent policy, not a gap. The reference-review step already captures confirmed domains — that's the evidence trail.

### D2 — Route-c experience unit
**Decision:** Referee-confirmed *duration* only — no annual word-count or project-count gate.
**Compensating control:** The reference-review step must capture **full-time vs part-time / regularity**, so "2 years" means 2 years of substantive work, not occasional freelancing. Duration + substantiveness is what's recorded as basis (c).

### D3 — Design volume
**Decision:** Steady-state **~100–200/month**; **initial surge ~2000/month**.
**Impact (changes two investigation recommendations):**
- **Do NOT retire the bulk-request machinery yet** — it's needed for the 2000/month surge. Defer that cleanup (investigation §15) until steady state.
- **Phase 0 loop-closing must land BEFORE the surge.** Pointing 2000/month at today's open loops would recreate the ~770-stuck pile at ~10× scale.
- Steady-state 100–200/month still confirms **no agents** — architecture verdict holds.

### D4 — Surge approvals
**Decision:** **Auto-approve a clean low-risk slice during the surge only**; human gates everything else. Reverts to human-gates-all at steady state.
**Non-negotiable guardrails:**
- Auto-slice **excludes all high-risk/regulated domains** (medical/pharma/legal/COA) — those always reach a human, surge or not. (Note: this is *narrower* than D1; D1 governs what a *human* may approve, D4 governs what may approve *without* one.)
- Auto-slice criteria are **deterministic config**, not LLM discretion. The dossier proposes; a fixed rule fires the auto-approve.
- Surge mode is a **real switch** (volume- or date-bound) that defaults back off.

### D5 — Where the auto-slice lands
**Decision:** **Full qualification** (straight to qualified), accepting that the record is permanent/irreversible. (Provisional buffer declined.)
**Compensating controls (these now do the work the human gate and provisional buffer would have — treat as spec, not optional):**
- **Start narrow, widen later.** Open the surge with only the most unambiguous profile — route-(a) *verified* degree + test score above a set MQM floor + single non-regulated pair + NDA signed + zero flags. Observe, then loosen.
- **Retrospective sample audit** — a human reviews a random **10–20% of auto-approvals weekly**, after the fact, logged. This is the audit-defensible substitute for the removed human gate: documented oversight of the automation. Without it, "auto-qualify, no human, no check" fails audit.

### D6 — Legacy 1,340 unqualified vendors
**Decision:** **In scope now**, folded into this redesign (not a separate build) — run them through the same pipeline.
**Conditions:**
- **Use work history as evidence** — completed projects + four-eyes revision history qualify vendors with demonstrated work; reserve fresh tests for thin-history cases. Don't re-test 1,340 from scratch. (`qms.v_retroactive_qualification_candidates` exists.)
- **Sequence after the surge / into lulls** — do not run the legacy backfill concurrently with the 2000/month surge; combined load would swamp the human gate.

### D7 — Legacy vendors during re-qualification
**Decision:** **Grace period** — keep working while being re-qualified.
**Compensating control:** Documented transition plan with a **firm deadline (≈60–90 days)** and a **consequence**: at deadline, an unfinished vendor is suspended from *new* work until qualified. Ties to the existing `qms-requalification-maintenance` cadence. This keeps "grace" from becoming an open-ended unqualified-but-working gap.

### D8 — Applicant test-feedback sub-system
**Decision:** **Product nicety — collapse** to issue→submit→triage; cut the rest.
**Caveat:** This is *applicant* feedback on their test. It is **not** the ISO-required feedback/corrective-action process — that one is **client feedback on delivered translations** (post-production) and lives elsewhere. Do not let this cut touch the client-feedback loop.

---

## Still-standing items (independent of the above, from the investigation)
- **Fix the broken document-evidence screener** (`evidence-screen` 3/3 failing) and make document review **event-triggered on upload**. This is one of the four LLM judgment steps and it's currently down — it feeds the human ceiling.
- **Un-filter `cvp-choice-reminders`** (drop the 4-clinical-domain restriction) to unblock the 334 stuck in `prescreened` — highest-yield, lowest-risk fix.
- **Verify the §6.1.6 citation** for domain specialisation against the licensed standard before it's locked into qualification records — domain competence sits in the 3.1.4 competence list; clause 6 is the production process. It's now load-bearing in code.

---

## Updated build sequence

- **Phase 0 — Stop the bleeding (before any surge).** Un-filter choice reminders; fix/replace the evidence screener and make doc-review event-triggered; confirm reference-reminders are chasing the 279. Pure loop-closing, no architecture change.
- **Phase 1 — One `decide()`.** Extract the single pure router; shadow-run against prescreen / auto-advance / iso-autoapprove-check; diff; cut over. Add explicit `lifecycle_state` + `state_history`.
- **Phase 2 — Manager dossier.** Build the LLM decision-dossier step; surface as the one-screen ratification UI. Breaks the 17-approved ceiling.
- **Phase 2b — Surge auto-slice (D4/D5).** Deterministic auto-approve rule for the narrow clean slice + surge toggle + the retrospective sample-audit job. Land before the 2000/month surge; keep narrow initially.
- **Phase 3 — Integrity.** Test timebox + MT/AI-use detection (so an auto-approved test score is meaningful — directly supports D5).
- **Phase 4 — Cleanup (deferred past surge per D3).** Retire one-shots/backfills, move seed-refs off cron, collapse the feedback sub-system (D8), fold auto-advance phases into `decide()`. **Keep bulk machinery until steady state.**
- **Phase 5 — Legacy requalification (D6/D7).** Work-history-driven, grace period with deadline, sequenced into lulls after the surge.

**Do not build until this record + the investigation plan are approved. Qualification is irreversible — validate `decide()` and the auto-slice rule on single records before any batch run.**

---

## Reviewer notes (added 2026-06-24, on intake of this record)

Two coherence/sequencing points surfaced when reconciling this record against the investigation — neither changes a decision; both are build-time guardrails:

1. **Phase 2b depends on the test-integrity slice of Phase 3, not just on Phase 0.** The D5 auto-slice qualifies on "test score above an MQM floor." A score is only trustworthy once **MT/AI-use detection** (Phase 3) exists; otherwise the auto-slice can permanently qualify a machine-translated test, and the retrospective 10–20% audit only *catches* it after an irreversible record is written. **Guardrail:** the MT/AI-use detection control must be live (at least on the production test) **before** the auto-slice is switched on — even if the rest of Phase 3 lands later. The auto-slice also depends on Phase 0's fixed document-review step (route-(a) "verified degree" is a doc-review output that is currently down).

2. **The §6.1.6 citation should be corrected before Phase 1/2 bake it into more records.** Clause numbers are already load-bearing in code and in `qms.competence_bases`; see the citation-location scan in the build notes. Recommend a single corrective pass after verification against the licensed copy, *before* the new `decide()`/dossier writes additional qualification records that cite a clause.
