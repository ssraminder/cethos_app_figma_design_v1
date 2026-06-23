-- ============================================================================
-- Public submission route: reliable/optional AV scan + automatic quote creation
-- ============================================================================
--
-- Context: the public /secure-upload route was frozen on antivirus. Files land
-- as scan_pending and are scanned by `scan-public-submission` via VirusTotal
-- (free tier, 2 files/run, self-reinvoking). On large (25-file) uploads the
-- self-reinvocation chain dies partway and the submission is stuck on
-- scan_pending forever — downloads locked AND quote conversion 409-blocked.
-- Separately, conversion to a quote was a manual admin button that was almost
-- never clicked (1 of 28 submissions ever converted).
--
-- This migration:
--   1. Adds a `scan_skipped` status (honest "not scanned" state) so the AV scan
--      can be turned off without faking a clean verdict.
--   2. Adds the `public_submission_av_scan` kill-switch (default OFF per request;
--      code fails safe to ON when the row is absent).
--   3. Schedules a 1-minute sweeper cron that re-kicks any submission stuck in
--      scan_pending, so scanning is reliable whenever it is switched back on.
-- ============================================================================

-- 1) Widen the scan_status CHECK constraints to allow 'scan_skipped'.
--    Widening a CHECK never invalidates existing rows. Applied to both tables
--    that share the scanner's status vocabulary.
ALTER TABLE public.public_submissions
  DROP CONSTRAINT IF EXISTS public_submissions_scan_status_check;
ALTER TABLE public.public_submissions
  ADD CONSTRAINT public_submissions_scan_status_check
  CHECK (scan_status IN ('scan_pending','scan_clean','scan_infected','scan_error','scan_skipped'));

ALTER TABLE public.customer_files
  DROP CONSTRAINT IF EXISTS customer_files_scan_status_check;
ALTER TABLE public.customer_files
  ADD CONSTRAINT customer_files_scan_status_check
  CHECK (scan_status IN ('scan_pending','scan_clean','scan_infected','scan_error','scan_skipped'));

-- 2) Kill-switch. Stored as a boolean-as-string to mirror call_intelligence_enabled.
--    Default OFF per the operational decision (the scan was stalling the route);
--    re-enable by setting this to 'true'. Edge functions fail safe to scanning
--    ON when this row is absent.
INSERT INTO public.app_settings (setting_key, setting_value, setting_type, description)
VALUES (
  'public_submission_av_scan',
  'false',
  'string',
  'When true, files uploaded via the public /secure-upload route are VirusTotal-scanned before they are downloadable / converted to a quote. When false, files are marked scan_skipped (not scanned, not claimed clean) and the submission converts to a quote immediately. Default off — disabled 2026-06-23 because the free-tier scanner was stalling large submissions. Re-enable once a reliable scanning quota is in place.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 3) Sweeper cron — reliability net for when the scan is ON. Re-kicks any
--    submission still in scan_pending so a dead self-reinvocation chain always
--    resumes within a minute. The function itself no-ops the sweep when the
--    AV kill-switch is off, so this is inert while scanning is disabled.
--    scan-public-submission is deployed --no-verify-jwt, so no auth header is
--    needed (mirrors check-missed-deadlines / expire-stale-offers).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scan-public-submission-sweep') THEN
    PERFORM cron.unschedule('scan-public-submission-sweep');
  END IF;
END $$;

SELECT cron.schedule(
  'scan-public-submission-sweep',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/scan-public-submission',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"kind":"sweep"}'::jsonb
  );
  $$
);
