-- AI front-desk for the vendor-management inbox (cvp-inbound-email).
-- Phase 1: handle ALL inbound (not just threaded replies) — cold CV/interest
-- emails, questions, etc. — replying to what it can and forwarding the rest to a
-- human (escalation_email). New action_taken outcomes + a toggle (default OFF)
-- with the escalation mailbox in config. Applied to prod via MCP 2026-06-20.

ALTER TABLE public.cvp_inbound_emails
  DROP CONSTRAINT IF EXISTS cvp_inbound_emails_action_taken_check;
ALTER TABLE public.cvp_inbound_emails
  ADD CONSTRAINT cvp_inbound_emails_action_taken_check
  CHECK (
    action_taken IS NULL OR action_taken = ANY (ARRAY[
      'do_not_contact_set','auto_reply_sent','auto_reply_failed','noop',
      'threaded_received','upload_redirect_sent','auto_triaged',
      'frontdesk_replied','frontdesk_escalated','frontdesk_dropped'
    ])
  );

INSERT INTO public.cvp_system_config (key, value)
VALUES ('inbound_frontdesk', '{"enabled": false, "escalation_email": "office@cethos.com"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
