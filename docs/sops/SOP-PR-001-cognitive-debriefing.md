# SOP-PR-001 — Cognitive Debriefing (Standalone COA Validation Service)

| | |
|---|---|
| **Document ID** | SOP-PR-001 |
| **Title** | Running a standalone cognitive debriefing (COA linguistic validation) project |
| **Owner** | Project Management / Operations |
| **Applies to** | Any PM or coordinator running a cognitive debriefing order in the admin portal (`portal.cethos.com`) |
| **Status** | Active · v1.0 (2026-06-24) |
| **Governing policy** | SOP-006 (COA linguistic validation qualification), SOP-003 (Approval authority & quality oversight), SOP-007 (CAPA & complaint handling) |
| **Standard** | ISO 17100:2015 — Clause 4 (pre-production), §5.2 (project management), Clause 6 (post-production, §6.1 feedback / §6.2 records); ISPOR good practices for COA translation & cultural adaptation (cognitive debriefing methodology). ISO 17100 §5.3 translation-production clauses (incl. §5.3.3 revision) **do not apply** — see §2. |

---

## 1. Purpose & principle

This runbook says **how** to run a **standalone cognitive debriefing** project in the portal, end to end, and **what records** it must leave for an ISO 17100 / IQVIA auditor. Cognitive debriefing tests how a **translated** COA/PRO instrument performs with real members of the **target population** — it is a *validation* service, not a translation service.

**The one principle that governs everything:** *the deliverable is evidence that the instrument was understood as intended by the target population, produced by a qualified, independent interviewer and signed off by internal QA — every finding tracing to a documented interview.* When the protocol (sample, population, instrument version) is unclear, **confirm with the client before fieldwork** — re-running interviews is costly and the agreed protocol is the §4.4 record an auditor checks.

---

## 2. Scope & definitions

- **Cognitive debriefing (a.k.a. cognitive interviewing / pilot testing):** structured interviews with a small sample of target-population respondents who complete the translated instrument, probing comprehension, clarity, and cultural appropriateness, and surfacing item-level problems and proposed refinements.
- **Standalone** means the **client provides the already-translated instrument** (and the source instrument / interview guide where applicable). **Cethos does not produce the forward translation in this workflow.**
- **Therefore ISO 17100 §5.3.3 (bilingual revision by a second linguist) does not apply here** — there is no Cethos-produced translation to revise. The "second pair of eyes" required is the **internal QA review of the debriefing report** (§6), and independence is satisfied by the interviewer being an **independent, qualified consultant**. (When Cethos *does* produce the translation, that happens in a *separate* translation workflow or the full LV-cycle workflow, where §5.3.3 applies — not here.)
- **Out of scope:** forward/back translation, reconciliation, harmonisation. If the engagement needs those, raise a separate order/workflow (or the full LV-cycle workflow) — do not bolt them onto this one.

---

## 3. The process & ISO phase mapping

| ISO phase | What happens here | System record |
|---|---|---|
| **Pre-production** (Clause 4) | Enquiry → quote/order; agree instrument version, target language/country, sample size, timeline, deliverable format (§4.4 client agreement). Assign a qualified interviewer (§4.6). | Quote/order record; client PM; `assignment_eligibility_events` |
| **Production** (Clause 5) | **Cognitive debriefing** (recruit/screen respondents → conduct interviews → analyse → draft report) → **internal QA review** of the report. PM maintains client communication and handles queries (§5.2). | `order_workflow_steps` (Cognitive debriefing → QA review); interview documentation; report |
| **Post-production** (Clause 6) | Release & deliver the report → confirm receipt → solicit feedback (§6.1); archive (§6.2, ≥5 yrs). | Final deliverable; delivery confirmation; feedback / CAPA record |

**Operational workflow (portal):** `cognitive_debriefing` template — **Cognitive debriefing → QA review → Final deliverable.** (There is **no** Translation step; the translation is client-provided. If you see a Translation step on a cognitive debriefing order, it is wrong for a standalone engagement — see §9.)

---

## 4. Roles & responsibilities

| Role | Responsibility |
|---|---|
| **Project Manager (Cethos)** | Owns the order. Confirms the protocol with the client, assigns the interviewer, monitors progress, runs client communication, releases the deliverable, captures feedback. |
| **Cognitive debriefing interviewer** (independent consultant / linguist) | Qualified per SOP-006 for COA / the interviewer role; native/in-country for the target population. Recruits & screens respondents, conducts and documents the interviews, analyses, writes the report. |
| **Internal QA reviewer (Cethos)** | Independent of the interviewer. Checks the report for methodology adherence, completeness, finding↔interview traceability, and that the agreed sample/scope was met. Signs off before delivery. |
| **Client** | Provides the translated instrument + source + any interview guide; agrees the protocol; receives and may provide feedback on the deliverable. |

---

## 5. Operational procedure (the core loop)

