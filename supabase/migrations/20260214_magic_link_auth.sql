-- ============================================================================
-- CETHOS: Magic Link Authentication Infrastructure
-- Date: February 14, 2026
-- ============================================================================

-- 1. Create customer_sessions table for magic link tokens
CREATE TABLE customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT
);

-- Indexes
CREATE INDEX idx_customer_sessions_token ON customer_sessions(token_hash);
CREATE INDEX idx_customer_sessions_customer ON customer_sessions(customer_id);
CREATE INDEX idx_customer_sessions_expires ON customer_sessions(expires_at);

-- RLS
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (edge functions use supabaseAdmin)
CREATE POLICY "Service role full access" ON customer_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- 2. Add tracking columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS magic_link_sent_at TIMESTAMPTZ;

-- 3. Cleanup: auto-delete expired sessions older than 24 hours (optional cron)
-- This can be scheduled via pg_cron later:
-- DELETE FROM customer_sessions WHERE expires_at < NOW() - INTERVAL '24 hours';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 'customer_sessions' AS table_name, COUNT(*) AS columns
FROM information_schema.columns
WHERE table_name = 'customer_sessions' AND table_schema = 'public';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'customers' AND column_name IN ('last_login_at', 'magic_link_sent_at');
