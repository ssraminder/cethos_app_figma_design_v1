-- Phase 2: track the COL + experience modifiers used so the ISO auditor
-- can reproduce any historical suggestion exactly.
ALTER TABLE vendor_rate_suggestions
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS col_bucket TEXT,
  ADD COLUMN IF NOT EXISTS col_multiplier NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS years_experience INT,
  ADD COLUMN IF NOT EXISTS experience_multiplier NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS ai_reasoning_source TEXT;
