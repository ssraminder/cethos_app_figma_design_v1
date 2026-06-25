CETHOS TRANSLATION SERVICES
12537494 Canada Inc.

Quality Management System
# STANDARD OPERATING PROCEDURE
## Business Continuity and Disaster Recovery

| | |
|---|---|
| **Document Title:** | Business Continuity and Disaster Recovery |
| **Document Number:** | SOP-017 |
| **Version:** | 1.0 |
| **Original Issue Date:** | June 24, 2026 |
| **Current Revision Date:** | June 24, 2026 |
| **Document Owner:** | System Owner |
| **Classification:** | Confidential |
| **Review Cycle:** | Annual, or after any plan invocation or test |

| Prepared By | Reviewed By | Approved By |
|---|---|---|
| _____________________<br>Raminder Shah<br>Acting Quality Manager | _____________________<br>Amrita Shah<br>Managing Director | _____________________<br>Raminder Shah<br>Founder & CEO |

---

## 1. Purpose
This procedure ensures Cethos can **continue delivering its in-scope services** (translation and Clinical Outcome Assessment linguistic validation) and **recover its systems and data** within defined objectives following a disruptive incident — from a single-record data loss to a full platform outage — while protecting the confidentiality, integrity, and availability of client and clinical-trial materials. It complements **SOP-016 Data Backup and Recovery** (which governs backup and recovery of data) by adding the business-continuity dimension: critical-process recovery priorities, disaster scenarios, alternate operations, invocation, communications, and continuity testing.

## 2. Scope
**Applies to** the production application platform (cloud PostgreSQL database, authentication, object/file storage, edge functions), the corporate IT environment (Microsoft 365 — Exchange, SharePoint, OneDrive; Google Drive used for file exchange), the application frontend and source code, contracted IT operations (Cital Enterprises), critical IT/service sub-processors (per SOP-018), and the people and processes that deliver the in-scope service.

**Does not apply to** linguist competence/qualification procedures (SOP-003, SOP-019) except where a disruption affects their availability, or facility evacuation/safety (Cethos operates remote-first — see Section 9).

## 3. Definitions
| Term | Definition |
|---|---|
| RTO (Recovery Time Objective) | Maximum acceptable time to restore a process/system after disruption. |
| RPO (Recovery Point Objective) | Maximum acceptable data loss, measured as time since the last recoverable point. |
| MTPD | Maximum Tolerable Period of Disruption — the point beyond which disruption threatens service viability. |
| BIA | Business Impact Analysis — identification of critical processes and their recovery priorities. |
| Business Continuity | Keeping critical processes running (possibly degraded) during disruption. |
| Disaster Recovery | Restoring IT systems and data after a disruptive event. |
| PITR | Point-in-Time Recovery — restoring the database to any moment within the continuous recovery window. |
| Invocation | Formal declaration that this plan is in effect, made by the System Owner. |
| SPOF | Single Point of Failure — a dependency whose loss alone halts a critical process. |

## 4. Responsibilities
| Role | Responsibility |
|---|---|
| **System Owner** | Owns this procedure; sole authority to declare a disaster and invoke the plan; authorises production restores and recovery spend; final accountability for continuity. |
| **Quality Manager** | Ensures BCDR evidence (tests, invocations, post-incident reviews) is recorded and audit-ready; raises CAPA for failures/gaps; maintains this document. |
| **IT Support (Cital Enterprises)** | Executes technical recovery (PITR restore, storage restore, redeploy); maintains backup automation; performs and records restore tests; provides escalation support. |
| **All staff** | Recognise and report disruptions promptly; follow alternate-operations instructions during an invocation. |
| **Critical sub-processors** | Provide their own platform resilience and status communication; assessed for continuity under SOP-018. |

## 5. Governance and supporting controls (current state)
This procedure sits over an operational backup and recovery capability evidenced in the Backup Verification Record and Restore Test Record (per SOP-016):
- **Production database** — cloud PostgreSQL, ~1.4 GB. Managed daily backups plus point-in-time recovery (7-day continuous window; configured RPO of approximately two minutes, better than the one-hour policy target).
- **Object/file storage** — independent daily replication to a separate cloud region (versioned; 90-day retention); file-recovery restore tested.
- **Microsoft 365 / Google Drive** — native version history, recycle bin, and a 7-year retain-only retention policy.
- **Frontend and source** — version-controlled and redeployable on demand.
- **Restore capability** — documented restore procedure validated (database dump/restore at production scale, zero discrepancies). A faithful restore of the live managed backup (restore to a temporary project) is scheduled at least annually — see Section 14.

## 6. Business Impact Analysis (BIA)
Critical processes in priority order, with recovery targets aligned to the system targets in SOP-016 Section 5. Degraded-mode continuity (Section 9) begins immediately on invocation; the RTOs below are the outer bounds for full system restoration.

