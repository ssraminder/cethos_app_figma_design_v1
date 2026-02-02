-- ============================================================================
-- CETHOS: Balance Resolution Columns for Orders
-- Phase 3C: Support for balance payment requests and refunds
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add Balance Payment Request Columns to Orders
-- ----------------------------------------------------------------------------
-- These columns track when a balance payment has been requested via Stripe

ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_payment_link TEXT;
COMMENT ON COLUMN orders.balance_payment_link IS 'Stripe Checkout session URL for balance payment requests';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_payment_session_id VARCHAR(255);
COMMENT ON COLUMN orders.balance_payment_session_id IS 'Stripe Checkout session ID for balance payment tracking';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_payment_requested_at TIMESTAMPTZ;
COMMENT ON COLUMN orders.balance_payment_requested_at IS 'When the balance payment request was sent to customer';

-- ----------------------------------------------------------------------------
-- 2. Add Refund Tracking Columns to Orders
-- ----------------------------------------------------------------------------
-- These columns track refunds processed for overpayments

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) DEFAULT 0;
COMMENT ON COLUMN orders.refund_amount IS 'Total amount refunded to customer';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status VARCHAR(50);
COMMENT ON COLUMN orders.refund_status IS 'Status of refund: pending, processing, completed, failed';

-- ----------------------------------------------------------------------------
-- 3. Add Overpayment Credit Column
-- ----------------------------------------------------------------------------
-- Tracks when overpayment is recorded as customer credit instead of refund

ALTER TABLE orders ADD COLUMN IF NOT EXISTS overpayment_credit DECIMAL(10,2) DEFAULT 0;
COMMENT ON COLUMN orders.overpayment_credit IS 'Amount credited to customer instead of refunded';

-- ----------------------------------------------------------------------------
-- 4. Create Indexes for Common Queries
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_balance_payment_session
  ON orders(balance_payment_session_id)
  WHERE balance_payment_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_refund_status
  ON orders(refund_status)
  WHERE refund_status IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. Ensure adjustments table exists with proper structure
-- ----------------------------------------------------------------------------
-- This table should already exist from previous migrations, but we add
-- the additional adjustment types needed for balance resolution

DO $$
BEGIN
  -- Check if adjustments table exists
  IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'adjustments') THEN
    CREATE TABLE adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      adjustment_type VARCHAR(50) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      reason TEXT NOT NULL,
      internal_notes TEXT,
      status VARCHAR(50) DEFAULT 'applied',
      created_by UUID REFERENCES staff_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_adjustments_order_id ON adjustments(order_id);
    CREATE INDEX idx_adjustments_type ON adjustments(adjustment_type);

    -- Enable RLS
    ALTER TABLE adjustments ENABLE ROW LEVEL SECURITY;

    -- Allow staff to view adjustments
    CREATE POLICY "Allow staff to view adjustments" ON adjustments
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM staff_users
          WHERE auth_user_id = auth.uid()
        )
      );

    -- Allow staff to create adjustments
    CREATE POLICY "Allow staff to create adjustments" ON adjustments
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM staff_users
          WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Document adjustment types used for balance resolution
-- ----------------------------------------------------------------------------
COMMENT ON TABLE adjustments IS 'Order adjustments including corrections, refunds, discounts, and credits';

/*
Adjustment types used in Phase 3C Balance Resolution:
- correction_increase: Order total increased (Phase 3B)
- correction_decrease: Order total decreased (Phase 3B)
- refund: Refund processed to customer (overpayment)
- offset_discount: Discount applied to waive underpayment
- offset_credit: Overpayment recorded as customer credit
*/

-- ----------------------------------------------------------------------------
-- 7. Grant Permissions
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT ON adjustments TO authenticated;
