-- ============================================================================
-- Test/quiz CHOOSER reminder system (cvp-send-choice-reminders) — 2026-06-23
--
-- Reminds applicants who were sent the chooser invitation but haven't yet
-- picked test or quiz (instrument_choice IS NULL). Each reminder regenerates the
-- choice token (fresh /choose link) and retires the old one. Daily per person,
-- capped (default 6), back-translators excluded by the fn's deliverability guard.
-- ============================================================================

-- Reminder tracking columns
ALTER TABLE public.cvp_applications
  ADD COLUMN IF NOT EXISTS instrument_choice_reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS instrument_choice_last_reminder_at timestamptz;

COMMENT ON COLUMN public.cvp_applications.instrument_choice_reminder_count IS
  'Number of chooser reminders sent (cvp-send-choice-reminders). Capped (default 6).';
COMMENT ON COLUMN public.cvp_applications.instrument_choice_last_reminder_at IS
  'Timestamp of the last chooser reminder; throttles the daily cron (>= ~24h apart).';

-- Kill-switch (fail-closed in the fn). Enabled = reminders actually send.
INSERT INTO public.cvp_system_config (key, value)
VALUES ('choice_reminders_enabled', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Sweep cron: every 3h; the fn's 24h per-person throttle keeps it to ~1/day.
-- Scoped to the COA / life-sciences / pharma / medical cohort.
SELECT cron.schedule(
  'cvp-choice-reminders',
  '0 */3 * * *',
  $cron$SELECT net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/cvp-send-choice-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"limit":50,"domains":["coa_linguistic_validation","life_sciences","pharmaceutical","medical"]}'::jsonb
  );$cron$
);

-- To pause instantly:  UPDATE public.cvp_system_config SET value='{"enabled": false}' WHERE key='choice_reminders_enabled';
-- To unschedule:       SELECT cron.unschedule('cvp-choice-reminders');
