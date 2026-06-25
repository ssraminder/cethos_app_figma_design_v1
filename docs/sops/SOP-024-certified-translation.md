# SOP-024 — Certified Translation

| | |
|---|---|
| **Document ID** | SOP-024 |
| **Title** | Running a Certified Translation order — translation and certification of official documents |
| **Owner** | Project Management / Operations |
| **Applies to** | Any PM or coordinator running a certified translation order in the admin portal (`portal.cethos.com`) |
| **Status** | Active · v1.0 (2026-06-25) |
| **Category** | Production |
| **Governing policy** | SOP-003 (Vendor Qualification and Management), SOP-001 (Document Control and Records Management), SOP-011 (Corrective and Preventive Actions) |
| **Standard** | ISO 17100:2015 — Clause 4 (pre-production); §5.2 (project management & client communication); §5.3.1 (translation), §5.3.2 (translator self-check), §5.3.6 (final verification & release); Clause 6 (§6.1 feedback, §6.2 records). **§5.3.3 independent revision is NOT a step in this workflow — see §2 and §6.** |

---

## 1. Purpose & principle

This runbook says **how** to run a **Certified Translation** order in the portal, end to end, and **what records** it must leave for an ISO 17100 / IQVIA auditor. Certified translation produces a translation of an **official document** (e.g. for legal, immigration, academic or government use) accompanied by a **signed certificate / affidavit** attesting to the accuracy and completeness of the translation. It is Cethos's default document-certification workflow.

**The one principle that governs everything:** *the deliverable is an accurate translation plus a certification statement that is correct for the certification type and the jurisdiction it is intended for.* Two things must hold: (a) the translator is **qualified** for the pair and document type, and (b) the certificate is generated from the **correct template for the certification type and jurisdiction** — never substitute a wrong-language, wrong-jurisdiction or wrong-type certificate (fail loud and stop; see §6).

---

## 2. Scope & definitions

- **Certified translation:** a translation of an official document issued together with a formal certificate / affidavit of accuracy, suitable for submission to the requesting authority.
- **Translation (§5.3.1) + self-check (§5.3.2):** a qualified translator renders the source and checks their own work before handoff.
- **Customer draft review:** a client value-add touchpoint where the customer confirms names, dates, spellings and details on the draft before certification. It is **not** an ISO production step.
- **PM Review & Certification:** an internal Cethos step — the PM (or qualified certifying staff) verifies the translation against the source and **issues the certificate / affidavit** for the certification type and jurisdiction.
- **ISO 17100 §5.3.3 position (read this).** This workflow, as configured, contains a **single linguist (the translator)** and an internal PM certification — it does **not** include an **independent revision by a second qualified linguist (§5.3.3)**. The PM Review & Certification is an internal verification and the formal attestation; it is **not** a §5.3.3 bilingual revision, and the customer draft review is not §5.3.3 either (the customer is not a qualified reviser). **Where a job requires ISO 17100 §5.3.3-conformant production, run it through Translation and Review (SOP-023) or Standard TEP (SOP-022) first, then certify the revised output.**
- **Out of scope:** non-certified translation (use SOP-023 / SOP-022 / `translation_only`).

---

## 3. The process & ISO phase mapping

| ISO phase | What happens here | System record |
|---|---|---|
| **Pre-production** (Clause 4) | Enquiry → quote/order; agree the **certification type**, **jurisdiction / intended use**, source document, language pair, delivery date (§4.4 client agreement). Assign a qualified translator (§4.6). | Quote/order record (certification type, intended use, country of issue); client PM; `assignment_eligibility_events` |
| **Production** (Clause 5) | **Translation** (§5.3.1) + self-check (§5.3.2) → **Customer draft review** → **PM Review & Certification** (internal verification against source + issue the certificate/affidavit, §5.3.6). PM maintains client communication (§5.2). | `order_workflow_steps` (Translation → Customer Draft Review → PM Review & Certification) |
| **Post-production** (Clause 6) | Release the certified package → confirm receipt → solicit feedback (§6.1); archive (§6.2, ≥5 yrs). | Final Deliverable; issued certificate; delivery confirmation; feedback / CAPA record |

**Operational workflow (portal):** `certified_translation` template — **Translation → Customer Draft Review → PM Review & Certification → Final Deliverable.** The **Customer Draft Review gates approval** of the translation (`approval_depends_on_step`): the order proceeds to PM certification only after the customer has confirmed the draft.

---

## 4. Roles & responsibilities

| Role | Responsibility |
|---|---|
| **Project Manager (Cethos)** | Owns the order. Confirms certification type / jurisdiction with the client, assigns the translator, manages the customer draft review, performs the **PM Review & Certification** (verify against source, issue the correct certificate/affidavit), releases the package, captures feedback. |
| **Translator** (§5.3.1) | Qualified per SOP-003 for the language pair and document type. Produces the target text and performs the §5.3.2 self-check before handoff. |
| **Certifying authority** | The PM or qualified staff who signs the certificate. Responsible for verifying the translation against the source and that the certificate is correct for the certification type and jurisdiction. |
| **Client** | Provides the official source document and intended use / jurisdiction; confirms names, dates and details at the draft review. |

---

## 5. Operational procedure (the core loop)