| # | Critical process | Supporting systems | **RTO** | **RPO** |
|---|---|---|---|---|
| 1 | In-flight COA / translation project delivery | Database, storage, M365, linguist availability | ≤ 24 h (degraded ops immediate) | ≤ 1 h (DB) / ≤ 24 h (files) |
| 2 | Secure client document intake, storage & retrieval | Object storage + replica, Google Drive | ≤ 24 h | ≤ 24 h |
| 3 | Quote → order → assignment workflow | Database, edge functions, frontend | ≤ 24 h | ≤ 1 h |
| 4 | Qualification & audit-record integrity | Database (append-only / WORM logs) | ≤ 24 h | ≤ 1 h |
| 5 | Corporate communications (client/vendor email) | Microsoft 365 / Exchange | ≤ 24 h | Near real time |
| 6 | Invoicing & payments | Database, payment processor | ≤ 72 h | ≤ 1 h |
| 7 | Recruitment pipeline | Database, email | ≤ 72 h | ≤ 1 h |

**Maximum Tolerable Period of Disruption (whole service): 72 hours.** Beyond this, escalate to executive crisis handling and proactively notify affected clients/sponsors (Section 11).

## 7. Recovery strategy and objectives (per system)
| System | Primary recovery strategy | Recovery source | **RTO** | **RPO** |
|---|---|---|---|---|
| Production database | PITR rewind, or restore to a new project | Managed backup / PITR (7-day window) | 24 h | 1 h |
| Object/file storage | Restore objects from the independent replica | Versioned replica (≥ 90 days) | 24 h | 24 h |
| Microsoft 365 | Native version history / recycle bin / retention | M365 tenant | 24 h | Near real time |
| Google Drive | Native version history / retention | Google Drive | 48 h | Near real time |
| Frontend & source / edge functions | Redeploy from version control | Repository | 4 h | Last commit |

## 8. Disaster scenarios and response playbooks
Each playbook follows **Trigger → Immediate response → Recovery → Owner.** All invocations are logged and reviewed under Section 13.

**S1 — Database loss or corruption (incl. accidental bulk change).** *Trigger:* corruption, erroneous bulk operation, or database unavailability. *Immediate:* halt writes where feasible; System Owner authorises restore; identify a clean recovery point. *Recovery:* IT performs PITR to the chosen timestamp (RPO ~1 h or better) or restores a managed backup to a temporary project for extraction — never restoring over production blind; verify integrity, including audit-trail continuity; cut over. *RTO ≤ 24 h.*

**S2 — Object/file storage loss.** *Trigger:* loss/corruption of stored client source files, deliverables, or QMS evidence. *Immediate:* confirm scope; System Owner authorises restore. *Recovery:* restore affected objects from the versioned replica (select pre-incident version); verify a known file. *RTO ≤ 24 h, RPO ≤ 24 h.* (PITR does not cover storage — the replica is the sole recovery source.)

**S3 — Platform / region outage.** *Trigger:* provider/region-level outage making the platform unavailable. *Immediate:* confirm via provider status; System Owner declares a disaster if the outage is expected to breach RTO; activate alternate operations (Section 9) and client communications (Section 11). *Recovery:* await provider restoration for short outages; for extended outages, restore the latest managed backup and replicated files to a new project in an alternate region and re-point the frontend. *Target RTO ≤ 24 h; MTPD 72 h.*

**S4 — Critical sub-processor outage.** *Trigger:* outage of a key sub-processor (per SOP-018): AI/OCR providers, transactional email, payments, or hosting. *Immediate:* identify the degraded function; switch to fallback. *Recovery/fallback:* AI/OCR → queue and process manually (human linguists do not depend on AI to translate); email → fail over between providers and M365/Exchange; payments → defer billing (RTO 72 h); hosting → redeploy. *RTO per function ≤ 24 h.*

**S5 — Security incident / ransomware / credential compromise.** *Trigger:* suspected breach, ransomware, or malicious data manipulation. *Immediate:* invoke the security incident response (SOP-014); isolate affected access; rotate credentials/keys; preserve logs. *Recovery:* restore from independent/immutable backups (the storage replica uses a no-delete writer; PITR provides pre-incident points); verify integrity; report per regulatory/contractual duties (Section 11). *RTO ≤ 24 h.*

**S6 — Key-person / single-point-of-failure unavailability.** *Trigger:* unavailability of the System Owner, IT Support, or a critical linguist on an active COA project. *Immediate:* invoke documented runbooks (this procedure and the SOP-016 records) so recovery does not depend on one person's memory; for the System Owner's decision authority, a pre-named delegate may authorise emergency recovery. *Recovery:* IT Support (managed service) provides continuity; reassign linguist work from the qualified COA panel (SOP-019); cross-train on critical procedures. *Preventive mitigation — see Section 14.*

