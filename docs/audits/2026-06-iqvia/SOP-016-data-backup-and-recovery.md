CETHOS TRANSLATION SERVICES
12537494 Canada Inc.

Quality Management System
# STANDARD OPERATING PROCEDURE
## Data Backup and Recovery

| | |
|---|---|
| **Document Title:** | Data Backup and Recovery |
| **Document Number:** | SOP-016 |
| **Version:** | 4.0 |
| **Original Issue Date:** | September 15, 2020 |
| **Current Revision Date:** | June 24, 2026 |
| **Document Owner:** | System Owner |
| **Classification:** | Confidential |
| **Review Cycle:** | Annual, or upon significant change to systems or data flows |

| Prepared By | Reviewed By | Approved By |
|---|---|---|
| _____________________<br>Raminder Shah<br>Acting Quality Manager | _____________________<br>Amrita Shah<br>Managing Director | _____________________<br>Raminder Shah<br>Founder & CEO |

---

## 1. Purpose
This procedure establishes the requirements for backing up and recovering the data and computerized systems that Cethos Translation Services relies on to deliver its services, with particular attention to systems used in regulated clinical research work such as the linguistic validation of Clinical Outcome Assessments. Its purpose is to protect the availability and integrity of company and client data, to enable recovery from data loss, corruption, or system failure, and to provide documented evidence that backup controls are defined, operated, and tested.

## 2. Scope
This procedure applies to all computerized systems and data stores that hold or process Cethos business records, client deliverables, regulated clinical content, personal data, and financial data. In-scope systems include the production application platform (the cloud-hosted vendor and order portal, comprising its database and object/file storage), Microsoft 365 (SharePoint, OneDrive, and Exchange), Google Drive used for file exchange, and the source code and configuration of company-developed applications. Systems that hold no business or regulated data, and personal endpoints that are not a system of record, are out of scope; staff are required to keep regulated content within approved, in-scope systems.

## 3. Definitions
| Term | Definition |
|---|---|
| Backup | A copy of data retained separately from the live system, used to restore that data after loss or corruption. |
| Recovery Point Objective (RPO) | The maximum acceptable amount of data, measured in time, that may be lost in an incident. |
| Recovery Time Objective (RTO) | The maximum acceptable time to restore a system to operation after an incident. |
| Point-in-Time Recovery (PITR) | The ability to restore a database to any chosen moment within a defined recovery window, rather than only to the last scheduled backup. |
| Object/file storage | The store holding uploaded and generated files, including client source documents and deliverables, held separately from the database. |

## 4. Procedure / Policy Statements

**4.1 Backup coverage and frequency.** Every in-scope system shall be backed up at a frequency proportionate to how often its data changes and to the impact of its loss, meeting at least the targets in Section 5. Backups shall be automated wherever the platform supports it, so that protection does not depend on a manual step.

**4.2 Retention.** Backups shall be retained for at least the minimum periods in Section 5. Backup retention is an operational recovery measure and is separate from records retention; long-term archival of regulated project records is governed by records retention requirements and applicable sponsor contracts, and shall not rely on system backups.

**4.3 Encryption and security.** Backups shall be encrypted in transit and at rest, and access to backups and to restore functions shall be restricted to authorized personnel. Where backups are held by a platform provider, the provider's encryption and security controls shall be relied upon and recorded in the system's qualification evidence.

**4.4 Point-in-time recovery for the database platform.** The production application database shall have point-in-time recovery enabled with a recovery window of at least seven days, with thirty days as the target. This reduces the recovery point objective from a full day to approximately one hour and provides protection against logical errors such as accidental or erroneous data changes.

**4.5 Object and file storage backup.** Managed database backups do not necessarily include separately stored files. The object and file storage that holds client source documents and deliverables shall therefore be backed up or replicated independently of the database, at least daily, so that uploaded and delivered files can be recovered to the same point as the database records that reference them.

**4.6 Geographic and residency considerations.** The location in which each system and its backups are hosted shall be recorded. Where regulated or personal data is hosted outside Canada, that cross-border handling shall be documented in the relevant privacy and system records so that obligations under PIPEDA and, for European-origin data, the GDPR are addressed transparently rather than assumed.

