# In-House Mock Audit — Recruitment & Linguist Qualification

**For:** the in-house auditor, to dry-run the IQVIA *Staff Qualification & Training* / *Supplier Management* sessions before 29 Jun.
**Method:** play the auditor. For each line: ask the question, pull the sample, look at the live evidence, record pass / finding. Mirror what a Stage-2 / clinical vendor auditor does. Cross-reference: `gap-analysis-recruitment-qualification.md`.

> Run the SQL against project `lmzoyezvsjgsxveoakdr`. "Show in portal" = drive the live admin UI.

---

## Step 1 — Documented process exists (ISO 17100 §3.1.1)
- **Ask:** "Show me your documented procedure for qualifying translators and revisers."
- **Evidence:** SOP-001 (active) + VM-001 at /admin/sops; the COA-specific VM-001.
- **Check:** is the COA SOP (VM-001) **approved** (not draft)? Is there one controlled SOP set (numbering reconciled)?
- **Likely finding:** VM-001 v1.1 pending approval; two numbering schemes. → approve + reconcile.

## Step 2 — Qualification records exist with evidence (§3.1.4)
- **Ask:** "Pick three active linguists — show me their qualification basis and the evidence."
- **Sample:** draw the three highest-volume COA-panel linguists.
- **SQL:** `SELECT v.full_name, rq.* FROM qms.role_qualifications rq JOIN vendors v ON v.id=rq.vendor_id ORDER BY rq.qualified_at DESC;`
- **Check:** each has a recorded basis (degree / degree+2y / 5y) **and** retrievable evidence (CV, certificate, or first-party PO history for the 5y route).
- **Likely finding:** panel subject-matter (life-sciences) quals empty (`qms.subject_matter_qualifications` = 0). → populate before audit.

## Step 3 — Subject-matter (life-sciences) competence for COA (§5.2)
- **Ask:** "How do you know these linguists are qualified for *clinical* content specifically?"
- **SQL:** `SELECT count(*) FROM qms.subject_matter_qualifications;`  (expect >0 for the panel)
- **Likely finding (today):** 0 rows. → record from clinical project history (RWS/TransPerfect) + CV evidence.

## Step 4 — Reviser independence (§3.1.5)
- **Ask:** "Show that the reviser is never the translator on the same file."
- **Evidence:** the assignment gate; 0 collisions ever; any override has written justification.
- **Expected:** pass.

## Step 5 — Testing / competence demonstration (§3.1.3, VM-001 §5.4/§5.7)
- **Ask:** "How do you test a COA linguist's actual skill?"
- **Evidence:** COA quiz Part 1 (knowledge) + Part 2 (MQM-graded sentence translation); COA test pilot; each grade stored with MQM annotations + model version.
- **SQL:** `SELECT count(*) FROM cvp_coa_translation_responses;` and `SELECT competence_slug,count(*) FROM iso_competence_quizzes WHERE competence_slug='coa_methodology' GROUP BY 1;`
- **Likely finding:** quiz not yet routed to applicants (built, not wired); reference for the EN→ES pilot AI-drafted pending linguist sign-off. → wire + validate.

## Step 6 — Ongoing maintenance of competence (§3.1.8)
- **Ask:** "Show me how qualifications are kept current and how you act on quality problems."
- **SQL:** `SELECT count(*) FROM qms.performance_events;` · `SELECT * FROM qms.linguist_performance_snapshot LIMIT 5;`
- **Likely finding (today):** 0 performance events; SOP-002 draft; no recorded monthly review. → emit events + record one review + approve SOP-002.

## Step 7 — Training procedure + employee training files
- **Ask:** "Show the COA methodology training and completion records; show staff/PM training files + job descriptions + CVs."
- **SQL:** `SELECT count(*) FROM cvp_training_lesson_progress;` (COA training completions)
- **Likely finding:** COA training not built (staff-only system); no PM/staff competence records (§3.1.7); job descriptions absent. → build training + record staff competence + add job descriptions.

## Step 8 — Supplier assessment, oversight & approved supplier list
- **Ask:** "Show your supplier-management procedure, your approved supplier list, and how you oversee sub-contracted staff and IT sub-processors that touch trial data."
- **Likely finding:** linguist side covered; **no written supplier-oversight SOP**, no formal approved-supplier list, IT sub-processor DPAs/residency unconfirmed. → author the two Supplier SOPs + list + confirm DPAs.

## Step 9 — Process integrity & audit trail
- **Ask:** "Show that recruitment decisions are controlled and logged, and that requesting documentation is systematic."
- **Evidence:** auto-document-request (Phase 1, logged, actor=system); `cvp_application_decisions`; cvp-* now version-controlled.
- **SQL:** `SELECT action,count(*) FROM cvp_application_decisions GROUP BY 1;`
- **Expected:** pass (recent improvement).

## Step 10 — XTRF migration control
- **Ask:** "You recently migrated platforms — show the migration was controlled and legacy qualification records are retained."
- **Likely finding:** pipelines didn't migrate; needs a documented migration-control + retention statement + remediation plan. → produce it.

---

## Mock-audit scoring sheet
| Step | Area | Pass / Finding | Owner | Due |
|---|---|---|---|---|
| 1 | §3.1.1 documented process | | | |
| 2 | §3.1.4 qualification records | | | |
| 3 | §5.2 subject-matter | | | |
| 4 | §3.1.5 reviser independence | | | |
| 5 | §3.1.3 testing | | | |
| 6 | §3.1.8 maintenance | | | |
| 7 | training files | | | |
| 8 | supplier management | | | |
| 9 | audit trail | | | |
| 10 | XTRF migration | | | |

**Run this dry-run once now, fix the 🔴s in the gap analysis, then run it again ~3 days before the audit.**
