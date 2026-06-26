# SOP-034 — Back-translation Review (Standalone LV Step)

| | |
|---|---|
| **Document ID** | SOP-034 |
| **Title** | Back-translation Review (compare BT to source, resolve discrepancies) — standalone linguistic-validation step |
| **Owner** | Project Management / Operations |
| **Applies to** | Any PM/coordinator and assigned linguist running a standalone LV back-translation-review order in the admin portal (`portal.cethos.com`) |
| **Category** | Production |
| **Status** | Active · v1.0 (effective 2026-06-26) |
| **Governing policy** | SOP-029 (LV master framework); SOP-003 (Vendor Qualification & Management); SOP-001 (Document Control & Records Management); SOP-011 (CAPA) |
| **Standard / ISO reference** | ISO 17100:2015 §5.3.6 (verification & release); ISO 9001:2015 QMS; ISPOR COA good practices |
| **Related** | SOP-029 (master LV framework) · workflow template `lv_bt_review` |

---
## 1. Purpose

Define **how a single back-translation review (BT review) step** is performed and released when an LV client subcontracts it on its own PO. BT review compares the **English back-translation against the original English source** item-by-item, **flags discrepancies** (meaning shifts, omissions, additions), classifies their severity, and proposes resolutions to the forward translation. An independent internal reviewer then verifies the result before release.

BT review is a **validation/review step, not a translation service**: its QA node is a **§5.3.6 verification & release** by an independent person, under the **ISO 9001 QMS + ISPOR/regulatory LV methodology**. **Do NOT describe this step as an "ISO 17100 translation service."** Cethos is ISO 17100-**aligned, not certified** (Stage 2 target ~Dec 2026) — never write "certified."

This SOP is the step recipe only. Intake, vendor assignment, the QA gate mechanics, delivery and records are defined once in **SOP-029** — this document points to them.

## 2. Scope & inputs

- **Scope:** one BT review — source-vs-back-translation discrepancy analysis with severity classification and proposed resolutions, verified internally before release. Cethos delivers a conformant **component**.
- **Template:** `lv_bt_review` (3-node: BT Review → QA Review → Final Deliverable).
- **Inputs (from the client PO/intake — see SOP-029 §6 step 1):**
  - the original English source instrument;
  - the English back-translation(s) to be compared;
  - the target-language forward translation (for context when proposing resolutions);
  - any client discrepancy-report template, deadline, deliverable format, PO#.
- **Out of scope:** producing the back-translation (SOP-033); reconciliation (SOP-032); harmonization (SOP-035). Each is its own PO/workflow.

## 3. Procedure

**PM**
1. Confirm intake per **SOP-029 §6.1** — create/confirm the order on the `lv_bt_review` template; record instrument, language pair, amount, PO#, PM. Verify the source, the back-translation and (where relevant) the forward translation are present; request anything missing before assigning.
2. Assign a **qualified** linguist (BT reviewer) for the source↔target pair and subject field per **SOP-029 §6.2** (never assign an unqualified linguist).

**Linguist (production step 1)**
3. Align the back-translation against the source item-by-item.
4. For each item, identify discrepancies (meaning change, omission, addition, ambiguity); **classify severity** (e.g. critical / major / minor) and record whether it indicates a real forward-translation problem versus an acceptable back-translation artefact.
5. For genuine discrepancies, propose a resolution to the forward translation (with rationale), consulting the target text. Produce a discrepancy report/grid (item, source, BT, issue, severity, proposed resolution). Raise unresolved questions as queries to the PM.
6. **Self-check:** confirm every source item was checked and each flagged discrepancy is documented; upload the discrepancy report to step 1.

**Independent reviewer (QA step 2) — see SOP-029 §6.4**
7. A **different** qualified person performs the **§5.3.6 verification**: confirm the full instrument was compared, discrepancies are correctly identified and severity-rated, proposed resolutions are sound and item-specific, and the report is complete and client-ready. Mark issues or return with documented reasons; re-verify on resubmission.
8. Record the verification outcome (reviewer identity, timestamp, pass/return) on the QA step.

**PM (release step 3)**
9. On QA approval, assemble the final deliverable and release to the client per **SOP-029 §6.5** (§5.3.6 release). Invoice/close per the client terms (SOP-029 §6.6).

## 4. Quality assurance

- **QA node:** **ISO 17100 §5.3.6 — Verification & release**, performed by an **independent** internal reviewer (not the BT reviewer), under the ISO 9001 QMS + ISPOR LV methodology.
- This is a **validation/review step** — **NOT** an ISO 17100 translation service; do not label it as such. Conformance basis = QMS + ISPOR.
- BT-reviewer competence (ISO 17100 §3.1.3–§3.1.4 + COA/LV) held and current in the QMS before assignment (SOP-029 §5).

## 5. Outputs & delivery

- **Deliverable:** the back-translation discrepancy report/grid (item-level issues, severity, proposed resolutions), in the agreed format.
- **Delivery:** released only after the §5.3.6 verification passes; delivery recorded per SOP-029 §6.5. De-identify any PII before release.

## 6. Records & retention

Per **SOP-029 §8** (ISO 17100 §6.2 — retain **≥ 5 years**): order/PO record (instrument, pair, PO#, PM); BT-reviewer + reviewer assignment and eligibility log; source, back-translation, forward-translation inputs and the discrepancy report; the §5.3.6 verification outcome; delivery/release record; client feedback linked to any CAPA. Files in controlled storage (vendor-deliveries bucket + project Dropbox per the folder-naming SOP).

## 7. Related documents

- **SOP-028** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-029** — master LV framework (intake, assignment, QA gate, delivery, records, conformance basis).
- **LV-standalone-workflow-set-design.md** — §2 conformance basis, §3 task→clause map (row 5), §4 the 3-node structure.
- Upstream: **SOP-033** Back-translation (produces the artefact reviewed here). Related: **SOP-032** Reconciliation, **SOP-030** Forward Translation.
- **Standards:** ISO 17100:2015 (§5.3.6); ISPOR good practices for COA translation & cultural adaptation.
