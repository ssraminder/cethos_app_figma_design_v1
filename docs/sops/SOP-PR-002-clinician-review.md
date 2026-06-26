# SOP-PR-002 — Clinician Review (Standalone COA Validation Service)

| | |
|---|---|
| **Document ID** | SOP-PR-002 |
| **Title** | Running a standalone clinician review (COA linguistic validation) project |
| **Owner** | Project Management / Operations |
| **Applies to** | Any PM or coordinator running a clinician review order in the admin portal (`portal.cethos.com`) |
| **Status** | Active · v1.0 (2026-06-24) |
| **Governing policy** | SOP-006 (COA linguistic validation qualification), SOP-003 (Approval authority & quality oversight), SOP-007 (CAPA & complaint handling) |
| **Standard** | ISO 17100:2015 — Clause 4 (pre-production), §5.2 (project management), Clause 6 (post-production, §6.1 feedback / §6.2 records); ISPOR good practices for COA translation & cultural adaptation (clinician review). ISO 17100 §5.3 translation-production clauses (incl. §5.3.3 revision) **do not apply** — see §2. |

---

## 1. Purpose & principle

This runbook says **how** to run a **standalone clinician review** project in the portal, end to end, and **what records** it must leave for an ISO 17100 / IQVIA auditor. Clinician review has a qualified **clinician** (a physician / medical professional) review a **translated** COA/PRO instrument for clinical accuracy, correct medical terminology, and appropriateness for the target patient population and therapeutic context — it is a *validation* service, not a translation service.

**The one principle that governs everything:** *the deliverable is a documented clinical sign-off that the translated instrument is medically accurate and appropriate for use with the target population — produced by a qualified, independent clinician and checked by internal QA — with every finding tracing to the reviewed item.* When the therapeutic area, instrument version, or intended use is unclear, **confirm with the client before the review** — reopening a clinical review is costly and the agreed scope is the §4.4 record an auditor checks.

---

## 2. Scope & definitions

- **Clinician review (a.k.a. clinical review / physician review):** a qualified clinician reviews the translated instrument for clinical/medical accuracy, correct medical terminology, conceptual equivalence in the clinical context, and appropriateness for the target patient population — surfacing item-level clinical problems and proposed refinements.
- **Standalone** means the **client provides the already-translated instrument** (and the source instrument where applicable). **Cethos does not produce the forward translation in this workflow.**
- **Therefore ISO 17100 §5.3.3 (bilingual revision by a second linguist) does not apply here** — there is no Cethos-produced translation to revise. The "second pair of eyes" required is the **internal QA review of the clinician's report** (§6), and independence is satisfied by the clinician being an **independent, qualified consultant**. (When Cethos *does* produce the translation, that happens in a *separate* translation workflow or the full LV-cycle workflow, where §5.3.3 applies — not here.)
- **Out of scope:** forward/back translation, reconciliation, harmonisation, and cognitive debriefing (population interviews — see SOP-PR-001). If the engagement needs those, raise a separate order/workflow — do not bolt them onto this one.

---

## 3. The process & ISO phase mapping

| ISO phase | What happens here | System record |
|---|---|---|
| **Pre-production** (Clause 4) | Enquiry → quote/order; agree instrument version, target language/country, therapeutic area, intended use, timeline, deliverable format (§4.4 client agreement). Assign a qualified clinician (§4.6). | Quote/order record; client PM; `assignment_eligibility_events` |
| **Production** (Clause 5) | **Clinician review** (review the instrument item-by-item → assess clinical accuracy & appropriateness → draft report) → **internal QA review** of the report. PM maintains client communication and handles queries (§5.2). | `order_workflow_steps` (Clinician review → QA review); review documentation; report |
| **Post-production** (Clause 6) | Release & deliver the report → confirm receipt → solicit feedback (§6.1); archive (§6.2, ≥5 yrs). | Final deliverable; delivery confirmation; feedback / CAPA record |

**Operational workflow (portal):** `clinician_review` template — **Clinician review → QA review → Final deliverable.** (There is **no** Translation step; the translation is client-provided. If you see a Translation step on a clinician review order, it is wrong for a standalone engagement — see §9.)

---

## 4. Roles & responsibilities

| Role | Responsibility |
|---|---|
| **Project Manager (Cethos)** | Owns the order. Confirms the therapeutic scope with the client, assigns the clinician, monitors progress, runs client communication, releases the deliverable, captures feedback. |
| **Clinician reviewer** (independent consultant) | Qualified per SOP-006 for COA / the clinician reviewer role; a **licensed physician / medical professional** with expertise in the relevant therapeutic area; native/fluent in the target language. Reviews the instrument, documents findings with clinical rationale, writes the report. |
| **Internal QA reviewer (Cethos)** | Independent of the clinician. Checks the report for completeness, finding↔item traceability, and that the agreed scope was met. Signs off before delivery. |
| **Client** | Provides the translated instrument + source; agrees the scope (therapeutic area, intended use); receives and may provide feedback on the deliverable. |

---

## 5. Operational procedure (the core loop)

