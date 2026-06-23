-- Vendor Communication: send-from-vm@ email thread on the vendor profile.
-- Applied to prod via MCP, then committed (repo mirrors prod).
-- Reuses the recruitment threading tables, scoped by vendor_id.

ALTER TABLE cvp_outbound_messages ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id);
ALTER TABLE cvp_inbound_emails ADD COLUMN IF NOT EXISTS matched_vendor_id uuid REFERENCES vendors(id);

CREATE INDEX IF NOT EXISTS idx_cvp_outbound_vendor ON cvp_outbound_messages(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cvp_inbound_vendor ON cvp_inbound_emails(matched_vendor_id) WHERE matched_vendor_id IS NOT NULL;

-- Widen inbound CHECKs for Phase-1 vendor-communication capture.
ALTER TABLE cvp_inbound_emails DROP CONSTRAINT IF EXISTS cvp_inbound_emails_action_taken_check;
ALTER TABLE cvp_inbound_emails ADD CONSTRAINT cvp_inbound_emails_action_taken_check
  CHECK (action_taken IS NULL OR action_taken = ANY (ARRAY[
    'do_not_contact_set','auto_reply_sent','auto_reply_failed','noop','threaded_received',
    'upload_redirect_sent','auto_triaged','frontdesk_replied','frontdesk_escalated',
    'frontdesk_dropped','qa_relayed','qa_capture_failed','vendor_reply_captured']));

ALTER TABLE cvp_inbound_emails DROP CONSTRAINT IF EXISTS cvp_inbound_emails_classified_intent_check;
ALTER TABLE cvp_inbound_emails ADD CONSTRAINT cvp_inbound_emails_classified_intent_check
  CHECK (classified_intent IS NULL OR classified_intent = ANY (ARRAY[
    'unsubscribe','other','unmatched','error','reply_to_outbound','document_submission',
    'staff_qa_reply','vendor_communication']));
