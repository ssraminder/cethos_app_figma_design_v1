# Approved Supplier List — Cethos Translations
**Generated:** 2026-06-17 from the live QMS register (`lmzoyezvsjgsxveoakdr`). **For:** IQVIA vendor-qualification audit (Supplier Management).

Cethos's "suppliers" fall in two classes: **(A) Linguistic resources** (translators, revisers, agencies) and **(B) IT / service sub-processors** (third parties that host or process data). Both are listed below. Approval basis and oversight are defined in the two Supplier-Management SOPs.

---

## A. Linguistic resources (approved = ISO 17100 §3.1 qualification on file)

**Roster summary (live):** 56 vendors hold a recorded role qualification (104 role qualifications total); 408 NDAs on file. A vendor is *approved* when it has a recorded §3.1.4 competence basis with documented evidence and a current NDA.

### A.1 COA-qualified panel (subject-matter recorded) — the in-scope list for IQVIA COA work
| Linguist | Roles | Subject-matter qualification |
|---|---|---|
| Gonzalo Calderon | Translator + Reviser | Clinical Trials (ICF, COA, COG); Life Sciences / Medical — *specialist* |
| edna osorio | Translator + Reviser | Life Sciences / Medical — *specialist* |
| Raja (R. Rajamanickam) | Translator + Reviser | Clinical Trials (ICF, COA, COG); Life Sciences / Medical — *experienced* |
| Claudia Bayá Crapuchett | Translator + Reviser | Life Sciences / Medical — *experienced* |
| Gurpreet Singh | Translator + Reviser | Life Sciences / Medical — *experienced* |
| Abhinav Dang | Translator + Reviser | Life Sciences / Medical — *experienced* |

*(MD-approved 2026-06-17; QM spot-check pending. Additional nominees — Tejinder Soodan, Abhash Pathak, Jagjeet, Ravindran A, Mugdha Ghate, Jaisy Louis, Patricia Lima, Amirreza Noroozi, Alessia Rosafio — are in qualification; their §3.1.4 basis is being established from XTRF history / recruitment pipeline and will be added on completion.)*

### A.2 Broader qualified linguist pool
56 vendors with recorded qualifications across language pairs (full register at /admin/vendors → QMS tab; live query in `mock-audit-recruitment-qualification.md` Step 2). This is the general approved-translator pool; COA assignments draw only from A.1.

### A.3 Sub-contracted / agency linguists
Agencies are approved on the agency's ISO 17100 certificate **or** its named linguists' credentials; per-delivery traceability via `vendors.business_name` + `step_deliveries.vendor_identifier`. (Mugdha Ghate / Srujaa is treated as an individual vendor per 2026-06-17 decision.)

---

## B. IT / service sub-processors (third parties processing Cethos / client data)
*Detected from the platform integration code; DPA / data-residency status to be confirmed (action item).*

| Sub-processor | Function | Touches client/trial content? | DPA / residency |
|---|---|---|---|
| Supabase | Database, auth, storage, edge functions (core platform) | **Yes** (documents) | confirm |
| Anthropic (Claude) | AI: OCR analysis, assessment, instructions | Yes (document content) | confirm |
| Mistral AI | OCR | Yes | confirm |
| Google Cloud Document AI | OCR | Yes | confirm |
| Dropbox | File storage / sync | Yes | confirm |
| Brevo (Sendinblue) | Transactional email | Metadata / PII | confirm |
| Mailgun | OTP / login email | Metadata / PII | confirm |
| Stripe | Payments | Billing PII | confirm |
| Twilio | SMS | Metadata / PII | confirm |
| RingCentral | Voice / SMS | Metadata / PII | confirm |
| Cal.com | Scheduling | Metadata / PII | confirm |
| Sentry | Error monitoring | Possible incidental | confirm |
| External CRM | Order intake | PII | confirm which CRM |
| Netlify / Vercel | Frontend hosting | Transit | confirm |

**Action:** confirm signed DPAs + data residency for every processor that touches trial/COA content (Supabase, the OCR/AI trio, Dropbox) before the audit; record in the IT/Sub-processor Management SOP register.

---

## Maintenance
- Linguistic resources: re-qualification reviewed every 12 months (SOP-002 / §3.1.8); suspension/offboarding on quality events.
- Sub-processors: reviewed at least annually and on any change of scope; DPA + residency re-confirmed.
- This list is regenerated from the live register; the QMS tab is the source of truth.
