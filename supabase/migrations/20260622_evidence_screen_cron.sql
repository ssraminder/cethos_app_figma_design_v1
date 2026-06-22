-- Evidence screening freshness crons (2026-06-22)
-- Keeps applicant ISO evidence fresh via scheduled re-screening runs.
-- Cadence: every 12h until 2026-07-04, then every 48h (auto-switched).
--
-- BEFORE RUNNING: set the backfill secret via CLI:
--   supabase secrets set EVIDENCE_BACKFILL_SECRET=<your-secret> --project-ref lmzoyezvsjgsxveoakdr
-- The same secret must be used in the cron body below. This migration is
-- stored with a placeholder — apply it manually or via a deploy script that
-- substitutes <EVIDENCE_BACKFILL_SECRET> before execution.

-- Switch function: fires once on July 4, kills 12h job, creates 48h job
create or replace function public.evidence_screen_switch_to_48h()
returns void language plpgsql security definer as $fn$
begin
  perform cron.unschedule('evidence-screen-12h');
  perform cron.unschedule('evidence-screen-switch-to-48h');
  -- NOTE: if re-creating from scratch, substitute the real secret below
  perform cron.schedule(
    'evidence-screen-48h',
    '0 0 */2 * *',
    'select net.http_post(url:=''https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/cvp-evidence-screen-backfill'',headers:=''{\"Content-Type\":\"application/json\"}'',body:=''{\"secret\":\"<EVIDENCE_BACKFILL_SECRET>\",\"limit\":100}'') as r'
  );
end;
$fn$;

-- 12h cron: every 12 hours until July 4 switch fires
-- (already created in prod on 2026-06-22 with real secret via MCP)
-- select cron.schedule(
--   'evidence-screen-12h',
--   '0 */12 * * *',
--   'select net.http_post(...secret=<EVIDENCE_BACKFILL_SECRET>...) as r'
-- );

-- One-time switch job: July 4 2026 00:00 UTC
-- (already created in prod on 2026-06-22 via MCP)
-- select cron.schedule(
--   'evidence-screen-switch-to-48h',
--   '0 0 4 7 *',
--   'select public.evidence_screen_switch_to_48h()'
-- );
