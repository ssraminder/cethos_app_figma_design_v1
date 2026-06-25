CETHOS TRANSLATION SERVICES — 12537494 Canada Inc.

Quality Management System | Controlled Record

# Sub-processor and Data-Residency Register

| Field | Value |
|---|---|
| **Document Title** | Sub-processor and Data-Residency Register |
| **Document Number** | REG-SP-001 |
| **Version** | 1.0 |
| **Effective Date** | June 24, 2026 |
| **Document Owner** | Acting Quality Manager (with IT) |
| **Review Cycle** | Annual, or on any change of sub-processor or data flow |
| **References** | SOP-018 (IT/Service Sub-processor Management); SOP-014 (Data Security); CSV-001 §2; 21 CFR Part 11; GDPR Art. 28/32; PIPEDA |
| **Classification** | Confidential |

| Prepared By | Reviewed By | Approved By |
|---|---|---|
| Raminder Shah — Acting Quality Manager | Amrita Shah — Managing Director | Raminder Shah — Founder & CEO |

## 1. Purpose and scope
This register lists every third-party service (sub-processor) that stores or processes Cethos or client data, recording its function, the data it touches, its hosting residency, its certifications, and its data-protection-agreement (DPA) status. It supports SOP-018 and the data-protection controls in SOP-014.

## 2. Control — confinement of clinical / COA content
Clinical and COA trial content is **confined to controlled storage systems only.** By Cethos policy and data-flow design:
- **Clinical / COA content is never sent to AI or OCR services.** The AI/OCR providers (Anthropic, Mistral, Google Document AI) are used only for **non-clinical, general-translation** document processing — never for COA or trial content.
- **Clinical / COA content is never carried as an email attachment.** Transactional email (Brevo) delivers notifications only; it never carries documents.
- **Consequently, the only sub-processors that hold clinical / COA content are the four controlled storage systems in §3.**

*(This control is to be reflected in SOP-014 and SOP-018 at their next revision.)*

## 3. Tier 1 — Sub-processors that hold clinical / COA content
| Sub-processor | Function | Residency | Provider certifications | DPA status |
|---|---|---|---|---|
| **Supabase** (hosted on AWS) | Production database + object/file storage (the portal platform) | US — us-east-1 | SOC 2 Type II (Supabase); underlying AWS: ISO 27001, SOC 2 | Standard DPA available — **confirm executed** |
| **AWS S3** | Independent storage backup replica (`cethos-translation-app-storage-backup`) | US — us-east-2 | ISO 27001, SOC 2, many | AWS DPA / Service Terms — **confirm** |
| **Microsoft 365 / SharePoint** | QMS documents + project document storage and exchange | M365 tenant — **confirm region** | ISO 27001, SOC 2, HIPAA-capable | Microsoft DPA (Data Protection Addendum) — standard, **confirm** |
| **Dropbox** | Project file storage and exchange | US — **confirm** | ISO 27001, SOC 2 | Dropbox Business DPA — **confirm executed** |

## 4. Tier 2 — Sub-processors that do NOT hold clinical / COA content (metadata / PII / operational only)
| Sub-processor | Function | Data touched | Residency | Note |
|---|---|---|---|---|
| Anthropic (Claude) | AI assistance — non-clinical documents/text | **No clinical/COA content** (policy §2) | US | Never receives clinical/COA data |
| Mistral AI · Google Document AI | OCR — non-clinical documents | **No clinical/COA content** (policy §2) | US | Never receives clinical/COA data |
| Brevo | Transactional email **delivery** | Email metadata + recipient PII; **no attachments** | EU | Delivery only |
| Mailgun | OTP / login email | Email metadata + PII | US | No documents |
| Stripe | Payment processing | Billing PII | US | No documents |
| Twilio · RingCentral | SMS / voice | Contact PII | US | No documents |
| Cal.com · Sentry · External CRM · Netlify | Scheduling · error monitoring · order intake · frontend hosting | Metadata / PII / data-in-transit | varies — confirm | No clinical content |

## 5. Data-residency note
Tier-1 clinical-content storage is predominantly **US-hosted** (Supabase us-east-1; AWS S3 us-east-2). This cross-border handling for a Canadian entity is **documented and tracked as a risk** (SOP-015), with PIPEDA and (for any EU-origin data) GDPR obligations addressed under SOP-014. The Microsoft 365 / SharePoint and Dropbox residency is to be confirmed and recorded here.

## 6. Review and maintenance
Reviewed at least annually and on any change of sub-processor or data flow (SOP-018). DPA status is confirmed at each review. New sub-processors are assessed and added before being brought into the data path.

## Revision History
| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | Jun 24, 2026 | R. Shah (Acting QM) | Initial register. Clinical/COA content confined to four controlled storage systems (Supabase, AWS S3, Microsoft 365/SharePoint, Dropbox); AI/OCR and email never receive clinical content. |

*** END OF DOCUMENT ***