1. **Receive & check client materials.** Translated instrument (the version to be debriefed), source instrument, interview/probe guide if supplied, target population & country, requested sample size, deadline, deliverable format. If anything is missing or ambiguous, **request it before fieldwork** (§7).
2. **Set up the order.** Create/confirm the order on the **`cognitive_debriefing`** workflow. The quote/order record captures the languages, country, instrument, sample, deadline and client PM — this **is** your pre-production specification (§4.4); there is no separate "project preparation" step.
3. **Assign a qualified interviewer.** Use Find Vendor → assign to a consultant qualified for cognitive debriefing / COA (SOP-006) and appropriate for the target language & country. The eligibility decision is logged (`assignment_eligibility_events`). Brief them on the protocol and confidentiality (NDA + data-protection policy).
4. **Fieldwork (interviewer).** Recruit & screen respondents to the agreed criteria, administer the instrument, conduct the structured cognitive interviews, and **document each interview** (probes, responses, de-identified respondent profile). Default sample is **5–8 respondents per language** unless the client/protocol specifies otherwise — record the agreed number.
5. **Analyse & draft the report (interviewer).** Item-level comprehension findings, problematic items, proposed refinements, and a summary — each finding traceable to the interview evidence. Upload the report + supporting documentation to the step.
6. **Internal QA review.** A Cethos reviewer (independent of the interviewer) checks the report against §6, confirms the agreed sample/scope was met, and records sign-off (who/when). If it fails, return to the interviewer with documented reasons; re-review on resubmission.
7. **Release & deliver.** Assemble the final deliverable and **Send to client** (final verification & release, §5.3.6). De-identify respondent PII in anything that leaves Cethos.
8. **Confirm receipt** (delivery confirmation) and **solicit feedback** (§6.1). Route any complaint into CAPA per SOP-007.

---

## 6. Quality controls

- **Interviewer competence (SOP-006).** Only a consultant qualified for cognitive debriefing / COA, native/in-country for the target population, may conduct fieldwork. The qualification is the QMS record an auditor checks; assignment eligibility is gated and logged.
- **Sample & recruitment.** Respondent count and screening criteria per the agreed protocol (default 5–8/language). Document recruitment and de-identified respondent demographics; respondents must be genuine target-population members (e.g. patients with the relevant condition where the instrument requires it).
- **Interview conduct & documentation.** Use a structured probe guide; document every interview so findings are traceable to evidence. No undocumented interviews.
- **Report QA (the internal review).** Independent Cethos reviewer confirms: methodology followed, sample/scope met, every finding traces to an interview, proposed refinements are item-specific, and the report is complete and client-ready. Sign-off recorded before release.
- **Confidentiality & data protection.** Respondent data handled under the interviewer's NDA and the data-protection policy; PII de-identified in the deliverable and retained records.

---

## 7. Client communication (all recorded against the order)

- **Intake / agreement (§4.4):** confirm instrument version, target population & country, sample size, timeline, and deliverable format **in writing** before fieldwork. This agreement is the pre-production record.
- **Queries during the project (§5.2):** any clarification (ambiguous item, population/screening question) goes PM ↔ client and is recorded on the order. A query that blocks fieldwork pauses production until resolved.
- **Delivery (§5.3.6 / §5.5):** the report is sent and **receipt confirmed**.
- **Feedback (§6.1):** solicit client feedback after delivery; log it. Complaints → CAPA (SOP-007).

> These touchpoints are to be captured in the order's communication trail. The portal enhancement to log them immutably (client-communication / lifecycle audit log) is planned; until it ships, record them on the order communications and the final-deliverable send log.

---

## 8. Records & retention (ISO §6.2 — ≥5 years)

Every cognitive debriefing order must leave this evidence trail:

- **Order / quote record** — instrument, languages, country, sample, deadline, client PM, agreed protocol (the §4.4 agreement).
- **Interviewer assignment + eligibility log** (`assignment_eligibility_events`) — who, qualified how, when.
- **Interview documentation** — per-interview records + de-identified respondent profiles.
- **Cognitive debriefing report** — findings, proposed refinements, summary.
- **Internal QA sign-off** — reviewer identity + timestamp + outcome.
- **Delivery confirmation** — what was sent, to whom, when (final-deliverable / draft-send log).
- **Client feedback / CAPA** — feedback captured; any complaint linked to its CAPA record.

Retain ≥5 years per ISO 17100 §6.2 and the data-protection policy. The per-cycle audit reports live in `docs/audits/`.

---

## 9. Don't

- **Don't treat this as a translation service.** Cethos does not produce the forward translation here; the client provides it. If a Translation step appears on a standalone cognitive debriefing order, it is a template error — **remove it** (or move the engagement to a translation / full-LV-cycle workflow).
- **Don't claim §5.3.3 revision applies.** It doesn't — the control here is the independent interviewer + internal QA review (§2, §6).
- **Don't deliver without the internal QA sign-off** (§6).
- **Don't use an unqualified interviewer** — must be qualified per SOP-006 for the target population.
- **Don't put respondent PII in the deliverable** — de-identify.
- **Don't start fieldwork on an unconfirmed protocol** — the agreed sample/population/instrument version is the §4.4 record; re-running interviews on a wrong protocol is a nonconformity, not a do-over.

---

## 10. Related documents

- **SOP-026** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-006** — COA linguistic validation qualification (who may interview/debrief).
- **SOP-003** — Approval authority & quality oversight.
- **SOP-007** — CAPA management & complaint handling (feedback/complaint route).
- **Workflow mapping** — `docs/audits/2026-06-iqvia/Cethos-Workflow-ISO17100-Mapping.pptx` (where cognitive debriefing sits among the workflows).
- **Standards** — ISO 17100:2015; ISPOR good practices for COA translation & cultural adaptation (cognitive debriefing).
