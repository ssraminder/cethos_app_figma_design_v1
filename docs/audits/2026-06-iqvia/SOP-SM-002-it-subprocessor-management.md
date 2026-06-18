# Standard Operating Procedure — IT / Service Sub-processor Management & Oversight

| | |
|---|---|
| **Document Title** | SOP: IT / Service Sub-processor Management & Oversight |
| **SOP Number** | SM-002 |
| **Version** | 1.0 (Draft — pending approval) |
| **Effective Date** | Upon approval |
| **Review Date** | Annually |
| **Document Owner** | IT / Quality Manager |
| **Approved By** | Raminder Shah — Managing Director |
| **Scope** | All third-party IT/service providers that host, transmit, or process Cethos or client/trial data |
| **Regulatory Reference** | IQVIA Supplier Management; 21 CFR Part 11; EU GDPR / data-processing; ICH GCP; ISO 17100 §4.3 |

## 1. Purpose
Defines how Cethos identifies, assesses, approves, and oversees the **IT and service sub-processors** that store, transmit, or process data on its behalf — so that third parties handling client and clinical-trial data meet Cethos's confidentiality, security, and data-integrity requirements.

## 2. Scope
All third-party providers in the data path: hosting/database, storage, email/SMS, payments, AI/OCR, scheduling, monitoring, CRM, and frontend hosting. Does **not** cover linguistic resources (see **SM-001**).

## 3. Responsibilities
| Role | Responsibility |
|---|---|
| IT / Database Administrator | Maintains the sub-processor register; assesses security + DPA + residency |
| Quality Manager | Annual oversight review; verifies DPAs current |
| Managing Director | Approves new sub-processors that touch trial data |

## 4. Definitions
Sub-processor · Data Processing Agreement (DPA) · Data residency · Trial/clinical content vs metadata · Confidential data — per GDPR/GCP and the Cethos data-handling policy.

## 5. Assessment criteria (before approval)
For each sub-processor, record and assess:
- **Function** + **what data it touches** (trial content / PII / metadata / transit only).
- **DPA** signed and on file (mandatory for any processor of client/trial content).
- **Data residency** + cross-border transfer basis.
- **Security posture** (encryption in transit/at rest; access controls; relevant certifications, e.g. SOC 2 / ISO 27001).
- **Sub-processor's own sub-processors** where material.
- Higher scrutiny for processors of **trial/COA content** (Supabase, OCR/AI, Dropbox).

## 6. Approved sub-processor register
- Maintained as the IT section of the **Approved Supplier List** (`approved-supplier-list.md` §B).
- A sub-processor is **approved** only with: documented function, signed DPA (if it touches client/trial data), confirmed residency, and an owner.
- No client/trial data may be routed to a sub-processor that is not on the approved register.

## 7. Ongoing oversight & change control
- **Annual review** of every sub-processor (DPA current, residency unchanged, security posture, incidents).
- **Change control:** adding a new sub-processor, or expanding one's data scope, requires assessment (§5) + MD approval before go-live; recorded in the register and infrastructure change log.
- **Incident handling:** a sub-processor security/data incident triggers the complaint/CAPA process and, where trial data is affected, sponsor notification.

## 8. Confidentiality & data integrity
Trial/COA content is transmitted to sub-processors only over secure channels; least-privilege access; retention + deletion per the data-handling policy and sponsor requirements. Audit-trail and integrity controls relevant to 21 CFR Part 11 are assessed for systems in the GxP path (cross-reference the CSV gap assessment).

## 9. Non-conformance & corrective action
A sub-processor failing assessment or oversight (missing DPA, unconfirmed residency, security gap) is a documented non-conformance → remediation or replacement → follow-up. Records retained ≥5 years.

## 10. SOP review & version control
Reviewed annually or on any change to the sub-processor landscape or applicable regulation. Revisions approved by the MD; prior versions archived.

| Version | Date | Summary | Approved By |
|---|---|---|---|
| 1.0 (Draft) | Pending | Initial release | Raminder Shah |

---
### Appendix A — Current sub-processor register (to complete)
See `approved-supplier-list.md` §B. **Open action:** confirm signed DPA + data residency for each processor of trial/COA content (Supabase, Anthropic, Mistral, Google Document AI, Dropbox) before the audit.