1. **Receive & check the order.** Confirm the **certification type**, **jurisdiction / intended use (country of issue)**, source document(s), language pair, name/date/spelling specifics, and delivery date. These drive which certificate template applies — confirm them **before** assigning (§7). The quote/order record **is** your pre-production specification (§4.4).
2. **Assign the Translator.** Use **Find Vendor** → assign a linguist qualified (SOP-003) for the pair and document type to **step 1 Translation**. The eligibility decision is logged (`assignment_eligibility_events`).
3. **Translation + self-check (vendor).** The translator delivers the target file and confirms the §5.3.2 self-check. Names, dates, numbers and proper nouns must match the source exactly. Upload to the step.
4. **Customer draft review.** Share the draft (step 2); the customer confirms names, dates, spellings and details. Record confirmation/changes on the order. Customer sign-off gates progression to certification.
5. **PM Review & Certification.** The PM verifies the translation against the source (accuracy, completeness, that every element of the official document is rendered), then **issues the certificate / affidavit from the correct template for the certification type and jurisdiction**. If the required template is missing or wrong for the type/jurisdiction/language, **stop and escalate** — do not substitute (see §6, §9).
6. **Release & deliver.** Assemble the certified package (translation + certificate) and **Send to client** (§5.3.6).
7. **Confirm receipt** (delivery confirmation) and **solicit feedback** (§6.1). Route any complaint into CAPA per SOP-011.

---

## 6. Quality controls

- **Translator competence (SOP-003).** The translator must be qualified for the pair and document type; assignment eligibility is gated and logged.
- **Correct certificate template (fail loud).** The certificate / affidavit must match the **certification type, jurisdiction and language**. A missing or mismatched template is a **stop condition** — escalate and resolve; never ship an English or wrong-jurisdiction certificate on a non-matching job. (This is the certified-translation analogue of the affidavit-template fail-loud rule.)
- **PM verification before certifying.** The certifying authority confirms the translation against the source before signing — the certificate attests to that verification.
- **Customer draft review.** A client value-add (confirming names/dates); it gates certification but does not replace translator competence or PM verification, and it is not a §5.3.3 revision.
- **ISO 17100 §5.3.3 (honesty note).** This workflow has **no independent second-linguist revision**. Do not represent a plain certified translation as ISO 17100 §5.3.3-conformant production. When §5.3.3 is required, certify a TEP / Translation-and-Review output instead (SOP-022 / SOP-023).
- **Confidentiality & data protection.** Official documents (often containing personal data) are handled under the translator's NDA and the data-protection policy.

---

## 7. Client communication (all recorded against the order)

- **Intake / agreement (§4.4):** confirm certification type, jurisdiction / intended use, source document and any name/date/spelling specifics **before assigning** — these determine the certificate. This agreement is the pre-production record.
- **Queries during the project (§5.2):** any clarification (illegible source, ambiguous name transliteration) goes PM ↔ client and is recorded on the order.
- **Customer draft review:** the customer confirms the draft; this gates certification.
- **Delivery (§5.3.6):** the certified package is sent and **receipt confirmed**.
- **Feedback (§6.1):** solicit feedback after delivery; log it. Complaints → CAPA (SOP-011).

> These touchpoints are captured on the order's communication trail. The portal enhancement to log them immutably (client-communication / lifecycle audit log) is planned; until it ships, record them on the order communications and the final-deliverable send log.

---

## 8. Records & retention (ISO §6.2 — ≥5 years)

Every certified translation order must leave this evidence trail:

- **Order / quote record** — certification type, jurisdiction / intended use, language pair, source document, client PM (the §4.4 agreement).
- **Assignment + eligibility log** (`assignment_eligibility_events`) — translator: who, qualified how, when.
- **Translation file** — the target rendered from the source.
- **Customer draft review** — what was confirmed/changed.
- **Issued certificate / affidavit** — the signed attestation, the template used, who certified, and when.
- **Delivery confirmation** — what was sent, to whom, when.
- **Client feedback / CAPA** — feedback captured; any complaint linked to its CAPA record.

Retain ≥5 years per ISO 17100 §6.2 and the data-protection policy. Per-cycle audit reports live in `docs/audits/`.

---

## 9. Don't

- **Don't issue a certificate from the wrong template** — it must match the certification type, jurisdiction and language. If it's missing or wrong, **stop and escalate**, never substitute.
- **Don't certify without verifying the translation against the source.**
- **Don't represent a plain certified translation as ISO 17100 §5.3.3-conformant** — it has no independent reviser. Route through SOP-022 / SOP-023 when §5.3.3 is required, then certify.
- **Don't treat the customer draft review as a revision** — the customer is not a qualified reviser.
- **Don't use an unqualified translator** — must be qualified per SOP-003 for the pair and document type.
- **Don't release before customer confirmation and PM certification.**

---

## 10. Related documents

- **SOP-023** — Translation and Review / **SOP-022** — Standard TEP (use these to add an independent §5.3.3 reviser when required, then certify).
- **SOP-003** — Vendor Qualification and Management (who may translate / certify).
- **SOP-001** — Document Control and Records Management (records & retention; certificate control).
- **SOP-011** — Corrective and Preventive Actions (feedback / complaint route).
- **Workflow mapping** — `docs/audits/2026-06-iqvia/Cethos-Workflow-ISO17100-Mapping.pptx` (where certified translation sits among the workflows, incl. the §5.3.3 position).
- **Standard** — ISO 17100:2015 (§5.3 translation production).
