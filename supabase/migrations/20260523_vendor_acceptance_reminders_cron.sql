-- Schedule vendor-acceptance-reminders to run every 15 minutes.
-- Sends escalating reminders when vendors haven't accepted direct assignments:
--   1h → reminder to vendor
--   2h → urgent to vendor + pm@cethoscorp.com
SELECT cron.schedule(
  'vendor-acceptance-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/vendor-acceptance-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
