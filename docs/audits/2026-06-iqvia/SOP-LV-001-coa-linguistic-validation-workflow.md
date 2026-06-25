# Standard Operating Procedure — COA Linguistic Validation Workflow

| | |
|---|---|
| **Document Title** | SOP: COA Linguistic Validation Workflow |
| **SOP Number** | LV-001 |
| **Version** | 1.0 (Draft — pending approval) |
| **Effective Date** | Upon approval |
| **Review Date** | Annually, or on a methodology/regulatory change |
| **Document Owner** | Project Management / Quality Manager |
| **Approved By** | Raminder Shah — Managing Director |
| **Scope** | All Clinical Outcome Assessment (COA) linguistic-validation projects (PRO, ClinRO, ObsRO, PerfO) |
| **Reference** | ISPOR Principles of Good Practice (Wild et al., 2005); FDA PRO Guidance (2009); ISO 17100:2015; ICH GCP; VM-001; TRAIN-COA-001 |

## 1. Purpose
Defines the controlled, step-by-step process Cethos follows to linguistically validate a COA so that every target-language version is **conceptually equivalent**, **culturally appropriate**, and **fully documented**. This SOP is the *operational* procedure; the *methodology* is taught in **TRAIN-COA-001** and the *resource qualification* is governed by **VM-001**.

## 2. Scope
**Applies to** all COA/PRO linguistic-validation projects delivered by Cethos. **Does not apply to** general certified or commercial translation (SOP-001 / standard workflow).

## 3. Responsibilities
| Role | Responsibility |
|---|---|
| Project Manager | Sets up the project, sequences the steps, assigns only COA-qualified+trained linguists, holds the audit trail |
| COA Translator (×2) | Independent forward translations + rationale |
| Reconciler | Single reconciled forward version + decision log |
| Back-Translator | Independent back translation (blind to source) |
| Reviewer / Reviser | Back-translation review; flags conceptual discrepancies |
| Cognitive-Debriefing Consultant | Conducts CD with target-population respondents; CD report |
| Clinician Reviewer (where required) | Clinical accuracy review |
| Quality Manager | Oversight; query/CAPA management; final QC |

## 4. Definitions
Per **TRAIN-COA-001 §4** (COA, PRO, conceptual equivalence, decentering, reconciliation, cognitive debriefing, harmonization, developer query).

## 5. Criteria — who may be assigned
- A linguist may be assigned a COA step **only if** they hold: a `qualified` role qualification (VM-001), a **Life Sciences + Clinical Trials (COA)** subject-matter qualification, a **passing COA Methodology Training** record (TRAIN-COA-001 §7), and an **active NDA**.
- The portal **assignment gate** (`qms_check_assignment` via Find Vendor) enforces qualification + language pair; the COA training + NDA checks are confirmed before assignment.
- Forward translators must be **independent** of one another; the back-translator must be **independent** of the forward/reconciliation team and **blind to the source**.

## 6. Process

Each stage is created as an **order step** in the portal, assigned to a qualified resource, and produces a recorded deliverable. Step status, assignee, timestamps, and deliverables form the project audit trail.

| # | Stage | Cethos service step | Output / record |
|---|---|---|---|
| 1 | **Preparation** | (PM setup) | Source + concept elaboration; developer/sponsor queries logged |
| 2 | **Forward translation ×2 (independent)** | `medical_translation` / `standard_translation` ×2 | Two independent forward versions + translator rationale |
| 3 | **Reconciliation** | `reconciliation` | Single reconciled forward version + decision log |
| 4 | **Back translation** | `back_translation` | Back translation (translator blind to source) |
| 5 | **Back-translation review** | `review` | Source-vs-BT comparison; discrepancies + resolutions; developer queries |
| 6 | **Harmonization** | `harmonization` | Cross-language consistency review + harmonization notes |
| 7 | **Cognitive debriefing** | `cognitive_debriefing` | CD with **5–8 target-population respondents**; CD report |
| 8 | **Post-CD review & finalization** | `post_cognitive_debriefing_review` | Findings incorporated; finalized translation |
| 9 | **Clinician review** *(where required)* | `clinician_review` → `post_clinician_review` | Clinical-accuracy sign-off |
| 10 | **Proofreading** | `proofreading` | Final linguistic/typographic check |
| 11 | **Final LV report** | (PM compile) | Complete documented trail: translations, reconciliation rationale, BT, queries/resolutions, CD report, final version |

> *Responsibility: Project Manager ensures each step is assigned to a qualified resource, no step is skipped or merged without a documented sponsor-approved deviation, and the audit trail is complete before delivery.*

**Migration / legacy instruments:** where a previously validated instrument is being migrated or adapted, the `linguistic_validation_migration` / `linguistic_validation_migration_qm` service steps apply, with the QM confirming the migration QC.

## 7. Documentation requirements
| Record | Location | Retention |
|---|---|---|
| Project + step records (assignee, status, timestamps) | Orders / order steps | ≥5 years |
| Step deliverables (each translation/review/CD output) | `step_deliveries` + storage | ≥5 years |
| Developer/sponsor queries + resolutions | Project notes / deliverables | ≥5 years |
| Cognitive-debriefing report | Deliverable | ≥5 years |
| Final LV report | Deliverable + client delivery | ≥5 years |
| Resource qualification + training + NDA | QMS register (VM-001 / TRAIN-COA-001) | per QMS |

## 8. Confidentiality controls
NDA active before any clinical material is shared; secure transfer only; no public MT/AI on confidential instrument content; deletion on completion per client/sponsor instruction (VM-001 §8 / SM-001 §8).

## 9. Non-conformance & corrective action
A conceptual error, skipped step, or missed query raises a documented non-conformance → root cause → corrective action → follow-up (SOP-QA-001). Quality events feed the linguist performance record (VM-001 §8).

## 10. SOP review & version control
Reviewed annually or on a methodology/standard change; revisions approved by the MD; prior versions archived.

| Version | Date | Summary | Approved By |
|---|---|---|---|
| 1.0 (Draft) | Pending | Initial release — ISPOR/FDA LV workflow mapped to Cethos service steps + records | Raminder Shah |

*SOP LV-001 | Version 1.0 (Draft) | Cethos Solutions | Effective upon approval*
