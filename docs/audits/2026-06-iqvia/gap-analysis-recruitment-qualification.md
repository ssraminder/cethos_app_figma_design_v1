# Gap Analysis — Staff Qualification, Training & Supplier Management
## ISO 17100:2015 (+Amd.1:2017) + IQVIA vendor-qualification requirements

**Date:** 2026-06-17 · **Scope:** the recruitment / linguist-qualification area of the 29–30 Jun IQVIA audit (agenda items: *Staff Qualification and Training*, *Supplier Management*). COA Linguistic Validation service line.

**Bottom line:** the *structure and tooling* are strong and improving, but several **evidence layers are still thin or empty**. As-is today this step would most likely draw **CAPA findings, not an outright fail** — but to pass cleanly we must populate the evidence for at least the **COA scope** before the audit. Below: requirement → current state → verdict → action.

Legend: ✅ in place · 🟡 partial · 🔴 gap

---

## A. ISO 17100 §3.1 — Translator / reviser competence & qualifications

| Clause | Requirement | Current state | Verdict | Action to pass |
|---|---|---|---|---|
| §3.1.1 | Documented qualification process | SOP-001 active; VM-001 v1.1 drafted (tracked changes) but **not yet approved**; two SOP numbering systems (SOP-00x vs VM-00x) | 🟡 | Approve VM-001 v1.1; reconcile SOP numbering so there's one controlled set |
| §3.1.3 | The six competences assessed | Prescreen AI CV review + translation tests + new `coa_methodology` quiz + Part-2 MQM sentence grading | ✅ | Wire the COA quiz into the applicant flow (built, not routed) |
| §3.1.4 | Qualification on documented basis (degree / degree+2y / 5y) | Auto-qualify pipeline: **104** role_qualifications recorded; evidence gate enforced; COA panel being qualified from XTRF payment history | 🟡 | Finish recording the COA panel's §3.1.4 basis from XTRF export |
| §3.1.5 | Reviser qualification + reviser≠translator | Mechanically enforced; **0 collisions ever** | ✅ | — |
| §3.1.6 | Reviewer (domain) competence | No reviewer role in QMS model; domain handled ad hoc | 🔴 | Add reviewer competence path or document the control |
| §3.1.7 | PM competence | **No staff/PM competence records** (HR audit NC-4) | 🔴 | Record PM competence for the ~7 staff (small population) |
| §3.1.4 §5.2 | **Subject-matter (life-sciences) qualification** | `qms.subject_matter_qualifications` = **0 rows**; taxonomy exists (Clinical Trials/COA, Life Sciences, Pharma) | 🔴 | Record life-sciences subject-matter quals for the COA panel (clinical project history = evidence) |
| §3.1.8 | Ongoing competence maintained + recorded | SOP-002 still **draft**; `qms.performance_events` = **0**; re-qualification cron not implemented; `linguist_performance_snapshot` empty | 🔴 | Approve SOP-002; emit performance events; record a monthly review |

## B. COA-specific (VM-001 §5.4 / §5.7)

| Item | Current state | Verdict | Action |
|---|---|---|---|
| COA methodology training (§5.7) | Training system is **staff-only**; no vendor-facing COA module; `cvp_training_lesson_progress` = 0 | 🔴 | Build the vendor-facing COA training + record completions for the panel (cross-repo build) |
| COA test (§5.4) | EN→ES pilot built (provisional→activated for e2e); COA quiz Part 1 (10 MCQs) + Part 2 (6 MQM sentences) built & e2e-passed | 🟡 | Validate the ES reference; route the quiz/test to applicants; replicate to more pairs |
| COA panel qualification records | Panel defined (verified RWS/TransPerfect + nominees); records being built | 🟡 | Complete each panel member's record set (basis + subject-matter + NDA + training) |

## C. IQVIA "Supplier Management"

| Item | Current state | Verdict | Action |
|---|---|---|---|
| Supplier assessment & oversight procedure (incl. contracted/subcontracted) | Linguist side covered by SOP-001/VM-001; **no written supplier-oversight SOP**; IT/service sub-processor oversight undocumented | 🔴 | Author Linguistic-Resource + IT/Sub-processor management SOPs (user chose two separate SOPs) |
| Approved supplier list | Derivable from data; not formalized | 🟡 | Generate + maintain a formal approved-supplier list |
| IT/service sub-processors (Supabase, Brevo, Stripe, OCR/AI, Dropbox…) DPAs / data residency | Inventory done; DPA/residency status **unconfirmed** | 🔴 | Confirm DPAs + residency for trial-data processors |

## D. Recruitment process integrity (supports the above)

| Item | Current state | Verdict |
|---|---|---|
| Automated, logged recruitment pipeline | Auto-prescreen (100% coverage) + **auto-document-request shipped** (Phase 1, logged, actor=system) | ✅ |
| Decision audit trail | `cvp_application_decisions` + new pipeline logging | ✅ |
| Status accuracy ("actual step") | `info_requested` now produced; broader status-accuracy fix is Phase 3 | 🟡 |
| Recruitment backend version-controlled | ✅ cvp-* archived into git (#962) | ✅ |

## E. XTRF migration (cross-cutting)

Vendor qualification *pipelines* did not migrate from XTRF; legacy linguists have CVs but thin new-portal records. **Strategy in place:** clean the COA audited scope from XTRF records + document the migration as a controlled change. 🟡 — execution pending (XTRF export from Bobby; CAPA-style remediation doc).

---

## Will we pass this step?

- **For the audited COA scope, if we close the 🔴 items below before 29 Jun:** yes, defensibly.
- **As-is today:** expect findings (CAPAs) on the empty evidence layers — not a structural fail, because the *system and process* exist; the issue is *records*.

**Must-close before audit (priority order):**
1. Record **COA panel** §3.1.4 + **subject-matter (life-sciences)** qualifications (currently 0). — *biggest single gap*
2. **Build + record COA methodology training** (§5.7) for the panel.
3. **Approve VM-001 v1.1** + **SOP-002**; reconcile SOP numbering.
4. **Wire the COA quiz/test** into the applicant flow + validate the ES reference.
5. **Author the two Supplier-Management SOPs** + the approved-supplier list.
6. **Performance/maintenance evidence** (§3.1.8): emit events + one recorded monthly review.
7. **PM/staff competence records** (§3.1.7) — small, quick.
8. Confirm **sub-processor DPAs / residency**.

**Lower-risk / can be "in-progress with a plan":** reviewer competence path (§3.1.6), full status-accuracy fix, CSV/Part 11 (separate agenda item).