**4.7 Backup monitoring.** Backup success and failure shall be monitored. Failed or missed backups shall be investigated and resolved, and both the failure and its resolution shall be recorded.

**4.8 Restore testing.** A documented restore test shall be performed at least annually for each critical system, and after any major change to a system or its backup configuration. A restore test verifies that data can actually be recovered, not merely that a backup exists. Results, including the date, system, scope, outcome, and any issues, shall be recorded and retained as evidence (Backup Verification Record; Restore Test Record).

**4.9 Relationship to business continuity.** This procedure operates alongside **SOP-017 Business Continuity and Disaster Recovery**. Backups are the data-recovery foundation on which the wider continuity and disaster-recovery arrangements depend.

## 5. Recovery Targets and Retention
The following targets apply to in-scope systems. Actual configured values are verified and recorded in the associated Backup Verification Record.

| System | Backup Method | Frequency | Retention | RPO | RTO |
|---|---|---|---|---|---|
| Production application database (portal, cloud PostgreSQL) | Managed automated backup plus point-in-time recovery | Continuous (PITR) and daily | 30 days target, 7 days minimum | 1 hour | 24 hours |
| Application object and file storage (source and deliverable files) | Scheduled backup or replication of stored objects | At least daily | 90 days minimum, longer per project | 24 hours | 24 hours |
| Microsoft 365 (SharePoint, OneDrive, Exchange) | Native version history, recycle bin and retention policy | Continuous | Per retention policy | Near real time | 24 hours |
| Google Drive (secondary exchange) | Native version history and retention | Continuous | Per retention settings | Near real time | 48 hours |
| Application frontend and source code | Version control repository with redeploy | On each commit | Full history | Not applicable (stateless) | 4 hours |

## 6. Roles and Responsibilities
| Role | Responsibility |
|---|---|
| Founder & CEO | Approves this procedure and holds overall accountability for protection of company and client data. |
| System Owner | Ensures each in-scope system is configured to meet the backup requirements and reviews the associated backup evidence. |
| IT Support (Cital Enterprises) | Configures and monitors backups, investigates failures, performs and records restore tests, and maintains backup evidence. |
| Quality Manager | Confirms during periodic QMS review that backups are configured, monitored, and restore-tested, and that evidence is retained. |
| All Staff | Store regulated and client content only in approved systems so that it falls within the scope of this procedure. |

## 7. Records and Evidence
The following records demonstrate that this procedure is operating and shall be retained as quality evidence:
- **Backup Verification Record** — the documented current backup configuration of each in-scope system, confirmed against the targets in Section 5.
- **Restore Test Record** — date, system, scope, outcome, and any issues.
- **Backup failure and incident records** — failures, investigation, and resolution.
- **Periodic QMS review records** confirming this procedure has been reviewed and remains effective.

## 8. Related Documents and References
- SOP-017 Business Continuity and Disaster Recovery
- SOP-014 Data Security and Confidentiality
- SOP-018 IT / Service Sub-processor Management
- SOP-001 Document Control and Records Management
- ISO/IEC 27001:2022, Annex A 8.13 (Information backup)
- ISO 9001:2015 Quality Management Systems
- GDPR Article 32 and PIPEDA (security and integrity of personal data)
- ICH E6(R3) Good Clinical Practice, computerized systems expectations
- GAMP 5 (Second Edition), risk-based approach to compliant computerized systems

## 9. Revision History
| Version | Date | Author | Description of Change |
|---|---|---|---|
| 1.0 | Sep 15, 2020 | R. Shah | Initial issue (as Data Backup and Recovery Policy). |
| 2.0 | May 10, 2023 | R. Shah | Scope expanded to cloud collaboration platforms (Microsoft 365, Google Workspace). Added restore testing requirement. |
| 3.0 | Jun 23, 2026 | Quality Manager | Added production application platform (cloud database and object storage); added point-in-time recovery and storage object backup requirements; aligned with ICH E6(R3). |
| 4.0 | Jun 24, 2026 | R. Shah (Acting QM) | Reissued as SOP-016 under the reconciled SOP register (QM-002 v6.0); updated continuity cross-reference to SOP-017. No change to control requirements. |

*** END OF DOCUMENT ***
