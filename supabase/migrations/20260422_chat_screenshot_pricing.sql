-- ============================================================================
-- Chat-screenshot pricing rule
-- Date: 2026-04-22
--
-- When a document is detected as chat_screenshot we charge a flat per-page
-- (== per-screenshot) rate with a quote-level minimum, and use a special
-- delivery turnaround. Settings are stored in app_settings so admins can tune
-- without a redeploy.
-- ============================================================================

-- ── 1. App settings ──
-- Use ON CONFLICT (setting_key) DO UPDATE for the existing key, plain insert
-- (with NOT EXISTS guard) for the new keys.
INSERT INTO app_settings (setting_key, setting_value, description)
SELECT 'screenshot_rate', '12.00', 'Chat-screenshot rule: rate per screenshot in CAD'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key='screenshot_rate');

UPDATE app_settings
   SET setting_value = '12.00',
       description = 'Chat-screenshot rule: rate per screenshot in CAD'
 WHERE setting_key = 'screenshot_rate' AND setting_value <> '12.00';

INSERT INTO app_settings (setting_key, setting_value, description)
SELECT 'screenshot_quote_minimum', '120.00', 'Chat-screenshot rule: minimum total across all chat_screenshot lines in a quote (CAD)'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key='screenshot_quote_minimum');

INSERT INTO app_settings (setting_key, setting_value, description)
SELECT 'screenshot_per_business_day', '5', 'Chat-screenshot rule: number of screenshots that fit in one business day of standard turnaround'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key='screenshot_per_business_day');

INSERT INTO app_settings (setting_key, setting_value, description)
SELECT 'screenshot_standard_baseline_days', '1', 'Chat-screenshot rule: business days added on top of the per-batch days. Total = ceil(count / per_business_day) + baseline.'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key='screenshot_standard_baseline_days');

INSERT INTO app_settings (setting_key, setting_value, description)
SELECT 'screenshot_rush_business_days', '1', 'Chat-screenshot rule: total business days when rush turnaround is selected'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key='screenshot_rush_business_days');

INSERT INTO app_settings (setting_key, setting_value, description)
SELECT 'screenshot_pricing_enabled', 'true', 'Chat-screenshot rule: master switch. When false, chat_screenshot files use the standard words-per-page formula.'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key='screenshot_pricing_enabled');

-- ── 2. New calculation_unit value: per_screenshot ──
ALTER TABLE ai_analysis_results
  DROP CONSTRAINT IF EXISTS ai_analysis_results_calculation_unit_check;

ALTER TABLE ai_analysis_results
  ADD CONSTRAINT ai_analysis_results_calculation_unit_check
  CHECK (calculation_unit IN ('per_page', 'per_word', 'per_hour', 'per_minute', 'flat', 'per_screenshot'));

-- ── 3. Override flag ──
-- Tracks whether a staff member has manually set the pricing for this row.
-- When true, the chat_screenshot auto-rule must NOT overwrite the values on
-- subsequent recalculations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_analysis_results' AND column_name='is_pricing_overridden'
  ) THEN
    ALTER TABLE ai_analysis_results
      ADD COLUMN is_pricing_overridden boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN ai_analysis_results.is_pricing_overridden IS
      'True when staff manually edited the pricing for this row. Auto-rules (e.g. chat_screenshot) skip rows with this flag set.';
  END IF;
END $$;
