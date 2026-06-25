CETHOS TRANSLATION SERVICES — 12537494 Canada Inc.

Quality Management System

# Computer System Validation Summary — COA-Relevant Modules

| Field | Value |
|---|---|
| **Document Title** | Computer System Validation Summary — COA-Relevant Modules |
| **Document Number** | CSV-002 |
| **Version** | 1.0 |
| **Effective Date** | June 24, 2026 |
| **Review Date** | Annually, or on a material system change |
| **Document Owner** | Acting Quality Manager (Founder & CEO), with IT |
| **Classification** | Confidential |
| **References** | CSV-001 (21 CFR Part 11 Gap Assessment); SOP-016 (Data Backup & Recovery); SOP-014 (Data Security); SOP-018 (IT Sub-processor Management); 21 CFR Part 11; GAMP 5 (2nd ed.); ICH E6(R3); FDA General Principles of Software Validation (2002) |

| Prepared By | Reviewed By | Approved By |
|---|---|---|
| Raminder Shah — Acting Quality Manager | Amrita Shah — Managing Director | Raminder Shah — Founder & CEO |

## 1. Purpose and scope
This summary documents the **risk-based computer system validation** of the COA-relevant modules of the Cethos portal, per GAMP 5 and 21 CFR Part 11. Scope = the modules whose records support COA linguistic-validation service delivery: **(a)** linguist qualification records, **(b)** the audit trail, **(c)** electronic signatures (NDAs/approvals), and **(d)** their supporting access-control and backup/recovery controls. Out of scope: modules with no GxP-relevant records, and any patient/subject data capture — the portal is **not an EDC** and captures no trial-participant data (CSV-001 §1).

## 2. System description and GAMP categorization
The Cethos portal is a cloud application (React/Vite front end; Supabase PostgreSQL 17.6, Auth, Storage, Edge Functions). As configured/custom software it is treated as **GAMP 5 Category 4/5**; validation effort is scaled to risk and concentrated on the COA-relevant records and their Part 11 controls. The platform sub-processor (Supabase/AWS) is a qualified supplier (SOP-018) relied upon for infrastructure qualification (SOC 2 / ISO 27001); Cethos validates the configuration and the controls it owns.

## 3. Validation approach (GAMP 5, risk-based)
Lifecycle: **User Requirements (URS) → Risk Assessment → Installation / Operational / Performance Qualification (IQ/OQ/PQ) → Requirements Traceability → Validation Summary & Release.** Rigour is proportionate to record risk, with the Part 11 record-integrity controls receiving the most. Supplier qualification is leveraged for the underlying platform.

## 4. User Requirements (URS) — COA-relevant
| ID | Requirement |
|---|---|
| URS-01 | Every linguist qualification records a documented §3.1.4 competence basis, the evidence, and the approver/date (SOP-003 / SOP-019). |
| URS-02 | All security-relevant actions are captured in a secure, computer-generated, time-stamped audit trail that cannot be altered or deleted (Part 11 §11.10(e)). |
| URS-03 | Electronic signatures (NDAs, approvals) capture signer identity, date/time, and meaning, and are bound to the record (Part 11 §11.50 / §11.70). |
| URS-04 | Access is least-privilege, role-based, and individually accountable; no shared accounts (Part 11 §11.10(d)/(g)). |
| URS-05 | COA assignment is gated to qualified linguists only. |
| URS-06 | Records are protected and recoverable over the retention period (Part 11 §11.10(c); SOP-016). |

## 5. Risk assessment (summary)
| Requirement | Risk if failed | Severity | Control | Residual |
|---|---|---|---|---|
| URS-02 audit trail | Undetected record tampering | High | Append-only, hash-chained, no-update/no-delete triggers | Low |
| URS-03 e-signature | Repudiated / unattributed signature | High | Captured signer name, time, IP, user-agent + signed snapshot, record-linked | Low |
| URS-01 qualification | Unqualified linguist used | High | Documented-evidence gate, no-bypass, single-approver + monthly QA spot-check | Low |
| URS-04 access | Unauthorised data access | High | Row-Level Security on all public tables, RBAC, OTP auth | Low |
| URS-05 assignment gate | COA work assigned to an unqualified linguist | High | QMS assignment-eligibility gate | Low |
| URS-06 recovery | Record loss | Medium | Managed backups + PITR + storage replication; restore-tested | Low |

## 6. Qualification testing

### 6.1 Installation Qualification (IQ)
Verified the production environment is correctly installed and configured: Supabase PostgreSQL 17.6 (us-east-1, ACTIVE_HEALTHY); Row-Level Security enabled on all public tables; managed daily backups + point-in-time recovery enabled; independent storage replication live; edge functions deployed from version control. Evidence: CTS-REC-BKP-001 (Backup Verification Record); live platform configuration.

### 6.2 Operational Qualification (OQ)
Verified each control operates as intended:
| Control | Test | Result |
|---|---|---|
| Audit-trail immutability | Attempt UPDATE / DELETE on the append-only audit log | Blocked by trigger — PASS |
| Audit-trail capture | Perform a qualification action; confirm a timestamped row is written | Row written — PASS |
| E-signature capture | Inspect an NDA signature for name / time / IP / signed snapshot | All present — PASS |
| Access control | Confirm RLS denies unauthorised reads | Denied — PASS |
| Assignment gate | Attempt to assign an unqualified linguist to a COA step | Blocked — PASS |
| Backup / restore | Recovery test (real-data reconstitution + separate-instance cycle) | PASS — CTS-REC-RST-002 |

### 6.3 Performance Qualification (PQ)
Verified the system performs in real use, from live production evidence: **282** role qualifications recorded with a documented basis; **3,945** append-only audit-log rows; **1,700+** record-linked NDA electronic signatures; immutable-after-approval document control (sop_versions trigger); the COA assignment gate in force. The system has operated in production since January 2026.

## 7. Requirements traceability
| Requirement | Verified by |
|---|---|
| URS-01 | OQ qualification/assignment; PQ (282 qualifications) |
| URS-02 | OQ immutability + capture; PQ (3,945 audit rows) |
| URS-03 | OQ e-signature; PQ (1,700+ NDAs) |
| URS-04 | IQ (RLS); OQ access control |
| URS-05 | OQ assignment gate |
| URS-06 | IQ (backups); CTS-REC-RST-002 |

## 8. Validation summary and release
The COA-relevant modules are validated to a risk-appropriate level: the Part 11 record-integrity controls (audit trail, electronic signature, access control, qualification/assignment gate) and record protection/recovery are installed, operate correctly, and perform in production. Residual items — a formal identity-proofing procedure, e-signature re-authentication for high-impact approvals, and a written encryption control statement — are tracked in **CSV-001 §4** as risk-based, non-blocking improvements.

**Release decision:** the COA-relevant modules are released for continued GxP-supporting use under this validated state, subject to periodic review (§9). Cethos does not represent the portal as a fully validated GxP/EDC system; this summary validates the in-scope COA modules and their Part 11 controls.

## 9. Periodic review and revalidation
Reviewed at least annually and revalidated on any material change to the COA-relevant modules, the audit-trail or e-signature mechanisms, the access-control model, or the platform sub-processor. Change control is enforced through the SDLC: version-controlled database migrations and pull-request review before release.

## 10. Revision History
| Version | Date | Author | Description of Change |
|---|---|---|---|
| 1.0 | Jun 24, 2026 | R. Shah (Acting QM) | Initial computer system validation summary for the COA-relevant modules. |

*** END OF DOCUMENT ***
