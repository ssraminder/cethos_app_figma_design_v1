# SOP-PR-009 — Proofreading (Standalone LV Step)

| | |
|---|---|
| **Document ID** | SOP-PR-009 |
| **Title** | Proofreading (paper & eCOA final layout/typographical check) — standalone linguistic-validation step |
| **Owner** | Quality / Operations |
| **Applies to** | Any PM/coordinator and assigned linguist running a standalone LV proofreading order in the admin portal (`portal.cethos.com`) |
| **Status** | Draft v0.1 — 2026-06-25 |
| **Related** | SOP-LV-001 (master LV framework) · `docs/audits/2026-06-iqvia/LV-standalone-workflow-set-design.md` · workflow template `lv_proofreading` |

---

## 1. Purpose

Define **how a single proofreading step** is performed and released when an LV client subcontracts it on its own PO. Proofreading is the **final monolingual check of the formatted instrument** — paper and/or eCOA (screenshots/build) — against the approved source/translated text, catching typographical, spelling, punctuation, layout, pagination, truncation and display errors before the instrument goes live. An independent internal reviewer then verifies the result before release.

Proofreading is a **review step, not a translation service** (ISO 17100 treats proofreading as an optional component, §5.3.5): its QA node is a **§5.3.6 verification & release** by an independent person, under the **ISO 9001 QMS + ISPOR/regulatory LV methodology**. **Do NOT describe this step as an "ISO 17100 translation service."** Cethos is ISO 17100-**aligned, not certified** (Stage 2 target ~Dec 2026) — never write "certified."

This SOP is the step recipe only. Intake, vendor assignment, the QA gate mechanics, delivery and records are defined once in **SOP-LV-001** — this document points to them.

## 2. Scope & inputs

- **Scope:** one final proofread of a formatted instrument (paper PDF and/or eCOA screenshots/build) against the approved text, delivered with a marked-up findings list, verified internally before release. Cethos delivers a conformant **component**.
- **Template:** `lv_proofreading` (3-node: Proofreading → QA Review → Final Deliverable).
- **Inputs (from the client PO/intake — see SOP-LV-001 §6 step 1):**
  - the formatted artefact to proofread (paper layout PDF and/or eCOA screenshots/build);
  - the **approved** source/translated text it must match (the reference of record);
  - any style/formatting spec, deadline, deliverable format (marked-up PDF / findings log), PO#.
- **Out of scope:** translation or adaptation of content (SOP-PR-003 / -004); bilingual revision; harmonization (SOP-PR-008). Each is its own PO/workflow. Proofreading does **not** re-translate — it checks the approved text as laid out.

## 3. Procedure

**PM**
1. Confirm intake per **SOP-LV-001 §6.1** — create/confirm the order on the `lv_proofreading` template; record instrument, language, format (paper/eCOA), amount, PO#, PM. Verify the formatted artefact and the approved reference text are both present and version-matched; request anything missing before assigning.
2. Assign a **qualified** linguist (proofreader) native in the target language and the subject field, per **SOP-LV-001 §6.2** (never assign an unqualified linguist).

**Linguist (production step 1)**
3. Compare the formatted artefact against the approved reference text item-by-item / screen-by-screen.
4. Check: spelling, typography, punctuation, diacritics/encoding, completeness (nothing dropped or duplicated), correct item/response-option order, layout, pagination, line breaks, **text truncation/overflow**, fonts and on-screen display (for eCOA). Confirm the displayed text matches the approved text exactly.
5. **Mark up every finding** with its location (page/screen/item) and the correction. Produce a marked-up artefact and/or findings log. Raise anything ambiguous (e.g. an apparent reference-text error) as a query to the PM rather than silently changing approved text.
6. **Self-check:** confirm the whole artefact was covered; upload the marked-up file/findings log to step 1.

**Independent reviewer (QA step 2) — see SOP-LV-001 §6.4**
7. A **different** qualified person performs the **§5.3.6 verification**: confirm the full artefact was proofread against the approved text, findings are accurate and located, no approved text was altered without a query, and the output is complete and client-ready. Mark issues or return with documented reasons; re-verify on resubmission.
8. Record the verification outcome (reviewer identity, timestamp, pass/return) on the QA step.

**PM (release step 3)**
9. On QA approval, assemble the final deliverable and release to the client per **SOP-LV-001 §6.5** (§5.3.6 release). Invoice/close per the client terms (SOP-LV-001 §6.6).

## 4. Quality assurance

- **QA node:** **ISO 17100 §5.3.6 — Verification & release**, performed by an **independent** internal reviewer (not the proofreader), under the ISO 9001 QMS + ISPOR LV methodology. (ISO 17100 §5.3.5 frames proofreading as an optional component, not a standalone translation service.)
- This is a **review step** — **NOT** an ISO 17100 translation service; do not label it as such. Conformance basis = QMS + ISPOR (+ §5.3.5 as the component reference).
- Proofreader competence (ISO 17100 §3.1.3–§3.1.4 + COA/LV) held and current in the QMS before assignment (SOP-LV-001 §5).

## 5. Outputs & delivery

- **Deliverable:** the marked-up artefact and/or proofreading findings log (located findings + corrections), in the agreed format.
- **Delivery:** released only after the §5.3.6 verification passes; delivery recorded per SOP-LV-001 §6.5. De-identify any PII before release.

## 6. Records & retention

Per **SOP-LV-001 §8** (ISO 17100 §6.2 — retain **≥ 5 years**): order/PO record (instrument, language, format, PO#, PM); proofreader + reviewer assignment and eligibility log; the formatted artefact, approved reference text and the marked-up output/findings log; the §5.3.6 verification outcome; delivery/release record; client feedback linked to any CAPA. Files in controlled storage (vendor-deliveries bucket + project Dropbox per the folder-naming SOP).

## 7. Related documents

- **SOP-LV-001** — master LV framework (intake, assignment, QA gate, delivery, records, conformance basis).
- **LV-standalone-workflow-set-design.md** — §2 conformance basis, §3 task→clause map (row 7), §4 the 3-node structure.
- Related: **SOP-PR-011** Finalization/Certification (final assembly/release), **SOP-PR-003** Forward Translation.
- **Standards:** ISO 17100:2015 (§5.3.5/§5.3.6); ISPOR good practices for COA translation & cultural adaptation.
