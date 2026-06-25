CETHOS TRANSLATION SERVICES — 12537494 Canada Inc.

Quality Management System | Controlled Record

# Internal Audit Report

| Field | Value |
|---|---|
| **Document Title** | Internal Audit Report — QMS & ISO 17100 / Part 11 Controls |
| **Document Number** | IA-2026-001 |
| **Version** | 1.0 |
| **Audit Date** | June 24, 2026 |
| **Audit Type** | Internal (scheduled, SOP-012) |
| **Auditor** | Acting Quality Manager |
| **Procedure** | SOP-012 Internal Audits |
| **Classification** | Confidential |

| Prepared By | Reviewed By | Approved By |
|---|---|---|
| Raminder Shah — Acting Quality Manager | Amrita Shah — Managing Director | Raminder Shah — Founder & CEO |

## 1. Scope and objectives
To verify that the Cethos Quality Management System supporting Clinical Outcome Assessment (COA) linguistic-validation service delivery conforms to the audit criteria, is effectively implemented, and is operating — with particular attention to document control, access and security, data integrity / audit trail, linguist qualification, electronic signatures, and backup/recovery.

## 2. Audit criteria
ISO 17100:2015; ISO 9001:2015 (referenced); 21 CFR Part 11; ICH E6(R3); and the Cethos SOPs (QM-002 v6.0 register).

## 3. Methodology
Per SOP-012 §6: **direct examination of live system evidence** (querying the production platform for control behaviour and records) supplemented by document review. Control behaviour was tested live where feasible (e.g., attempting prohibited writes to verify enforcement). Evidence is objective and reproducible. *Independence note:* at the company's current scale full auditor independence is limited; this is mitigated by an evidence-based methodology (objective, reproducible system queries rather than self-assessment) and is itself recorded as a standing observation.

## 4. Summary of results
**7 control areas conforming** (with live evidence) · **2 minor nonconformities** · **2 observations** · **3 nonconformities found and corrected during the period (closed)**. No major nonconformities. The QMS is assessed as **effective**, with the open items below tracked through CAPA (SOP-011).

## 5. Detailed findings — conforming controls (objective evidence)

| # | Control area | Criterion | Live evidence (2026-06-24) | Result |
|---|---|---|---|---|
| C-1 | Document control | ISO 9001 §7.5; SOP-001 | 15 active SOPs (+3 archived), 29 controlled versions, 9 controlled documents. Version content **immutable after approval** — verified live: an attempted edit to an approved SOP version was **blocked** ("immutable after approval"). | **Conforms** |
| C-2 | Access & security | Part 11 §11.10(d)/(g); SOP-014 | **Row-Level Security enabled on 293/293 public tables (100%)**, 702 RLS policies; 7 staff under a 3-tier role model (super_admin 2 · admin 4 · reviewer 1); OTP authentication; no shared accounts. | **Conforms** |
| C-3 | Data integrity / audit trail | Part 11 §11.10(e); SOP-014 | `qms.qualification_audit_log` holds **4,074 append-only entries**; UPDATE/DELETE **blocked** — verified live ("append-only … prohibited"). 9 WORM/immutable triggers across the database; `notification_log` (6,459 rows) is WORM. | **Conforms** |
| C-4 | Linguist qualification & competence | ISO 17100 §3.1; SOP-003 | **282 role qualifications** across **234 vendors**, supported by **1,197 competence-evidence records**; 269/282 carry a recorded §3.1.4 competence basis. | **Conforms** (see OBS-1) |
| C-5 | Assignment eligibility gate | ISO 17100 §3.1; SOP-003 | **6,084 assignment-eligibility events** logged; the gate evaluates qualification before assignment. | **Conforms** |
| C-6 | Electronic signatures | Part 11 §11.50/§11.70; SOP-014 | **1,751 NDA e-signatures** / 1,034 agreements, each capturing signer name, email, timestamp, IP, user-agent, signed HTML snapshot and PDF, with supersede chain and verification log. | **Conforms** |
| C-7 | Backup & recovery | Part 11 §11.10(c); SOP-016/017 | PITR (7-day window, ~2-min RPO) + independent daily storage replication; **restore-tested** 2026-06-24 (real-data + separate-instance, 0 discrepancies — CTS-REC-RST-002). | **Conforms** |

