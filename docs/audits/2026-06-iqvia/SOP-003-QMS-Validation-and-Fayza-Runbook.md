# SOP-003 QMS Validation and Fayza Guide

**Document Number:** SOP-003
**SOP Title:** Vendor Qualification and Management
**Revision / Version:** v2 active (document header v5.0)
**QMS section / module:** Portal → **Standard Operating Procedures** (`/admin/sops`, Human Resources); validated against the **vendor QMS tab** (`/admin/vendors/:id?tab=qms`) and the **Qualification Queue** (`/admin/qms/queue`).
**Validation date:** 2026-06-26 (live session, admin portal)
**Environment:** Production — `https://portal.cethos.com`, signed in as Admin
**SOP record ID:** `46d69698-d8a8-47d4-b27f-5b5824a8a667`
**Validation status:** **Pass** — the one issue found (a stale SOP reference on the qualification page) was **fixed and deployed** in the same session.

---

# Section A: SOP Validation Report

## 1. Validation summary

SOP-003 is the consolidated vendor-qualification procedure (it absorbed the former translator-qualification, maintenance, approval-authority, and supplier-management SOPs). Because qualifying a vendor is **irreversible** (`qms.qualification_audit_log` is append-only), validation was performed **read-only against real records** — never by creating a test qualification.

The qualification system genuinely implements the SOP, proven end-to-end on a real qualified vendor (**Omotola**, `APP-26-0167`):
- **§4 / §5 / §11 — competence basis + documented evidence.** Qualified as *Translator · "Recognized degree in translation"*; **6 of 6 evidence items Verified**, each with a **sha-256 file hash** and a human verification note; documented proof on file, not self-report.
- **§6 / §7 — approver + review cycle.** Qualification records the approver and date; a **12-month re-qualification due date** (2026-06-22 → 2027-06-22); the monthly cron `qms-requalification-maintenance` reviews qualifications coming due; performance events are logged (`qms.performance_events`).
- **§8 — Approved Supplier List + assignment gate.** The ASL is the live QMS register (**173 approved suppliers**); the function `qms_check_assignment` enforces eligibility (COA assignments draw only from the COA-qualified subset, SOP-019). The Qualification Queue triages applicants (Auto-qualify / Needs human review / No CV) with a deliberate, manager-gated "Apply".
- **§9 — confidentiality.** NDA on file (Active, signed) before work; **1,156 NDA agreements** system-wide.
- **§11 — records.** Append-only `qms.qualification_audit_log` (**4,294 rows**), never deleted.

**A human should be able to confirm the SOP unaided** by opening a qualified vendor's QMS tab — see Section B.

## 2. SOP metadata

| Field | Value |
|---|---|
| SOP number | SOP-003 |
| SOP title | Vendor Qualification and Management |
| Version / status | v2 active (doc header v5.0) |
| Effective date | June 24, 2026 |
| Owner | Acting Quality Manager (Founder & CEO) / Life Sciences Manager |
| Approved by | Raminder Shah — Founder & CEO |
| ISO / regulatory | ISO 17100:2015 §3.1, §4.3; ISO 9001 §8.4; IQVIA Supplier Management; ICH GCP |
| QMS location | `/admin/sops` → Human Resources |
| Status in QMS | v2 active, effective 2026-06-24 |

## 3. Execution log

| SOP ref | Step intent | Action (read-only) | Result | Status |
|---|---|---|---|---|
| Locate | Find SOP-003 | Opened `/admin/sops/46d69698…` | Renders; v2 active, v1 superseded (control block + frozen panel) | Success |
| §9 | NDA before work | Omotola QMS tab | "NDA on file — Active · signed 6/19/2026 (v3.0)" | Success |
| §4/§6/§7 | Competence basis + review | Omotola QMS tab | "qualified · Translator — Recognized degree in translation · Verified · Qualified 6/22/2026 · re-qualification due 6/22/2027"; 3 language pairs | Success |
| §4/§5/§11 | Documented evidence | Omotola QMS tab | 6/6 evidence Verified, each sha-256 ✓ + View document + human note | Success |
| §5 | Application triage | `/admin/qms/queue` | Triages Auto-qualify 56 / Needs human review 126 / No CV 161; basis column shows §3.1.4(a); manager-gated Apply | Success |
| §7 | Review-due automation | DB (cron) | `qms-requalification-maintenance` monthly (`10 6 1 * *`) → `qms_run_requalification_maintenance` | Success |
| §8 | ASL + assignment gate | DB | 173 approved suppliers; `qms_check_assignment` present | Success |
| §11 | Append-only records | DB | `qms.qualification_audit_log` 4,294 rows; no-update/no-delete + hash-chain triggers | Success |

