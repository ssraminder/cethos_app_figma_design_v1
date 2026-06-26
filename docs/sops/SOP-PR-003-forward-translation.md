# SOP-PR-003 — Forward Translation (Standalone LV Step)

| | |
|---|---|
| **Document ID** | SOP-PR-003 |
| **Title** | Forward Translation — standalone linguistic-validation step |
| **Owner** | Quality / Operations |
| **Applies to** | Any PM/coordinator and assigned linguist running a standalone LV forward-translation order in the admin portal (`portal.cethos.com`) |
| **Status** | Draft v0.1 — 2026-06-25 |
| **Related** | SOP-LV-001 (master LV framework) · `docs/audits/2026-06-iqvia/LV-standalone-workflow-set-design.md` · workflow template `translation_only` |

---

## 1. Purpose

Define **how a single forward-translation step** is performed and released when an LV client (e.g. RWS Life Sciences) subcontracts that step on its own PO. The linguist renders the source COA/PRO instrument into the target language; an independent second qualified linguist then performs the mandatory revision before release. This step **is delivered as an ISO 17100-aligned translation service** — its QA node is a **§5.3.3 bilingual revision by a second person**. Cethos is ISO 17100-**aligned, not certified** (Stage 2 target ~Dec 2026) — never write "certified."

This SOP is the step recipe only. Intake, vendor assignment, the QA gate mechanics, delivery and records are defined once in **SOP-LV-001** — this document does not repeat them; it points to them.

## 2. Scope & inputs

- **Scope:** one forward translation of a client-supplied source instrument into one target language/locale, delivered with an independent §5.3.3 revision. The client manages the full LV cycle and assembles the end-to-end deliverable; Cethos delivers a conformant **component**.
- **Template:** `translation_only` (3-node: Forward Translation → QA Review → Final Deliverable).
- **Inputs (from the client PO/intake — see SOP-LV-001 §6 step 1):**
  - source instrument (text to be translated) and its version/ID;
  - target language and locale (e.g. fr-FR, es-MX);
  - any client glossary, style guide, prior translations, or reference materials;
  - instructions, deadline, deliverable format, PO#.
- **Out of scope:** adaptation to a regional variant (SOP-PR-004), reconciliation (SOP-PR-005), back-translation (SOP-PR-006). Each is its own PO/workflow — do not bolt them on.

## 3. Procedure

**PM**
1. Confirm intake per **SOP-LV-001 §6.1** — create/confirm the order on the `translation_only` template; record instrument, source→target pair, amount, PO#, PM. Check the source, target locale, glossary/reference set and deadline are all present; if anything is missing or ambiguous, request it before assigning.
2. Assign a **qualified** linguist for the source→target pair and subject field from the QMS roster per **SOP-LV-001 §6.2** (eligibility gated on role/language/subject qualification — never assign an unqualified linguist).

**Linguist (production step 1)**
3. Read the source instrument and all reference materials; raise any source ambiguity as a query to the PM before translating.
4. Translate the full source into the target language, applying the client glossary/style guide and COA conventions (preserve item structure, response options, recall periods, and instrument meaning; do not localise measurement/format unless instructed).
5. **Self-check (§5.3.2):** re-read the target against the source for completeness, accuracy, terminology and consistency; fix and finalise.
6. Compile any translator notes/queries and upload the target file (+ notes) to step 1.

**Independent reviser (QA step 2) — see SOP-LV-001 §6.4**
7. A **different** qualified linguist performs the **§5.3.3 bilingual revision**: compare target against source for meaning, completeness, terminology, register, grammar/spelling and compliance with the brief/glossary. Mark corrections or return to the translator with documented reasons; re-revise on resubmission.
8. Record the revision outcome (reviser identity, timestamp, pass/return) on the QA step.

**PM (release step 3)**
9. On QA approval, assemble the final deliverable and release to the client per **SOP-LV-001 §6.5** (§5.3.6 verification & release). Invoice/close per the client terms (SOP-LV-001 §6.6).

## 4. Quality assurance

- **QA node:** **ISO 17100 §5.3.3 — Revision** (bilingual review of target against source by a **second** qualified linguist who is **not** the translator). Independence of producer and reviser is mandatory.
- Supporting clauses: §5.3.1 Translation and §5.3.2 self-check by the translator; **§5.3.6 verification & release** by the PM at delivery.
- This step **may be described as an ISO 17100-aligned translation service** (use "aligned," never "certified").
- Translator and reviser competence (ISO 17100 §3.1.3–§3.1.4) is held and current in the QMS before assignment (SOP-LV-001 §5).

## 5. Outputs & delivery

- **Deliverable:** the revised target-language translation of the instrument, in the agreed format, plus any agreed translator notes/query log.
- **Delivery:** released to the client only after the §5.3.3 revision passes; delivery recorded per SOP-LV-001 §6.5 (the §5.3.6 release record). De-identify any PII before anything leaves Cethos.

## 6. Records & retention

Per **SOP-LV-001 §8** (ISO 17100 §6.2 — retain **≥ 5 years**): order/PO record (instrument, pair, PO#, PM); linguist + reviser assignment and eligibility log; source and target files; translator notes/queries; the §5.3.3 revision outcome (reviser identity, timestamp, result); delivery/release record; any client feedback linked to its CAPA record. Source and target files held in controlled storage (vendor-deliveries bucket + project Dropbox per the folder-naming SOP).

## 7. Related documents

- **SOP-028** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-LV-001** — master LV framework: intake, qualified-vendor assignment, the QA gate, delivery/release, records & retention, and the §5.3.3-vs-§5.3.6 conformance basis (the shared procedures this SOP relies on).
- **LV-standalone-workflow-set-design.md** — §2 ISO conformance basis, §3 task→clause map (row 1), §4 the 3-node structure.
- Sibling translation-type step: **SOP-PR-004** Adaptation (§5.3.3). Downstream LV steps: **SOP-PR-005** Reconciliation, **SOP-PR-006** Back-translation.
- **Standards:** ISO 17100:2015 (§5.3.1/§5.3.2/§5.3.3/§5.3.6); ISPOR good practices for COA translation & cultural adaptation.
