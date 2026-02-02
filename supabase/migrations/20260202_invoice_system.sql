-- ============================================================================
-- CETHOS INVOICE SYSTEM - SCHEMA
-- ============================================================================

-- 1. Customer Invoices Table (One invoice per order)
CREATE TABLE IF NOT EXISTS customer_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id),
  quote_id UUID REFERENCES quotes(id),

  -- Amounts (copied from order at invoice time)
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  certification_total DECIMAL(10,2) DEFAULT 0,
  rush_fee DECIMAL(10,2) DEFAULT 0,
  delivery_fee DECIMAL(10,2) DEFAULT 0,
  tax_rate DECIMAL(5,4) DEFAULT 0.05,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Payment tracking
  amount_paid DECIMAL(10,2) DEFAULT 0,
  balance_due DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft', 'issued', 'sent', 'partial', 'paid', 'void', 'cancelled')),

  -- Dates
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,

  -- PDF storage
  pdf_storage_path TEXT,
  pdf_generated_at TIMESTAMPTZ,

  -- Trigger tracking
  trigger_type VARCHAR(20) DEFAULT 'order' CHECK (trigger_type IN ('order', 'delivery', 'manual')),

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_invoices_order_id ON customer_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_customer_id ON customer_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_status ON customer_invoices(status);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_due_date ON customer_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_invoice_number ON customer_invoices(invoice_number);

-- RLS
ALTER TABLE customer_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_invoices_select" ON customer_invoices FOR SELECT USING (true);
CREATE POLICY "customer_invoices_insert" ON customer_invoices FOR INSERT WITH CHECK (true);
CREATE POLICY "customer_invoices_update" ON customer_invoices FOR UPDATE USING (true);

-- 2. Invoice Generation Queue
CREATE TABLE IF NOT EXISTS invoice_generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  trigger_type VARCHAR(20) DEFAULT 'delivery',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_queue_status ON invoice_generation_queue(status);

ALTER TABLE invoice_generation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_queue_all" ON invoice_generation_queue FOR ALL USING (true);

-- 3. Invoice Number Sequence
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1;

-- 4. Function to Generate Invoice Number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year TEXT;
  v_seq INT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_seq := nextval('invoice_number_seq');
  RETURN 'INV-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$;

-- 5. Function to Calculate Invoice Due Date
CREATE OR REPLACE FUNCTION calculate_invoice_due_date(p_customer_id UUID)
RETURNS DATE
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_ar BOOLEAN;
  v_payment_terms VARCHAR(20);
BEGIN
  SELECT
    COALESCE(is_ar_customer, FALSE),
    COALESCE(payment_terms, 'immediate')
  INTO v_is_ar, v_payment_terms
  FROM customers
  WHERE id = p_customer_id;

  IF v_is_ar AND v_payment_terms = 'net_30' THEN
    RETURN CURRENT_DATE + INTERVAL '30 days';
  ELSIF v_is_ar AND v_payment_terms = 'net_15' THEN
    RETURN CURRENT_DATE + INTERVAL '15 days';
  ELSIF v_is_ar AND v_payment_terms = 'net_60' THEN
    RETURN CURRENT_DATE + INTERVAL '60 days';
  ELSE
    RETURN CURRENT_DATE; -- Immediate for non-AR
  END IF;
END;
$$;

-- 6. Function to Create Invoice from Order
CREATE OR REPLACE FUNCTION create_invoice_from_order(p_order_id UUID, p_trigger_type VARCHAR DEFAULT 'delivery')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_due_date DATE;
  v_existing_invoice UUID;
BEGIN
  -- Check if invoice already exists for this order
  SELECT id INTO v_existing_invoice
  FROM customer_invoices
  WHERE order_id = p_order_id AND status NOT IN ('void', 'cancelled');

  IF v_existing_invoice IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invoice already exists for this order',
      'invoice_id', v_existing_invoice
    );
  END IF;

  -- Get order details
  SELECT
    o.id, o.order_number, o.quote_id, o.customer_id,
    o.subtotal, o.certification_total, o.rush_fee, o.delivery_fee,
    o.tax_rate, o.tax_amount, o.total_amount, o.amount_paid, o.balance_due
  INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Generate invoice number and due date
  v_invoice_number := generate_invoice_number();
  v_due_date := calculate_invoice_due_date(v_order.customer_id);

  -- Create invoice
  INSERT INTO customer_invoices (
    invoice_number, order_id, customer_id, quote_id,
    subtotal, certification_total, rush_fee, delivery_fee,
    tax_rate, tax_amount, total_amount,
    amount_paid, balance_due,
    status, invoice_date, due_date, trigger_type
  ) VALUES (
    v_invoice_number, p_order_id, v_order.customer_id, v_order.quote_id,
    v_order.subtotal, v_order.certification_total, v_order.rush_fee, v_order.delivery_fee,
    COALESCE(v_order.tax_rate, 0.05), v_order.tax_amount, v_order.total_amount,
    v_order.amount_paid, v_order.balance_due,
    CASE WHEN v_order.balance_due <= 0 THEN 'paid' ELSE 'issued' END,
    CURRENT_DATE, v_due_date, p_trigger_type
  )
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'due_date', v_due_date,
    'total_amount', v_order.total_amount,
    'balance_due', v_order.balance_due
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_invoice_from_order(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION create_invoice_from_order(UUID, VARCHAR) TO anon;

-- 7. Trigger to Auto-Generate Invoice on Order Delivered
CREATE OR REPLACE FUNCTION trigger_invoice_on_delivered()
RETURNS TRIGGER AS $$
BEGIN
  -- Only if status changed TO 'delivered'
  IF NEW.status = 'delivered' AND
     (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    -- Add to queue for processing
    INSERT INTO invoice_generation_queue (order_id, trigger_type)
    VALUES (NEW.id, 'delivery')
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_delivered_invoice_trigger ON orders;
CREATE TRIGGER order_delivered_invoice_trigger
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_invoice_on_delivered();

-- 8. Add Accountant Role to Staff
DO $$
BEGIN
  -- Check if constraint exists and drop it
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'staff_users_role_check'
    AND table_name = 'staff_users'
  ) THEN
    ALTER TABLE staff_users DROP CONSTRAINT staff_users_role_check;
  END IF;

  -- Add new constraint with accountant role
  ALTER TABLE staff_users ADD CONSTRAINT staff_users_role_check
    CHECK (role IN ('admin', 'super_admin', 'reviewer', 'senior_reviewer', 'accountant'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update role constraint: %', SQLERRM;
END $$;

-- 9. Verify Tables Created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('customer_invoices', 'invoice_generation_queue');
