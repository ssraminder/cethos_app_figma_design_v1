-- ============================================================================
-- TRANSLATION DETAILS ENHANCEMENTS
-- Migration: 20260129_translation_details_enhancements.sql
-- ============================================================================

-- ============================================================================
-- 1. ADD tier COLUMN TO languages TABLE (if not exists)
-- ============================================================================

-- Add tier column (1=Standard, 2=Complex Script, 3=Rare/Specialized)
ALTER TABLE languages ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1;

-- Add native_name column for displaying language names in their native script
ALTER TABLE languages ADD COLUMN IF NOT EXISTS native_name TEXT;

-- Update existing languages with tier information
-- Tier 1: Standard (Latin script, common European languages)
UPDATE languages SET tier = 1 WHERE code IN ('en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ro', 'sv', 'no', 'da', 'fi');

-- Tier 2: Complex Script (Non-Latin scripts, requires more processing)
UPDATE languages SET tier = 2 WHERE code IN ('zh', 'ja', 'ko', 'ar', 'hi', 'he', 'th', 'vi', 'ru', 'uk', 'el', 'bn', 'ta', 'te', 'ml', 'kn', 'gu', 'pa', 'mr', 'ur');

-- Tier 3: Rare/Specialized (Less common languages requiring specialized translators)
UPDATE languages SET tier = 3 WHERE tier IS NULL OR tier NOT IN (1, 2);

-- Update native names for common languages
UPDATE languages SET native_name = CASE code
  WHEN 'en' THEN 'English'
  WHEN 'es' THEN 'Español'
  WHEN 'fr' THEN 'Français'
  WHEN 'de' THEN 'Deutsch'
  WHEN 'it' THEN 'Italiano'
  WHEN 'pt' THEN 'Português'
  WHEN 'zh' THEN '中文'
  WHEN 'ja' THEN '日本語'
  WHEN 'ko' THEN '한국어'
  WHEN 'ar' THEN 'العربية'
  WHEN 'hi' THEN 'हिन्दी'
  WHEN 'ru' THEN 'Русский'
  WHEN 'nl' THEN 'Nederlands'
  WHEN 'pl' THEN 'Polski'
  WHEN 'vi' THEN 'Tiếng Việt'
  WHEN 'th' THEN 'ไทย'
  WHEN 'tr' THEN 'Türkçe'
  WHEN 'uk' THEN 'Українська'
  WHEN 'el' THEN 'Ελληνικά'
  WHEN 'he' THEN 'עברית'
  WHEN 'bn' THEN 'বাংলা'
  WHEN 'ta' THEN 'தமிழ்'
  WHEN 'te' THEN 'తెలుగు'
  WHEN 'ml' THEN 'മലയാളം'
  WHEN 'kn' THEN 'ಕನ್ನಡ'
  WHEN 'gu' THEN 'ગુજરાતી'
  WHEN 'pa' THEN 'ਪੰਜਾਬੀ'
  WHEN 'mr' THEN 'मराठी'
  WHEN 'ur' THEN 'اردو'
  WHEN 'fa' THEN 'فارسی'
  WHEN 'sw' THEN 'Kiswahili'
  WHEN 'tl' THEN 'Tagalog'
  WHEN 'id' THEN 'Bahasa Indonesia'
  WHEN 'ms' THEN 'Bahasa Melayu'
  ELSE name
END
WHERE native_name IS NULL;

-- Ensure multiplier column exists and has reasonable defaults by tier
-- Update multipliers based on tier if they're at default 1.0
UPDATE languages
SET multiplier = CASE tier
  WHEN 1 THEN 1.0
  WHEN 2 THEN 1.25
  WHEN 3 THEN 1.5
END
WHERE multiplier = 1.0 OR multiplier IS NULL;

-- ============================================================================
-- 2. ADD language_multiplier_override COLUMN TO quotes TABLE
-- ============================================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS language_multiplier_override DECIMAL(4,2) DEFAULT NULL;

COMMENT ON COLUMN quotes.language_multiplier_override IS 'Staff override for language multiplier. NULL means use tier default from source language.';

-- ============================================================================
-- 3. CREATE/UPDATE recalculate_quote_totals FUNCTION TO USE LANGUAGE MULTIPLIER
-- ============================================================================

-- Update the function to incorporate language multiplier
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
  v_language_multiplier DECIMAL(4,2);
BEGIN
  -- Get language multiplier (use override if set, otherwise use language's default)
  SELECT COALESCE(q.language_multiplier_override, COALESCE(l.multiplier, 1.0))
  INTO v_language_multiplier
  FROM quotes q
  LEFT JOIN languages l ON q.source_language_id = l.id
  WHERE q.id = p_quote_id;

  v_language_multiplier := COALESCE(v_language_multiplier, 1.0);

  -- Get tax rate from quotes.tax_rate_id or default
  SELECT COALESCE(tr.rate, 0.05) INTO v_tax_rate
  FROM quotes q
  LEFT JOIN tax_rates tr ON q.tax_rate_id = tr.id
  WHERE q.id = p_quote_id;

  v_tax_rate := COALESCE(v_tax_rate, 0.05);

  -- Check if rush
  SELECT is_rush INTO v_is_rush FROM quotes WHERE id = p_quote_id;

  -- Sum document-level totals (translation + document certifications)
  -- Note: line_total already includes language multiplier from process-document
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
      'total', v_total,
      'language_multiplier', v_language_multiplier
    ),
    updated_at = NOW()
  WHERE id = p_quote_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION recalculate_quote_totals(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_quote_totals(UUID) TO anon;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON COLUMN languages.tier IS 'Language complexity tier: 1=Standard, 2=Complex Script, 3=Rare/Specialized';
COMMENT ON COLUMN languages.native_name IS 'Language name in its native script';
