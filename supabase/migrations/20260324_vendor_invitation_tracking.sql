-- ============================================================================
-- CETHOS: Vendor Invitation Tracking
-- Date: March 24, 2026
-- Note: vendor_auth and vendor_sessions tables already exist.
-- This migration adds invitation tracking columns to vendors
-- and schedules a pg_cron job for automated reminders.
-- ============================================================================

-- Invitation tracking columns on vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS invitation_reminder_count INTEGER DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMPTZ;

-- Index for the reminder cron query
CREATE INDEX IF NOT EXISTS idx_vendors_invitation_pending
  ON vendors (invitation_sent_at)
  WHERE invitation_sent_at IS NOT NULL AND auth_user_id IS NULL;

-- Schedule daily reminder cron at 10 AM UTC via pg_cron + pg_net
-- Graduated schedule: day 3, 7, 15, 21, 30, then monthly
SELECT cron.schedule(
  'vendor-invitation-reminder',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/vendor-invitation-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
