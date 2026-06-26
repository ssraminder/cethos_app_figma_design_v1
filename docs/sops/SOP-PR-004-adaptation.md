# SOP-PR-004 — Adaptation (Standalone LV Step)

| | |
|---|---|
| **Document ID** | SOP-PR-004 |
| **Title** | Adaptation (regional/locale variant) — standalone linguistic-validation step |
| **Owner** | Quality / Operations |
| **Applies to** | Any PM/coordinator and assigned linguist running a standalone LV adaptation order in the admin portal (`portal.cethos.com`) |
| **Status** | Draft v0.1 — 2026-06-25 |
| **Related** | SOP-LV-001 (master LV framework) · `docs/audits/2026-06-iqvia/LV-standalone-workflow-set-design.md` · workflow template `lv_adaptation` |

---

## 1. Purpose

Define **how a single adaptation step** is performed and released when an LV client subcontracts it on its own PO. Adaptation takes an **existing approved translation in one locale** and adapts it to a **regional variant of the same language** (e.g. English (US) → English (India); Spanish (Spain) → Spanish (Mexico)), adjusting culturally/regionally dependent wording while preserving the instrument's measured concepts. An independent second qualified linguist then performs the mandatory revision before release. This step **is delivered as an ISO 17100-aligned translation service** — its QA node is a **§5.3.3 bilingual revision by a second person**. Cethos is ISO 17100-**aligned, not certified** (Stage 2 target ~Dec 2026) — never write "certified."

This SOP is the step recipe only. Intake, vendor assignment, the QA gate mechanics, delivery and records are defined once in **SOP-LV-001** — this document points to them, not repeats them.

## 2. Scope & inputs

- **Scope:** one adaptation of a client-supplied approved translation from a source locale to one target regional variant of the **same** language, delivered with an independent §5.3.3 revision. Cethos delivers a conformant **component**; the client assembles the end-to-end LV deliverable.
- **Template:** `lv_adaptation` (3-node: Adaptation → QA Review → Final Deliverable).
- **Inputs (from the client PO/intake — see SOP-LV-001 §6 step 1):**
  - the approved source-locale translation and its version/ID;
  - the original source instrument (for reference/equivalence checking);
  - source locale and target regional variant (e.g. en-US → en-IN);
  - any client glossary, regional style guide, prior locale variants, deadline, deliverable format, PO#.
- **Out of scope:** a fresh forward translation from the original source (SOP-PR-003); reconciliation (SOP-PR-005); harmonization across languages (SOP-PR-008). Each is its own PO/workflow.

## 3. Procedure

**PM**
1. Confirm intake per **SOP-LV-001 §6.1** — create/confirm the order on the `lv_adaptation` template; record instrument, source-locale → target-variant pair, amount, PO#, PM. Verify the approved source translation, the original source, the target variant, and any regional glossary are present; request anything missing before assigning.
2. Assign a **qualified** linguist native/in-region for the **target variant** and the subject field, from the QMS roster per **SOP-LV-001 §6.2** (eligibility gated — never assign an unqualified linguist).

**Linguist (production step 1)**
3. Review the approved source-locale translation against the original source to understand intended meaning before adapting.
4. Adapt the translation to the target regional variant: adjust region-specific vocabulary, idiom, spelling/orthography, examples, and culturally dependent references **only where the variant requires it** — preserve item structure, response options, recall periods, and the measured concepts. Leave wording that is already valid in the target variant unchanged. Flag any segment where adaptation cannot preserve equivalence as a query.
5. **Self-check (§5.3.2):** re-read the adapted text against the source translation and original source for completeness, equivalence, regional appropriateness and consistency; finalise.
6. Compile change notes (what was adapted and why) and upload the adapted file (+ notes) to step 1.

**Independent reviser (QA step 2) — see SOP-LV-001 §6.4**
7. A **different** qualified linguist performs the **§5.3.3 revision**: verify the adapted text against the source translation and original source for meaning preservation, correct regional usage, terminology, register and brief/glossary compliance, and that unnecessary changes were not introduced. Mark corrections or return with documented reasons; re-revise on resubmission.
8. Record the revision outcome (reviser identity, timestamp, pass/return) on the QA step.

**PM (release step 3)**
9. On QA approval, assemble the final deliverable and release to the client per **SOP-LV-001 §6.5** (§5.3.6 verification & release). Invoice/close per the client terms (SOP-LV-001 §6.6).

## 4. Quality assurance

- **QA node:** **ISO 17100 §5.3.3 — Revision** (bilingual review against the source translation and original source by a **second** qualified linguist, native/in-region for the target variant, who is **not** the adapter). Producer/reviser independence is mandatory.
- Supporting clauses: §5.3.2 adapter self-check; **§5.3.6 verification & release** by the PM at delivery.
- This step **may be described as an ISO 17100-aligned translation service** (use "aligned," never "certified").
- Adapter and reviser competence (ISO 17100 §3.1.3–§3.1.4) held and current in the QMS before assignment (SOP-LV-001 §5).

## 5. Outputs & delivery

- **Deliverable:** the revised, regionally adapted instrument in the agreed format, plus the agreed adaptation change-notes/query log.
- **Delivery:** released only after the §5.3.3 revision passes; delivery recorded per SOP-LV-001 §6.5. De-identify any PII before release.

## 6. Records & retention

Per **SOP-LV-001 §8** (ISO 17100 §6.2 — retain **≥ 5 years**): order/PO record (instrument, locale pair, PO#, PM); adapter + reviser assignment and eligibility log; source translation, original source, and adapted target files; adaptation change-notes/queries; the §5.3.3 revision outcome; delivery/release record; client feedback linked to any CAPA. Files in controlled storage (vendor-deliveries bucket + project Dropbox per the folder-naming SOP).

## 7. Related documents

- **SOP-028** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-LV-001** — master LV framework (intake, assignment, QA gate, delivery, records, conformance basis).
- **LV-standalone-workflow-set-design.md** — §2 conformance basis, §3 task→clause map (row 2), §4 the 3-node structure.
- Sibling translation-type step: **SOP-PR-003** Forward Translation (§5.3.3). Related: **SOP-PR-008** Harmonization (cross-language consistency).
- **Standards:** ISO 17100:2015 (§5.3.2/§5.3.3/§5.3.6); ISPOR good practices for COA translation & cultural adaptation.
