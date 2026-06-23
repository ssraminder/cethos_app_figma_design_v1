# SOP-QA-001 — CAPA Management & Complaint Handling

| Field | Value |
|---|---|
| Document Title | CAPA Management & Complaint Handling |
| SOP Number | SOP-QA-001 |
| Version | 1.0 |
| Effective Date | 23 June 2026 |
| Review Date | 23 June 2027 |
| Document Owner | Quality Manager |
| Approved By | Raminder Shah — Managing Director |
| Scope | Translation & COA linguistic-validation services; all complaints and nonconformities, internal or client-raised |
| Regulatory Reference | ISO 17100:2015 §3.1.8, §4.6; ISO 9001:2015 §10.2 (CAPA); IQVIA Supplier Management |

> Cethos is working toward ISO 17100 certification (Stage 2 target Dec 2026); this SOP is part of that QMS and does not assert current certification.

## 1. Purpose
To define how Cethos captures complaints and quality signals, records nonconformities (NCs), performs root-cause analysis, plans and verifies corrective and preventive actions (CAPA), and feeds the outcome back into linguist performance monitoring and re-qualification — in a traceable, auditable manner.

## 2. Scope
**Applies to:** every complaint (client or internal), every nonconformity arising from a complaint, a delivery quality signal (revision finding, late delivery), an internal audit finding, or a quality issue; and all resulting corrective/preventive actions.
**Does not apply to:** software defects in the portal itself (tracked separately in `bug_reports` under the SDLC/defect-management process).

## 3. Responsibilities
| Role | Responsibilities |
|---|---|
| Project Manager | Logs complaints and delivery quality signals; raises NCs; proposes corrections |
| Quality Manager | Owns triage, root-cause review, CAPA approval, effectiveness verification, and closure |
| Vendor Manager | Acts on linguist-attributed NCs; initiates re-qualification review where indicated |
| Managing Director | Approves this SOP; final authority on suspension/withdrawal of a linguist qualification |

## 4. Definitions
| Term | Definition |
|---|---|
| Complaint | Any expression of dissatisfaction with a service or deliverable, client or internal |
| Nonconformity (NC) | A documented failure to meet a requirement, with severity (low/medium/high/critical) |
| Correction | Immediate action to fix the specific occurrence |
| Corrective action | Action to eliminate the root cause and prevent recurrence |
| Preventive action | Action to prevent a potential nonconformity from occurring |
| Effectiveness check | Verification, after implementation, that the action achieved its purpose |

## 5. Criteria
- **5.1** Every complaint is recorded within one business day of receipt with a unique number (`CMP-YYYY-NNNNN`).
- **5.2** A complaint is triaged to one of: resolved (no NC), or escalated to an NC (`NC-YYYY-NNNNN`).
- **5.3** Every NC of severity high/critical, and any NC linked to a linguist, has at least one CAPA action (`CAPA-YYYY-NNNNN`) with an owner and due date.
- **5.4** An NC is not closed until all its CAPA actions are verified and (where applicable) an effectiveness check is recorded.
- **5.5** Linguist-attributed complaints/NCs emit a performance event; severity high/critical events trigger a re-qualification review (per SOP VM-001 §9 and ISO 17100 §3.1.8).

## 6. Process
**Stage 1 — Capture.** A complaint is logged via the admin portal (Quality & performance → Log complaint), or a delivery quality signal (revision request, late delivery) is captured automatically from the workflow. *Responsibility: PM.*

**Stage 2 — Triage.** The Quality Manager classifies severity and category and either resolves the complaint or escalates it to a nonconformity (the complaint is auto-linked). *Responsibility: Quality Manager.*

**Stage 3 — Root-cause analysis.** For each NC, the underlying cause is documented (5 whys / fishbone). *Responsibility: Quality Manager.*

**Stage 4 — CAPA.** One or more corrective/preventive actions are created with owner, due date, and effectiveness-check date. The NC moves to *CAPA in progress*. *Responsibility: Quality Manager + action owners.*

**Stage 5 — Verify & close.** Each action is marked done, then verified; an effectiveness result (effective / not effective) is recorded. When all actions are verified, the NC is closed with a closure summary. *Responsibility: Quality Manager.*

**Stage 6 — Feedback to performance.** Linguist-attributed events flow to `qms.performance_events` → the daily `qms.linguist_performance_snapshot` rollup → the monthly re-qualification maintenance, which flags serious or repeat patterns for human review. *Responsibility: Vendor Manager.*

## 7. Documentation Requirements
| Record | Location | Retention |
|---|---|---|
| Complaint | `qms.quality_complaints` | ≥ 5 years |
| Nonconformity | `qms.nonconformities` | ≥ 5 years |
| CAPA action | `qms.capa_actions` | ≥ 5 years |
| Immutable change history | `qms.quality_event_log` (append-only, SHA-256 hash chain) | ≥ 5 years |
| Linguist performance events | `qms.performance_events` → `qms.linguist_performance_snapshot` | ≥ 5 years |

## 8. Confidentiality Controls
All records reside in the access-controlled portal database (Supabase RLS; `qms` schema reachable only via SECURITY DEFINER functions). Complainant and client data are visible to authorised staff only. No trial/COA content is stored in complaint or NC free-text fields beyond what is necessary to describe the issue.

## 9. Non-Conformance & Corrective Action
A failure to follow this SOP is itself recorded as an internal-audit nonconformity and worked through Stages 3–5. The `qms.quality_event_log` hash chain (`qms.verify_quality_log_integrity()`) provides tamper evidence; a failed integrity check is a critical nonconformity requiring immediate escalation to the Managing Director.

## 10. SOP Review & Version Control
Reviewed annually or on material process change. Implemented by portal migrations `20260623_qms_capa_complaints_schema.sql`, `20260623_qms_quality_functions.sql`, `20260623_qms_wire_quality_signals.sql`.

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 23 June 2026 | Quality Manager | Initial issue; CAPA + complaint system and linguist performance monitoring brought online |

---
*SOP-QA-001 | Version 1.0 | Cethos Solutions | Effective June 23, 2026*
