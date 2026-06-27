---
name: feature_qms_dropbox_sop_sync_2026_06_26
description: qms-dropbox-sync edge fn + ledger/triggers/cron that replicate SOPs into team Dropbox as .docx
metadata:
  node_type: memory
  type: project
---

# QMS SOPs auto-replicated into the team Dropbox as .docx

User asked to download all SOPs (+ other QMS docs) into the team Dropbox QMS
library and keep it **synced with the system**. SOPs are stored in the portal as
markdown (`public.sops` + `public.sop_versions.content_md`) — there is **no
stored doc file**, so each version is *generated* to .docx on the fly. The
Dropbox MCP cannot upload binary files, so generation+upload **must** go through
an edge function (Deno), not the MCP.

## What shipped (2026-06-26, applied + deployed to prod directly; not yet a PR)

- **Edge fn `qms-dropbox-sync`** (`--no-verify-jwt`, deployed via CLI so JWT
  stays off) reuses the `dropbox_connections.purpose='team'` connection + team
  root namespace + upload helpers from [[feature_dropbox_team_sync_hourly_sweep_2026_06_26]].
  Body `{sop_id?, limit?}` (default limit 25, returns `remaining` to drain).
- **`_shared/md-docx.ts`** — markdown→.docx renderer (headings, bullet/numbered
  lists, pipe tables, blockquotes, code, **bold**/*italic*/`code`/links) with a
  Cethos controlled-document cover block (SOP#, version, status, effective date,
  approver) + "Controlled copy — source of truth is the portal" footer. Uses
  `https://esm.sh/docx@8.5.0` (same lib as `_shared/affidavit-docx.ts`).
- **Ledger `public.qms_dropbox_syncs`** (unique on `sop_version_id`, RLS on /
  no policies = service-role only). Idempotent reconcile keyed by a content hash
  over (generator_version, sop#, title, version, status, effective_date,
  is_current, approver, content_md):
  - never-synced → generate+upload; content/metadata changed → regenerate
    overwrite (+ delete stale old path); only path changed → rename/move.
  - **Only ever touches files it created** (tracked in ledger) → staff-added
    files (Test-Record Checklist, Audit Memo) are safe.
- **On-change triggers** (`trg_qms_dropbox_versions` on sop_versions;
  `trg_qms_dropbox_sops_ins` + `_upd` on sops — split because a WHEN clause
  referencing OLD is illegal on an INSERT trigger, and TG_OP isn't allowed in
  WHEN at all) → `qms_dropbox_notify(sop_id)` → `net.http_post` (fire-and-forget,
  swallows errors so it never blocks a SOP edit).
- **Weekly cron** `qms-dropbox-sync-weekly` jobid **1850**, `30 3 * * 0`
  (Sun 03:30 UTC), body `{"limit":200}` — full-reconcile safety net.

## Layout (under team root ns 14543866243)
`/Cethos Team Folder/QMS/SOPs/SOP-NNN - <Title>/`
- active version: `SOP-NNN vX.0 - <Title> -current.docx`
- superseded: `SOP-NNN vX.0 - <Title>.docx`
Bare `SOP-NNN` stub folders the user pre-created are auto-deleted when empty
(full-scan runs only when no `sop_id` passed).

## Verified live on prod (2026-06-26)
40 active SOPs → 40 folders, **54 versions → 54 .docx, 0 failed** (10–16 KB).
Downloaded SOP-001 v2.0 → valid OOXML, cover + metadata table + headings render.
SOP-008 (3 versions) shows only v3.0 with `-current`. Idempotent re-run =
0 processed. Archived/RETIRED SOPs (is_archived) skipped; drafts skipped.

## Manuals / controlled-document library (added same day)
Extended `qms-dropbox-sync` to ALSO replicate the portal **Documents & Manuals
library** (`portal_documents` / `portal_document_files`, bucket
`portal-documents`) — these are **real stored files copied as-is** (.docx/.pdf/
.html), NOT generated. Layout `/Cethos Team Folder/QMS/Manuals/<DocCode> -
<Title>/<DocCode> vX.Y - <Title>[ -current]<ext>`. Scope = all published,
non-archived docs (`is_published=true and is_archived=false`); `is_current`
resolved via `portal_documents.current_file_id`. Separate ledger
`public.qms_manual_dropbox_syncs` (unique `document_file_id`); a doc-file row is
immutable (new version = new row) so dedup is path-equality only (no re-download
on rename). Triggers `trg_qms_manual_dropbox_files` (insert on
portal_document_files), `trg_qms_manual_dropbox_docs_ins/_upd` (portal_documents
title/doc_code/current_file_id/is_published/is_archived). Same weekly cron 1850
(body `{"limit":200}`, default `kind:"all"`) covers both families.

Function body dispatch: `{sop_id}`→SOPs only, `{document_id}`→manuals only,
neither→both (filter via `kind:"sop"|"manual"|"all"`).

Verified prod 2026-06-26: 24 docs → 24 folders, **32 files, 0 failed** (sizes
match DB byte-for-byte incl. a 2 MB HTML guide); QM-002 shows v6.1 `-current` +
v6.0; CTS-REC-RST-002 shows v1.0/v1.1/v1.2 with only v1.2 `-current`. Idempotent.

## Registers (one-time Excel scaffolds, added same day)
Operational QMS records (qms schema) are LIVE DATA, not files — so they're
exported as **one-time Excel scaffolds** the user maintains by hand (NOT
auto-synced; weekly cron only touches SOPs+manuals). Action
`{"action":"scaffold_registers","force?":bool}` on `qms-dropbox-sync`:
- reads `public.qms_register_export()` — a read-only SECURITY DEFINER RPC
  (migration `20260626_qms_register_export.sql`) that does the cross-schema
  joins (qms schema is NOT PostgREST-exposed even to service role → must go
  through a public SECURITY DEFINER wrapper; execute granted to service_role
  only, PII). Returns one JSONB with: qualification_summary (filtered to
  vendors holding a role_qual), role_qualifications, language_pairs,
  competence_evidence, capa, complaints, nonconformities, performance, staff.
- builds 3 .xlsx via `npm/esm.sh xlsx@0.18.5` (SheetJS, aoa_to_sheet) →
  `/Cethos Team Folder/QMS/Registers/`:
  - `Qualification Register (ISO 6.1).xlsx` (Linguist Summary 237 / Role Quals
    285 / Language-Pair Quals 441 / Competence Evidence 1334 / Legacy blank)
  - `Quality-Event Registers.xlsx` (CAPA 5 / Complaints 1 / Nonconformities 4 /
    Performance 105 / Legacy)
  - `Training Register (template).xlsx` (seeded with 9 active staff; portal
    training tables empty → template)
- Each sheet: banner + "ONE-TIME SCAFFOLD, maintain manually, portal=SoR" note
  + a "Legacy (pre-portal)" sheet for backfilling old manual-register data.
- **Skip-if-exists** (`dbxExists` via get_metadata) → re-running never clobbers
  the user's hand-entered rows; pass `force:true` to regenerate.
Verified prod 2026-06-26: 3 workbooks written, valid xlsx, re-run all skipped.
NDA register was offered but user declined.

## Extending later
Bump `GENERATOR_VERSION` to force a full SOP docx regen after layout edits.
To add more QMS tables, add another reconcile pass + ledger (live docs) or
extend `qms_register_export` + a new workbook (scaffolds).
