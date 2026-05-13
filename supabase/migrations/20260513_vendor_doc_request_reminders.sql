-- ============================================================================
-- Phase 4 — status sweep + reminder cron for vendor_document_requests
--
-- 1) New columns:
--      reminder_count   int  default 0   how many reminders have been sent
--      last_reminder_at timestamptz      when the most recent reminder went
--      auto_synced_at   timestamptz      last time the sweep re-checked items
--                                        against live vendor state
--
-- 2) Per-item shape gains optional declined_at + decline_reason. No schema
--    change — those are jsonb keys on existing requested_items.
--
-- 3) pg_cron schedules wake the two edge functions:
--      vendor-doc-request-status-sweep  every 15 min — expires stale tokens,
--                                       auto-completes items the vendor
--                                       satisfied outside the flow.
--      vendor-doc-request-reminder      daily 14:00 UTC — re-syncs the list,
--                                       reanalyses, sends tiered reminders.
--
-- Both functions must be deployed --no-verify-jwt to match the existing
-- cron pattern (see vendor-invitation-reminder, review-request crons).
-- ============================================================================

ALTER TABLE public.vendor_document_requests
  ADD COLUMN IF NOT EXISTS reminder_count   int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_synced_at   timestamptz;

-- Idempotent schedule helper — drop if it already exists then re-create.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vendor-doc-request-status-sweep') THEN
    PERFORM cron.unschedule('vendor-doc-request-status-sweep');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vendor-doc-request-reminder') THEN
    PERFORM cron.unschedule('vendor-doc-request-reminder');
  END IF;
END$$;

SELECT cron.schedule(
  'vendor-doc-request-status-sweep',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/vendor-doc-request-status-sweep',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'vendor-doc-request-reminder',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/vendor-doc-request-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

COMMENT ON COLUMN public.vendor_document_requests.reminder_count IS
  'Phase 4 — how many reminder emails have been sent for this request. Drives tiered reminder cadence (day 3, day 7, day 12).';
COMMENT ON COLUMN public.vendor_document_requests.last_reminder_at IS
  'Phase 4 — when the most recent reminder email was dispatched.';
COMMENT ON COLUMN public.vendor_document_requests.auto_synced_at IS
  'Phase 4 — last time the status sweep re-checked requested_items against live vendor state.';
