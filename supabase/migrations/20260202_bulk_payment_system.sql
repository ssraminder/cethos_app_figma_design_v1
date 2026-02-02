-- ============================================================================
-- CETHOS BULK PAYMENT SYSTEM - SCHEMA
-- Supports: Bulk payments, paystub upload, over/under payment handling, refunds
-- ============================================================================

-- ============================================
-- 1. Customer Credit Balance
-- ============================================
DO $$
BEGIN
  -- Add credit_balance column to customers if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'credit_balance'
  ) THEN
    ALTER TABLE customers ADD COLUMN credit_balance DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Customer Credit Log - tracks all credit additions and usages
CREATE TABLE IF NOT EXISTS customer_credit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('credit_added', 'credit_used', 'credit_expired', 'credit_refunded')),
  source VARCHAR(50), -- 'overpayment', 'refund', 'promo', 'manual', 'order_applied'
  payment_id UUID, -- Reference to payment that created the credit
  order_id UUID REFERENCES orders(id),
  invoice_id UUID REFERENCES customer_invoices(id),
  notes TEXT,
  created_by_staff_id UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_credit_log_customer ON customer_credit_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_log_type ON customer_credit_log(type);
CREATE INDEX IF NOT EXISTS idx_customer_credit_log_created_at ON customer_credit_log(created_at);

ALTER TABLE customer_credit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_credit_log_select" ON customer_credit_log FOR SELECT USING (true);
CREATE POLICY "customer_credit_log_insert" ON customer_credit_log FOR INSERT WITH CHECK (true);

COMMENT ON TABLE customer_credit_log IS 'Tracks all customer credit balance changes';

-- ============================================
-- 2. Customer Payments Table (for bulk payments)
-- ============================================
CREATE TABLE IF NOT EXISTS customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Payment details
  amount DECIMAL(10,2) NOT NULL,
  payment_method_id UUID REFERENCES payment_methods(id),
  payment_method_code VARCHAR(50),
  payment_method_name VARCHAR(100),
  payment_date DATE NOT NULL,
  reference_number VARCHAR(255),
  notes TEXT,

  -- Staff tracking
  confirmed_by_staff_id UUID REFERENCES staff_users(id),
  confirmed_at TIMESTAMPTZ,

  -- AI/Paystub tracking
  ai_allocated BOOLEAN DEFAULT FALSE,
  ai_confidence DECIMAL(3,2),
  paystub_filename TEXT,
  paystub_storage_path TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_date ON customer_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_customer_payments_status ON customer_payments(status);

ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_payments_select" ON customer_payments FOR SELECT USING (true);
CREATE POLICY "customer_payments_insert" ON customer_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "customer_payments_update" ON customer_payments FOR UPDATE USING (true);

COMMENT ON TABLE customer_payments IS 'Records customer payments that can be allocated across multiple invoices';

-- ============================================
-- 3. Customer Payment Allocations (links payments to invoices)
-- ============================================
CREATE TABLE IF NOT EXISTS customer_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES customer_payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES customer_invoices(id) ON DELETE CASCADE,
  allocated_amount DECIMAL(10,2) NOT NULL,
  is_ai_matched BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT positive_allocation CHECK (allocated_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON customer_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON customer_payment_allocations(invoice_id);

ALTER TABLE customer_payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_allocations_select" ON customer_payment_allocations FOR SELECT USING (true);
CREATE POLICY "payment_allocations_insert" ON customer_payment_allocations FOR INSERT WITH CHECK (true);

COMMENT ON TABLE customer_payment_allocations IS 'Links payments to invoices for allocation tracking';

-- ============================================
-- 4. Invoice Adjustments (discounts and surcharges on invoices)
-- ============================================
CREATE TABLE IF NOT EXISTS invoice_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES customer_invoices(id) ON DELETE CASCADE,
  adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('discount', 'surcharge', 'write_off')),
  amount DECIMAL(10,2) NOT NULL, -- negative for discount, positive for surcharge
  reason TEXT,
  payment_id UUID REFERENCES customer_payments(id),
  created_by_staff_id UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_invoice ON invoice_adjustments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_type ON invoice_adjustments(adjustment_type);

ALTER TABLE invoice_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_adjustments_select" ON invoice_adjustments FOR SELECT USING (true);
CREATE POLICY "invoice_adjustments_insert" ON invoice_adjustments FOR INSERT WITH CHECK (true);

COMMENT ON TABLE invoice_adjustments IS 'Tracks discounts and surcharges applied to invoices';

-- ============================================
-- 5. Payment Requests (Stripe payment links for shortfalls)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  invoice_id UUID REFERENCES customer_invoices(id),
  original_payment_id UUID REFERENCES customer_payments(id),

  -- Request details
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(100), -- 'shortfall', 'order_edit', 'balance_due'

  -- Stripe
  stripe_payment_link_id VARCHAR(100),
  stripe_payment_link_url TEXT,
  stripe_payment_intent_id VARCHAR(100),

  -- Expiry
  expires_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  paid_at TIMESTAMPTZ,

  -- Email tracking
  email_sent_at TIMESTAMPTZ,
  email_sent_to VARCHAR(255),
  reminder_sent_at TIMESTAMPTZ,

  -- Staff
  created_by_staff_id UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_customer ON payment_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_expires ON payment_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_payment_requests_stripe ON payment_requests(stripe_payment_link_id);

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_requests_select" ON payment_requests FOR SELECT USING (true);
CREATE POLICY "payment_requests_insert" ON payment_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "payment_requests_update" ON payment_requests FOR UPDATE USING (true);

