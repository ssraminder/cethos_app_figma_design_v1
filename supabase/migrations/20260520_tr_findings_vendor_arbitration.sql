-- LQA-style finding arbitration: the translator opening the share link
-- can Accept (must upload a new version of the file with the change applied)
-- or Deny (must give a reason). Tracks the decision per-finding so the
-- reviewer can see, on the admin page, exactly which findings the
-- translator agreed with vs disputed.
--
-- Stays separate from existing application_status (which tracks whether
-- Cethos applied the change in the .docx output) so the two states don't
-- interfere — application_status is internal, vendor_decision is the
-- translator's response.

ALTER TABLE tr.findings
  ADD COLUMN IF NOT EXISTS vendor_decision text
    CHECK (vendor_decision IN ('accepted', 'rejected')),
  ADD COLUMN IF NOT EXISTS vendor_decision_reason text,
  ADD COLUMN IF NOT EXISTS vendor_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_decision_via_token_id uuid,
  ADD COLUMN IF NOT EXISTS vendor_decision_by_email text,
  ADD COLUMN IF NOT EXISTS vendor_uploaded_file_id uuid REFERENCES tr.job_files(id);

CREATE INDEX IF NOT EXISTS findings_job_vendor_decision_idx
  ON tr.findings(job_id, vendor_decision);

NOTIFY pgrst, 'reload schema';
