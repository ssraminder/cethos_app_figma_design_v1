-- ============================================================================
-- STAFF PAYMENT QUEUE & STATEMENTS
-- ============================================================================

-- 1. Payment Confirmation Queue (for E-Transfer/Cheque)
CREATE TABLE IF NOT EXISTS payment_confirmation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES customer_payment_intents(id),
  customer_id UUID NOT NULL REFERENCES customers(id),

  -- Payment details
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  reference_number VARCHAR(100),
  customer_memo TEXT,

  -- AI allocation
  ai_confidence DECIMAL(3,2),
  ai_reasoning TEXT,
  ai_allocations JSONB,

  -- Status
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),

  -- Staff action
  processed_by_staff_id UUID REFERENCES staff_users(id),
  processed_at TIMESTAMPTZ,
  staff_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_confirmation_queue_status ON payment_confirmation_queue(status);
CREATE INDEX IF NOT EXISTS idx_confirmation_queue_customer ON payment_confirmation_queue(customer_id);

ALTER TABLE payment_confirmation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "confirmation_queue_all" ON payment_confirmation_queue FOR ALL USING (true);

-- 2. Customer Statements
CREATE TABLE IF NOT EXISTS customer_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),

  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Balances
  opening_balance DECIMAL(10,2) DEFAULT 0,
  total_invoiced DECIMAL(10,2) DEFAULT 0,
  total_paid DECIMAL(10,2) DEFAULT 0,
  closing_balance DECIMAL(10,2) DEFAULT 0,

  -- Aging
  current_amount DECIMAL(10,2) DEFAULT 0,
  days_30_amount DECIMAL(10,2) DEFAULT 0,
  days_60_amount DECIMAL(10,2) DEFAULT 0,
  days_90_plus_amount DECIMAL(10,2) DEFAULT 0,

  -- PDF
  pdf_storage_path TEXT,
  pdf_generated_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'sent', 'cancelled')),

  -- Send tracking
  sent_at TIMESTAMPTZ,
  sent_by_staff_id UUID REFERENCES staff_users(id),
  sent_to_email VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_statements_customer ON customer_statements(customer_id);
CREATE INDEX IF NOT EXISTS idx_statements_status ON customer_statements(status);
CREATE INDEX IF NOT EXISTS idx_statements_period ON customer_statements(period_start, period_end);

ALTER TABLE customer_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "statements_all" ON customer_statements FOR ALL USING (true);

-- 3. Statement Line Items
CREATE TABLE IF NOT EXISTS customer_statement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES customer_statements(id) ON DELETE CASCADE,

  -- Item details
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('opening', 'invoice', 'payment', 'adjustment', 'closing')),
  reference_id UUID, -- invoice_id or payment_id
  reference_number VARCHAR(100),
  description TEXT,

  -- Amounts
  debit_amount DECIMAL(10,2) DEFAULT 0,
  credit_amount DECIMAL(10,2) DEFAULT 0,
  running_balance DECIMAL(10,2),

  item_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_statement_items_statement ON customer_statement_items(statement_id);

ALTER TABLE customer_statement_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "statement_items_all" ON customer_statement_items FOR ALL USING (true);

-- 4. Statement Number Sequence
CREATE SEQUENCE IF NOT EXISTS statement_number_seq START WITH 1;

-- 5. Function to Generate Statement Number
CREATE OR REPLACE FUNCTION generate_statement_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year TEXT;
  v_month TEXT;
  v_seq INT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month := TO_CHAR(CURRENT_DATE, 'MM');
  v_seq := nextval('statement_number_seq');
  RETURN 'STMT-' || v_year || v_month || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
