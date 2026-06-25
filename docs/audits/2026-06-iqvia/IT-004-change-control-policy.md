# IT-004 — Change Control Policy (Infrastructure & Application)

| Field | Value |
|---|---|
| **Document Title** | Change Control Policy (Infrastructure & Application) |
| **Document Number** | IT-004 |
| **Version** | 1.0 (Draft — pending approval) |
| **Effective Date** | Upon approval |
| **Review Date** | Annually, or on material change |
| **Document Owner** | Managing Director (acting Information Security Officer) |
| **Approved By** | Raminder Shah — Managing Director |
| **Scope** | All changes to Cethos application code, database schema, edge functions, and infrastructure configuration |
| **Regulatory Reference** | 21 CFR Part 11; FDA General Principles of Software Validation; ICH GCP; ISO/IEC 27001 A.12.1 |

## 1. Purpose
To ensure changes to production systems are authorised, reviewed, traceable, and reversible, so that integrity of clinical-supporting systems and data is preserved.

## 2. Scope
Application code (admin, customer, vendor, public-apply frontends), database schema (migrations), edge functions, and infrastructure/configuration. Emergency fixes follow the same controls with retrospective record.

## 3. Responsibilities
| Role | Responsibility |
|---|---|
| Managing Director / Technical lead | Reviews and approves changes; authorises production deploys. |
| Developer (incl. AI-assisted) | Implements on a branch, opens a pull request, documents the change. |
| Quality Manager | Confirms GxP-impacting changes are validated (see CSV procedure). |

## 4. Definitions
| Term | Definition |
|---|---|
| PR | Pull request — proposed change reviewed before merge. |
| Migration | Versioned, repeatable database schema change committed to the repo. |
| Rollback | Reverting a change to a known-good prior state. |
| GxP-impacting | A change affecting a regulated record, audit trail, or qualification decision. |

## 5. Policy statements
5.1 **Source control** — all code and schema live in version-controlled repositories (GitHub: admin `cethos_app_figma_design_v1` + vendor `cethos-vendor`); no undocumented direct production edits.
5.2 **Review before merge** — every change is made on a branch and merged via **pull request with review**; the PR records what changed and why.
5.3 **Database changes via migrations** — schema changes are applied as **migrations committed to the repository**, so the repo reflects production and changes are repeatable/traceable.
5.4 **Traceability** — each change is linked from commit/PR → deploy; the change history is retained in the repository.
5.5 **Rollback** — changes are designed to be reversible (revert PR / down-migration / prior deploy); database has Point-in-Time Recovery (IT-005) as a backstop.
5.6 **GxP-impacting changes** — changes to audit trails, qualification logic, or regulated records require validation evidence per the CSV procedure and Quality Manager sign-off before release.
5.7 **Segregation of duties** — the author of a change is not its sole approver for GxP-impacting changes.
5.8 **Configuration & secrets** — environment configuration and secrets are managed outside source control (managed secrets); changes to them follow the same authorisation.

## 6. Process
1. **Plan** — describe the change + impact (GxP-impacting?). *Responsibility: Developer.*
2. **Implement** — on a branch; DB changes as a migration. *Responsibility: Developer.*
3. **Review & approve** — PR review; GxP-impacting → QM validation. *Responsibility: Technical lead / QM.*
4. **Deploy** — merge + deploy (functions via CLI; frontends via host); migration applied to prod + committed. *Responsibility: Technical lead.*
5. **Verify** — confirm in production; record outcome. *Responsibility: Developer.*
6. **Rollback if needed** — revert/down-migration/PITR. *Responsibility: Technical lead.*

## 7. Records
| Record | Location | Retention |
|---|---|---|
| Change history (commits/PRs) | GitHub repositories | Life of system |
| Migrations | `supabase/migrations/` | Life of system |
| Validation evidence (GxP changes) | QMS / CSV file | Life of system + 5y |

## 8. Confidentiality
Repositories are private; access follows IT-002.

## 9. Non-conformance & corrective action
Undocumented production changes, missing reviews, or skipped validation on GxP changes are logged and remediated via CAPA.

## 10. Review & version control
| Version | Date | Author | Summary | Approval |
|---|---|---|---|---|
| 1.0 (Draft) | 2026-06-20 | IT/Quality | Initial change-control policy (git/PR/migrations) | Pending (MD) |
