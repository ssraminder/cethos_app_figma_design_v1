-- Track how many times the invoice payment link was clicked + when last.
-- Helps debug "customer didn't receive link" / "clicked too late" reports.

ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS click_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_clicked_at timestamptz;
