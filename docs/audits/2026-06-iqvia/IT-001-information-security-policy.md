# IT-001 — Information Security Policy

| Field | Value |
|---|---|
| **Document Title** | Information Security Policy |
| **Document Number** | IT-001 |
| **Version** | 1.0 (Draft — pending approval) |
| **Effective Date** | Upon approval |
| **Review Date** | Annually, or on material change |
| **Document Owner** | Managing Director (acting Information Security Officer) |
| **Approved By** | Raminder Shah — Managing Director |
| **Scope** | All Cethos information systems, data, staff, and contracted resources |
| **Regulatory Reference** | 21 CFR Part 11; ICH GCP; ISO 17100; ISO/IEC 27001 (reference framework); PIPEDA / GDPR |

## 1. Purpose
To establish Cethos's commitment to protecting the confidentiality, integrity, and availability (CIA) of information — in particular client and clinical-trial materials (including Clinical Outcome Assessment content) — and to define the governance under which the supporting IT security policies (IT-002…IT-005), SOP-SM-002 (IT sub-processor management), and the Business Continuity / CSV procedures operate.

## 2. Scope
Applies to all Cethos production systems (the Supabase platform, Microsoft 365, frontends, and contracted sub-processors), all data processed by them, and all staff and contractors with access. Out of scope: linguist competence procedures (governed by VM-001/SOP-001) except where they touch system access.

## 3. Responsibilities
| Role | Responsibility |
|---|---|
| Managing Director (acting ISO) | Owns the ISMS; approves policies; final accountability for information security; approves access for privileged roles. |
| Quality Manager | Ensures security controls are reflected in QMS records and audit readiness. |
| All staff | Comply with these policies; report incidents promptly; protect credentials. |
| Sub-processors | Bound by DPAs and assessed under SOP-SM-002. |

## 4. Definitions
| Term | Definition |
|---|---|
| CIA | Confidentiality, Integrity, Availability. |
| Trial data | Client/sponsor materials including COA instruments, source documents, and translations. |
| Sub-processor | A third-party service that processes Cethos or client data (see SOP-SM-002). |
| Privileged access | Administrative or service-role access capable of broad data access or change. |

## 5. Policy statements
5.1 Information is classified and protected per **IT-003** (Data Protection, Classification, Encryption & Retention).
5.2 Access is granted on **least-privilege**, role-based, and individually accountable terms per **IT-002** (Access Control).
5.3 Changes to systems are controlled, reviewed, and traceable per **IT-004** (Change Control).
5.4 Data is backed up and recoverable per **IT-005** (Backup & Recovery); continuity is addressed in the BCDR plan.
5.5 All security-relevant actions on qualification, assignment, and notification records are recorded in **tamper-evident, append-only audit trails** (hash-chained `qualification_audit_log` / `tr.audit_log`; WORM on `notification_log`, `order_workflow_steps`, `assignment_eligibility_events`).
5.6 Third-party services that process data are governed by **SOP-SM-002** (assessment, DPA, residency, oversight).
5.7 Security incidents are managed under the Incident Response procedure (IT-006, planned) and reported to the Managing Director without delay.
5.8 Cethos relies on certified cloud sub-processors (Supabase/AWS, Microsoft 365) for physical and infrastructure security; their certifications (e.g., SOC 2 / ISO 27001) are part of the supplier assessment evidence.

## 6. Implementation & evidence (live)
- Platform: Supabase managed Postgres 17.6 + Auth + Storage + Edge Functions (AWS us-east-1); M365/Exchange for corporate identity.
- Access: 9 staff under 3-tier RBAC, all auth-linked; **RLS on 252/290 (87%) public tables, 658 RLS policies**.
- Audit trail: hash-chained append-only logs + WORM tables (see `it-security-evidence-pack.md`).
- Change control: GitHub PR workflow + committed Supabase migrations.
- **Known risk (tracked):** production data residency is US (us-east-1) for a Canadian entity — see IT-003 §5 and the audit risk register.

## 7. Records
| Record | Location | Retention |
|---|---|---|
| This policy + approvals | QMS / `docs/audits` | Life of system + 5y |
| Audit trails | `qms.qualification_audit_log`, `tr.audit_log`, `notification_log` | Append-only, retained for system life |
| Sub-processor register + DPAs | SOP-SM-002 / approved-supplier-list | Contract term + 5y |

## 8. Non-conformance & corrective action
Security non-conformances are logged and remediated through the Cethos CAPA process; material gaps (e.g., data-residency, missing DPAs) are entered in the audit risk register with owner and target date.

## 9. Review & version control
Reviewed annually or on material change. Versioned and approved by the Managing Director.

| Version | Date | Author | Summary | Approval |
|---|---|---|---|---|
| 1.0 (Draft) | 2026-06-20 | IT/Quality | Initial IT security governance umbrella | Pending (MD) |
