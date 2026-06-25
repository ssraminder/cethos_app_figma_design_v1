# CETHOS TRANSLATION SERVICES
**Quality Management System | Controlled Policy & Plan**

# Business Continuity & Disaster Recovery (BCDR) Plan

| Field | Value |
|---|---|
| **Document Title** | Business Continuity & Disaster Recovery (BCDR) Plan |
| **Document Number** | CTS-POL-006 *(proposed — confirm next free number in the CTS-POL register against CTS-POL-001…005)* |
| **Version** | 1.0 (Draft — pending approval) |
| **Date** | 2026-06-24 |
| **Effective Date** | Upon approval |
| **Review Date** | Annually, or on material change / after any plan invocation or test |
| **Document Owner** | System Owner (Founder & CEO) |
| **Approved By** | Raminder Shah — Founder & CEO / System Owner |
| **Classification** | Confidential |
| **Scope** | Continuity and recovery of the production application platform, corporate IT, and the in-scope translation / COA linguistic-validation service |
| **References** | CTS-POL-005 Data Backup & Recovery Policy v3.0; CTS-REC-BKP-001 Backup Verification Record; CTS-REC-RST-001 Restore Test Record; SOP-005 IT/Service Sub-processor Management; SOP-007 CAPA Management & Complaint Handling; IT Information Security Policy (CTS-POL-001, infosec umbrella) |
| **Regulatory Reference** | 21 CFR Part 11 §11.10 (protection & ready retrieval of records); ICH GCP (continuity of trial-related services); ISO/IEC 27001 A.17 / ISO 22301 (business-continuity reference framework); ISO 17100:2015 §4.x (production capacity & resources) |

> **Reconciliation note (pending CTS-POL-005 receipt):** section/clause cross-references to CTS-POL-005 below are taken from how the policy is quoted in CTS-REC-BKP-001 / CTS-REC-RST-001 (RPO/retention targets in §5; backup controls in §4.3–4.5, restore testing §4.8, records §7). Confirm exact clause numbers, the owner/approver block wording, and the ratified RPO/RTO targets against the actual CTS-POL-005 v3.0 on receipt.

---

## 1. Purpose
To ensure Cethos can **continue delivering its in-scope services** (translation and Clinical Outcome Assessment linguistic validation) and **recover its systems and data** within defined objectives following a disruptive incident — from a single-record data loss to a full platform outage — while protecting the confidentiality, integrity, and availability of client and clinical-trial materials. This plan complements CTS-POL-005 (which governs *backup & recovery of data*) by adding the **business-continuity** dimension: critical-process recovery priorities, disaster scenarios, alternate operations, invocation, communications, and continuity testing.

## 2. Scope
**Applies to:** the production application platform (Supabase: PostgreSQL database, Auth, Storage, Edge Functions), the corporate IT environment (Microsoft 365 — Exchange, SharePoint, OneDrive), the application frontend and source (Netlify + GitHub), contracted IT operations (Cital Enterprises), critical IT/service sub-processors (per SOP-005), and the people and processes that deliver the in-scope service.

**Does not apply to:** linguist competence/qualification procedures (SOP-001…006) except where a disruption affects their availability; physical facility safety/evacuation (Cethos operates remote-first — see §9).

## 3. Responsibilities
| Role | Responsibility |
|---|---|
| **System Owner (Founder & CEO)** | Owns this plan; **sole authority to declare a disaster and invoke the plan**; authorises production restores and recovery spend; final accountability for continuity. |
| **Quality Manager** | Ensures BCDR evidence (tests, invocations, post-incident reviews) is recorded and audit-ready; raises CAPA for failures/gaps; maintains this document. |
| **IT Support — Cital Enterprises** | Executes technical recovery (PITR restore, storage restore, redeploy); maintains backup automation; performs and records restore tests; provides 24×7 escalation per the support arrangement. |
| **All staff** | Recognise and report disruptions promptly; follow alternate-operations instructions during an invocation. |
| **Critical sub-processors** | Provide their own platform resilience and status communication; assessed for continuity under SOP-005. |

