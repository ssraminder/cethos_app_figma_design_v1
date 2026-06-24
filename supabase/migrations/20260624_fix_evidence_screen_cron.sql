-- Phase 0 / Item 2b — fix the broken evidence-screen catch-all cron.
--
-- The `evidence-screen-12h` cron stored its headers/body as raw TEXT with
-- literal backslash-escaped quotes and no ::jsonb cast, so pg_cron threw
--   ERROR: invalid input syntax for type json ... Token "\" is invalid
-- on EVERY run (failed 3/3) and the HTTP request was never even sent.
--
-- The cvp-evidence-screen-backfill function itself is healthy: on-upload
-- screening (the same screenEvidenceDocument code path) produced 600+
-- ai_document_screen evidence rows in the window the cron was dead, so this
-- only restores the 12h catch-all that sweeps the handful of stragglers whose
-- on-upload screening was skipped/failed (was 9 unscreened at fix time).
--
-- Fix: rebuild the command with proper jsonb via jsonb_build_object, and source
-- the auth secret from Vault (evidence_backfill_secret = the function's
-- EVIDENCE_BACKFILL_SECRET env) rather than hardcoding it in the cron body.
-- Look up by jobname (not a hard-coded jobid) for portability.

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'evidence-screen-12h';
  if jid is null then
    raise notice 'evidence-screen-12h cron job not found; nothing to alter';
  else
    perform cron.alter_job(
      job_id := jid,
      command := $job$ select net.http_post(
        url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/cvp-evidence-screen-backfill',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object(
          'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'evidence_backfill_secret'),
          'limit', 50
        )
      ); $job$
    );
  end if;
end $$;
