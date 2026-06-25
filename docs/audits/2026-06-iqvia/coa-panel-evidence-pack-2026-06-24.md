# COA Linguistic Validation — Qualified Panel Evidence Pack

**Prepared for:** IQVIA EQA‑Vendor qualification audit (29–30 Jun 2026)
**Scope:** Translation services — Linguistic Validation of Clinical Outcome Assessments (COA)
**Date:** 2026‑06‑24 · **Owner:** Vendor Management / Quality Manager · **Approved by:** Raminder Shah (MD)
**Source of truth:** live QMS register (`qms.role_qualifications`, `qms.subject_matter_qualifications`, `qms.competence_evidence`, `qms.nda_agreements`, `cvp_translator_domains`) on Supabase project `lmzoyezvsjgsxveoakdr`.

> Cethos is *working toward* ISO 17100 certification (Stage 2 target Dec 2026); it is not yet certified. COA Linguistic Validation is a **net‑new service line** — this pack demonstrates **qualified capability and a controlled system**, not historical volume, which is the correct basis for a vendor‑qualification audit of a new line.

## 1. The qualified COA panel (9 linguists)

Every member is an `active` vendor with a `qualified` translator role qualification, a recorded §3.1.4 basis, Life Sciences + Clinical‑Trials(COA) subject‑matter qualifications, an active NDA, and a COA domain qualified on evidence only.

| # | Linguist | App | Language pair(s) | §3.1.4 basis | COA LV quiz | Subject‑matter quals |
|---|---|---|---|---|---|---|
| 1 | Agustina Francisco | 0782 | EN→ES‑419 | (a) translation degree | 100% · Recommend approve | Life Sci (exp) · Clin Trials COA (spec) |
| 2 | Almudena López Díaz | 0848 | EN→ES | (c) ≥5y experience | 100% · Recommend approve | Life Sci (exp) · Clin Trials COA (spec) |
| 3 | Estela Ponisio | 0613 | EN→ES / ES‑AR / ES‑ES | (c) ≥5y experience | 100% · Recommend approve | Life Sci (exp) · Clin Trials COA (spec) |
| 4 | Gabriela Hernández | 0946 | EN→ES / ES‑419 | (a) translation degree | 100% · Recommend approve | Life Sci (exp) · Clin Trials COA (spec) |
| 5 | Karine Blanchard Gagné | 0415 | EN‑CA→FR‑CA | (c) ≥5y experience | 100% · Recommend approve | Life Sci (exp) · Clin Trials COA (spec) |
| 6 | Laura Domínguez | 0806 | EN→ES (+FR→ES) | (a) translation degree | 95.8% · Recommend approve | Life Sci (exp) · Clin Trials COA (spec) |
| 7 | Maurice Dzeuga | 0596 | EN→FR / FR‑CA | (a) translation degree | 100% · Recommend approve | Life Sci (exp) · Clin Trials COA (spec) |
| 8 | Rémi Coutant | 0694 | EN/ES/IT/PT/SV→FR | (a) translation degree | 95.8% · Recommend approve | Life Sci (exp) · Clin Trials COA (spec) |
| 9 | Víctor Manuel Alva Coras | 0389 | EN→ES‑419, FR→ES‑419 | (a) translation degree | 91.7% · Recommend approve | Life Sci (exp) · Clin Trials COA (spec) |

**Language coverage:** EN→Spanish (European, Latin‑American, Argentine variants) and EN→French (France + Canada), with one multi‑source‑into‑French specialist. Basis mix: 6× route (a) verified translation degree, 3× route (c) ≥5y documented experience.

## 2. How each linguist was qualified (ISO 17100 §3.1.4 / §6.1)

Two things are established and recorded separately for every member (see `competence-qualification-model.md`):

