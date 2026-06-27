# Hourly auto-replication into the TEAM Dropbox (2026-06-26)

## Problem
Audit of past-24h orders found **0 of 5** replicated to the team Dropbox. Root
cause: the real-time triggers in `supabase/functions/_shared/dropbox-trigger.ts`
still call the **legacy** `dropbox-sync` (→ `/Cethos/Orders/…`). The go-forward
**team** folder (`/Cethos Team Folder/01_Clients/…` for agencies,
`/Cethos Team Folder/02_Certified-Individuals/…` for retail) was only ever
populated by the manual `tmp/backfill-*.mjs` scripts — there was **no cron and
no DB trigger** enqueuing new orders. So newly-paid orders never auto-reached the
team Dropbox. There was also a failure backlog (~243: `step_delivery` "Object not
found", deliveries hitting Dropbox `too_many_write_operations`).

## Decision
Edge function + pg_cron, **not** a Claude Code scheduled task — it's the
established pattern here (`process-invoice-queue`, `ocr-process-queue`, etc.),
always-on, deterministic, auditable (ISO 17100), and reuses the existing copy
engine. Claude Code scheduled tasks are for ad-hoc audits, not a production SLA.

## What shipped (branch `feat/dropbox-team-sync-hourly-sweep`, PR #__)
- **Migration `20260626_dropbox_team_sweep.sql`**:
  - `public.dropbox_team_sweep_state` (per-order sweep ledger; RLS, staff-read).
  - `public.dropbox_team_sweep_candidates(lookback_days, resweep_hours, limit)` —
    dirty = never_swept OR `orders.updated_at` > last sweep OR (still-active AND
    periodic refresh window elapsed). Gates re-sweeping so permanently-failing
    orders aren't retried every run (bloat guard).
  - `public.dropbox_team_sweep_record(...)` — atomic upsert + run_count++.
- **Edge fn `dropbox-team-sync-sweep`** (deployed `--no-verify-jwt`): selects
  candidates (or explicit `order_ids` / `dry_run`), calls the existing idempotent
  `dropbox-team-sync` `backfill_order` per order, paced (`pace_ms`) with a
  `time_budget_ms` (110s) guard that self-resumes next run. `backfill_order`
  dedups by destination path, so re-sweeps only upload missing files.
- **Cron `20260626_dropbox_team_sweep_cron.sql`** → `cron.schedule(
  'dropbox-team-sync-sweep-hourly', '20 * * * *', body {"batch":10,"pace_ms":300})`
  (jobid 1849, active).

## Verified on prod
Ran the sweeper on the 5 past-24h orders → **15 files synced, 0 errors**.
DB shows team rows synced + sweep_state recorded; confirmed the Dropbox tree
directly via `list_folder` (e.g. ORD-2026-10529 → `02_Certified-Individuals/…/
01_Source/v1/Arsh birtch cert.pdf` + `00_Admin/PROJECT-RECORD.md`). NOTE: Dropbox
**search** index lags seconds-old uploads — verify with `list_folder`, not search.

## Notes / follow-ups
- This does NOT retire the legacy real-time sync; both targets coexist
  (`dropbox_file_syncs.target` = 'legacy' | 'team'). Proper cutover = repoint
  `_shared/dropbox-trigger.ts` at `dropbox-team-sync` (bigger change, deferred).
- First few hourly runs re-touch all paid orders in the 21d window (sweep ledger
  starts empty) — cheap due to dedup. Steady state is tiny.
- Tunable via cron body: `batch`, `lookback_days`, `resweep_hours`, `pace_ms`.
- Full-sync of a brand-new order ≈ 20s; batch sized so a run fits the time budget.
- Compliance side-finding (separate from this work): **ORD-2026-10527** (Lemlem
  Bekele, QT26-10687) had NULL source/target language + NULL intended_use
  (known `/secure-upload` bug) — still needs a data fix.
