-- ============================================================================
-- Migration: Customer default tax rate
-- Date: April 21, 2026
-- Lets admins configure a customer's preferred tax_rate once on the customer
-- profile; new projects for that customer inherit it.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='customers' AND column_name='default_tax_rate_id'
  ) THEN
    ALTER TABLE customers
      ADD COLUMN default_tax_rate_id uuid REFERENCES tax_rates(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_default_tax_rate_id
  ON customers(default_tax_rate_id);
