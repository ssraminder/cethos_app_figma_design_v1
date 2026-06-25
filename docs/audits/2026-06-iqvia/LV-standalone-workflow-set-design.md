# LV Standalone Workflow Set — Design

**Created:** 2026-06-24 · **For:** Cethos COA linguistic-validation services (RWS + future LV clients) · **Audit context:** IQVIA 2026-06
**Status:** design for review → build. Resolves pending task #8 ("full LV standalone workflow set").

---

## 1. Principle (locked with user, 2026-06-24)

LV clients (RWS, etc.) subcontract **individual LV steps** — one PO = one step (Translate *or* Proofread *or* Harmonize *or* Interview…). So Cethos offers **each LV step as its own single-step workflow**, with one internal QA node:

```
[ client's LV step ]      →   [ internal QA ]              →   [ release ]
  external linguist /            independent 2nd person,         internal_work
  consultant (vendor)            internal, NOT billed            (delivery record)
```

The client buys/sees only the **step**. The **QA node is Cethos's own quality gate** — not a separate deliverable, not billed — and it is what carries ISO conformance. (Modeled on the Welocalize cognitive-debriefing/clinician templates: vendor step → QA → Final deliverable.)

---

## 2. ISO conformance — what each standalone workflow can and cannot claim

ISO 17100:2015 governs **translation services** only: translation (§5.3.1) + self-check (§5.3.2) + **revision by a second person (§5.3.3)** + verification & release (§5.3.6).

- **Translation-type steps** (Forward Translation, Adaptation, Back-translation) — the QA node is a **§5.3.3 bilingual revision by a second qualified linguist**. → These standalone workflows **ARE ISO 17100-aligned translation services.** ✅
- **Validation / review steps** (Reconciliation, BT Review, Harmonization, Proofreading, Cognitive Debriefing, Interview, Clinician Review, Finalization) — ISO 17100 does **not** classify these as "translation services" (§5.3.4/§5.3.5 treat review/proofread as *optional steps inside* a project; debriefing/clinician review are outside §5.3). The QA node is a **§5.3.6 verification & release** by an independent person. These are governed by the **ISO 9001 QMS + ISPOR/regulatory LV methodology** with documented competence. **Do NOT label them "ISO 17100 translation services."**
- **End-to-end LV conformance is owned by the prime (RWS)**, who assembles the full cycle; Cethos delivers **conformant components**.
- **Cethos is ISO 17100-ALIGNED, not certified** (Stage 2 target ~Dec 2026). Always say "conforms to / aligned with," never "certified."

> **Audit-binder statement:** *"Cethos delivers the client-specified LV step plus an independent internal quality review prior to release. For translation and adaptation steps this review is a §5.3.3 bilingual revision by a second qualified linguist (ISO 17100-aligned). For validation and review steps it is final verification per §5.3.6, performed under the ISO 9001 QMS and the ISPOR/regulatory linguistic-validation methodology. End-to-end ISO 17100 conformance of the assembled LV deliverable rests with the prime TSP."*

---

## 3. The workflow set (11 standalone LV workflows)

Each = `production step → QA → release`. ✔ = confirmed from RWS POs; ◻ = standard LV methodology (confirm RWS uses it).

| # | Workflow (template) | RWS code | Production step (vendor role) | QA node | Claim basis | Template |
|---|---|---|---|---|---|---|
| 1 | **LV Forward Translation** ✔ | TRLV | Translator | **§5.3.3 revision** (2nd linguist) | ISO 17100-aligned translation | reuse `translation_only` |
| 2 | **LV Adaptation** ✔ | EDAD | Adapter | **§5.3.3 revision** | ISO 17100-aligned translation | 🆕 `lv_adaptation` |
| 3 | **LV Reconciliation** ◻ | (REC?) | Reconciler | §5.3.6 verify | QMS + ISPOR | 🆕 `lv_reconciliation` |
| 4 | **LV Back-translation** ◻ | (BT?) | Back-translator | §5.3.6 verify | QMS + ISPOR (COA verify) | reuse/adapt `medical_back_translation` |
| 5 | **LV BT Review** ◻ | (BTRV?) | BT reviewer | §5.3.6 verify | QMS + ISPOR | 🆕 `lv_bt_review` |
| 6 | **LV Harmonization** ✔ | HARM | Harmonizer | §5.3.6 verify | QMS + ISPOR | reuse/adapt `harmonization_review` |
| 7 | **LV Proofreading** ✔ | pPRF | Proofreader | §5.3.6 verify | ISO 17100 §5.3.5 component | 🆕 `lv_proofreading` |
| 8 | **Cognitive Debriefing** ✔ | (CD) | CD consultant | §5.3.6 verify | QMS + ISPOR | reuse `cognitive_debriefing` |
| 9 | **LV Interview** ✔ | IIP | Interviewer | §5.3.6 verify | QMS + ISPOR | 🆕 `lv_interview` |
| 10 | **Clinician Review** ◻ | (CR) | Clinician | §5.3.6 verify | QMS + ISPOR | reuse `clinician_review` |
| 11 | **LV Finalization / Certification** ◻ | (FIN?) | (internal) | §5.3.6 verify | QMS | 🆕 `lv_finalization` |

