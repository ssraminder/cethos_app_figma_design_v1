# SOP-037 — Cognitive / Debriefing Interview (Standalone LV Step)

| | |
|---|---|
| **Document ID** | SOP-037 |
| **Title** | Cognitive / debriefing interview (incl. participant recruitment) — standalone linguistic-validation step |
| **Owner** | Project Management / Operations |
| **Applies to** | Any PM/coordinator and assigned interviewer running a standalone LV interview order in the admin portal (`portal.cethos.com`) |
| **Category** | Production |
| **Status** | Active · v1.0 (effective 2026-06-26) |
| **Governing policy** | SOP-029 (LV master framework); SOP-003 (Vendor Qualification & Management); SOP-001 (Document Control & Records Management); SOP-011 (CAPA) |
| **Standard / ISO reference** | ISO 17100:2015 §5.3.6 (verification & release); ISO 9001:2015 QMS; ISPOR COA good practices (cognitive debriefing) |
| **Related** | SOP-029 (master LV framework) · workflow template `lv_interview` |

---
## 1. Purpose

Define **how a single interview step** is performed and released when an LV client subcontracts it on its own PO. This step covers the **cognitive / debriefing interview** with target-population participants — **including participant recruitment and screening** — to test how a translated COA/PRO instrument is understood: a qualified interviewer recruits/screens participants, administers the instrument, conducts structured cognitive probing, and documents each interview. An independent internal reviewer then verifies the interview output before release.

The interview is a **validation step, not a translation service**: its QA node is a **§5.3.6 verification & release** by an independent person, under the **ISO 9001 QMS + ISPOR/regulatory LV methodology**. **Do NOT describe this step as an "ISO 17100 translation service."** Cethos is ISO 17100-**aligned, not certified** (Stage 2 target ~Dec 2026) — never write "certified."

> **Relationship to SOP-008:** SOP-008 covers the full standalone **cognitive debriefing** engagement (interviews → analysis → debriefing report). This SOP-037 is the focused **interview** step on the `lv_interview` template — used when the client subcontracts the interview/fieldwork on its own PO (recruitment + interviews + documented interview output), with analysis/report potentially a separate PO. Where a single PO covers the whole debriefing, run it under SOP-008.

This SOP is the step recipe only. Intake, vendor assignment, the QA gate mechanics, delivery and records are defined once in **SOP-029** — this document points to them.

## 2. Scope & inputs

- **Scope:** one interview/fieldwork step — participant recruitment & screening, administration of the translated instrument, structured cognitive interviews, and documented per-interview output — verified internally before release. Cethos delivers a conformant **component**.
- **Template:** `lv_interview` (3-node: Interview → QA Review → Final Deliverable).
- **Inputs (from the client PO/intake — see SOP-029 §6 step 1):**
  - the **translated** instrument (the version to be debriefed) + the source instrument;
  - the interview/probe guide (or agreement to use the standard ISPOR approach);
  - target population, country/locale, required sample size and screening criteria;
  - deadline, deliverable format, PO#.
- **Out of scope:** producing the translation (SOP-030); the analysis/debriefing report when scoped separately (SOP-008); clinician review (SOP-009). Each is its own PO/workflow.

## 3. Procedure

**PM**
1. Confirm intake per **SOP-029 §6.1** — create/confirm the order on the `lv_interview` template; record instrument, language/country, sample size & screening criteria, amount, PO#, PM. **Confirm the protocol (population, sample, instrument version, probe guide) in writing before fieldwork** — re-running interviews is costly and the agreed protocol is the pre-production record an auditor checks. Request anything missing before assigning.
2. Assign a **qualified** interviewer — native/in-country for the target population, qualified for cognitive debriefing/COA — from the QMS roster per **SOP-029 §6.2** (never assign an unqualified interviewer). Brief on protocol, confidentiality (NDA) and data protection.

**Interviewer (production step 1)**
3. **Recruit & screen** participants to the agreed criteria (genuine target-population members — e.g. patients with the relevant condition where required). Document recruitment and de-identified participant profiles; obtain participant consent per the data-protection policy. Default sample is **5–8 participants per language** unless the protocol specifies otherwise — record the agreed number.
4. Administer the translated instrument to each participant and conduct the **structured cognitive interview** (comprehension, clarity, cultural appropriateness) using the probe guide.
5. **Document each interview** — probes, responses, item-level comprehension issues, de-identified participant profile. No undocumented interviews.
6. Compile the per-interview output (and, if the PO scope includes it, the item-level findings summary). Upload interview documentation to step 1.

**Independent reviewer (QA step 2) — see SOP-029 §6.4**
7. A **different** qualified person performs the **§5.3.6 verification**: confirm the agreed sample/screening was met, every interview is documented, findings (if in scope) trace to interview evidence, participant PII is de-identified, and the output is complete and client-ready. Mark issues or return with documented reasons; re-verify on resubmission.
8. Record the verification outcome (reviewer identity, timestamp, pass/return) on the QA step.

**PM (release step 3)**
9. On QA approval, assemble the final deliverable and release to the client per **SOP-029 §6.5** (§5.3.6 release). **De-identify participant PII** in anything that leaves Cethos. Invoice/close per the client terms (SOP-029 §6.6).

## 4. Quality assurance

- **QA node:** **ISO 17100 §5.3.6 — Verification & release**, performed by an **independent** internal reviewer (not the interviewer), under the ISO 9001 QMS + ISPOR LV methodology.
- This is a **validation step** — **NOT** an ISO 17100 translation service; do not label it as such. Conformance basis = QMS + ISPOR.
- Interviewer competence (qualified for cognitive debriefing/COA, native/in-country for the target population; ISO 17100 §3.1 + COA/LV) held and current in the QMS before assignment (SOP-029 §5).

## 5. Outputs & delivery

- **Deliverable:** the documented interview output — per-interview records, de-identified participant profiles, and (where in scope) item-level comprehension findings — in the agreed format.
- **Delivery:** released only after the §5.3.6 verification passes; delivery recorded per SOP-029 §6.5. Participant PII de-identified before release.

## 6. Records & retention

Per **SOP-029 §8** (ISO 17100 §6.2 — retain **≥ 5 years**): order/PO record (instrument, language/country, sample, agreed protocol, PO#, PM); interviewer + reviewer assignment and eligibility log; recruitment/screening records and de-identified participant profiles; per-interview documentation; the §5.3.6 verification outcome; delivery/release record; client feedback linked to any CAPA. Participant data handled under the interviewer's NDA and the data-protection policy. Files in controlled storage (vendor-deliveries bucket + project Dropbox per the folder-naming SOP).

## 7. Related documents

- **SOP-028** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-029** — master LV framework (intake, assignment, QA gate, delivery, records, conformance basis).
- **SOP-008** — Cognitive Debriefing (the full standalone debriefing engagement; use it when one PO covers interviews + analysis + report).
- **LV-standalone-workflow-set-design.md** — §2 conformance basis, §3 task→clause map (row 9), §4 the 3-node structure.
- **Standards:** ISO 17100:2015 (§5.3.6); ISPOR good practices for COA translation & cultural adaptation (cognitive debriefing).
