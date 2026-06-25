# IT-005 — Backup & Recovery Policy

| Field | Value |
|---|---|
| **Document Title** | Backup & Recovery Policy |
| **Document Number** | IT-005 |
| **Version** | 1.0 (Draft — pending approval) |
| **Effective Date** | Upon approval |
| **Review Date** | Annually, or on material change |
| **Document Owner** | Managing Director (acting Information Security Officer) |
| **Approved By** | Raminder Shah — Managing Director |
| **Scope** | Backup and recovery of all production data (database + file storage) |
| **Regulatory Reference** | 21 CFR Part 11 §11.10(c) (record protection/retrieval); ICH GCP; ISO/IEC 27001 A.12.3 |

## 1. Purpose
To ensure Cethos production data — the database and stored documents (CVs, certifications, trial/COA materials) — is backed up, retained, and recoverable within defined objectives, protecting record integrity and availability.

## 2. Scope
The Supabase production database and Storage buckets. Source code is independently protected via version control (IT-004). Corporate documents in Microsoft 365 are covered by M365 retention.

## 3. Responsibilities
| Role | Responsibility |
|---|---|
| Managing Director / Technical lead | Owns backup configuration, verifies restore tests, owns RPO/RTO. |
| Quality Manager | Confirms backup/restore evidence is retained for audit. |

## 4. Definitions
| Term | Definition |
|---|---|
| Backup | A point-in-time copy of data for recovery. |
| PITR | Point-in-Time Recovery — restore to any moment within the retention window. |
| RPO | Recovery Point Objective — maximum acceptable data loss. |
| RTO | Recovery Time Objective — maximum acceptable downtime. |
| Restore test | A verified recovery from backup, recorded. |

## 5. Policy statements
5.1 **Automated backups** — the production database is protected by **Supabase managed automated backups** plus **Point-in-Time Recovery**; backups are managed by the platform on AWS, encrypted at rest.
5.2 **Retention window** — the PITR/backup retention window is set per the platform plan tier; the current window is **[confirm tier — attach config]** and is reviewed annually against client/regulatory needs.
5.3 **Objectives** — target **RPO ≤ [e.g., 24h / PITR-granular]** and **RTO ≤ [e.g., 4h]** for the production database. *(Set + ratify these targets with the platform's actual capabilities.)*
5.4 **Storage/files** — uploaded documents in Storage buckets are part of the managed platform; file-object recovery is covered by the same managed backups. *(Confirm bucket backup coverage + attach evidence.)*
5.5 **Restore testing** — a **documented restore test** is performed at least **annually** (and after any major change) to verify backups are usable; the result (date, scope, outcome, RTO observed) is recorded.
5.6 **Record protection** — append-only audit/qualification records (`qualification_audit_log`, `tr.audit_log`, WORM tables) are inherently protected against deletion and are included in the database backup.
5.7 **Recovery authorisation** — production restores are authorised by the Managing Director / technical lead and recorded as a change (IT-004).

## 6. Process (recovery)
1. **Detect** — data loss/corruption or outage identified. *Responsibility: Technical lead.*
2. **Assess** — determine recovery point + scope. *Responsibility: Technical lead.*
3. **Authorise** — MD/technical lead authorises restore. *Responsibility: Managing Director.*
4. **Recover** — restore via PITR/backup to the chosen point. *Responsibility: Technical lead.*
5. **Verify** — confirm data integrity post-restore (incl. audit-trail continuity). *Responsibility: Technical lead / QM.*
6. **Record** — log the event, RTO/RPO achieved, and lessons learned. *Responsibility: Technical lead.*

## 7. Records
| Record | Location | Retention |
|---|---|---|
| Backup configuration | Supabase console (evidence screenshot in QMS) | Current + history |
| Annual restore-test record | QMS | 5y |
| Recovery event records | QMS / change log | 5y |

## 8. Confidentiality
Backups inherit the encryption and access controls of production (IT-002 / IT-003).

## 9. Non-conformance & corrective action
Backup failures, an overdue/failed restore test, or unmet RPO/RTO are logged and remediated via CAPA.

## 10. Review & version control
| Version | Date | Author | Summary | Approval |
|---|---|---|---|---|
| 1.0 (Draft) | 2026-06-20 | IT/Quality | Initial backup & recovery policy | Pending (MD) |

> **Open evidence to attach before audit:** confirm Supabase plan tier + exact PITR/backup retention window; capture a dated **restore-test record**; confirm Storage-bucket backup coverage. These bridge into the BCDR plan (separate audit item).