**Reuse (5):** translation_only, medical_back_translation, harmonization_review, cognitive_debriefing, clinician_review.
**New single-step templates (6):** lv_adaptation, lv_reconciliation, lv_bt_review, lv_proofreading, lv_interview, lv_finalization.
⚠️ Check the existing `medical_back_translation` and `harmonization_review` shapes — if they are multi-step *cycles* rather than single-step, create single-step `lv_back_translation` / `lv_harmonization` variants instead of reusing.

---

## 4. Per-template step structure (the build target)

Every standalone LV workflow has the same 3-node shape (mirrors the Welocalize COA templates):

| step_number | name | actor_type | requires_file_upload | notes |
|---|---|---|---|---|
| 1 | *(the LV step, e.g. "Adaptation")* | `external_vendor` | true | the linguist/consultant; `service_id` = the step's service; vendor delivers the file |
| 2 | **QA Review** | `internal_review` | false | independent reviewer (default **Bobby Rawat** `5ec2997c…`); **§5.3.3 revision** (translation steps) or **§5.3.6 verification** (validation steps) |
| 3 | **Final Deliverable** | `internal_work` | true | release to client; the delivery/§5.3.6 release record |

`approval_depends_on_step` gates the Final on the QA. No client draft-review node (LV is internal-QA per §5.3, not a client-facing review).

---

## 5. Services needed

Existing Cethos services to map to: **Cognitive Debriefing**, **Clinician Review**, **Standard Translation** (→ Forward Translation), **Proofreading**, **Harmonization**, **Editing**, **Translation Review**. 
**New services likely required:** Adaptation, Reconciliation, Back-translation, BT Review, Interview, Finalization/Certification (confirm against the `services` table; create where missing, mirroring the COA service rows).

---

## 6. Build spec (for the build session)

1. Create the 6 new `workflow_templates` rows (codes above) + their 3 `workflow_template_steps` each (per §4), copying column conventions from `cognitive_debriefing`/`clinician_review` template rows.
2. Create any missing `services` rows (per §5).
3. Set step 2 (`internal_review`) `assigned_staff` default to Bobby Rawat; mark the QA's ISO basis in the step `instructions` (§5.3.3 vs §5.3.6) for the audit trail.
4. Apply via `apply_migration`; commit the SQL to `supabase/migrations/`.
5. Then onboarding: each RWS PO → an order on the matching workflow (per the task→template map), RWS USD account, un-delivered shell.

---

## 7. Confirmations — RESOLVED (user, 2026-06-24)
- ✅ **All steps are billed separately and stay in the set** — Reconciliation, Back-translation, BT Review, Clinician Review, Finalization/Certification included. The ◻ rows in §3 are now **confirmed**; the full 11-workflow set is locked.
- ✅ **Model each as a separate, independent standalone workflow.** In practice the LV steps *sequence* (e.g. after Harmonization a Reconciliation may follow; after Back-translation a BT reconciliation), **but the client sends them as separate POs, so Cethos does NOT chain them** — each PO = one independent single-step workflow. The user confirmed: *"safe to consider these separate independent steps."* One generic **LV Reconciliation** template covers both forward-translation reconciliation and back-translation reconciliation.
- ◻ QA reviewer: **Bobby Rawat** default stands (not yet overridden for RWS).

> **Design is LOCKED.** Next = build: create the 6 new `workflow_templates` (+ their steps + any missing services), then onboard each May-1+ RWS PO onto the matching workflow (RWS USD account, un-delivered shell). The PO scope spine is in `tmp/rws-po-scope.md`.

---

## 8. Documentation plan (SOPs) — so a human can replicate every step (user req, 2026-06-24)

**Layered** (QMS best practice; extends the existing SOP-PR-001/002):

- **Master — `SOP-LV-001` "Linguistic Validation (standalone LV services)":** the shared framework — methodology overview, the single-step+QA principle, the ISO §5.3.3-vs-§5.3.6 conformance basis + what each step can/can't claim (per §2), competence requirements, and the **common procedures every step reuses** (vendor assignment, file handling, the QA gate, delivery/release, records & retention ≥5 yr). Includes the full-cycle map (how steps sequence — §7) and an index linking the per-step SOPs. *The auditor's system view.*
- **Per-step SOPs (11)** — one focused, **replicable** "how to perform this step" each, continuing the `SOP-PR-` series. Each: **purpose · inputs · step-by-step procedure · QA (cite §5.3.3 or §5.3.6) · outputs · records.** They reference `SOP-LV-001` for the shared parts (no repetition). *The human's recipe.*
  - **Existing:** SOP-PR-001 Cognitive Debriefing · SOP-PR-002 Clinician Review.
  - **New (9):** SOP-PR-003 Forward Translation · -004 Adaptation · -005 Reconciliation · -006 Back-translation · -007 BT Review · -008 Harmonization · -009 Proofreading · -010 Interview · -011 Finalization/Certification.
- Register every SOP in the established system: markdown in `docs/sops/` + controlled `.docx` in `docs/sops/sharepoint-export/` + the SOP index + the portal `/admin/sops`. Each per-step SOP's "QA" section cites the exact ISO clause for that step (the §5.3.3/§5.3.6 column in §3).

Numbers are a suggestion — fit them to the live SOP register/scheme.
