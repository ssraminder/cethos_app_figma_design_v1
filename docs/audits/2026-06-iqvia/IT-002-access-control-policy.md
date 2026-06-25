# IT-002 — Access Control & Logical Security Policy

| Field | Value |
|---|---|
| **Document Title** | Access Control & Logical Security Policy |
| **Document Number** | IT-002 |
| **Version** | 1.0 (Draft — pending approval) |
| **Effective Date** | Upon approval |
| **Review Date** | Annually, or on material change |
| **Document Owner** | Managing Director (acting Information Security Officer) |
| **Approved By** | Raminder Shah — Managing Director |
| **Scope** | Logical access to all Cethos systems and data |
| **Regulatory Reference** | 21 CFR Part 11 §11.10(d),(g); ICH GCP; ISO/IEC 27001 A.9; PIPEDA/GDPR |

## 1. Purpose
To ensure that access to Cethos systems and data is granted only to authorised, individually identified persons on a least-privilege, role-based basis, and is reviewed and revoked appropriately.

## 2. Scope
All logical access: the admin portal, customer portal, vendor/applicant portals, the Supabase database/storage/functions, Microsoft 365, and administrative consoles of sub-processors. Physical access is covered by IT-001 §5.8 (inherited from certified DCs) + office controls.

## 3. Responsibilities
| Role | Responsibility |
|---|---|
| Managing Director | Approves privileged (super_admin / service-role) access; owns periodic access reviews. |
| Staff member | Uses own named account; never shares credentials; reports loss/compromise. |
| Quality Manager | Confirms access reviews are recorded for audit. |

## 4. Definitions
| Term | Definition |
|---|---|
| RBAC | Role-Based Access Control. |
| RLS | Row-Level Security (database-enforced per-row authorisation). |
| Service role | Non-interactive key used by backend functions with elevated DB rights. |
| Least privilege | Minimum access necessary to perform a role. |

## 5. Policy statements
5.1 **Individual accountability** — every internal user has a unique named account linked to a single identity (`auth.users`); shared/generic logins are prohibited. *(Evidence: 9/9 staff linked to auth.)*
5.2 **Role-based tiers** — staff are assigned exactly one of `super_admin`, `admin`, or `reviewer`; privileges are scoped to the tier. Vendors and applicants access only their own data via scoped portal sessions.
5.3 **Database-enforced authorisation** — access is enforced at the data layer by **Row-Level Security**, not only the UI. *(Evidence: RLS on 252/290 public tables (87%); 658 RLS policies.)*
5.4 **Authentication** — admin access uses Supabase Auth (email + one-time code); vendor/applicant portals use one-time-code login. MFA is enforced on Microsoft 365 and the cloud-console (Supabase/AWS) administrative accounts. *(Confirm + attach MFA enforcement evidence.)*
5.5 **Privileged & service credentials** — service-role keys and console admin credentials are restricted to the minimum staff, stored as managed secrets (not in source), and rotated on staff change or suspected compromise.
5.6 **Joiner / mover / leaver** — access is provisioned on documented authorisation, changed when a role changes, and **revoked promptly on departure**; `staff_users.is_active=false` plus auth de-provisioning removes access.
5.7 **Periodic access review** — the Managing Director reviews staff accounts, roles, and privileged-key holders at least **quarterly**; the review is recorded.
5.8 **Segregation** — admin, vendor, applicant, and customer surfaces are separate applications with separate access scopes; no cross-tenant data access.

## 6. Process (access lifecycle)
1. **Request/authorise** — role + access requested; MD (or delegate) authorises. *Responsibility: Managing Director.*
2. **Provision** — create named account, assign role, link auth identity. *Responsibility: IT/Admin.*
3. **Use** — least-privilege; RLS enforces row scope. *Responsibility: User.*
4. **Review** — quarterly account/role/privilege review, recorded. *Responsibility: Managing Director.*
5. **Revoke** — on departure/role change, deactivate + de-provision auth + rotate any shared service secret. *Responsibility: IT/Admin.*

## 7. Records
| Record | Location | Retention |
|---|---|---|
| Access authorisations & changes | QMS access log | 5y |
| Quarterly access-review record | QMS | 5y |
| System access enforcement (RLS, roles) | Database (`pg_policies`, `staff_users`) | Live |

## 8. Confidentiality
All access carries a confidentiality obligation; trial/COA data is accessed strictly on a need-to-know basis.

## 9. Non-conformance & corrective action
Unauthorised access, shared credentials, or overdue reviews are logged and remediated via CAPA.

## 10. Review & version control
| Version | Date | Author | Summary | Approval |
|---|---|---|---|---|
| 1.0 (Draft) | 2026-06-20 | IT/Quality | Initial access-control policy | Pending (MD) |
