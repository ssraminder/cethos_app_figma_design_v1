-- ============================================================
-- quote_activity_log — Tracks all staff actions on a quote
-- ============================================================
CREATE TABLE quote_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_users(id),
  action_type TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_activity_log_quote_id ON quote_activity_log(quote_id);
CREATE INDEX idx_quote_activity_log_created_at ON quote_activity_log(created_at);

-- Enable RLS
ALTER TABLE quote_activity_log ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: Restrict to staff only (not all authenticated users)
CREATE POLICY "Staff can read quote activity logs"
  ON quote_activity_log FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM staff_users WHERE is_active = true)
  );

CREATE POLICY "Staff can insert quote activity logs"
  ON quote_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM staff_users WHERE is_active = true)
  );

-- Service role bypass for edge functions
CREATE POLICY "Service role full access to quote activity logs"
  ON quote_activity_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
