-- =====================================================================
-- Fix: vendor-activation-email-cron was firing every 15 min but
-- returning 401, so 0 emails sent since 2026-05-14 05:00 UTC (counter
-- stuck at 380, ~1067 eligible vendors backlogged).
--
-- Root cause: apply_vendor_activation_email_schedule() (from the
-- 2026-05-13 migration) hard-codes a cron command WITHOUT the
-- `x-cron-secret` header, but vendor-activation-email-cron's
-- requireCronSecret() check rejects requests without it. Every admin
-- toggle of the schedule rewrote the cron with the broken command,
-- silently undoing the 20260515_cron_schedules_send_secret_header.sql
-- patch.
--
-- Two-part fix:
--  1) Patch the function so future re-schedules include the secret
--  2) Re-apply the live cron command now (alter_job)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_vendor_activation_email_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_row public.vendor_activation_email_schedule%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM public.vendor_activation_email_schedule WHERE id = 1;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vendor-activation-email-cron') THEN
    PERFORM cron.unschedule('vendor-activation-email-cron');
  END IF;

  IF current_row.enabled THEN
    PERFORM cron.schedule(
      'vendor-activation-email-cron',
      current_row.cron_expression,
      $cron$
        SELECT net.http_post(
          url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/vendor-activation-email-cron',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END;
$$;

-- Re-apply now so the live cron stops 401'ing.
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'vendor-activation-email-cron';
  IF jid IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id  => jid,
      command => $cmd$
        SELECT net.http_post(
          url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/vendor-activation-email-cron',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
          ),
          body := '{}'::jsonb
        );
      $cmd$
    );
  END IF;
END $$;
