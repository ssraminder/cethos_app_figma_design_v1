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

### How the qualification SOPs relate

`SOP-001` / `SOP-003` / `SOP-006` define **what** qualification requires (policy).
**`SOP-VM-001`** is the **operational runbook** — *how* a vendor manager executes them in the portal
(screen → verify → approve / request / test → audit), including the decision rules, the exact
tables/functions, and the known pitfalls. `SOP-002` covers ongoing re-qualification.

> Note: `sharepoint-export/RLS_Remediation_ClaudeCode_Prompt.md` is a one-off engineering prompt, not a
> controlled SOP — it is intentionally not listed above.
