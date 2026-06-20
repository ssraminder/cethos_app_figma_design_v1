-- Widen cvp_inbound_emails CHECK constraints to record the new
-- "applicant emailed documents -> auto-redirected to portal upload" outcome.
-- Widening an allowed-value set is non-breaking (existing rows still satisfy it).
--
-- Paired with cvp-inbound-email change: inbound recruitment emails that carry
-- document attachments now receive an auto-reply directing the sender to upload
-- via the portal (Profile > Supporting Documents) instead of emailing files.
-- Applied to prod via MCP on 2026-06-20; file committed so the repo reflects prod.

ALTER TABLE public.cvp_inbound_emails
  DROP CONSTRAINT IF EXISTS cvp_inbound_emails_action_taken_check;
ALTER TABLE public.cvp_inbound_emails
  ADD CONSTRAINT cvp_inbound_emails_action_taken_check
  CHECK (
    action_taken IS NULL OR action_taken = ANY (ARRAY[
      'do_not_contact_set','auto_reply_sent','auto_reply_failed','noop',
      'threaded_received','upload_redirect_sent'
    ])
  );

ALTER TABLE public.cvp_inbound_emails
  DROP CONSTRAINT IF EXISTS cvp_inbound_emails_classified_intent_check;
ALTER TABLE public.cvp_inbound_emails
  ADD CONSTRAINT cvp_inbound_emails_classified_intent_check
  CHECK (
    classified_intent IS NULL OR classified_intent = ANY (ARRAY[
      'unsubscribe','other','unmatched','error','reply_to_outbound',
      'document_submission'
    ])
  );
