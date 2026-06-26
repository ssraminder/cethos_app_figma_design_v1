# SOP-PR-008 — Harmonization (Standalone LV Step)

| | |
|---|---|
| **Document ID** | SOP-PR-008 |
| **Title** | Harmonization (cross-language consistency of a multi-country instrument) — standalone linguistic-validation step |
| **Owner** | Quality / Operations |
| **Applies to** | Any PM/coordinator and assigned linguist running a standalone LV harmonization order in the admin portal (`portal.cethos.com`) |
| **Status** | Draft v0.1 — 2026-06-25 |
| **Related** | SOP-LV-001 (master LV framework) · `docs/audits/2026-06-iqvia/LV-standalone-workflow-set-design.md` · workflow template `lv_harmonization` |

---

## 1. Purpose

Define **how a single harmonization step** is performed and released when an LV client subcontracts it on its own PO. Harmonization reviews **multiple language versions of the same instrument** (a multi-country set) together to ensure **cross-language consistency** — that every version measures the same concepts the same way, that shared structure/scaling/response options are aligned, and that source-level issues affecting all languages are flagged consistently. An independent internal reviewer then verifies the result before release.

Harmonization is a **validation/review step, not a translation service**: its QA node is a **§5.3.6 verification & release** by an independent person, under the **ISO 9001 QMS + ISPOR/regulatory LV methodology**. **Do NOT describe this step as an "ISO 17100 translation service."** Cethos is ISO 17100-**aligned, not certified** (Stage 2 target ~Dec 2026) — never write "certified."

This SOP is the step recipe only. Intake, vendor assignment, the QA gate mechanics, delivery and records are defined once in **SOP-LV-001** — this document points to them.

## 2. Scope & inputs

- **Scope:** one harmonization review across a set of language versions of one instrument — a cross-language consistency report with harmonization recommendations, verified internally before release. Cethos delivers a conformant **component**.
- **Template:** `lv_harmonization` (3-node: Harmonization → QA Review → Final Deliverable).
- **Inputs (from the client PO/intake — see SOP-LV-001 §6 step 1):**
  - the set of target-language versions to be harmonized (with version/IDs and their languages/countries);
  - the original source instrument (the common reference);
  - any client harmonization template/conventions, deadline, deliverable format, PO#.
- **Out of scope:** producing any of the translations (SOP-PR-003); regional adaptation (SOP-PR-004); reconciliation of two FTs in one language (SOP-PR-005). Each is its own PO/workflow.

## 3. Procedure

**PM**
1. Confirm intake per **SOP-LV-001 §6.1** — create/confirm the order on the `lv_harmonization` template; record instrument, the language set, amount, PO#, PM. Verify all language versions and the source are present and version-matched; request anything missing before assigning.
2. Assign a **qualified** linguist (harmonizer) competent across the relevant languages (or coordinate the required language coverage) and the subject field, per **SOP-LV-001 §6.2** (never assign an unqualified linguist).

**Linguist (production step 1)**
3. Lay all language versions against the source, item-by-item, side-by-side.
4. Check cross-language consistency: same concepts measured, aligned item structure, response options, scaling, recall periods and formatting conventions; and consistent handling of any source ambiguity across all languages.
5. **Flag inconsistencies** (where one language diverges in meaning, structure or scaling) and **source-level issues** that affect all versions; for each, record the affected language(s) and a harmonization recommendation. Produce a harmonization report/grid (item, languages, issue, recommendation). Raise unresolved source questions as queries to the PM.
6. **Self-check:** confirm every item was checked across every version; upload the harmonization report to step 1.

**Independent reviewer (QA step 2) — see SOP-LV-001 §6.4**
7. A **different** qualified person performs the **§5.3.6 verification**: confirm the full set was reviewed, inconsistencies and source-level issues are correctly identified, recommendations are item-specific and consistent across languages, and the report is complete and client-ready. Mark issues or return with documented reasons; re-verify on resubmission.
8. Record the verification outcome (reviewer identity, timestamp, pass/return) on the QA step.

**PM (release step 3)**
9. On QA approval, assemble the final deliverable and release to the client per **SOP-LV-001 §6.5** (§5.3.6 release). Invoice/close per the client terms (SOP-LV-001 §6.6).

## 4. Quality assurance

- **QA node:** **ISO 17100 §5.3.6 — Verification & release**, performed by an **independent** internal reviewer (not the harmonizer), under the ISO 9001 QMS + ISPOR LV methodology.
- This is a **validation/review step** — **NOT** an ISO 17100 translation service; do not label it as such. Conformance basis = QMS + ISPOR.
- Harmonizer competence (ISO 17100 §3.1.3–§3.1.4 + COA/LV, across the required languages) held and current in the QMS before assignment (SOP-LV-001 §5).

## 5. Outputs & delivery

- **Deliverable:** the cross-language harmonization report/grid (inconsistencies, source-level issues, recommendations), in the agreed format.
- **Delivery:** released only after the §5.3.6 verification passes; delivery recorded per SOP-LV-001 §6.5. De-identify any PII before release.

## 6. Records & retention

Per **SOP-LV-001 §8** (ISO 17100 §6.2 — retain **≥ 5 years**): order/PO record (instrument, language set, PO#, PM); harmonizer + reviewer assignment and eligibility log; all language-version inputs, source and the harmonization report; the §5.3.6 verification outcome; delivery/release record; client feedback linked to any CAPA. Files in controlled storage (vendor-deliveries bucket + project Dropbox per the folder-naming SOP).

## 7. Related documents

- **SOP-028** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-LV-001** — master LV framework (intake, assignment, QA gate, delivery, records, conformance basis).
- **LV-standalone-workflow-set-design.md** — §2 conformance basis, §3 task→clause map (row 6), §4 the 3-node structure.
- Related: **SOP-PR-005** Reconciliation, **SOP-PR-004** Adaptation, **SOP-PR-003** Forward Translation.
- **Standards:** ISO 17100:2015 (§5.3.6); ISPOR good practices for COA translation & cultural adaptation.
