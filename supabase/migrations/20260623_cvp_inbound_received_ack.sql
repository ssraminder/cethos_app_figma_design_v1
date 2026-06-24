-- "We received your request" autoresponder for inbound that is NOT auto-resolved
-- (threaded replies left as NEEDS REVIEW + vendor-communication replies).
-- A dedicated timestamp records the ack WITHOUT touching action_taken (keeps
-- NEEDS REVIEW intact) or acknowledged_at (keeps the staff "needs attention"
-- highlight intact). No CHECK widening needed. Also the dedup key.
-- Applied to prod via MCP on 2026-06-23; file committed so the repo reflects prod.

ALTER TABLE public.cvp_inbound_emails
  ADD COLUMN IF NOT EXISTS received_ack_sent_at timestamptz;

-- Kill-switch, default OFF (fail-closed). Flip to {"enabled": true} after verify.
INSERT INTO public.cvp_system_config (key, value, description)
VALUES (
  'inbound_received_ack',
  '{"enabled": false}'::jsonb,
  'Autoresponder: send a "we received your request" holding ack to senders whose inbound is not auto-resolved (threaded_received applicant replies + vendor_reply_captured). Default OFF.'
)
ON CONFLICT (key) DO NOTHING;
