# IT-003 — Data Protection, Classification, Encryption & Retention Policy

| Field | Value |
|---|---|
| **Document Title** | Data Protection, Classification, Encryption & Retention Policy |
| **Document Number** | IT-003 |
| **Version** | 1.0 (Draft — pending approval) |
| **Effective Date** | Upon approval |
| **Review Date** | Annually, or on material change |
| **Document Owner** | Managing Director (acting Information Security Officer) |
| **Approved By** | Raminder Shah — Managing Director |
| **Scope** | All data processed or stored by Cethos systems |
| **Regulatory Reference** | 21 CFR Part 11; ICH GCP; PIPEDA; GDPR (where applicable); ISO/IEC 27001 A.8/A.10 |

## 1. Purpose
To classify Cethos data, define the protection (encryption, residency, access) appropriate to each class, and govern retention and secure disposal — with particular care for client and clinical-trial (COA) materials.

## 2. Scope
All data: trial/COA documents, source files and translations, linguist personal/qualification data, customer and financial data, and operational metadata.

## 3. Responsibilities
| Role | Responsibility |
|---|---|
| Managing Director | Owns classification scheme, residency decisions, retention schedule. |
| Quality Manager | Ensures retention aligns with client/regulatory requirements. |
| All staff | Handle data per its classification; no copying trial data to uncontrolled locations. |

## 4. Definitions
| Term | Definition |
|---|---|
| Data classification | Tiering of data by sensitivity to determine controls. |
| Data residency | Geographic location where data is stored/processed. |
| At rest / in transit | Stored data / data moving across a network. |
| Secure disposal | Irreversible deletion at end of retention. |

## 5. Policy statements
5.1 **Classification** — data is classified as: **(C1) Restricted** (trial/COA content, source documents, personal IDs/diplomas), **(C2) Confidential** (customer, financial, linguist qualification), **(C3) Internal**, **(C4) Public**. Controls scale with class.
5.2 **Encryption** — all data is encrypted **at rest (AES-256, Supabase/AWS-managed)** and **in transit (TLS 1.2+)**. No production data is transmitted or stored unencrypted.
5.3 **Access** — Restricted/Confidential data is access-controlled per IT-002 (RLS, least privilege, need-to-know); trial materials are stored in controlled Storage buckets, not in email or uncontrolled drives.
5.4 **Data residency (known consideration / risk-tracked)** — production data, **including uploaded trial/COA documents, is currently hosted in the US (AWS us-east-1)** by Supabase, while Cethos is a Canadian entity. This is disclosed to clients on request; where a sponsor requires a specific residency (e.g., EU/Canada), it is handled as a project-level requirement and is recorded in the **audit risk register** with a remediation option (region migration / regional instance). Corporate email/identity is Microsoft 365.
5.5 **Sub-processors** — any third party processing Restricted/Confidential data is assessed and bound under **SOP-SM-002** (DPA, residency, security posture); the register lists 14 processors.
5.6 **Retention** — data is retained per client/contract and regulatory requirements (clinical project records: typically the trial master file requirement; default minimum 5 years unless a contract specifies longer). The retention schedule is maintained by the Quality Manager.
5.7 **Secure disposal** — at end of retention, data is securely and irreversibly deleted; append-only audit/qualification records are retained for the life of the QMS as required.
5.8 **Minimisation** — only data necessary for the service is collected; AI sub-processors (Claude/Mistral/Google DocAI) receive only the content needed for the specific processing task.

## 6. Implementation & evidence (live)
- Encryption at rest/in transit: Supabase/AWS managed (AES-256 / TLS).
- Controlled storage: CVs (`vendor-cvs`), certifications (`vendor-certifications`), QMS evidence (`qms-evidence`) — private buckets, signed-URL access only.
- Residency: project region `us-east-1` (confirmed live).
- Sub-processor register: `approved-supplier-list.md` §B / SOP-SM-002 (14 processors; DPA/residency = open action).

## 7. Records
| Record | Location | Retention |
|---|---|---|
| Classification scheme + retention schedule | QMS | Life of system |
| Sub-processor DPAs | SOP-SM-002 | Contract + 5y |
| Disposal records | QMS | 5y |

## 8. Confidentiality
All Restricted/Confidential data is subject to NDA and need-to-know; trial/COA content is never reused outside its engagement.

## 9. Non-conformance & corrective action
Mishandling, unauthorised copying, residency breaches, or retention failures are logged and remediated via CAPA; residency gap is an active risk item.

## 10. Review & version control
| Version | Date | Author | Summary | Approval |
|---|---|---|---|---|
| 1.0 (Draft) | 2026-06-20 | IT/Quality | Initial data-protection/encryption/retention policy; US residency disclosed | Pending (MD) |
