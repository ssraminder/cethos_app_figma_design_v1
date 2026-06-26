# SOP-PR-006 — Back-translation (Standalone LV Step)

| | |
|---|---|
| **Document ID** | SOP-PR-006 |
| **Title** | Back-translation (independent target → English for client comparison) — standalone linguistic-validation step |
| **Owner** | Quality / Operations |
| **Applies to** | Any PM/coordinator and assigned linguist running a standalone LV back-translation order in the admin portal (`portal.cethos.com`) |
| **Status** | Draft v0.1 — 2026-06-25 |
| **Related** | SOP-LV-001 (master LV framework) · `docs/audits/2026-06-iqvia/LV-standalone-workflow-set-design.md` · workflow template `lv_back_translation` |

---

## 1. Purpose

Define **how a single back-translation step** is performed and released when an LV client subcontracts it on its own PO. Back-translation is an **independent translation of the target-language instrument back into English (the source language)**, produced **without reference to the original source**, so the client can compare it against the original and detect meaning shifts in the forward translation. An independent second qualified linguist then performs the mandatory revision before release.

Because this step produces a translation (target → English), its QA node is a **§5.3.3 bilingual revision by a second person** (per the task instruction for this step). The back-translation is a *diagnostic* artefact for the client's downstream BT review (SOP-PR-007) — Cethos does not judge the forward translation here. Cethos is ISO 17100-**aligned, not certified** (Stage 2 target ~Dec 2026) — never write "certified."

This SOP is the step recipe only. Intake, vendor assignment, the QA gate mechanics, delivery and records are defined once in **SOP-LV-001** — this document points to them.

## 2. Scope & inputs

- **Scope:** one independent back-translation of a client-supplied target-language instrument into English, delivered with an independent §5.3.3 revision. Cethos delivers a conformant **component**; the client performs the source-vs-BT comparison.
- **Template:** `lv_back_translation` (3-node: Back-translation → QA Review → Final Deliverable).
- **Inputs (from the client PO/intake — see SOP-LV-001 §6 step 1):**
  - the **target-language** instrument to be back-translated, and its version/ID;
  - the target language/locale and English variant required;
  - deadline, deliverable format, PO#.
  - **The original English source is NOT given to the back-translator** (blind back-translation preserves the diagnostic value). The PM holds it only for the QA reviser's completeness check, not for the producer.
- **Out of scope:** forward translation (SOP-PR-003); the source-vs-BT discrepancy review (SOP-PR-007, usually the client's or a separate PO); reconciliation (SOP-PR-005). Each is its own PO/workflow.

## 3. Procedure

**PM**
1. Confirm intake per **SOP-LV-001 §6.1** — create/confirm the order on the `lv_back_translation` template; record instrument, target→English pair, amount, PO#, PM. Verify the target-language instrument and the English variant are specified; request anything missing before assigning. **Do not pass the original source to the producer.**
2. Assign a **qualified** linguist, native in English and fluent in the target language, for the subject field per **SOP-LV-001 §6.2** — and **not** the person who produced the forward translation (independence). Never assign an unqualified linguist.

**Linguist (production step 1)**
3. Translate the target-language instrument back into English **literally enough to expose meaning**, without consulting the original source — preserve item structure, response options and recall periods. The goal is a faithful mirror of what the target text actually says, not a polished re-translation.
4. Flag any target-language wording that is ambiguous or hard to render as a translator note.
5. **Self-check (§5.3.2):** re-read the back-translation against the target for completeness and faithfulness; finalise.
6. Upload the English back-translation (+ notes) to step 1.

**Independent reviser (QA step 2) — see SOP-LV-001 §6.4**
7. A **different** qualified linguist performs the **§5.3.3 revision**: compare the English back-translation against the **target-language** text for completeness, faithfulness, terminology and grammar (the reviser may use the original source only to confirm completeness/coverage, not to "correct" meaning toward it). Mark corrections or return with documented reasons; re-revise on resubmission.
8. Record the revision outcome (reviser identity, timestamp, pass/return) on the QA step.

**PM (release step 3)**
9. On QA approval, assemble the final deliverable and release to the client per **SOP-LV-001 §6.5** (§5.3.6 verification & release). Invoice/close per the client terms (SOP-LV-001 §6.6).

## 4. Quality assurance

- **QA node:** **ISO 17100 §5.3.3 — Revision** (bilingual review of the English back-translation against the target text by a **second** qualified linguist who is **not** the back-translator). Producer/reviser independence is mandatory, and the back-translator must be independent of the forward translator.
- Supporting clauses: §5.3.2 back-translator self-check; **§5.3.6 verification & release** by the PM at delivery.
- Back-translator and reviser competence (ISO 17100 §3.1.3–§3.1.4) held and current in the QMS before assignment (SOP-LV-001 §5).

## 5. Outputs & delivery

- **Deliverable:** the English back-translation of the instrument (the client's comparison artefact), in the agreed format, plus the agreed translator notes.
- **Delivery:** released only after the §5.3.3 revision passes; delivery recorded per SOP-LV-001 §6.5. De-identify any PII before release.

## 6. Records & retention

Per **SOP-LV-001 §8** (ISO 17100 §6.2 — retain **≥ 5 years**): order/PO record (instrument, pair, PO#, PM); back-translator + reviser assignment and eligibility log (and the independence-from-forward-translator basis); target-language input and English back-translation files; translator notes; the §5.3.3 revision outcome; delivery/release record; client feedback linked to any CAPA. Files in controlled storage (vendor-deliveries bucket + project Dropbox per the folder-naming SOP).

## 7. Related documents

- **SOP-026** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-LV-001** — master LV framework (intake, assignment, QA gate, delivery, records, conformance basis).
- **LV-standalone-workflow-set-design.md** — §2 conformance basis, §3 task→clause map (row 4), §4 the 3-node structure.
- Downstream: **SOP-PR-007** BT Review (compares this back-translation to the source). Related: **SOP-PR-005** Reconciliation, **SOP-PR-003** Forward Translation.
- **Standards:** ISO 17100:2015 (§5.3.2/§5.3.3/§5.3.6); ISPOR good practices for COA translation & cultural adaptation.