COMMENT ON TABLE payment_requests IS 'Tracks Stripe payment links sent for collecting shortfalls';

-- ============================================
-- 6. Refunds Table
-- ============================================
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  original_payment_id UUID,
  payment_id UUID REFERENCES customer_payments(id),
  invoice_id UUID REFERENCES customer_invoices(id),

  -- Refund details
  amount DECIMAL(10,2) NOT NULL,
  stripe_refund_id VARCHAR(100),
  refund_method VARCHAR(20) DEFAULT 'manual' CHECK (refund_method IN ('stripe', 'manual', 'check', 'bank_transfer', 'credit')),

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Reason
  reason TEXT,
  failure_reason TEXT,

  -- Timestamps
  processed_at TIMESTAMPTZ,
  created_by_staff_id UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_customer ON refunds(customer_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe ON refunds(stripe_refund_id);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refunds_select" ON refunds FOR SELECT USING (true);
CREATE POLICY "refunds_insert" ON refunds FOR INSERT WITH CHECK (true);
CREATE POLICY "refunds_update" ON refunds FOR UPDATE USING (true);

COMMENT ON TABLE refunds IS 'Tracks all refund requests and their processing status';

-- ============================================
-- 7. Order Adjustments (for order edit price changes)
-- ============================================
CREATE TABLE IF NOT EXISTS order_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('discount', 'surcharge', 'waive', 'price_change')),
  amount DECIMAL(10,2) NOT NULL,
  original_total DECIMAL(10,2),
  new_total DECIMAL(10,2),
  reason TEXT,
  handling_method VARCHAR(30), -- 'stripe_request', 'ar', 'waive', 'refund'
  payment_request_id UUID REFERENCES payment_requests(id),
  refund_id UUID REFERENCES refunds(id),
  created_by_staff_id UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_adjustments_order ON order_adjustments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_adjustments_type ON order_adjustments(adjustment_type);

ALTER TABLE order_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_adjustments_select" ON order_adjustments FOR SELECT USING (true);
CREATE POLICY "order_adjustments_insert" ON order_adjustments FOR INSERT WITH CHECK (true);

COMMENT ON TABLE order_adjustments IS 'Tracks price adjustments from order edits';

-- ============================================
-- 8. Staff Activity Log Enhancement
-- ============================================
-- Add payment-related action types to staff_activity_log if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_activity_log' AND column_name = 'details'
  ) THEN
    ALTER TABLE staff_activity_log ADD COLUMN details JSONB;
  END IF;
END $$;

-- ============================================
-- 9. Grant Permissions
-- ============================================
GRANT SELECT, INSERT ON customer_credit_log TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON customer_payments TO authenticated, anon;
GRANT SELECT, INSERT ON customer_payment_allocations TO authenticated, anon;
GRANT SELECT, INSERT ON invoice_adjustments TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON payment_requests TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON refunds TO authenticated, anon;
GRANT SELECT, INSERT ON order_adjustments TO authenticated, anon;

-- ============================================
-- 10. Helper Function: Apply Customer Credit
-- ============================================
CREATE OR REPLACE FUNCTION apply_customer_credit(
  p_customer_id UUID,
  p_amount DECIMAL(10,2),
  p_order_id UUID DEFAULT NULL,
  p_invoice_id UUID DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance DECIMAL(10,2);
  v_applied_amount DECIMAL(10,2);
BEGIN
  -- Get current credit balance
  SELECT COALESCE(credit_balance, 0) INTO v_current_balance
  FROM customers WHERE id = p_customer_id;

  -- Calculate amount to apply
  v_applied_amount := LEAST(v_current_balance, p_amount);

  IF v_applied_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No credit available');
  END IF;

  -- Deduct from customer balance
  UPDATE customers
  SET credit_balance = credit_balance - v_applied_amount,
      updated_at = NOW()
  WHERE id = p_customer_id;

  -- Log the usage
  INSERT INTO customer_credit_log (
    customer_id, amount, type, source, order_id, invoice_id,
    notes, created_by_staff_id
  ) VALUES (
    p_customer_id, -v_applied_amount, 'credit_used', 'order_applied',
    p_order_id, p_invoice_id, 'Credit applied to order/invoice', p_staff_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'applied_amount', v_applied_amount,
    'remaining_balance', v_current_balance - v_applied_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_customer_credit(UUID, DECIMAL, UUID, UUID, UUID) TO authenticated, anon;

-- ============================================
-- 11. Verification
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'customer_credit_log',
  'customer_payments',
  'customer_payment_allocations',
  'invoice_adjustments',
  'payment_requests',
  'refunds',
  'order_adjustments'
);
