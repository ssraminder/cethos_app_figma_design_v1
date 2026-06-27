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

## Extending later
Design is SOP-only v1. To add QM manuals (QM-001/QM-002 in `portal_documents`)
or other QMS tables, add another reconcile pass + ledger rows; bump
`GENERATOR_VERSION` in the edge fn to force a full docx regen after layout edits.