## 4. Definitions
| Term | Definition |
|---|---|
| **RTO** (Recovery Time Objective) | Maximum acceptable time to restore a process/system after disruption. |
| **RPO** (Recovery Point Objective) | Maximum acceptable data loss, measured as time since the last recoverable point. |
| **MTPD / MTD** | Maximum Tolerable Period of Disruption — the point beyond which disruption threatens the viability of the service. |
| **BIA** | Business Impact Analysis — identification of critical processes and their recovery priorities. |
| **Business Continuity (BC)** | Keeping critical processes running (possibly degraded) during disruption. |
| **Disaster Recovery (DR)** | Restoring IT systems and data after a disruptive event. |
| **PITR** | Point-in-Time Recovery — restore the database to any moment within the continuous recovery window. |
| **Invocation** | Formal declaration that this plan is in effect, made by the System Owner. |
| **SPOF** | Single Point of Failure — a dependency whose loss alone halts a critical process. |

## 5. Governance & supporting controls (live state)
This plan sits over an **already-operational** backup & recovery capability (evidenced in CTS-REC-BKP-001 v1.3 and CTS-REC-RST-001, both 23 Jun 2026):

- **Production database** — Supabase PostgreSQL 17.6, project `Cethos_Translation_App` (`lmzoyezvsjgsxveoakdr`), AWS **us-east-1**, ~1.4 GB. Managed daily physical backups **+ Point-in-Time Recovery enabled** (7-day continuous window, **RPO ~2 min**).
- **Object/file storage** — Supabase Storage (35 buckets, ~9,505 objects incl. trial/COA materials) with **independent daily replication to AWS S3** (`cethos-translation-app-storage-backup`, us-east-2; versioned; ≥90-day retention; no-delete IAM). First full backup 23 Jun 2026 (5.19 GiB); **file-recovery restore test PASS**.
- **Microsoft 365** — native version history + recycle bin, plus a **7-year retain-only Purview policy** (SharePoint/OneDrive/Exchange).
- **Frontend & source** — Netlify (`cethosappfigma`) built from GitHub `main`; full version history; redeployable on demand.
- **Restore capability** — documented restore procedure validated (sandbox pg_dump/pg_restore, 293 tables / 194,724 rows, 0 discrepancies). **Open action carried here:** a faithful restore of the *live managed backup* (Supabase "Restore to new project") is scheduled at least annually — see §12.

## 6. Business Impact Analysis (BIA)
Critical processes in priority order, with recovery targets. (RTOs are grounded in the small database footprint and the live recovery capabilities above.)

| # | Critical process | Supporting systems | Impact if down | **RTO** | **RPO** |
|---|---|---|---|---|---|
| 1 | **In-flight COA / translation project delivery** (active client deliverables) | Supabase DB+Storage, M365 (email), linguist availability | Missed clinical deadlines; sponsor/regulatory impact | **≤ 8 h** (degraded ops immediately, see §9) | ≤ 2 min (DB) / ≤ 24 h (files) |
| 2 | **Secure client document intake, storage & retrieval** (trial/COA materials) | Supabase Storage, S3 replica | Cannot receive/return regulated content | **≤ 8 h** | ≤ 24 h (S3 replica) |
| 3 | **Quote → order → assignment workflow** (portal) | Supabase DB, Edge Functions, frontend | Sales/operations halt | **≤ 4 h** | ≤ 2 min |
| 4 | **Qualification & audit-record integrity** (ISO/IQVIA evidence) | Supabase DB (append-only/WORM logs) | Loss of compliance evidence | **≤ 4 h** | ≤ 2 min |
| 5 | **Corporate communications** (client/vendor email) | Microsoft 365 / Exchange, Brevo, Mailgun | Cannot coordinate delivery | **≤ 4 h** | Continuous (versioned) |
| 6 | **Invoicing & payments** | Supabase DB, Stripe, QuickBooks | Billing delay (tolerable) | ≤ 72 h | ≤ 2 min |
| 7 | **Recruitment pipeline** | Supabase DB, Mailgun | Onboarding delay (tolerable) | ≤ 72 h | ≤ 2 min |

**Maximum Tolerable Period of Disruption (whole service): 72 h.** Beyond this, escalate to executive crisis handling and proactively notify affected clients/sponsors (§11).

## 7. Recovery strategy & objectives (per system)
| System | Primary recovery strategy | Recovery source | **RTO** | **RPO** |
|---|---|---|---|---|
| Production database | PITR rewind, or restore to new project | Supabase managed backup / PITR (7-day window) | ≤ 4 h | ~2 min |
| Object/file storage | Restore objects from S3 replica | AWS S3 `…-storage-backup` (versioned, ≥90 d) | ≤ 8 h | ≤ 24 h |
| Microsoft 365 | Native version history / recycle bin / Purview retention | Microsoft 365 tenant | ≤ 8 h | Continuous |
| Frontend & source | Redeploy from GitHub `main` | Netlify + GitHub | ≤ 1 h | Last commit |
| Edge Functions / config | Redeploy from repo (`supabase/functions`) | GitHub + Supabase CLI | ≤ 4 h | Last commit |