## 6. Nonconformities and observations (raised as CAPA — SOP-011)

| Ref | Class | Finding | Evidence | Action |
|---|---|---|---|---|
| **NC-2026-001** | Minor | The CAPA / complaints system is operational but **no records have been logged** — no worked CAPA examples on file. | `qms.capa_actions` = 0, `quality_complaints` = 0, `nonconformities` = 0 | CAPA-004: log this period's findings and establish ongoing CAPA recording. |
| **NC-2026-002** | Minor | Staff training modules exist but **no completion records** are held — training is not evidenced. | `cvp_trainings` = 5, `training_lesson_progress` = 0 | CAPA-005: record staff training completions and build training files. |
| **OBS-1** | Observation | 13 of 282 qualifications lack a recorded competence-basis reference. | 269/282 with basis | CAPA-006: review and complete the basis reference on the 13 records. |
| **OBS-2** | Observation | Supporting documents still to be filed: staff CVs/job descriptions, sub-processor DPA register, BCDR call-tree/delegate. | Document review | Tracked in the audit action list. |

## 7. Nonconformities found and corrected during the period (closed)
These were identified and remediated during the QMS reconciliation and are recorded to evidence the audit → CAPA → closure loop:

| Ref | Finding | Correction | Status |
|---|---|---|---|
| **CAPA-2026-001** | The live SOP register had **diverged** from QM-002 v5.0 (numbers reused for different documents). | Reconciled to **QM-002 v6.0** (21-SOP register); live registry renumbered/consolidated. | **Closed** |
| **CAPA-2026-002** | **No standalone Business Continuity / DR plan**, and the backup policy was not in the controlled SOP register. | Authored and activated **SOP-016** (Backup & Recovery) and **SOP-017** (BCDR); restore-tested. | **Closed** |
| **CAPA-2026-003** | Defect: two new SOP records had a null current-version link (would not render). | Corrected; current-version links restored; verified. | **Closed** |

## 8. Conclusion
The QMS supporting COA linguistic-validation service delivery is **effective and operating**, with strong, live-verified controls for access, data integrity, document control, qualification, electronic signatures, and backup/recovery. Two minor nonconformities (CAPA/complaints recording; training-completion evidence) and two observations are tracked through SOP-011 and SOP-013 (Management Review). No major nonconformities were identified.

## 9. Annual internal audit schedule (SOP-012)
| Audit | Area | Planned | Owner |
|---|---|---|---|
| IA-2026-001 | Full QMS / ISO 17100 / Part 11 controls (this audit) | Jun 2026 | Acting QM |
| IA-2026-002 | Linguist qualification & competence (SOP-003/019) + training records | Sep 2026 | Acting QM |
| IA-2026-003 | Supplier / sub-processor management (SOP-018) + DPAs | Dec 2026 | Acting QM |
| IA-2027-001 | CAPA, complaints & management review effectiveness (SOP-011/013) | Mar 2027 | Acting QM |
| IA-2027-002 | IT security, backup, BCDR + restore test (SOP-014/016/017) | Jun 2027 | Acting QM |

Higher-risk and recently-changed areas are audited earlier; the full cycle repeats annually.

## 10. Distribution and follow-up
Distributed to the Founder & CEO and the Managing Director. Open nonconformities and observations are entered into the CAPA log (SOP-011) with owners and due dates and reviewed at the next Management Review (SOP-013).

## Revision History
| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | Jun 24, 2026 | R. Shah (Acting QM) | Initial internal audit report (first scheduled audit under SOP-012). |

*** END OF DOCUMENT ***
