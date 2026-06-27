-- 20260626_dropbox_team_sweep_cron.sql
-- Hourly schedule for the dropbox-team-sync-sweep edge function.
-- Runs at :20 past each hour (off the top-of-hour cluster). Conservative batch
-- so each run stays within the function's internal time budget; the sweeper
-- self-resumes on the next run for anything it could not finish.

select cron.schedule(
  'dropbox-team-sync-sweep-hourly',
  '20 * * * *',
  $$
  select net.http_post(
    url     := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/dropbox-team-sync-sweep',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"batch":10,"pace_ms":300}'::jsonb
  );
  $$
);
