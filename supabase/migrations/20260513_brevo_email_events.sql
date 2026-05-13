-- ============================================================================
-- 20260513_brevo_email_events.sql
--
-- Receives webhook events from Brevo for every transactional email we send
-- (delivered, opened, clicked, bounced, spam, etc). Joins back to our local
-- notification_log via brevo_message_id so the admin UI can show the full
-- lifecycle per email.
-- ============================================================================

CREATE TABLE IF NOT EXISTS brevo_email_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brevo_message_id    TEXT NOT NULL,        -- matches notification_log.metadata->>'brevo_message_id'
  brevo_id            BIGINT,               -- Brevo's internal numeric id when present
  event               TEXT NOT NULL,        -- delivered | opened | click | hard_bounce | soft_bounce | ...
  recipient_email     TEXT NOT NULL,
  subject             TEXT,
  reason              TEXT,                 -- bounce/blocked reason
  link                TEXT,                 -- click target, when event=click
  tag                 TEXT,                 -- single-tag convenience (full tags in raw_payload)
  event_ts            TIMESTAMPTZ NOT NULL, -- timestamp from Brevo
  raw_payload         JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (message_id, event, event_ts) — guards against Brevo retries.
CREATE UNIQUE INDEX IF NOT EXISTS uq_brevo_event_msg_event_ts
  ON brevo_email_events (brevo_message_id, event, event_ts);

CREATE INDEX IF NOT EXISTS idx_brevo_event_email_ts
  ON brevo_email_events (recipient_email, event_ts DESC);

CREATE INDEX IF NOT EXISTS idx_brevo_event_msg
  ON brevo_email_events (brevo_message_id);

COMMENT ON TABLE brevo_email_events IS
  'Brevo webhook events (delivered/opened/click/bounce/etc). Match brevo_message_id back to notification_log.metadata->>''brevo_message_id'' to reconstruct full per-email lifecycle.';
