-- ============================================================================
-- 20260527_respect_auto_discount_suppressed.sql
--
-- Bug: recalculate_quote_totals always (re)computes the auto_volume_discount
-- adjustment from v_pct_base and never inspects quotes.auto_discount_suppressed.
-- Result: when a staff member removes the volume discount on a quote, the
-- suppress flag is set on the quote but the next recalc (triggered by any
-- ai_analysis_results insert/update, an explicit RPC, or any other recompute
-- path) silently re-inserts the discount row and rewrites the totals back to
-- the discounted value. Caught on QT-2026-25279 / quote
-- 8f904885-acf4-450d-bda6-712f9000b48d.
--
-- Fix: read auto_discount_suppressed from the quote row and skip the
-- auto_volume_discount INSERT when it's true. The unconditional DELETE above
-- the IF block already clears any stale row, so the suppressed branch just
-- leaves quote_adjustments empty for the auto discount.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.recalculate_quote_totals(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_translation_total DECIMAL(10,2);
  v_doc_certification_total DECIMAL(10,2);
  v_quote_certification_total DECIMAL(10,2);
  v_certification_total DECIMAL(10,2);
  v_subtotal DECIMAL(10,2);
  v_pct_base DECIMAL(10,2);
  v_adjustments_total DECIMAL(10,2);
  v_tax_rate DECIMAL(6,4);
  v_tax_amount DECIMAL(10,2);
  v_total DECIMAL(10,2);
  v_rush_fee DECIMAL(10,2) := 0;
  v_delivery_fee DECIMAL(10,2) := 0;
  v_is_rush BOOLEAN;
  v_turnaround_type VARCHAR(20);
  v_rush_fee_type VARCHAR(20);
  v_rush_fee_custom_value DECIMAL(10,2);
  v_rush_multiplier DECIMAL(6,4);
  v_same_day_multiplier DECIMAL(6,4);
  v_language_multiplier DECIMAL(4,2);
  v_fee_base DECIMAL(10,2);
  v_volume_discount_pct DECIMAL(5,2);
  v_volume_discount_amount DECIMAL(10,2);
  v_screenshot_enabled BOOLEAN;
  v_screenshot_quote_min DECIMAL(10,2);
  v_screenshot_lines_total DECIMAL(10,2);
  v_screenshot_topup DECIMAL(10,2);
  v_auto_discount_suppressed BOOLEAN;
BEGIN
  IF quote_is_post_payment_locked(p_quote_id) THEN
    RETURN;
  END IF;

  SELECT COALESCE(tr.rate, 0.05) INTO v_tax_rate
  FROM quotes q
  LEFT JOIN tax_rates tr ON q.tax_rate_id = tr.id
  WHERE q.id = p_quote_id;
  v_tax_rate := COALESCE(v_tax_rate, 0.05);

  SELECT
    is_rush,
    COALESCE(turnaround_type, 'standard'),
    COALESCE(rush_fee_type, 'auto'),
    rush_fee_custom_value,
    COALESCE(delivery_fee, 0),
    COALESCE(auto_discount_suppressed, false)
  INTO v_is_rush, v_turnaround_type, v_rush_fee_type, v_rush_fee_custom_value, v_delivery_fee, v_auto_discount_suppressed
  FROM quotes
  WHERE id = p_quote_id;

  SELECT COALESCE(setting_value::DECIMAL, 0.30) INTO v_rush_multiplier
  FROM app_settings WHERE setting_key = 'rush_multiplier';
  v_rush_multiplier := COALESCE(v_rush_multiplier, 0.30);

  SELECT COALESCE(setting_value::DECIMAL, 2.00) INTO v_same_day_multiplier
  FROM app_settings WHERE setting_key = 'same_day_multiplier';
  v_same_day_multiplier := COALESCE(v_same_day_multiplier, 2.00);

  SELECT COALESCE(q.language_multiplier_override, l.multiplier, 1.0)
  INTO v_language_multiplier
  FROM quotes q
  LEFT JOIN languages l ON q.source_language_id = l.id
  WHERE q.id = p_quote_id;

  SELECT
    COALESCE(SUM(line_total), 0),
    COALESCE(SUM(certification_price), 0) +
      COALESCE((SELECT SUM(price) FROM document_certifications dc
                JOIN ai_analysis_results ar ON dc.analysis_id = ar.id
                WHERE ar.quote_id = p_quote_id
                  AND ar.deleted_at IS NULL
                  AND dc.is_primary = false), 0)
  INTO v_translation_total, v_doc_certification_total
  FROM ai_analysis_results
  WHERE quote_id = p_quote_id
    AND deleted_at IS NULL;

  SELECT COALESCE(SUM(price * quantity), 0) INTO v_quote_certification_total
  FROM quote_certifications
  WHERE quote_id = p_quote_id;

  v_certification_total := v_doc_certification_total + v_quote_certification_total;

  v_subtotal := v_translation_total;
  v_pct_base := v_subtotal + v_certification_total;

  DELETE FROM quote_adjustments
  WHERE quote_id = p_quote_id AND reason = 'auto_screenshot_minimum';

  SELECT (setting_value = 'true' OR setting_value = '1') INTO v_screenshot_enabled
  FROM app_settings WHERE setting_key = 'screenshot_pricing_enabled';
  v_screenshot_enabled := COALESCE(v_screenshot_enabled, true);

  IF v_screenshot_enabled = true THEN
    SELECT COALESCE(setting_value::DECIMAL, 120.00) INTO v_screenshot_quote_min
    FROM app_settings WHERE setting_key = 'screenshot_quote_minimum';
    v_screenshot_quote_min := COALESCE(v_screenshot_quote_min, 120.00);

    SELECT COALESCE(SUM(line_total), 0)
      INTO v_screenshot_lines_total
    FROM ai_analysis_results
    WHERE quote_id = p_quote_id
      AND deleted_at IS NULL
      AND detected_document_type = 'chat_screenshot'
      AND COALESCE(is_excluded, false) = false;

    IF v_screenshot_lines_total > 0
       AND v_screenshot_lines_total < v_screenshot_quote_min THEN
      v_screenshot_topup := ROUND(v_screenshot_quote_min - v_screenshot_lines_total, 2);
      INSERT INTO quote_adjustments (
        id, quote_id, adjustment_type, value_type, value,
        calculated_amount, reason, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), p_quote_id, 'surcharge', 'fixed',
        v_screenshot_topup, v_screenshot_topup, 'auto_screenshot_minimum',
        NOW(), NOW()
      );
    END IF;
  END IF;

  DELETE FROM quote_adjustments
  WHERE quote_id = p_quote_id AND reason = 'auto_volume_discount';

  IF v_pct_base >= 2000 THEN
    v_volume_discount_pct := 15;
  ELSIF v_pct_base >= 1000 THEN
    v_volume_discount_pct := 10;
  ELSE
    v_volume_discount_pct := 0;
  END IF;

  IF v_volume_discount_pct > 0 AND NOT v_auto_discount_suppressed THEN
    v_volume_discount_amount := ROUND(v_pct_base * v_volume_discount_pct / 100, 2);
    INSERT INTO quote_adjustments (
      id, quote_id, adjustment_type, value_type, value,
      calculated_amount, reason, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_quote_id, 'discount', 'percentage',
      v_volume_discount_pct, -v_volume_discount_amount, 'auto_volume_discount',
      NOW(), NOW()
    );
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN adjustment_type = 'discount' THEN
        CASE WHEN value_type = 'percentage' THEN -1 * (v_pct_base * value / 100) ELSE -1 * value END
      WHEN adjustment_type = 'surcharge' THEN
        CASE WHEN value_type = 'percentage' THEN (v_pct_base * value / 100) ELSE value END
    END
  ), 0) INTO v_adjustments_total
  FROM quote_adjustments
  WHERE quote_id = p_quote_id;

  UPDATE quote_adjustments
  SET calculated_amount =
    CASE
      WHEN adjustment_type = 'discount' THEN
        CASE WHEN value_type = 'percentage' THEN -1 * (v_pct_base * value / 100) ELSE -1 * value END
      WHEN adjustment_type = 'surcharge' THEN
        CASE WHEN value_type = 'percentage' THEN (v_pct_base * value / 100) ELSE value END
    END
  WHERE quote_id = p_quote_id;

  v_fee_base := v_pct_base + v_adjustments_total;

  IF v_rush_fee_type = 'fixed' AND v_rush_fee_custom_value IS NOT NULL THEN
    v_rush_fee := v_rush_fee_custom_value;
  ELSIF v_rush_fee_type = 'percentage' AND v_rush_fee_custom_value IS NOT NULL THEN
    v_rush_fee := v_fee_base * (v_rush_fee_custom_value / 100);
  ELSIF v_turnaround_type = 'same_day' THEN
    v_rush_fee := v_fee_base * (v_same_day_multiplier - 1);
  ELSIF v_turnaround_type = 'rush' OR v_is_rush THEN
    v_rush_fee := v_fee_base * v_rush_multiplier;
  ELSE
    v_rush_fee := 0;
  END IF;

  v_tax_amount := ROUND(
    (v_subtotal + v_certification_total + v_adjustments_total + v_rush_fee + v_delivery_fee) * v_tax_rate,
    2
  );
  v_total :=
    v_subtotal + v_certification_total + v_adjustments_total + v_rush_fee + v_delivery_fee + v_tax_amount;

  UPDATE quotes
  SET
    surcharge_total = (
      SELECT COALESCE(SUM(
        CASE WHEN value_type = 'percentage' THEN (v_pct_base * value / 100) ELSE value END
      ), 0)
      FROM quote_adjustments
      WHERE quote_id = p_quote_id AND adjustment_type = 'surcharge'
    ),
    discount_total = (
      SELECT COALESCE(SUM(
        CASE WHEN value_type = 'percentage' THEN (v_pct_base * value / 100) ELSE value END
      ), 0)
      FROM quote_adjustments
      WHERE quote_id = p_quote_id AND adjustment_type = 'discount'
    )
  WHERE id = p_quote_id;

  UPDATE quotes
  SET
    subtotal = v_subtotal,
    certification_total = v_certification_total,
    rush_fee = v_rush_fee,
    tax_rate = v_tax_rate,
    tax_amount = v_tax_amount,
    total = v_total,
    is_rush = (v_turnaround_type IN ('rush', 'same_day')),
    calculated_totals = jsonb_build_object(
      'translation_total', v_translation_total,
      'doc_certification_total', v_doc_certification_total,
      'quote_certification_total', v_quote_certification_total,
      'certification_total', v_certification_total,
      'subtotal', v_subtotal,
      'pct_base', v_pct_base,
      'adjustments_total', v_adjustments_total,
      'rush_fee', v_rush_fee,
      'rush_fee_type', v_rush_fee_type,
      'rush_multiplier_used', CASE
        WHEN v_rush_fee_type = 'fixed' THEN NULL
        WHEN v_rush_fee_type = 'percentage' THEN v_rush_fee_custom_value
        WHEN v_turnaround_type = 'same_day' THEN (v_same_day_multiplier - 1) * 100
        WHEN v_turnaround_type = 'rush' THEN v_rush_multiplier * 100
        ELSE 0
      END,
      'turnaround_type', v_turnaround_type,
      'delivery_fee', v_delivery_fee,
      'tax_rate', v_tax_rate,
      'tax_amount', v_tax_amount,
      'pre_tax', v_subtotal + v_certification_total + v_adjustments_total + v_rush_fee + v_delivery_fee,
      'total', v_total,
      'language_multiplier', v_language_multiplier
    ),
    updated_at = NOW()
  WHERE id = p_quote_id;
END;
$$;

COMMIT;
