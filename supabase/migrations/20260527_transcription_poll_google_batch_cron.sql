-- Schedule the Google STT batchRecognize poller to run every 30 seconds.
-- Picks up transcription_jobs where provider='google' AND status='processing'
-- AND provider_async_operation_name IS NOT NULL, polls the LRO, and when done
-- writes the transcript + triggers downstream chain.
--
-- Sends the shared cron secret in x-cron-secret header (audit finding H-5
-- pattern). Idempotent — unschedules any prior job with the same name first.

DO $$
DECLARE
  v_secret text;
BEGIN
  -- Drop any pre-existing schedule with this name
  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname = 'transcription-poll-google-batch';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'transcription-poll-google-batch',
  '30 seconds',
  $$
  SELECT net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/transcription-poll-google-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
