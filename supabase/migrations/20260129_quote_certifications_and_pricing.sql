-- ============================================================================
-- QUOTE-LEVEL CERTIFICATIONS TABLE AND PRICING ENHANCEMENTS
-- Migration: 20260129_quote_certifications_and_pricing.sql
-- ============================================================================

-- ============================================================================
-- 1. CREATE quote_certifications TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS quote_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  certification_type_id UUID NOT NULL REFERENCES certification_types(id),
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1,
  added_by UUID REFERENCES staff_users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quote_certs_quote ON quote_certifications(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_certs_type ON quote_certifications(certification_type_id);

-- RLS Policies
ALTER TABLE quote_certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_certs_select ON quote_certifications;
CREATE POLICY quote_certs_select ON quote_certifications FOR SELECT USING (true);

DROP POLICY IF EXISTS quote_certs_insert ON quote_certifications;
CREATE POLICY quote_certs_insert ON quote_certifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS quote_certs_update ON quote_certifications;
CREATE POLICY quote_certs_update ON quote_certifications FOR UPDATE USING (true);

DROP POLICY IF EXISTS quote_certs_delete ON quote_certifications;
CREATE POLICY quote_certs_delete ON quote_certifications FOR DELETE USING (true);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_quote_certifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quote_certifications_updated ON quote_certifications;
CREATE TRIGGER trg_quote_certifications_updated
  BEFORE UPDATE ON quote_certifications
  FOR EACH ROW EXECUTE FUNCTION update_quote_certifications_updated_at();

-- ============================================================================
-- 2. ADD tax_rate_id COLUMN TO quotes TABLE
-- ============================================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tax_rate_id UUID REFERENCES tax_rates(id);

-- Set default tax rate for existing quotes (Alberta GST)
UPDATE quotes
SET tax_rate_id = (
  SELECT id FROM tax_rates
  WHERE region_code = 'AB' AND is_active = true
  LIMIT 1
)
WHERE tax_rate_id IS NULL;

-- ============================================================================
-- 3. ENSURE tax_rates TABLE HAS DATA
-- ============================================================================

-- Insert Canadian provincial rates if not exist
INSERT INTO tax_rates (region_type, region_code, region_name, tax_name, rate, is_active, effective_from)
VALUES
  ('province', 'AB', 'Alberta', 'GST', 0.05, true, '2020-01-01'),
  ('province', 'BC', 'British Columbia', 'GST+PST', 0.12, true, '2020-01-01'),
  ('province', 'ON', 'Ontario', 'HST', 0.13, true, '2020-01-01'),
  ('province', 'QC', 'Quebec', 'GST+QST', 0.14975, true, '2020-01-01'),
  ('province', 'MB', 'Manitoba', 'GST+PST', 0.12, true, '2020-01-01'),
  ('province', 'SK', 'Saskatchewan', 'GST+PST', 0.11, true, '2020-01-01'),
  ('province', 'NS', 'Nova Scotia', 'HST', 0.15, true, '2020-01-01'),
  ('province', 'NB', 'New Brunswick', 'HST', 0.15, true, '2020-01-01'),
  ('province', 'NL', 'Newfoundland', 'HST', 0.15, true, '2020-01-01'),
  ('province', 'PE', 'Prince Edward Island', 'HST', 0.15, true, '2020-01-01'),
  ('province', 'NT', 'Northwest Territories', 'GST', 0.05, true, '2020-01-01'),
  ('province', 'NU', 'Nunavut', 'GST', 0.05, true, '2020-01-01'),
  ('province', 'YT', 'Yukon', 'GST', 0.05, true, '2020-01-01'),
  ('country', 'INTL', 'International (No Tax)', 'None', 0.00, true, '2020-01-01')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. ENSURE quote_adjustments TABLE EXISTS (may already exist from previous migration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS quote_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('discount', 'surcharge')),
  value_type VARCHAR(20) NOT NULL CHECK (value_type IN ('fixed', 'percentage')),
  value DECIMAL(10,2) NOT NULL,
  calculated_amount DECIMAL(10,2),
  reason TEXT,
  added_by UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_adj_quote ON quote_adjustments(quote_id);

-- RLS
ALTER TABLE quote_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_adj_select ON quote_adjustments;
CREATE POLICY quote_adj_select ON quote_adjustments FOR SELECT USING (true);

DROP POLICY IF EXISTS quote_adj_insert ON quote_adjustments;
CREATE POLICY quote_adj_insert ON quote_adjustments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS quote_adj_update ON quote_adjustments;
CREATE POLICY quote_adj_update ON quote_adjustments FOR UPDATE USING (true);

DROP POLICY IF EXISTS quote_adj_delete ON quote_adjustments;
CREATE POLICY quote_adj_delete ON quote_adjustments FOR DELETE USING (true);

-- ============================================================================
-- 5. CREATE/UPDATE recalculate_quote_totals FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_quote_totals(p_quote_id UUID)
RETURNS void AS $$
DECLARE
  v_translation_total DECIMAL(10,2);
  v_doc_certification_total DECIMAL(10,2);
  v_quote_certification_total DECIMAL(10,2);
  v_certification_total DECIMAL(10,2);
  v_subtotal DECIMAL(10,2);
  v_adjustments_total DECIMAL(10,2);
  v_tax_rate DECIMAL(6,4);
  v_tax_amount DECIMAL(10,2);
  v_total DECIMAL(10,2);
  v_rush_fee DECIMAL(10,2) := 0;
  v_is_rush BOOLEAN;
BEGIN
  -- Get tax rate from quotes.tax_rate_id or default
  SELECT COALESCE(tr.rate, 0.05) INTO v_tax_rate
  FROM quotes q
  LEFT JOIN tax_rates tr ON q.tax_rate_id = tr.id
  WHERE q.id = p_quote_id;

  v_tax_rate := COALESCE(v_tax_rate, 0.05);

  -- Check if rush
  SELECT is_rush INTO v_is_rush FROM quotes WHERE id = p_quote_id;

  -- Sum document-level totals (translation + document certifications)
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

  -- Calculate adjustments (discounts negative, surcharges positive)
  SELECT COALESCE(SUM(
    CASE
      WHEN adjustment_type = 'discount' THEN
        CASE WHEN value_type = 'percentage' THEN -1 * (v_subtotal * value / 100) ELSE -1 * value END
      WHEN adjustment_type = 'surcharge' THEN
        CASE WHEN value_type = 'percentage' THEN (v_subtotal * value / 100) ELSE value END
    END
  ), 0) INTO v_adjustments_total
  FROM quote_adjustments
  WHERE quote_id = p_quote_id;

  -- Update calculated_amount in quote_adjustments
  UPDATE quote_adjustments
  SET calculated_amount =
    CASE
      WHEN adjustment_type = 'discount' THEN
        CASE WHEN value_type = 'percentage' THEN -1 * (v_subtotal * value / 100) ELSE -1 * value END
      WHEN adjustment_type = 'surcharge' THEN
        CASE WHEN value_type = 'percentage' THEN (v_subtotal * value / 100) ELSE value END
    END
  WHERE quote_id = p_quote_id;

  -- Apply rush fee (30%)
  IF v_is_rush THEN
    v_rush_fee := (v_subtotal + v_adjustments_total) * 0.30;
  END IF;

  v_tax_amount := ROUND((v_subtotal + v_adjustments_total + v_rush_fee) * v_tax_rate, 2);
  v_total := v_subtotal + v_adjustments_total + v_rush_fee + v_tax_amount;

  -- Update quote - BOTH columns and JSONB
  UPDATE quotes
  SET
    -- Table columns
    subtotal = v_subtotal,
    certification_total = v_certification_total,
    rush_fee = v_rush_fee,
    tax_rate = v_tax_rate,
    tax_amount = v_tax_amount,
    total = v_total,
    -- JSONB for frontend
    calculated_totals = jsonb_build_object(
      'translation_total', v_translation_total,
      'doc_certification_total', v_doc_certification_total,
      'quote_certification_total', v_quote_certification_total,
      'certification_total', v_certification_total,
      'subtotal', v_subtotal,
      'adjustments_total', v_adjustments_total,
      'rush_fee', v_rush_fee,
      'tax_rate', v_tax_rate,
      'tax_amount', v_tax_amount,
      'total', v_total
    ),
    updated_at = NOW()
  WHERE id = p_quote_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON quote_certifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON quote_certifications TO anon;
GRANT EXECUTE ON FUNCTION recalculate_quote_totals(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_quote_totals(UUID) TO anon;

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE quote_certifications IS 'Quote-level certifications that apply to the entire order (separate from document-level certifications)';
COMMENT ON COLUMN quotes.tax_rate_id IS 'Reference to the selected tax rate for this quote';
COMMENT ON FUNCTION recalculate_quote_totals(UUID) IS 'Recalculates all quote totals including certifications, adjustments, rush fee, and tax';