**S7 — Loss of workplace / connectivity / workforce.** *Trigger:* office, connectivity, or staffing disruption. *Response:* Cethos is remote-first and cloud-based — staff work from any location with internet; there are no on-premises servers to recover. Affected staff switch location/connection. *RTO ≤ 4 h (reconnect).*

## 9. Continuity of operations (degraded-mode running)
While systems recover, critical work continues by:
- **Manual production fallback** — translation/COA work proceeds via direct file exchange (M365 / Google Drive / email) and offline CAT tools; the AI/OCR tier is an accelerator, not a dependency.
- **Communications continuity** — if the portal is down, client and vendor coordination continues over Microsoft 365 email.
- **Record reconciliation** — work performed during degraded mode is logged and reconciled into the portal (orders, deliveries, audit records) once restored, preserving ISO 17100 / 21 CFR Part 11 traceability.

## 10. Plan activation and invocation
1. **Detect & assess** — any staff member reports a disruption to the System Owner / IT Support; severity and likely duration are assessed against the BIA RTOs.
2. **Declare** — the System Owner (or named delegate) declares a disaster and invokes this plan when a disruption is expected to breach a critical-process RTO.
3. **Mobilise** — IT Support leads technical recovery; the Quality Manager opens an incident record; the communication plan (Section 11) activates.
4. **Stand down** — the System Owner declares recovery complete once services are verified; a post-incident review (Section 13) follows.

**Escalation / call tree** *(populate contact numbers before approval):* System Owner → IT Support (Cital Enterprises) → sub-processor support (platform/cloud, Microsoft, Google) → affected clients/sponsors.

## 11. Communication plan
| Audience | Trigger | Channel / owner |
|---|---|---|
| Internal staff | On invocation | Email/phone; System Owner |
| Clients / sponsors (incl. clinical) | When a deliverable or data may be affected | Direct email from System Owner / account manager; honest status + revised timeline |
| Sub-processors | When recovery needs their support | Support channels; IT Support |
| Regulators / per contract | If a reportable breach or data-integrity event (S5) | Per contractual & legal obligation; System Owner |

## 12. Testing, exercises and maintenance
- **Annual DR restore test** — a faithful restore of the live managed database backup into a temporary project (never over production), plus a storage file-recovery test. Recorded in the Restore Test Record (date, scope, RTO observed, outcome). *Status: restore-procedure test passed; first faithful managed-backup restore scheduled — see Section 14.*
- **Annual business-continuity tabletop exercise** — walk through one scenario (rotating S1–S6) with the System Owner and IT Support; record findings and actions.
- **Trigger-based tests** — after any major architecture change or sub-processor change (SOP-018).
- **Maintenance** — reviewed annually, after any invocation, and after any test; changes are version-controlled (Section 16).

## 13. Post-incident review and CAPA
Every invocation (and any failed test) is followed by a documented review: timeline, RTO/RPO achieved versus target, root cause, and corrective/preventive actions raised through **SOP-011 (CAPA)**. Lessons feed back into this procedure and SOP-016.

## 14. Residual risks and planned actions
| Risk | Status | Planned action |
|---|---|---|
| Data residency — production data (incl. trial/COA files) hosted outside Canada | Accepted, tracked | Documented in SOP-014 and the audit risk register; cross-region rebuild path in the storage replica |
| Faithful managed-backup restore not yet exercised (procedure test only) | Open | Perform a restore-to-new-project test before/at the audit window; record in the Restore Test Record |
| Database PITR retention at 7-day minimum (vs 30-day target) | Accepted (cost) | Extend the PITR window if a sponsor contract requires; otherwise sign-off residual risk |
| System Owner decision-authority SPOF | Open | Name an emergency-recovery delegate; record in the Section 10 call tree |
| Cross-region failover is manual | Accepted | Documented runbook; rehearse in the annual tabletop |

## 15. Records and Evidence
| Record | Location | Retention |
|---|---|---|
| This procedure + approvals | QMS (controlled) | Life of system + 7 y |
| Restore-test records | Restore Test Record (QMS) | 7 y |
| Backup verification | Backup Verification Record (QMS) | Current + history |
| Invocation / incident records + post-incident reviews | QMS / CAPA log (SOP-011) | 7 y |
| Business-continuity exercise records | QMS | 7 y |

## 16. Revision History
| Version | Date | Author | Description of Change |
|---|---|---|---|
| 1.0 | Jun 24, 2026 | R. Shah (Acting QM) | Initial issue. Newly authored business-continuity and disaster-recovery procedure complementing SOP-016; added to the SOP register under QM-002 v6.0. Approved and activated. |

*** END OF DOCUMENT ***
