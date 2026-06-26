-- 20260625_team_dropbox_sync_foundation.sql
-- Foundation for the NEW team-account Dropbox sync (dropbox-team-sync).
--
--   1) Multi-connection: dropbox_connections gains `purpose` ('legacy'|'team')
--      so the legacy wordsmith.in connection and the new Cethos-team
--      connection coexist during cutover (previously a hard singleton row).
--   2) Audit `target` on dropbox_file_syncs + per-target dedup, so the same
--      source file can sync once to legacy AND once to team without the
--      dup-guard treating the team copy as a duplicate of the legacy one.
--   3) Per-step `create_dropbox_folder` flag (order + template) driving the
--      "Create a Dropbox folder for this step" checkbox / folder derivation.
--
-- SHIP WITH the dropbox-oauth update: its upsert uses onConflict "((true))",
-- which this migration removes — re-pointing it to `purpose` is required or a
-- re-connect upsert will fail.
--
-- NOTE: the "To Translate" -> "To Process" change is a DISPLAY-LABEL rename
-- only and is intentionally NOT here — the slug `to_translate` is load-bearing
-- (billability key + ~10 components); it ships with the intake-UI change.

-- 1) Multi-connection -------------------------------------------------------
alter table public.dropbox_connections
  add column if not exists purpose text not null default 'legacy';

alter table public.dropbox_connections
  drop constraint if exists dropbox_connections_purpose_chk;
alter table public.dropbox_connections
  add constraint dropbox_connections_purpose_chk check (purpose in ('legacy', 'team'));

-- Replace the hard singleton (one row ever) with one-row-per-purpose.
-- Existing row(s) default to 'legacy' (the wordsmith.in connection).
drop index if exists public.dropbox_connections_singleton;
create unique index if not exists dropbox_connections_purpose_key
  on public.dropbox_connections (purpose);

-- 2) Audit target + per-target dedup ---------------------------------------
alter table public.dropbox_file_syncs
  add column if not exists target text not null default 'legacy';

alter table public.dropbox_file_syncs
  drop constraint if exists dropbox_file_syncs_target_chk;
alter table public.dropbox_file_syncs
  add constraint dropbox_file_syncs_target_chk check (target in ('legacy', 'team'));

-- Re-key the dup-guard to include target so a file can sync once per account
-- (else the existing legacy rows block the team back-fill as "duplicates").
drop index if exists public.idx_dropbox_syncs_unique_source;
create unique index if not exists idx_dropbox_syncs_unique_source
  on public.dropbox_file_syncs (source_bucket, source_path, sync_trigger, target)
  where status = 'synced';

-- 3) Per-step "create a Dropbox folder" flag -------------------------------
-- NULL = derive (file-bearing step -> folder); true/false = explicit override
-- set by the add-step "Create a Dropbox folder for this step" checkbox.
alter table public.order_workflow_steps
  add column if not exists create_dropbox_folder boolean;
alter table public.workflow_template_steps
  add column if not exists create_dropbox_folder boolean;