1. **Qualification basis (§3.1.4):** route (a) a recognised translation degree, document‑reviewed and **staff‑verified by the MD** (`qms.competence_evidence`, `verification_method='document_review'`); or route (c) ≥5 years documented experience confirmed by an independent, year‑verified reference.
2. **Demonstrated COA competence:** the **COA Linguistic Validation quiz** — English methodology/research MCQs (bar 90%) **plus graded EN→target Part‑2 translations** scored against an MQM rubric. The decisive signal is the graded‑translation **`assessment_recommendation`**, not the MCQ %. **Every panel member is "Recommend approve — passed"** (the strict gate; "Needs human review" and "Not recommended" linguists are deliberately excluded / general‑only).

## 3. Subject‑matter qualification (§5.2 / §6.1.6)

Each member holds two recorded subject‑matter qualifications — **Life Sciences / Medical** and **Clinical Trials (ICF, COA, COG)** — in `qms.subject_matter_qualifications`, **evidence‑linked to the graded COA quiz** and approved by the MD (pending Quality‑Manager spot‑check). High‑risk clinical domains are qualified on this evidence only; declared‑but‑unevidenced domains are **not** qualified (the over‑scoping control).

## 4. COA methodology & training (VM‑001 §5.7)

- The COA linguistic‑validation methodology is documented in **TRAIN‑COA‑001** (ISPOR Wild et al. 2005 / FDA PRO Guidance workflow: preparation → dual forward → reconciliation → back translation → BT review → harmonization → cognitive debriefing → finalization), with a **scored knowledge check (≥80% pass)**.
- **Assignment gate:** per VM‑001 §5.7 and TRAIN‑COA‑001 §7, **no linguist is assigned a COA project step without a recorded training completion.** As COA is a net‑new line with no project yet delivered, completions are recorded **as the panel is activated** — nothing is overdue. (Optional pre‑audit step held with the MD: deliver TRAIN‑COA‑001 + knowledge check to the panel now and record live completions.)

## 5. Confidentiality (§8)

All 9 hold an **active NDA** (`qms.nda_agreements`, clickwrap bound to the application/vendor record) accepted before any assessment material was shared. Clinical materials follow client/sponsor confidentiality + deletion‑on‑completion rules (VM‑001 §8 / SM‑001 §8).

## 6. Data‑integrity controls (audit‑critical)

- **Right gate:** COA readiness = graded `assessment_recommendation`, not MCQ score. A score‑only gate was identified and rejected (it would have admitted "Not recommended" linguists).
- **Evidenced‑only domains:** the approval function qualifies only domains with real evidence (graded test / passed COA quiz / verified certificate); the historical "cascade approved" phantom rows were relabelled `declared_unverified`.
- **Append‑only audit:** `qms.qualification_audit_log` blocks UPDATE/DELETE; every qualification is traceable to evidence, an actor, and a timestamp. Approver of record on this panel = `raminder@cethos.com`.
- **Reproducibility:** every test/quiz stores inputs, the AI rubric output, the score, and the timestamp; references store referees' verbatim answers.

## 7. Where the auditor finds each record

| Evidence | Location |
|---|---|
| Qualification + basis | `qms.role_qualifications` (status, `competence_basis_id` → `qms.competence_bases.iso_clause_reference`) |
| Degree / experience evidence | `qms.competence_evidence` (`verification_method`, `verified_by`, screening notes) |
| COA quiz result | `cvp_quiz_submissions` (`assessment_recommendation`, `assessment_summary`, Part‑2 graded) |
| Subject‑matter quals | `qms.subject_matter_qualifications` (evidence‑linked) |
| Operational domains | `cvp_translator_domains` (status='approved', evidenced‑only) |
| NDA | `qms.nda_agreements` (status='active') + `vendor_nda_signatures` |
| Methodology training | TRAIN‑COA‑001 + (on activation) `qms.competence_evidence` completion records |
| Assignability | `vendor_language_pairs` + `qms_check_assignment` ISO gate |

---
*COA Panel Evidence Pack | 2026‑06‑24 | Cethos Solutions | source: live QMS register*