1. **Receive & check client materials.** Translated instrument (the version to be reviewed), source instrument, target language & country, therapeutic area & intended use, deadline, deliverable format. If anything is missing or ambiguous, **request it before the review** (§7).
2. **Set up the order.** Create/confirm the order on the **`clinician_review`** workflow. The quote/order record captures the languages, country, instrument, therapeutic area, deadline and client PM — this **is** your pre-production specification (§4.4); there is no separate "project preparation" step.
3. **Assign a qualified clinician.** Use Find Vendor → assign to a clinician qualified for clinician review / COA (SOP-006) and appropriate for the target language **and the instrument's therapeutic area**. The eligibility decision is logged (`assignment_eligibility_events`). Brief them on the scope and confidentiality (NDA + data-protection policy).
4. **Clinician review (clinician).** Review the translated instrument item-by-item for clinical/medical accuracy, correct terminology, conceptual equivalence and appropriateness for the patient population, and **document each finding** with its clinical rationale.
5. **Draft the report (clinician).** Item-level clinical findings, problematic items, proposed refinements, and a summary clinical assessment / sign-off — each finding traceable to the reviewed item. Upload the report + supporting documentation to the step.
6. **Internal QA review.** A Cethos reviewer (independent of the clinician) checks the report against §6, confirms the agreed scope was met, and records sign-off (who/when). If it fails, return to the clinician with documented reasons; re-review on resubmission.
7. **Release & deliver.** Assemble the final deliverable and **Send to client** (final verification & release, §5.3.6). Remove any PII from anything that leaves Cethos.
8. **Confirm receipt** (delivery confirmation) and **solicit feedback** (§6.1). Route any complaint into CAPA per SOP-007.

---

## 6. Quality controls

- **Clinician competence (SOP-006).** Only a clinician qualified for clinician review / COA — a **licensed physician / medical professional with relevant therapeutic-area expertise** — may perform the review. The qualification is the QMS record an auditor checks; assignment eligibility is gated and logged.
- **Scope & therapeutic fit.** Confirm the clinician's specialty matches the instrument's therapeutic area and patient population; document the basis for the match.
- **Review conduct & documentation.** Item-by-item review using the agreed scope; document every finding with clinical rationale so findings are traceable to the instrument. No undocumented sign-off.
- **Report QA (the internal review).** Independent Cethos reviewer confirms: the full instrument was reviewed, scope met, every finding traces to an item, proposed refinements are item-specific and clinically justified, and the report is complete and client-ready. Sign-off recorded before release.
- **Confidentiality & data protection.** Materials handled under the clinician's NDA and the data-protection policy; PII removed from the deliverable and retained records.

---

## 7. Client communication (all recorded against the order)

- **Intake / agreement (§4.4):** confirm instrument version, target language & country, therapeutic area, intended use, timeline, and deliverable format **in writing** before the review. This agreement is the pre-production record.
- **Queries during the project (§5.2):** any clarification (ambiguous item, therapeutic-context question) goes PM ↔ client and is recorded on the order. A query that blocks the review pauses production until resolved.
- **Delivery (§5.3.6 / §5.5):** the report is sent and **receipt confirmed**.
- **Feedback (§6.1):** solicit client feedback after delivery; log it. Complaints → CAPA (SOP-007).

> These touchpoints are to be captured in the order's communication trail. The portal enhancement to log them immutably (client-communication / lifecycle audit log) is planned; until it ships, record them on the order communications and the final-deliverable send log.

---

## 8. Records & retention (ISO §6.2 — ≥5 years)

Every clinician review order must leave this evidence trail:

- **Order / quote record** — instrument, languages, country, therapeutic area, deadline, client PM, agreed scope (the §4.4 agreement).
- **Clinician assignment + eligibility log** (`assignment_eligibility_events`) — who, qualified how, when.
- **Review documentation** — item-level findings + clinical rationale.
- **Clinician review report** — findings, proposed refinements, clinical assessment / sign-off.
- **Internal QA sign-off** — reviewer identity + timestamp + outcome.
- **Delivery confirmation** — what was sent, to whom, when (final-deliverable / draft-send log).
- **Client feedback / CAPA** — feedback captured; any complaint linked to its CAPA record.

Retain ≥5 years per ISO 17100 §6.2 and the data-protection policy. The per-cycle audit reports live in `docs/audits/`.

---

## 9. Don't

- **Don't treat this as a translation service.** Cethos does not produce the forward translation here; the client provides it. If a Translation step appears on a standalone clinician review order, it is a template error — **remove it** (or move the engagement to a translation / full-LV-cycle workflow).
- **Don't claim §5.3.3 revision applies.** It doesn't — the control here is the independent clinician + internal QA review (§2, §6).
- **Don't deliver without the internal QA sign-off** (§6).
- **Don't use an unqualified clinician** — must be a licensed physician / medical professional qualified per SOP-006 for the therapeutic area.
- **Don't assign a clinician whose specialty doesn't match the instrument's therapeutic area.**
- **Don't put patient or other PII in the deliverable** — remove it.
- **Don't start the review on an unconfirmed scope** — the agreed therapeutic area / instrument version / intended use is the §4.4 record; reviewing the wrong scope is a nonconformity, not a do-over.

---

## 10. Related documents

- **SOP-026** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-006** — COA linguistic validation qualification (who may perform clinician review).
- **SOP-003** — Approval authority & quality oversight.
- **SOP-007** — CAPA management & complaint handling (feedback/complaint route).
- **SOP-PR-001** — Cognitive debriefing (the sibling standalone COA validation service).
- **Workflow mapping** — `docs/audits/2026-06-iqvia/Cethos-Workflow-ISO17100-Mapping.pptx` (where clinician review sits among the workflows).
- **Standards** — ISO 17100:2015; ISPOR good practices for COA translation & cultural adaptation (clinician review).
