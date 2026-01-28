-- ============================================================================
-- CETHOS: Payment Methods and Quote Adjustments
-- Copy this entire file and paste into Supabase SQL Editor
-- https://supabase.com/dashboard/project/lmzoyezvsjgsxveoakdr/sql
-- ============================================================================

-- 1. Payment Methods Table
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  is_online BOOLEAN DEFAULT FALSE,
  requires_staff_confirmation BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  icon VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default payment methods
INSERT INTO payment_methods (code, name, description, is_online, requires_staff_confirmation, display_order, icon, is_active)
VALUES 
  ('online', 'Online Payment', 'Pay securely online via credit/debit card', TRUE, FALSE, 1, 'credit-card', TRUE),
  ('cash', 'Cash', 'Pay in cash at our office', FALSE, TRUE, 2, 'banknote', TRUE),
  ('terminal', 'Payment Terminal', 'Pay at office using debit/credit terminal', FALSE, TRUE, 3, 'credit-card', TRUE),
  ('etransfer', 'E-Transfer', 'Send Interac e-Transfer', FALSE, TRUE, 4, 'mail', TRUE),
  ('cheque', 'Cheque', 'Pay by cheque (in person or mail)', FALSE, TRUE, 5, 'file-text', TRUE),
  ('invoice', 'Invoice (Net 30)', 'For approved corporate clients', FALSE, TRUE, 6, 'file-invoice', FALSE)
ON CONFLICT (code) DO NOTHING;

-- 2. Quote Adjustments Table
CREATE TABLE IF NOT EXISTS quote_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  adjustment_type VARCHAR(50) NOT NULL,
  value_type VARCHAR(20) NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  calculated_amount DECIMAL(10,2) NOT NULL,
  reason TEXT,
  created_by_staff_id UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_adjustment_type CHECK (adjustment_type IN ('discount', 'surcharge')),
  CONSTRAINT valid_value_type CHECK (value_type IN ('percentage', 'fixed')),
  CONSTRAINT positive_value CHECK (value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_quote_adjustments_quote_id ON quote_adjustments(quote_id);

-- 3. Add Payment Columns to Quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES payment_methods(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_confirmed_by_staff_id UUID REFERENCES staff_users(id);

CREATE INDEX IF NOT EXISTS idx_quotes_payment_method ON quotes(payment_method_id);

-- 4. RLS Policies
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read active payment_methods" ON payment_methods;
CREATE POLICY "Allow public read active payment_methods" ON payment_methods
  FOR SELECT TO authenticated, anon
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Allow staff to manage payment_methods" ON payment_methods;
CREATE POLICY "Allow staff to manage payment_methods" ON payment_methods
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_users 
      WHERE auth_user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

ALTER TABLE quote_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow staff to view quote_adjustments" ON quote_adjustments;
CREATE POLICY "Allow staff to view quote_adjustments" ON quote_adjustments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_users 
      WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow staff to manage quote_adjustments" ON quote_adjustments;
CREATE POLICY "Allow staff to manage quote_adjustments" ON quote_adjustments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- 5. Helper Function
CREATE OR REPLACE FUNCTION calculate_quote_adjustments(p_quote_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total DECIMAL(10,2) := 0;
  v_adjustment RECORD;
BEGIN
  FOR v_adjustment IN 
    SELECT adjustment_type, calculated_amount
    FROM quote_adjustments
    WHERE quote_id = p_quote_id
  LOOP
    IF v_adjustment.adjustment_type = 'discount' THEN
      v_total := v_total - v_adjustment.calculated_amount;
    ELSE
      v_total := v_total + v_adjustment.calculated_amount;
    END IF;
  END LOOP;
  
  RETURN v_total;
END;
$$;

-- 6. Grant Permissions
GRANT SELECT ON payment_methods TO authenticated, anon;
GRANT ALL ON quote_adjustments TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_quote_adjustments(UUID) TO authenticated, anon;

-- Done! You should see 6 payment methods created.
