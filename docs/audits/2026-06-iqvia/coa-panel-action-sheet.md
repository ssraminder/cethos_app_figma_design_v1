# COA Panel — Per-Vendor Action Sheet (IQVIA audit, 29–30 Jun 2026)

**Generated:** 2026-06-21 (live QMS data) · **Owner:** Raminder Shah (MD / COA approver, VM-001)
**Scope:** Translation Services — Linguistic Validation of Clinical Outcome Assessments (COA)
**Goal:** A defensible COA linguist panel, each with: qualified role qualification (Tier-2 verified evidence) + active NDA + Life Sciences/Medical & Clinical Trials (COA) subject-matter qual + **COA Linguistic Validation training completion (VM-001 §5.7)**.

## Current state (what an auditor sees today)
- 6 vendors have a COA-relevant subject-matter qualification recorded.
- **2 are `qualified`** (Abhinav Dang, Gurpreet Singh) — Tier-2 first-party evidence + NDA.
- **4 are `under_review` / "Provisional — not ISO/COA qualified"** (Gonzalo, edna, Claudia, Raja) — only AI-screened CV evidence.
- **COA Linguistic Validation training completions: 0 across the entire roster** (including the 2 qualified). Hard §5.7 finding.

The two qualification gaps:
1. **Evidence** — the 4 provisional members need one Tier-2 verified document (degree cert or reference) uploaded + human-verified → auto-promotes to `qualified`.
2. **Training** — all 6 must complete the COA Linguistic Validation module online in the vendor portal.

---

## Per-vendor actions

### 1. Abhinav Dang — Hindi (EN↔HI) · vendor `f01458a7-4b91-4009-aed8-1320e324b752`
- Qualification: ✅ **qualified ×2** (translator + reviser), Tier-2 first-party evidence, NDA ✅, subject-matter ✅
- **Only gap → TRAINING.** Complete **COA Linguistic Validation** online (vendor portal `/trainings`). Also GCP / Confidentiality / ISO 17100.
- Owner: vendor (portal login). Done when `cvp_training_completions` has a completed COA LV row.

### 2. Gurpreet Singh — Punjabi (EN↔PA) · vendor `56213434-5f79-46e5-99b0-42d4345b4a65`
- Qualification: ✅ **qualified ×2**, Tier-2 first-party evidence, NDA ✅, subject-matter ✅
- **Only gap → TRAINING** (same as Abhinav).
- Owner: vendor.

### 3. Gonzalo Calderon — Spanish (EN→ES, clinical-trials protocols) · vendor `b6712a24-1392-4b66-94c4-2c6eb1242c7d`
- Qualification: ⚠️ **under_review** — screened CV only (0 verified). NDA ✅, subject-matter ✅. **Strongest COA fit.**
- **Gap 1 → EVIDENCE.** Raminder to obtain his degree certificate (or a clinical-work reference). Upload on his `/iso-evidence` link (or admin QMS tab → Add document) → **human Verify** → auto-promotes to `qualified`.
- **Gap 2 → TRAINING** (COA LV online).
- Owner: Raminder (collect doc + Verify) + vendor (training).

### 4. edna osorio — Portuguese-BR (EN→PT-BR, medical) · vendor `804d75f0-58f0-447b-8b2a-087d18b9a265`
- Qualification: ⚠️ **under_review** — screened CV only. NDA ✅, subject-matter ✅.
- **Gap 1 → EVIDENCE** (degree/medical-translation cert → upload → Verify → auto-promote).
- **Gap 2 → TRAINING** (COA LV online).
- Owner: Raminder + vendor.

### 5. Claudia Bayá Crapuchett — Spanish-LatAm (EN→ES, medical) · vendor `d76a799d-37ee-4787-b893-2e7b76e0b548`
- Qualification: ⚠️ **under_review** — screened CV only. NDA ✅, subject-matter ✅.
- **Gap 1 → EVIDENCE** (degree/medical cert → upload → Verify → auto-promote).
- **Gap 2 → TRAINING** (COA LV online).
- Owner: Raminder + vendor.

### 6. Raja (R Rajamanickam) — Tamil (EN↔TA, clinical research) · vendor `b450f9ff-3cd5-4347-8682-91d13c8de11c`
- Qualification: ⚠️ **under_review** — screened CV only. NDA ✅, subject-matter ✅.
- ⚠️ **First-party route does NOT work on current data:** portal history = **2 jobs / $44 CAD / Jun 2026**, 0 legacy invoices → below the 3-job minimum, would not promote (and is not defensible "documented experience").
- **Gap 1 → EVIDENCE, choose one:**
  - (a) **XTRF P000071 export** — his real Tamil clinical history (~2017+) that didn't migrate; load as legacy first-party → §3.1.4(c) → promotes; **or**
  - (b) **diploma/reference** like the others (simpler if XTRF export isn't ready).
- **Gap 2 → TRAINING** (COA LV online).
- Owner: Raminder (decide XTRF export vs diploma) + vendor (training).

---

## Mechanisms (reference)
- **Upload evidence:** vendor `/iso-evidence/<token>` (vendor self-upload, AI-screens on upload) OR admin Vendor → QMS tab → "Add document".
- **Verify to Tier-2:** admin QMS tab → "Verify" on the evidence row (guarded: if AI flagged a name/claim mismatch, requires written override reason). Verifying + active NDA auto-promotes `under_review → qualified` (recruit) / `preliminary` (legacy).
- **Training (online):** vendor portal → **Trainings** → "COA Linguistic Validation" (`1f1bb270-3994-4f4b-9851-4d900bba111e`) → Mark complete. Records `cvp_training_completions` (audit training file). Also: GCP for Clinical Linguists, Confidentiality & Data Protection, ISO 17100 Process & QA.
- **Offline completion fallback:** admin `/admin/qms/training-records` → "Record offline completion" (only with a genuine basis).

## Summary table

| Vendor | Lang | Qual now | Evidence action | Training |
|---|---|---|---|---|
| Abhinav Dang | HI | ✅ qualified | — | COA LV online |
| Gurpreet Singh | PA | ✅ qualified | — | COA LV online |
| Gonzalo Calderon | ES | ⚠️ provisional | diploma → verify | COA LV online |
| edna osorio | PT-BR | ⚠️ provisional | diploma → verify | COA LV online |
| Claudia Bayá | ES | ⚠️ provisional | diploma → verify | COA LV online |
| Raja | TA | ⚠️ provisional | XTRF P000071 export *or* diploma → verify | COA LV online |

**Target end state:** 6 qualified COA linguists across ES / PT-BR / TA / HI / PA, each Tier-2 verified + NDA + COA-trained.

## Open decisions / risks
- **Panel breadth:** 6 linguists, no FR/DE clinical coverage. Confirm whether FR/DE COA pairs are in IQVIA scope; if so, the panel needs dedicated FR/DE clinical members.
- **Raja:** confirm XTRF export availability vs. diploma route this week (audit is 8 days out).
- **Training authenticity:** completions must reflect real module completion (online) or a genuine offline basis — do not back-date or fabricate.
