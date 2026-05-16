-- =====================================================================
-- Audit finding H-5: each cron job now sends the shared secret in the
-- `x-cron-secret` header so the edge function can verify it.
--
-- The pattern: pg_cron reads `cron_shared_secret` from
-- vault.decrypted_secrets on every fire (so secret rotation is just
-- an UPDATE in vault — no cron job changes needed).
--
-- Idempotent — uses cron.alter_job to update each schedule's command.
-- Each job listed below was identified in the H-5 scope. Cron jobs
-- whose edge functions weren't updated to require the secret are
-- left unchanged.
-- =====================================================================

DO $$
DECLARE
  rec record;
  job_url text;
  new_cmd text;
  jobs_to_update text[] := ARRAY[
    'cvp-send-queued-rejections-hourly',
    'cvp-check-test-followups-hourly',
    'cvp-check-grading-followups',
    'cvp-daily-recruitment-status',
    'cvp-drain-test-library',
    'cvp-process-feedback-auto-send',
    'cvp-tms-migration-send',
    'negotiation-hitl-reminder-hourly',
    'vendor-activation-email-cron',
    'vendor-activation-status-email',
    'vendor-doc-request-status-sweep',
    'vendor-doc-request-reminder'
  ];
BEGIN
  FOR rec IN
    SELECT jobid, jobname, schedule, command
      FROM cron.job
     WHERE jobname = ANY(jobs_to_update)
  LOOP
    -- Extract URL from the existing command. Robust enough for the
    -- standard `net.http_post(url := '...', ...)` shape we use.
    job_url := (regexp_match(rec.command, $re$url\s*:?=?\s*'([^']+)'$re$))[1];
    IF job_url IS NULL THEN
      RAISE NOTICE 'skip %, cannot parse URL', rec.jobname;
      CONTINUE;
    END IF;

    new_cmd := format(
      $cmd$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
        ),
        body := '{}'::jsonb
      );
      $cmd$,
      job_url
    );

    PERFORM cron.alter_job(
      job_id  => rec.jobid,
      command => new_cmd
    );
    RAISE NOTICE 'updated job % (id %)', rec.jobname, rec.jobid;
  END LOOP;
END $$;
