-- Drop the unused brevo_email_events table.
--
-- It was added in an earlier (now reverted) attempt to ingest Brevo
-- webhooks. The admin email log uses get-brevo-email-events instead,
-- which proxies Brevo's /v3/smtp/statistics/events API in real time —
-- no local cache, no webhook config required.
DROP TABLE IF EXISTS brevo_email_events;
