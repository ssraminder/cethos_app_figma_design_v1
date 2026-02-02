-- Migration: Create ar_payments table for tracking AR invoice payments
-- Date: 2026-02-02

-- Create ar_payments table
CREATE TABLE IF NOT EXISTS ar_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ar_id UUID NOT NULL REFERENCES accounts_receivable(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method_id UUID REFERENCES payment_methods(id),
  payment_method_code VARCHAR(50),
  payment_method_name VARCHAR(100),
  payment_date DATE NOT NULL,
  reference_number VARCHAR(255),
  notes TEXT,
  recorded_by UUID REFERENCES staff_users(id),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ar_payments_ar_id ON ar_payments(ar_id);
CREATE INDEX IF NOT EXISTS idx_ar_payments_recorded_by ON ar_payments(recorded_by);
CREATE INDEX IF NOT EXISTS idx_ar_payments_payment_date ON ar_payments(payment_date);

-- Enable Row Level Security
ALTER TABLE ar_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow authenticated users to select
DROP POLICY IF EXISTS "ar_payments_select" ON ar_payments;
CREATE POLICY "ar_payments_select" ON ar_payments FOR SELECT USING (true);

-- RLS Policies - Allow authenticated users to insert
DROP POLICY IF EXISTS "ar_payments_insert" ON ar_payments;
CREATE POLICY "ar_payments_insert" ON ar_payments FOR INSERT WITH CHECK (true);

-- Add columns to accounts_receivable if they don't exist
-- (original_amount and amount_paid columns for tracking payments)
DO $$
BEGIN
  -- Add original_amount column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts_receivable' AND column_name = 'original_amount'
  ) THEN
    ALTER TABLE accounts_receivable ADD COLUMN original_amount DECIMAL(10, 2);
    -- Initialize original_amount from amount_due for existing records
    UPDATE accounts_receivable SET original_amount = amount_due WHERE original_amount IS NULL;
  END IF;

  -- Add amount_paid column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts_receivable' AND column_name = 'amount_paid'
  ) THEN
    ALTER TABLE accounts_receivable ADD COLUMN amount_paid DECIMAL(10, 2) DEFAULT 0;
  END IF;

  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts_receivable' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE accounts_receivable ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE ar_payments IS 'Records manual payments made against AR invoices';
COMMENT ON COLUMN ar_payments.ar_id IS 'Reference to the accounts_receivable record';
COMMENT ON COLUMN ar_payments.amount IS 'Payment amount';
COMMENT ON COLUMN ar_payments.payment_method_id IS 'Reference to payment_methods table';
COMMENT ON COLUMN ar_payments.payment_method_code IS 'Payment method code (e.g., cash, cheque, e_transfer)';
COMMENT ON COLUMN ar_payments.payment_method_name IS 'Payment method display name';
COMMENT ON COLUMN ar_payments.payment_date IS 'Date the payment was received';
COMMENT ON COLUMN ar_payments.reference_number IS 'External reference (cheque number, transaction ID, etc.)';
COMMENT ON COLUMN ar_payments.notes IS 'Optional notes about the payment';
COMMENT ON COLUMN ar_payments.recorded_by IS 'Staff member who recorded the payment';
COMMENT ON COLUMN ar_payments.recorded_at IS 'Timestamp when payment was recorded in system';
