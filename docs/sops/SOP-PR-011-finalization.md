# SOP-PR-011 — Finalization / Certification (Standalone LV Step)

| | |
|---|---|
| **Document ID** | SOP-PR-011 |
| **Title** | Finalization / Certification (final assembly, certificate of completion, release) — standalone linguistic-validation step |
| **Owner** | Quality / Operations |
| **Applies to** | Any PM/coordinator running a standalone LV finalization/certification order in the admin portal (`portal.cethos.com`) |
| **Status** | Draft v0.1 — 2026-06-25 |
| **Related** | SOP-LV-001 (master LV framework) · `docs/audits/2026-06-iqvia/LV-standalone-workflow-set-design.md` · workflow template `lv_finalization` |

---

## 1. Purpose

Define **how a single finalization / certification step** is performed and released when an LV client subcontracts it on its own PO. Finalization is the **final assembly and release** of the validated instrument: collate the final files, apply final formatting, compile the methodology/version summary, and issue a **certificate of completion** documenting the LV steps performed. An independent internal reviewer then verifies the assembled package before release.

Finalization is an **internal assembly/release step, not a translation service**: its QA node is a **§5.3.6 verification & release** by an independent person, under the **ISO 9001 QMS**. **Do NOT describe this step as an "ISO 17100 translation service."** The certificate documents the **steps performed and Cethos's QMS conformance**; it must **not** state or imply ISO 17100 **certification** — Cethos is ISO 17100-**aligned, not certified** (Stage 2 target ~Dec 2026). Always write "conforms to / aligned with," never "certified."

This SOP is the step recipe only. Intake, the QA gate mechanics, delivery and records are defined once in **SOP-LV-001** — this document points to them. (This step is performed `internal_work`; it does not assign an external vendor.)

## 2. Scope & inputs

- **Scope:** one finalization/certification — final assembly of the validated instrument files, methodology/version summary, and a certificate of completion, verified internally before release. Cethos delivers a conformant **component**; end-to-end LV conformance of the assembled deliverable rests with the prime/client.
- **Template:** `lv_finalization` (3-node: Finalization → QA Review → Final Deliverable; production step is **internal**, not an external vendor).
- **Inputs (from the client PO/intake — see SOP-LV-001 §6 step 1):**
  - the final approved instrument file(s) and version/IDs;
  - the record of the LV steps performed (which prior steps, by whom — to summarise on the certificate);
  - the certificate template/required fields and any client packaging/format spec;
  - deadline, deliverable format, PO#.
- **Out of scope:** performing the underlying LV steps (those are their own SOPs/POs); making substantive linguistic changes (finalization assembles approved content — it does not re-translate or re-edit). Each substantive step is its own PO/workflow.

## 3. Procedure

**PM / internal finalizer (production step 1)**
1. Confirm intake per **SOP-LV-001 §6.1** — create/confirm the order on the `lv_finalization` template; record instrument, language(s), amount, PO#, PM. Verify the final approved files, the step-history record and the certificate template are present; request anything missing before starting.
2. **Assemble** the final package: collate the approved instrument file(s), apply final formatting/packaging to the client spec, and confirm version integrity (the files match the approved/validated versions — no unapproved changes introduced).
3. **Compile the methodology/version summary** — instrument, languages/countries, the LV steps performed and the order in which they ran (referencing the relevant per-step records).
4. **Draft the certificate of completion** — document the LV steps Cethos performed and that they were carried out under the Cethos QMS and the ISPOR/regulatory LV methodology. State conformance as **"aligned with ISO 17100"** where relevant; **never** state or imply ISO 17100 certification. Include instrument/version, languages, date, and the authorising signatory.
5. Upload the assembled package, summary and draft certificate to step 1.

**Independent reviewer (QA step 2) — see SOP-LV-001 §6.4**
6. A **different** qualified person performs the **§5.3.6 verification**: confirm the package is complete and correctly versioned, the methodology summary matches the actual step records, the certificate is accurate and uses compliant wording (no "certified"/no overclaim), and the deliverable is client-ready. Mark issues or return with documented reasons; re-verify on resubmission.
7. Record the verification outcome (reviewer identity, timestamp, pass/return) on the QA step.

**PM (release step 3)**
8. On QA approval, release the final package + certificate to the client per **SOP-LV-001 §6.5** (the §5.3.6 verification & release record). De-identify any PII before release. Invoice/close per the client terms (SOP-LV-001 §6.6).

## 4. Quality assurance

- **QA node:** **ISO 17100 §5.3.6 — Verification & release**, performed by an **independent** internal reviewer (not the finalizer), under the ISO 9001 QMS — explicitly checking that the certificate wording does not overclaim (no ISO 17100 certification).
- This is an **internal assembly/release step** — **NOT** an ISO 17100 translation service; do not label it as such. Conformance basis = QMS.
- The authorising signatory must have release authority per the QMS approval-authority policy.

## 5. Outputs & delivery

- **Deliverable:** the assembled final instrument package, the methodology/version summary, and the **certificate of completion** (documenting steps performed + QMS/ISPOR conformance; "aligned with ISO 17100," never "certified").
- **Delivery:** released only after the §5.3.6 verification passes; delivery recorded per SOP-LV-001 §6.5. De-identify any PII before release.

## 6. Records & retention

Per **SOP-LV-001 §8** (ISO 17100 §6.2 — retain **≥ 5 years**): order/PO record (instrument, languages, PO#, PM); the step-history record summarised; the assembled final files; the methodology/version summary; the issued certificate of completion (with signatory); the §5.3.6 verification outcome; delivery/release record; client feedback linked to any CAPA. Files in controlled storage (vendor-deliveries bucket + project Dropbox per the folder-naming SOP).

## 7. Related documents

- **SOP-026** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-LV-001** — master LV framework (intake, the QA gate, delivery/release, records & retention, and the §5.3.3-vs-§5.3.6 conformance basis).
- **LV-standalone-workflow-set-design.md** — §2 conformance basis, §3 task→clause map (row 11), §4 the 3-node structure.
- The upstream per-step SOPs whose work this step assembles: **SOP-PR-003**…**SOP-PR-010** (and SOP-PR-001/-002).
- **Standards:** ISO 17100:2015 (§5.3.6, §6.2); ISO 9001 QMS; ISPOR good practices for COA translation & cultural adaptation. **Cethos is ISO 17100-aligned, not certified.**
