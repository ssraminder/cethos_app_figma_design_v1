-- Mirror pricing_mode onto order_workflow_steps so the assigned/accepted
-- step row carries the same flag as the offer it came from.
ALTER TABLE order_workflow_steps
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'per_unit'
  CHECK (pricing_mode IN ('per_unit', 'target'));
