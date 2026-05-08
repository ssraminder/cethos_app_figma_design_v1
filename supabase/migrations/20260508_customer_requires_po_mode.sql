-- ============================================================================
-- Migration: customers.requires_po_mode (3-state) + drop unused
-- vendor_manager_* columns
-- Date: 2026-05-08
-- Applied directly to prod via MCP apply_migration; this file is committed
-- so future environments stay in sync.
-- ============================================================================

ALTER TABLE customers
  DROP COLUMN IF EXISTS vendor_manager_name,
  DROP COLUMN IF EXISTS vendor_manager_email,
  DROP COLUMN IF EXISTS vendor_manager_phone;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS requires_po_mode text;

UPDATE customers
SET requires_po_mode = CASE
  WHEN requires_po IS TRUE THEN 'required_upfront'
  ELSE 'not_required'
END
WHERE requires_po_mode IS NULL;

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_requires_po_mode_check;
ALTER TABLE customers
  ADD CONSTRAINT customers_requires_po_mode_check
  CHECK (requires_po_mode IS NULL OR requires_po_mode IN (
    'not_required',
    'required_upfront',
    'pending_acceptable'
  ));

ALTER TABLE customers
  ALTER COLUMN requires_po_mode SET DEFAULT 'not_required';

CREATE INDEX IF NOT EXISTS customers_requires_po_mode_idx
  ON customers (requires_po_mode);

COMMENT ON COLUMN customers.requires_po_mode IS
  'PO requirement state. not_required = optional. required_upfront = blocks order creation without PO. pending_acceptable = order can be created without PO, but invoice issuing is blocked until po_number fills in.';
