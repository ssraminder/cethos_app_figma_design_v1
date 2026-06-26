# Cethos SOP Register (Master Index)

This is the **repo-side master list** of Cethos Standard Operating Procedures. It mirrors the
published **`sharepoint-export/00 - SOP Index (read me first).docx`** (the controlled copy used in the
QMS binder). Update **both** when an SOP is added, retired, or renumbered.

## Document-control conventions

- **One flat folder.** All SOPs live in `docs/sops/`. We organise by **document ID**, not by subfolder
  — the ID prefix is the category (see below). This keeps the register flat, cross-references simple,
  and gives the auditor a single master list. (Don't create per-type subfolders unless a category
  later grows past ~15 documents.)
- **Numbering:** `SOP-<AREA>-<NN>`. `AREA` is omitted for the core ISO 17100 QMS series (`SOP-001…007`,
  historical). Functional areas use a prefix: `VM` = Vendor Management, `IT` = IT/infrastructure,
  `OPS` = Operations/front-desk, `QA-EV` = Quality evidence, `PR` = Production / service-workflow execution.
- **Two formats, one source of truth per field.** Working/source copies are **Markdown** in
  `docs/sops/`. Published/controlled copies are **Word** in `docs/sops/sharepoint-export/` (and the QMS
  SharePoint). For the `.docx`-only QMS series, the SharePoint copy is the controlled master for
  owner/version/approval fields.
- **Versioning:** bump the version + date in the document's own header table; note material changes.

## Register

### Core QMS / ISO 17100 series (formal procedures)

| ID | Title | Area | Format |
|---|---|---|---|
| SOP-001 | Qualifying translators and revisers | Quality / Vendor Mgmt | `.docx` |
| SOP-002 | Keeping qualifications up to date (re-qualification) | Quality / Vendor Mgmt | `.docx` |
| SOP-003 | Approval authority and quality oversight | Quality | `.docx` |
| SOP-004 | Linguistic resource (supplier) management | Vendor Mgmt | `.docx` |
| SOP-005 | IT service sub-processor management | IT | `.docx` |
| SOP-006 | COA linguistic validation qualification | Quality / Vendor Mgmt | `.docx` |
| SOP-007 | CAPA management and complaint handling | Quality | `.docx` |
| QA-EV-CAPA-001 | CAPA / complaints evidence record | Quality | `.docx` |

### Operational runbooks (how the procedures are executed day-to-day)

| ID | Title | Area | Format | Source |
|---|---|---|---|---|
| **SOP-VM-001** | **Linguist Qualification Pipeline (vendor-manager operational runbook)** | Vendor Mgmt | `.md` | [SOP-VM-001-linguist-qualification-pipeline.md](SOP-VM-001-linguist-qualification-pipeline.md) |
| SOP-IT-001 | Vendor inbox & AI front desk (mail infrastructure) | IT | `.md` + `.docx` | [SOP-IT-001-vendor-inbox-mail-infrastructure.md](SOP-IT-001-vendor-inbox-mail-infrastructure.md) |
| SOP-OPS-001 | Answering AI front-desk escalations | Operations | `.md` + `.docx` | [SOP-OPS-001-answering-frontdesk-escalations.md](SOP-OPS-001-answering-frontdesk-escalations.md) |
| **SOP-PR-001** | **Cognitive debriefing (standalone COA validation service)** | Production | `.md` + `.docx` | [SOP-PR-001-cognitive-debriefing.md](SOP-PR-001-cognitive-debriefing.md) |
| **SOP-PR-002** | **Clinician review (standalone COA validation service)** | Production | `.md` + `.docx` | [SOP-PR-002-clinician-review.md](SOP-PR-002-clinician-review.md) |

### Production / service-workflow SOPs

These document how each orderable workflow is executed. **The portal `/admin/sops` library is the
controlled system of record** and numbers SOPs in a flat `SOP-0NN` sequence (the category — e.g.
*Production* — is a separate field, not encoded in the number). Repo Markdown here is the working copy.

