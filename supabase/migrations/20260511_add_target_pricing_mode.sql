-- Target-based pricing for client (order_receivables) and vendor (vendor_step_offers)
-- lines: 'per_unit' (default) → quantity × rate; 'target' → flat amount, no real
-- wordcount/rate needed (avoids the dummy-rate workaround).

ALTER TABLE order_receivables
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'per_unit'
  CHECK (pricing_mode IN ('per_unit', 'target'));

ALTER TABLE vendor_step_offers
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'per_unit'
  CHECK (pricing_mode IN ('per_unit', 'target'));