## 8. Disaster scenarios & response playbooks
Each playbook: **Trigger → Immediate response → Recovery → Owner.** All invocations are logged and reviewed under §13.

### S1 — Database loss or corruption (incl. accidental mass-delete)
- **Trigger:** data corruption, erroneous bulk operation, or DB unavailability.
- **Immediate:** stop writes if feasible; System Owner authorises restore; identify clean recovery point.
- **Recovery:** Cital performs **PITR** to the chosen timestamp (RPO ~2 min) or restores a managed backup to a **new temporary project** for extraction (never restore over production blind); verify integrity incl. append-only audit-trail continuity; cut over. **RTO ≤ 4 h.**

### S2 — Object/file storage loss
- **Trigger:** loss/corruption of Storage objects (client source files, deliverables, QMS evidence).
- **Immediate:** confirm scope of loss; System Owner authorises restore.
- **Recovery:** restore affected objects from the **AWS S3 replica** (versioned; pick pre-incident version); verify checksums against a known file. **RTO ≤ 8 h, RPO ≤ 24 h.** *(Note: PITR does NOT cover Storage — the S3 replica is the sole recovery source; keep it healthy.)*

### S3 — Supabase project / region (us-east-1) outage
- **Trigger:** provider/region-level outage making the platform unavailable.
- **Immediate:** confirm via Supabase/AWS status; System Owner declares disaster if outage is expected to breach RTO; activate alternate operations (§9) and client comms (§11).
- **Recovery:** await provider restoration for short outages; for extended outages, **restore the latest managed backup + S3 files to a new project in an alternate region** (e.g. ca-central-1) and repoint DNS/frontend. **Target RTO ≤ 24 h; MTPD 72 h.** *(Residual risk: cross-region rebuild is manual — see §14.)*

### S4 — Critical sub-processor outage
- **Trigger:** outage of a key sub-processor (per SOP-005): AI/OCR (Anthropic, Mistral, Google Document AI), email (Brevo, Mailgun), payments (Stripe), or hosting (Netlify).
- **Immediate:** identify the degraded function; switch to fallback.
- **Recovery / fallback:** **OCR/AI** → queue work and process **manually** (human linguists do not depend on AI to translate); **email** → fail over between Brevo/Mailgun and M365/Exchange direct; **payments** → defer billing (non-critical, RTO 72 h); **hosting** → redeploy. Production of in-scope deliverables can continue **without** the AI/OCR tier. **RTO per function ≤ 8 h.**

### S5 — Security incident / ransomware / credential compromise
- **Trigger:** suspected breach, ransomware, or malicious data manipulation.
- **Immediate:** invoke incident response (CTS-POL-001 infosec / IT-006 incident response); isolate affected access; rotate credentials/keys; preserve logs.
- **Recovery:** restore from **immutable/independent backups** (the S3 replica uses a no-delete IAM writer; PITR provides pre-incident points); verify integrity; report per regulatory/contractual duties (§11). **RTO ≤ 24 h.**

### S6 — Key-person / SPOF unavailability
- **Trigger:** unavailability of the System Owner, Cital, or a critical linguist on an active COA project.
- **Immediate:** invoke documented runbooks (this plan + CTS-REC records) so recovery does not depend on one person's memory; for the System Owner's *decision authority*, a pre-named **delegate** may authorise emergency recovery.
- **Recovery:** Cital (managed service) provides IT continuity; reassign linguist work from the qualified COA panel (SOP-006); cross-train on critical procedures. **Mitigation is preventive — see §14.**

### S7 — Loss of workplace / connectivity / workforce
- **Trigger:** office, connectivity, or staffing disruption.
- **Response:** Cethos is **remote-first and cloud-based** — staff work from any location with internet; no on-premises servers to recover. Impact is low; affected staff switch location/connection. **RTO ≤ 4 h** (reconnect).

## 9. Continuity of operations (degraded-mode running)
While systems recover, critical work continues by:
- **Manual production fallback** — translation/COA work proceeds via direct file exchange (M365/email) and offline CAT tools; the AI/OCR tier is an accelerator, not a dependency.
- **Communications continuity** — if the portal is down, client/vendor coordination continues over Microsoft 365 email.
- **Record reconciliation** — work performed during degraded mode is logged and reconciled into the portal (orders, deliveries, audit records) once restored, preserving ISO 17100 / Part 11 traceability.

