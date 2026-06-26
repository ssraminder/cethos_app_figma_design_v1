# SOP-032 — Reconciliation (Standalone LV Step)

| | |
|---|---|
| **Document ID** | SOP-032 |
| **Title** | Reconciliation (merge two forward translations) — standalone linguistic-validation step |
| **Owner** | Project Management / Operations |
| **Applies to** | Any PM/coordinator and assigned linguist running a standalone LV reconciliation order in the admin portal (`portal.cethos.com`) |
| **Category** | Production |
| **Status** | Active · v1.0 (effective 2026-06-26) |
| **Governing policy** | SOP-029 (LV master framework); SOP-003 (Vendor Qualification & Management); SOP-001 (Document Control & Records Management); SOP-011 (CAPA) |
| **Standard / ISO reference** | ISO 17100:2015 §5.3.6 (verification & release); ISO 9001:2015 QMS; ISPOR COA good practices |
| **Related** | SOP-029 (master LV framework) · workflow template `lv_reconciliation` |

---
## 1. Purpose

Define **how a single reconciliation step** is performed and released when an LV client subcontracts it on its own PO. Reconciliation takes **two independent forward translations** of the same source instrument and merges them into **one harmonized reconciled version**, choosing or synthesising the best rendering item-by-item with documented rationale. An independent internal reviewer then verifies the result before release.

Reconciliation is a **validation/review step, not a translation service**: its QA node is a **§5.3.6 verification & release** by an independent person, performed under the **ISO 9001 QMS + ISPOR/regulatory LV methodology**. **Do NOT describe this step as an "ISO 17100 translation service."** Cethos is ISO 17100-**aligned, not certified** (Stage 2 target ~Dec 2026) — never write "certified."

This SOP is the step recipe only. Intake, vendor assignment, the QA gate mechanics, delivery and records are defined once in **SOP-029** — this document points to them.

## 2. Scope & inputs

- **Scope:** one reconciliation merging two forward translations (this same template also covers back-translation reconciliation) into a single harmonized version with item-level rationale, verified internally before release. Cethos delivers a conformant **component**.
- **Template:** `lv_reconciliation` (3-node: Reconciliation → QA Review → Final Deliverable).
- **Inputs (from the client PO/intake — see SOP-029 §6 step 1):**
  - the two forward translations (FT1, FT2) and their version/IDs;
  - the original source instrument;
  - any client glossary/style guide, reconciliation template/format, deadline, deliverable format, PO#.
- **Out of scope:** producing the forward translations themselves (SOP-030); back-translation (SOP-033); harmonization across languages (SOP-035). Each is its own PO/workflow.

## 3. Procedure

**PM**
1. Confirm intake per **SOP-029 §6.1** — create/confirm the order on the `lv_reconciliation` template; record instrument, language pair, amount, PO#, PM. Verify both translations and the source are present; request anything missing before assigning.
2. Assign a **qualified** linguist (reconciler) for the source→target pair and subject field per **SOP-029 §6.2** (never assign an unqualified linguist).

**Linguist (production step 1)**
3. Lay the two translations against the source item-by-item.
4. For each item, select FT1, FT2, or a synthesised wording that best conveys the source concept in the target language, applying the client glossary and COA conventions; **document the decision and rationale** for every item (including where the two diverged).
5. Produce the single reconciled instrument and a reconciliation log/grid (item, FT1, FT2, chosen wording, rationale). Raise any unresolved source ambiguity as a query to the PM.
6. **Self-check:** re-read the reconciled version against the source for completeness, consistency and equivalence; upload the reconciled file + reconciliation log to step 1.

**Independent reviewer (QA step 2) — see SOP-029 §6.4**
7. A **different** qualified person performs the **§5.3.6 verification**: confirm the reconciled version is complete, internally consistent, equivalent to the source, that each item decision is documented and defensible, and that glossary/brief were followed. Mark issues or return with documented reasons; re-verify on resubmission.
8. Record the verification outcome (reviewer identity, timestamp, pass/return) on the QA step.

**PM (release step 3)**
9. On QA approval, assemble the final deliverable and release to the client per **SOP-029 §6.5** (§5.3.6 release). Invoice/close per the client terms (SOP-029 §6.6).

## 4. Quality assurance

- **QA node:** **ISO 17100 §5.3.6 — Verification & release**, performed by an **independent** internal reviewer (not the reconciler), under the ISO 9001 QMS + ISPOR LV methodology.
- This is a **validation/review step** — **NOT** an ISO 17100 translation service; do not label it as such. Conformance basis = QMS + ISPOR.
- Reconciler competence (ISO 17100 §3.1.3–§3.1.4 + COA/LV) held and current in the QMS before assignment (SOP-029 §5).

## 5. Outputs & delivery

- **Deliverable:** the single reconciled instrument plus the reconciliation log/grid (item-level decisions + rationale), in the agreed format.
- **Delivery:** released only after the §5.3.6 verification passes; delivery recorded per SOP-029 §6.5. De-identify any PII before release.

## 6. Records & retention

Per **SOP-029 §8** (ISO 17100 §6.2 — retain **≥ 5 years**): order/PO record (instrument, pair, PO#, PM); reconciler + reviewer assignment and eligibility log; the two input translations, source, reconciled output and reconciliation log; the §5.3.6 verification outcome; delivery/release record; client feedback linked to any CAPA. Files in controlled storage (vendor-deliveries bucket + project Dropbox per the folder-naming SOP).

## 7. Related documents

- **SOP-028** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-029** — master LV framework (intake, assignment, QA gate, delivery, records, conformance basis).
- **LV-standalone-workflow-set-design.md** — §2 conformance basis, §3 task→clause map (row 3), §4 the 3-node structure.
- Upstream: **SOP-030** Forward Translation. Related downstream: **SOP-033** Back-translation, **SOP-034** BT Review, **SOP-035** Harmonization.
- **Standards:** ISO 17100:2015 (§5.3.6); ISPOR good practices for COA translation & cultural adaptation.