| ID | Title | Workflow template | Format | Source |
|---|---|---|---|---|
| **SOP-022** | **Standard TEP (Translation · Editing · Proofreading)** | `standard_tep` | `.md` + portal | [SOP-022-standard-tep.md](SOP-022-standard-tep.md) |
| **SOP-023** | **Translation and Review** | `translation_review` | `.md` + portal | [SOP-023-translation-and-review.md](SOP-023-translation-and-review.md) |
| **SOP-024** | **Certified Translation** | `certified_translation` | `.md` + portal | [SOP-024-certified-translation.md](SOP-024-certified-translation.md) |
| **SOP-025** | **Transcription and Translation** | `transcription_translation` | `.md` + portal | [SOP-025-transcription-and-translation.md](SOP-025-transcription-and-translation.md) |
| **SOP-028** | **Post-Delivery Client Review & Revision Rounds** | *All workflows (cross-cutting)* | `.md` (+ portal) | [SOP-028-post-delivery-revision-rounds.md](SOP-028-post-delivery-revision-rounds.md) |

#### Linguistic Validation (LV) standalone-step set — published to the portal 2026-06-26

The master framework + the per-step recipes for every standalone COA linguistic-validation workflow.
Published as flat `SOP-0NN` (active, immutable). These replace the former `SOP-LV-001` / `SOP-PR-003…011`
working drafts (now removed; SOP-PR-001/002 remain the working copies of SOP-008/009).

| ID | Title | Workflow template | Source |
|---|---|---|---|
| **SOP-029** | **Linguistic Validation — Standalone Services (master framework)** | *(all LV workflows)* | [SOP-029-linguistic-validation-master.md](SOP-029-linguistic-validation-master.md) |
| **SOP-030** | Forward Translation | `translation_only` | [SOP-030-forward-translation.md](SOP-030-forward-translation.md) |
| **SOP-031** | Adaptation | `lv_adaptation` | [SOP-031-adaptation.md](SOP-031-adaptation.md) |
| **SOP-032** | Reconciliation | `lv_reconciliation` | [SOP-032-reconciliation.md](SOP-032-reconciliation.md) |
| **SOP-033** | Back-translation | `lv_back_translation` | [SOP-033-back-translation.md](SOP-033-back-translation.md) |
| **SOP-034** | Back-translation Review | `lv_bt_review` | [SOP-034-back-translation-review.md](SOP-034-back-translation-review.md) |
| **SOP-035** | Harmonization | `lv_harmonization` | [SOP-035-harmonization.md](SOP-035-harmonization.md) |
| **SOP-036** | Proofreading | `lv_proofreading` | [SOP-036-proofreading.md](SOP-036-proofreading.md) |
| **SOP-037** | Cognitive / Debriefing Interview | `lv_interview` | [SOP-037-cognitive-debriefing-interview.md](SOP-037-cognitive-debriefing-interview.md) |
| **SOP-038** | Finalization / Certification | `lv_finalization` | [SOP-038-finalization-certification.md](SOP-038-finalization-certification.md) |

Also published in the portal (flat scheme): **SOP-008** Cognitive Debriefing (working copy
[SOP-PR-001](SOP-PR-001-cognitive-debriefing.md)) and **SOP-009** Clinician Reviews (working copy
[SOP-PR-002](SOP-PR-002-clinician-review.md)).

> **Numbering note.** The **portal flat `SOP-0NN`** scheme is the single controlled, auditor-facing
> register (e.g. cognitive debriefing = `SOP-008`, LV master = `SOP-029`). The former repo
> **`SOP-LV-001` / `SOP-PR-003…011`** working drafts were reconciled onto the portal scheme and
> published as **SOP-029…SOP-038** on 2026-06-26; the old-numbered drafts have been removed so only one
> scheme remains. The 8 `lv_*` workflow templates now reference `SOP-029` (migration
> `20260626_lv_workflow_template_sop_refs.sql`). New workflow SOPs continue the flat sequence.

### How the qualification SOPs relate

`SOP-001` / `SOP-003` / `SOP-006` define **what** qualification requires (policy).
**`SOP-VM-001`** is the **operational runbook** — *how* a vendor manager executes them in the portal
(screen → verify → approve / request / test → audit), including the decision rules, the exact
tables/functions, and the known pitfalls. `SOP-002` covers ongoing re-qualification.

> Note: `sharepoint-export/RLS_Remediation_ClaudeCode_Prompt.md` is a one-off engineering prompt, not a
> controlled SOP — it is intentionally not listed above.
