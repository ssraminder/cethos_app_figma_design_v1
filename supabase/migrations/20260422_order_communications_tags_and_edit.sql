-- ============================================================================
-- Order communications: per-attachment manual tags + edit tracking
-- Date: 2026-04-22
-- ============================================================================

ALTER TABLE order_communication_attachments
  ADD COLUMN IF NOT EXISTS tags text;

COMMENT ON COLUMN order_communication_attachments.tags IS
  'Free-text staff tags describing the file contents (e.g. "change log, source EN, target PA"). Passed to the AI as attachment context.';

ALTER TABLE order_communications
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_edited_by uuid REFERENCES staff_users(id);

COMMENT ON COLUMN order_communications.last_edited_at IS
  'Set whenever staff edits the body/subject/date or attachments after the original creation.';
