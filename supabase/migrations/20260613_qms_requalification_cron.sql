-- Monthly §3.1.8 maintenance: 06:10 UTC on the 1st. Idempotent re-schedule.
SELECT cron.unschedule('qms-requalification-maintenance')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'qms-requalification-maintenance');

SELECT cron.schedule(
  'qms-requalification-maintenance',
  '10 6 1 * *',
  $$SELECT public.qms_run_requalification_maintenance(60);$$
);