## 4. Gap and issue register

| Issue ID | SOP ref | Severity | Issue | Resolution | Status |
|---|---|---|---|---|---|
| ISS-1 | §8 / §11 (traceability) | Major | The Qualification Queue page (`/admin/qms/queue`) and the server-side apply-gate (`qms-auto-qualify`) cited **"SOP-001 — How we qualify translators and revisers"**, and the gate keyed on the **archived** SOP record (slug `qualify-translators-revisers`). After the QM-002 consolidation, vendor qualification is **SOP-003**; SOP-001 is Document Control. | Repointed the gate to SOP-003's slug (`approval-authority-qa-oversight`) and corrected every user-facing reference (procedure link → SOP-003 detail, apply-confirmation dialog, error message, code comments). **Edge function `qms-auto-qualify` re-deployed (`--no-verify-jwt`); UI fix ships with the merge.** Behaviour is unchanged (both SOPs are active); the fix is correctness/traceability. | **Fixed & deployed** |

## 5. ISO 17100 observations

- **Role clarity & approval (§3, §6):** distinct roles; qualifications carry an approver + date.
- **Competence (§3.1.4, §4):** three documented routes, with the basis recorded on each qualification and documented, verified evidence (sha-256, view-document) behind it.
- **Maintenance (§3.1.8, §7):** explicit 12-month re-qualification dates and a monthly maintenance cron; performance events logged.
- **Approved Supplier List (§4.3, §8):** the ASL is the live QMS register with an enforced assignment-eligibility gate.
- **Records (§11):** append-only, hash-chained audit log; records never deleted.

**Overall:** SOP-003 and the system are **aligned**. The single traceability defect (ISS-1) was corrected during validation.

## 6. Validation conclusion

**The SOP is executable by a human as written, and — after the in-session fix — the system matches it.** Validation status: **Pass**.

---

# SOP-003 Validation Walkthrough - Instructions for Fayza

> The spoon-fed, screenshot-illustrated version of this walkthrough is the Word guide **Cethos-SOP-003-Vendor-Qualification-Verification-Guide.docx** (CTH-VRF-003), built from real annotated portal screenshots — Fayza only reads and confirms; she never qualifies anyone.

## 1. Purpose
Confirm that SOP-003 (Vendor Qualification & Management) describes what the portal actually does, by **looking at a real already-qualified vendor** — read-only.

## 2. Before you start
- **Access:** Admin login to `https://portal.cethos.com`.
- **Golden rule:** **Look only.** Qualifying a vendor is permanent. Never click *Add qualification*, *Add document*, or approve anyone. If something doesn't match, write it in the Notes box.

## 3. Steps
1. Log in; left menu **QUALITY → SOPs**; open **SOP-003 — Vendor Qualification and Management**; read the control block + §4 (the three §3.1.4 routes). *(Screenshot S1.)*
2. Open an **already-qualified vendor** → **QMS** tab. Confirm the **NDA on file** is **Active + signed**. *(S2, §9.)*
3. Confirm the **role qualification**: role, **§3.1.4 basis**, **Verified**, qualified date, **12-month re-qualification due**, and language pairs. *(S3, §4/§6/§7.)*
4. Confirm **Evidence / proof**: each item **Verified** + **sha-256** hash + **View document**. *(S4, §4/§5/§11.)*

## 4. When to stop and escalate
Stop and tell **Raminder** if: a control is missing, the NDA isn't active, evidence isn't verified/hashed, a record won't open, or anything looks risky on the live system.

## 5. Final confirmation
- `Tester name:` ___  `Date:` ___
- `Was SOP-003 confirmed against a real qualified vendor? Yes / No`
- `Any blocking issues? Yes / No`   `Deviations:` ___   `Comments:` ___

---

**Proposed filename:** `SOP-003_QMS_Validation_and_Fayza_Runbook`
