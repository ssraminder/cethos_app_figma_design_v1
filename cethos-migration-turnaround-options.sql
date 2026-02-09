-- ============================================================================
-- CETHOS: Turnaround Options & Delivery Enhancements
-- Migration: cethos-migration-turnaround-options.sql
-- Run BEFORE deploying recalculate-quote-pricing edge function
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CREATE turnaround_options TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS turnaround_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  multiplier DECIMAL(4,2) DEFAULT 1.00,
  fee_type VARCHAR(20) DEFAULT 'percentage' CHECK (fee_type IN ('percentage', 'fixed')),
  fee_value DECIMAL(10,2) DEFAULT 0,
  estimated_days INTEGER DEFAULT 5,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed turnaround options
INSERT INTO turnaround_options (code, name, multiplier, fee_type, fee_value, estimated_days, is_default, sort_order)
VALUES
  ('standard', 'Standard', 1.00, 'percentage', 0, 5, TRUE, 1),
  ('rush', 'Rush', 1.30, 'percentage', 30, 2, FALSE, 2),
  ('same_day', 'Same Day', 2.00, 'percentage', 100, 0, FALSE, 3)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. ADD NEW COLUMNS TO quotes TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS turnaround_option_id UUID REFERENCES turnaround_options(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS promised_delivery_date DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS converted_to_order_id UUID;

-- Set default turnaround_option_id for existing quotes with turnaround_type
UPDATE quotes
SET turnaround_option_id = (
  SELECT id FROM turnaround_options WHERE code = quotes.turnaround_type LIMIT 1
)
WHERE turnaround_option_id IS NULL AND turnaround_type IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. RLS POLICIES FOR turnaround_options
-- ----------------------------------------------------------------------------
ALTER TABLE turnaround_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read active turnaround_options" ON turnaround_options;
CREATE POLICY "Allow public read active turnaround_options" ON turnaround_options
  FOR SELECT TO authenticated, anon
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Allow staff to manage turnaround_options" ON turnaround_options;
CREATE POLICY "Allow staff to manage turnaround_options" ON turnaround_options
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_users
      WHERE auth_user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- 4. UPDATE recalculate_quote_totals TO HANDLE TURNAROUND OPTIONS & DELIVERY
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_quote_totals(p_quote_id UUID)
RETURNS void AS $$
DECLARE
  v_translation_total DECIMAL(10,2);
  v_doc_certification_total DECIMAL(10,2);
  v_quote_certification_total DECIMAL(10,2);
  v_certification_total DECIMAL(10,2);
  v_subtotal DECIMAL(10,2);
  v_adjustments_total DECIMAL(10,2);
  v_surcharge_total DECIMAL(10,2);
  v_discount_total DECIMAL(10,2);
  v_tax_rate DECIMAL(6,4);
  v_tax_amount DECIMAL(10,2);
  v_total DECIMAL(10,2);
  v_rush_fee DECIMAL(10,2) := 0;
  v_delivery_fee DECIMAL(10,2) := 0;
  v_is_rush BOOLEAN;
  v_turnaround_option_id UUID;
  v_turnaround_fee_type VARCHAR(20);
  v_turnaround_fee_value DECIMAL(10,2);
  v_physical_delivery_option_id UUID;
BEGIN
  -- Get quote details
  SELECT
    COALESCE(tr.rate, q.tax_rate, 0.05),
    q.is_rush,
    q.turnaround_option_id,
    q.physical_delivery_option_id
  INTO v_tax_rate, v_is_rush, v_turnaround_option_id, v_physical_delivery_option_id
  FROM quotes q
  LEFT JOIN tax_rates tr ON q.tax_rate_id = tr.id
  WHERE q.id = p_quote_id;

  v_tax_rate := COALESCE(v_tax_rate, 0.05);

  -- Get turnaround option details if set
  IF v_turnaround_option_id IS NOT NULL THEN
    SELECT fee_type, fee_value
    INTO v_turnaround_fee_type, v_turnaround_fee_value
    FROM turnaround_options
    WHERE id = v_turnaround_option_id;
  END IF;

  -- Get delivery fee from physical delivery option
  IF v_physical_delivery_option_id IS NOT NULL THEN
    SELECT COALESCE(price, 0) INTO v_delivery_fee
    FROM delivery_options
    WHERE id = v_physical_delivery_option_id;
  END IF;

  -- Sum document-level totals (translation costs + document certifications)
  SELECT
    COALESCE(SUM(line_total - COALESCE(certification_price, 0)), 0),
    COALESCE(SUM(certification_price), 0) +
      COALESCE((SELECT SUM(price) FROM document_certifications dc
                JOIN ai_analysis_results ar ON dc.analysis_id = ar.id
                WHERE ar.quote_id = p_quote_id AND dc.is_primary = false), 0)
  INTO v_translation_total, v_doc_certification_total
  FROM ai_analysis_results
  WHERE quote_id = p_quote_id;

  -- Sum quote-level certifications
  SELECT COALESCE(SUM(price * quantity), 0) INTO v_quote_certification_total
  FROM quote_certifications
  WHERE quote_id = p_quote_id;

  -- Total certifications
  v_certification_total := v_doc_certification_total + v_quote_certification_total;

  v_subtotal := v_translation_total + v_certification_total;

  -- Calculate surcharges and discounts separately
  SELECT
    COALESCE(SUM(CASE WHEN adjustment_type = 'surcharge' THEN
      CASE WHEN value_type = 'percentage' THEN (v_subtotal * value / 100) ELSE value END
    ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN adjustment_type = 'discount' THEN
      CASE WHEN value_type = 'percentage' THEN (v_subtotal * value / 100) ELSE value END
    ELSE 0 END), 0)
  INTO v_surcharge_total, v_discount_total
  FROM quote_adjustments
  WHERE quote_id = p_quote_id;

  v_adjustments_total := v_surcharge_total - v_discount_total;

  -- Update calculated_amount in quote_adjustments for display
  UPDATE quote_adjustments
  SET calculated_amount =
    CASE
      WHEN adjustment_type = 'discount' THEN
        CASE WHEN value_type = 'percentage' THEN (v_subtotal * value / 100) ELSE value END
      WHEN adjustment_type = 'surcharge' THEN
        CASE WHEN value_type = 'percentage' THEN (v_subtotal * value / 100) ELSE value END
    END
  WHERE quote_id = p_quote_id;

  -- Calculate rush fee from turnaround option or is_rush flag
  IF v_turnaround_option_id IS NOT NULL AND v_turnaround_fee_value > 0 THEN
    IF v_turnaround_fee_type = 'percentage' THEN
      v_rush_fee := ROUND((v_subtotal + v_adjustments_total) * v_turnaround_fee_value / 100, 2);
    ELSE
      v_rush_fee := v_turnaround_fee_value;
    END IF;
  ELSIF v_is_rush THEN
    v_rush_fee := ROUND((v_subtotal + v_adjustments_total) * 0.30, 2);
  END IF;

  -- Tax applies to subtotal + adjustments + rush + delivery
  v_tax_amount := ROUND((v_subtotal + v_adjustments_total + v_rush_fee + v_delivery_fee) * v_tax_rate, 2);
  v_total := v_subtotal + v_adjustments_total + v_rush_fee + v_delivery_fee + v_tax_amount;

  -- Update quote — both columns and JSONB
  UPDATE quotes
  SET
    subtotal = v_subtotal,
    certification_total = v_certification_total,
    rush_fee = v_rush_fee,
    delivery_fee = v_delivery_fee,
    tax_rate = v_tax_rate,
    tax_amount = v_tax_amount,
    total = v_total,
    is_rush = CASE
      WHEN v_turnaround_option_id IS NOT NULL THEN v_turnaround_fee_value > 0
      ELSE v_is_rush
    END,
    calculated_totals = jsonb_build_object(
      'translation_total', v_translation_total,
      'doc_certification_total', v_doc_certification_total,
      'quote_certification_total', v_quote_certification_total,
      'certification_total', v_certification_total,
      'subtotal', v_subtotal,
      'adjustments_total', v_adjustments_total,
      'surcharge_total', v_surcharge_total,
      'discount_total', v_discount_total,
      'rush_fee', v_rush_fee,
      'delivery_fee', v_delivery_fee,
      'tax_rate', v_tax_rate,
      'tax_amount', v_tax_amount,
      'total', v_total
    ),
    updated_at = NOW()
  WHERE id = p_quote_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 5. GRANTS
-- ----------------------------------------------------------------------------
GRANT SELECT ON turnaround_options TO authenticated, anon;
GRANT EXECUTE ON FUNCTION recalculate_quote_totals(UUID) TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- 6. COMMENTS
-- ----------------------------------------------------------------------------
COMMENT ON TABLE turnaround_options IS 'Turnaround speed options (standard, rush, same-day) with pricing multipliers';
COMMENT ON COLUMN quotes.turnaround_option_id IS 'Selected turnaround speed option for this quote';
COMMENT ON COLUMN quotes.promised_delivery_date IS 'Staff-set promised delivery date for the customer';
COMMENT ON COLUMN quotes.converted_to_order_id IS 'Order ID when quote has been converted to a paid order';