## 10. Plan activation & invocation
1. **Detect & assess** — any staff member reports a disruption to the System Owner / Cital; severity and likely duration are assessed against the BIA RTOs.
2. **Declare** — the **System Owner (or named delegate)** declares a disaster and invokes this plan when a disruption is expected to breach a critical-process RTO.
3. **Mobilise** — Cital leads technical recovery; Quality Manager opens an incident record; comms plan (§11) activates.
4. **Stand down** — the System Owner declares recovery complete once services are verified; a post-incident review (§13) follows.

**Escalation / call tree** *(populate contact numbers before approval):* System Owner → Cital Enterprises (IT, 24×7) → Sub-processor support (Supabase/AWS, Microsoft) → affected clients/sponsors.

## 11. Communication plan
| Audience | Trigger | Channel / owner |
|---|---|---|
| Internal staff | On invocation | Email/phone; System Owner |
| Clients / sponsors (incl. clinical) | When a deliverable or data may be affected | Direct email from System Owner/PM; honest status + revised timeline |
| Sub-processors | When recovery needs their support | Support tickets / account contacts; Cital |
| Regulators / per contract | If a reportable breach or data-integrity event (S5) | Per contractual & legal obligation; System Owner + counsel |

## 12. Testing, exercises & maintenance
Demonstrable testing is mandatory (and an explicit audit expectation):
- **Annual DR restore test** — a *faithful* restore of the live managed database backup via Supabase "Restore to new project" into a temporary project (never over production), plus a storage file-recovery test from the S3 replica. Record in **CTS-REC-RST-001** (date, scope, RTO observed, outcome). *Status: sandbox procedure test PASSED 23 Jun 2026; first faithful managed-backup restore scheduled — see §14.*
- **Annual BC tabletop exercise** — walk through one scenario (rotating S1–S6) with System Owner + Cital; record findings and actions.
- **Trigger-based tests** — after any major architecture change or sub-processor change (SOP-005).
- **Maintenance** — this plan is reviewed annually, after any invocation, and after any test; changes are version-controlled (§15).

## 13. Post-incident review & CAPA
Every invocation (and any failed test) is followed by a documented review: timeline, RTO/RPO achieved vs target, root cause, and corrective/preventive actions raised through **SOP-007 (CAPA)**. Lessons feed back into this plan and the supporting policies.

## 14. Residual risks & planned actions (honest register)
| Risk | Status | Planned action |
|---|---|---|
| **Data residency** — production data (incl. trial/COA files) hosted in **US (us-east-1)** for a Canadian entity | Accepted, tracked | Documented in infosec/data-protection policy + audit risk register; cross-region (ca-central-1) rebuild path in S3 |
| **Faithful managed-backup restore** not yet exercised (sandbox only) | Open | Perform a Supabase "Restore to new project" test before/at the audit window; record in CTS-REC-RST-001 |
| **DB PITR retention at 7-day minimum** (vs 30-day target) | Accepted (cost) | Option to extend PITR window (14/28-day) if a sponsor contract requires; else sign-off residual risk |
| **System Owner decision-authority SPOF** | Open | Name an emergency-recovery delegate; document in §10 call tree |
| **Cross-region failover is manual** | Accepted | Documented runbook (S3); rehearse in the annual tabletop |

## 15. Records & retention
| Record | Location | Retention |
|---|---|---|
| This plan + approvals | QMS library (controlled) | Life of system + 5 y |
| Restore-test records | CTS-REC-RST-001 (QMS) | 5 y |
| Backup verification | CTS-REC-BKP-001 (QMS) | Current + history |
| Invocation / incident records + post-incident reviews | QMS / CAPA log (SOP-007) | 5 y |
| BC exercise records | QMS | 5 y |

## 16. Review & version control
| Version | Date | Author | Summary | Approval |
|---|---|---|---|---|
| 1.0 (Draft) | 2026-06-24 | Quality / IT (Cital) | Initial standalone BCDR plan; consolidates CTS-POL-005 + CTS-REC-BKP-001/RST-001 and adds the business-continuity dimension | Pending (System Owner) |

---
*CTS-POL-006 (proposed) | Version 1.0 (Draft) | Cethos Translation Services | Confidential*
