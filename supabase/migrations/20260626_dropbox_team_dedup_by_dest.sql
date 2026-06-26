-- Dedup TEAM Dropbox syncs by DESTINATION path (not by source file), so the same
-- artifact can be copied into each workflow stage's folder (Cognitive Debriefing
-- -> QA Review -> Final Deliverable), each retained + SHA-256 hashed. Legacy keeps
-- its original source-based dedup.
drop index if exists public.idx_dropbox_syncs_unique_source;

create unique index if not exists idx_dropbox_syncs_team_dest
  on public.dropbox_file_syncs (dropbox_path)
  where status = 'synced' and target = 'team';

create unique index if not exists idx_dropbox_syncs_legacy_source
  on public.dropbox_file_syncs (source_bucket, source_path, sync_trigger)
  where status = 'synced' and target = 'legacy';
