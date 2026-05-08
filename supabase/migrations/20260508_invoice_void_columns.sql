-- ============================================================================
-- Migration: invoice void columns on customer_invoices + vendor_payables
-- Date: 2026-05-08
-- Applied directly to prod via MCP apply_migration on 2026-05-08; this file
-- is committed for the record so future environments stay in sync.
-- ============================================================================

-- customer_invoices already has voided_at + reference_invoice_id. Adding the
-- audit columns + a forward link so the voided invoice can point at its
-- replacement (the new invoice, when re-issued, points back via
-- reference_invoice_id, completing the bidirectional reference).
ALTER TABLE customer_invoices
  ADD COLUMN IF NOT EXISTS voided_by_staff_id uuid REFERENCES staff_users(id),
  ADD COLUMN IF NOT EXISTS void_reason_code text,
  ADD COLUMN IF NOT EXISTS void_reason_notes text,
  ADD COLUMN IF NOT EXISTS replaced_by_invoice_id uuid REFERENCES customer_invoices(id);

ALTER TABLE customer_invoices
  DROP CONSTRAINT IF EXISTS customer_invoices_void_reason_code_check;
ALTER TABLE customer_invoices
  ADD CONSTRAINT customer_invoices_void_reason_code_check
  CHECK (void_reason_code IS NULL OR void_reason_code IN (
    'pricing_correction',
    'cancelled_order',
    'customer_request',
    'billing_error',
    'duplicate',
    'other'
  ));

-- Vendor side: vendor_payables stores the vendor invoice. Same void/audit
-- columns so the same flow works on the vendor portal.
ALTER TABLE vendor_payables
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by_staff_id uuid REFERENCES staff_users(id),
  ADD COLUMN IF NOT EXISTS void_reason_code text,
  ADD COLUMN IF NOT EXISTS void_reason_notes text,
  ADD COLUMN IF NOT EXISTS replaced_by_payable_id uuid REFERENCES vendor_payables(id),
  ADD COLUMN IF NOT EXISTS reference_payable_id uuid REFERENCES vendor_payables(id);

ALTER TABLE vendor_payables
  DROP CONSTRAINT IF EXISTS vendor_payables_void_reason_code_check;
ALTER TABLE vendor_payables
  ADD CONSTRAINT vendor_payables_void_reason_code_check
  CHECK (void_reason_code IS NULL OR void_reason_code IN (
    'pricing_correction',
    'cancelled_step',
    'vendor_request',
    'billing_error',
    'duplicate',
    'other'
  ));

CREATE INDEX IF NOT EXISTS customer_invoices_voided_at_idx
  ON customer_invoices (voided_at)
  WHERE voided_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendor_payables_voided_at_idx
  ON vendor_payables (voided_at)
  WHERE voided_at IS NOT NULL;

COMMENT ON COLUMN customer_invoices.replaced_by_invoice_id IS
  'When this invoice is voided and a replacement issued, points to the new invoice. The new invoice in turn sets reference_invoice_id pointing back here.';
COMMENT ON COLUMN vendor_payables.replaced_by_payable_id IS
  'Vendor-side mirror of customer_invoices.replaced_by_invoice_id.';
