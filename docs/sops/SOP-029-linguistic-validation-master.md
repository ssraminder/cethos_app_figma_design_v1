# SOP-029 — Linguistic Validation — Standalone LV Services (Master Framework)

| | |
|---|---|
| **Document ID** | SOP-029 |
| **Title** | Linguistic Validation — standalone LV services (master framework) |
| **Owner** | Quality / Operations |
| **Applies to** | All Cethos COA linguistic-validation *step* services (RWS Life Sciences and other LV clients) |
| **Category** | Production |
| **Status** | Active · v1.0 (effective 2026-06-26) |
| **Governing policy** | SOP-001 (Document Control & Records Management); SOP-003 (Vendor Qualification & Management); SOP-011 (CAPA) |
| **Standard / ISO reference** | ISO 17100:2015 §5.3 (translation production), §6.2 (records); ISO 9001:2015 QMS; ISPOR COA good practices; FDA/EMA PRO guidance |
| **Related** | Per-step SOPs SOP-030…SOP-038, SOP-008 (Cognitive Debriefing), SOP-009 (Clinician Review) · `docs/audits/2026-06-iqvia/LV-standalone-workflow-set-design.md` · portal workflow templates |

---
## 1. Purpose
Define, once, the framework Cethos uses to deliver **individual linguistic-validation (LV) steps** subcontracted by LV clients (e.g. RWS Life Sciences) as **standalone single-step services**, each with an **independent internal quality review** before release — consistently, replicably, and in conformance with ISO 17100 (for translation steps) and the ISO 9001 QMS + ISPOR/regulatory LV methodology (for validation steps). Each individual step has its own per-step SOP (the SOP-030…SOP-038 set, plus SOP-008 / SOP-009) that gives the detailed recipe; this master holds everything those SOPs share.

## 2. Scope & definitions
- **Linguistic validation (LV):** the methodology for producing and validating COA/PRO instruments across languages (ISPOR good-practice; FDA/EMA PRO guidance).
- **Standalone step:** one LV task — forward translation, adaptation, reconciliation, back-translation, BT review, harmonization, proofreading, cognitive debriefing, interview, clinician review, or finalization/certification — purchased and delivered on its own.
- **Client / subcontracting model:** the LV client (RWS) manages the **full** LV cycle and subcontracts **individual steps** to Cethos via **separate POs**. Cethos delivers conformant *components*; **end-to-end ISO 17100 conformance of the assembled deliverable rests with the client/prime TSP.**

## 3. The step set & the single-step + QA model
Each step is delivered as its **own independent workflow** (the client buys/sends each as a separate PO; steps are **not chained** even though they sequence in the full cycle — e.g. harmonization → reconciliation, back-translation → BT reconciliation):

```
[ the client's LV step ]  →  [ internal QA ]  →  [ release ]
  external linguist /          independent 2nd      delivery record
  consultant (vendor)          person, internal     (internal_work)
```

The **QA node is Cethos's own quality gate** — not a separate client deliverable, not billed. The eleven steps and which template each uses are listed in the design doc §3 and the per-step SOPs.

## 4. ISO conformance basis (what each step may claim)
- **Translation-type steps** (forward translation, adaptation, back-translation): the QA node is a **§5.3.3 bilingual revision by a second qualified linguist** → delivered as **ISO 17100-aligned translation services**.
- **Validation / review steps** (reconciliation, BT review, harmonization, proofreading, cognitive debriefing, interview, clinician review, finalization): ISO 17100 does **not** classify these as translation services; the QA node is **§5.3.6 verification & release** by an independent person, performed under the **ISO 9001 QMS + ISPOR LV methodology**. **These must NOT be described as "ISO 17100 translation services."**
- **Cethos is ISO 17100-ALIGNED, not certified** (Stage 2 target ~Dec 2026). Use "conforms to / aligned with" — never "certified."
- Each per-step SOP states the exact clause that step's QA satisfies.

## 5. Roles & competence
- **Linguist / consultant (vendor, step 1):** qualified per ISO 17100 competence requirements (degree + experience) and the role/language/subject qualification held in the QMS roster; for clinician review, a qualified clinician.
- **QA reviewer (internal, step 2):** an independent, qualified second person (NOT the producer), assigned per the QMS approval-authority policy. Performs the §5.3.3 revision or §5.3.6 verification per step type.
- **Project manager:** assigns the qualified vendor, manages client communication, authorises release.

## 6. Common operational procedure (shared by every step)
1. **Intake** — PO received (RWS → lv@cethos.com); create the order on the matching workflow template; record project, instrument, language pair, amount, PO#, PM (pre-production / §4.4 record).
2. **Assign** — assign a **qualified** vendor for the step from the QMS roster (eligibility is gated on role/language/subject qualification; never assign an unqualified linguist).
3. **Produce** — vendor performs the step and uploads the deliverable (step 1).
4. **QA** — the independent reviewer performs the §5.3.3 revision (translation) or §5.3.6 verification (validation), records the outcome (step 2).
5. **Release** — on QA approval, deliver to the client and record the release (step 3).
6. **Invoice / close** — per the client billing terms (RWS = automated PO-based, net_30, USD).

## 7. Quality controls
- The mandatory independent **QA node** on every workflow (§4).
- Vendor **competence evidence** held and current in the QMS before assignment.
- The **order-workflow audit trail** (each step, actor, timestamp, deliverable) is the per-project record.
- Issues/complaints → **CAPA** via the quality system (`qms.quality_complaints` / nonconformities).

## 8. Records & retention
Order record, workflow + QA records, vendor competence reference, and deliverables are retained **≥ 5 years** (ISO 17100 §6.2). Source and target files held in the controlled storage (vendor-deliveries bucket + project Dropbox per the folder-naming SOP).

## 9. Client communication & feedback
POs in, deliverables out; client queries and feedback are logged against the order (per the QMS feedback mechanism). Cethos does not add a client-facing draft-review step (LV QA is internal per §5.3).

## 10. Don'ts (audit-critical)
- ✗ Do **not** label validation/review steps as "ISO 17100 translation services."
- ✗ Do **not** claim ISO 17100 **certification** — Cethos is *aligned*, working toward Stage 2.
- ✗ Do **not** chain the independent steps — each PO is its own workflow.
- ✗ Do **not** rely on the client's downstream reconciliation/review to satisfy Cethos's §5.3.3 on a translation step — Cethos reviews its **own** deliverable.
- ✗ Do **not** assign an unqualified linguist; QA must be a **different** person than the producer.

## 11. Related documents
Per-step SOPs (the detailed recipes): SOP-008 Cognitive Debriefing · SOP-009 Clinician Review · SOP-030 Forward Translation · SOP-031 Adaptation · SOP-032 Reconciliation · SOP-033 Back-translation · SOP-034 BT Review · SOP-035 Harmonization · SOP-036 Proofreading · SOP-037 Interview · SOP-038 Finalization/Certification. Design: `LV-standalone-workflow-set-design.md`.

- **SOP-028** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
