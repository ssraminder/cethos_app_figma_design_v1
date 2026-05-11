-- ============================================================================
-- 20260511_normalize_subtotal_convention.sql
--
-- Establishes a single canonical pricing convention across quotes, orders,
-- customer_invoices, and the per-row pricing tables. ONLY applies to new
-- recalculations performed after this migration runs — historical data is
-- left untouched (per design call: "moving forward it should be ok").
--
--     subtotal           = translation cost ONLY
--     certification_total = certification cost (always separate)
--     pre_tax            = subtotal + certification_total
--                          + rush_fee + delivery_fee
--                          + surcharge_total - discount_total
--     total              = pre_tax + tax_amount
--
-- Percentage-based rush and adjustment values are applied to
--     base = subtotal + certification_total
-- (option B from the design call — the "goods and services" line, before
-- any fees).
--
-- BEFORE this migration:
--   * recalculate_quote_totals stored quotes.subtotal = translation + cert,
--     causing every downstream consumer that adds certification_total to
--     double count it.
--   * Per-row line_total stored translation + certification combined.
--
-- AFTER this migration (for newly recalculated rows only):
--   * line_total = translation cost only. certification_price stays
--     separate on the row.
--   * quote/order/invoice subtotal = translation only.
--
-- ── Historical data ────────────────────────────────────────────────────────
-- Existing rows are NOT backfilled. Any row that next triggers a recalc
-- (analysis added, group edited, adjustment toggled, etc.) will transition
-- to the new convention. quotes.total, orders.total_amount, and
-- customer_invoices.total_amount were already correct under both
-- conventions, so the bottom-line dollar values do not change.
--
-- The frontend pricing displays in the follow-up PR should compute
-- displayed pre-tax as `total - tax_amount` rather than summing the
-- component fields, so old (un-recalculated) records render a correct
-- Pre-tax line without needing backfill.
-- ============================================================================

BEGIN;

-- ───────────────────────── 1. Per-row recalcs ───────────────────────────────
-- line_total now = translation cost ONLY. certification_price stays its own
-- column.

CREATE OR REPLACE FUNCTION public.recalculate_document_totals(p_analysis_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_excluded BOOLEAN;
  v_base_rate DECIMAL(10,2);
  v_rate_override DECIMAL(10,2);
  v_words_per_page INTEGER;
  v_complexity_multiplier DECIMAL(4,2);
  v_language_multiplier DECIMAL(4,2);
  v_billable_pages DECIMAL(10,2);
  v_per_page_rate DECIMAL(10,2);
  v_translation_cost DECIMAL(10,2);
  v_quote_file_id UUID;
  v_total_word_count INTEGER;
  v_page_count INTEGER;
  page_rec RECORD;
  v_doc_type TEXT;
  v_is_overridden BOOLEAN;
  v_screenshot_enabled BOOLEAN;
  v_screenshot_rate DECIMAL(10,2);
  v_existing_page_count INTEGER;
BEGIN
  SELECT is_excluded, detected_document_type, is_pricing_overridden, page_count
    INTO v_is_excluded, v_doc_type, v_is_overridden, v_existing_page_count
  FROM ai_analysis_results WHERE id = p_analysis_id;

  IF v_is_excluded = true THEN
    UPDATE ai_analysis_results
    SET billable_pages = 0, line_total = 0, updated_at = NOW()
    WHERE id = p_analysis_id;
    RETURN;
  END IF;

  SELECT setting_value::DECIMAL INTO v_base_rate
  FROM app_settings WHERE setting_key = 'base_rate';
  SELECT setting_value::INTEGER INTO v_words_per_page
  FROM app_settings WHERE setting_key = 'words_per_page';
  v_base_rate := COALESCE(v_base_rate, 65.00);
  v_words_per_page := COALESCE(v_words_per_page, 225);

  SELECT (setting_value = 'true' OR setting_value = '1') INTO v_screenshot_enabled
  FROM app_settings WHERE setting_key = 'screenshot_pricing_enabled';
  SELECT setting_value::DECIMAL INTO v_screenshot_rate
  FROM app_settings WHERE setting_key = 'screenshot_rate';
  v_screenshot_enabled := COALESCE(v_screenshot_enabled, true);
  v_screenshot_rate := COALESCE(v_screenshot_rate, 12.00);

  -- BRANCH A: chat_screenshot auto-rule
  IF v_doc_type = 'chat_screenshot'
     AND COALESCE(v_is_overridden, false) = false
     AND v_screenshot_enabled = true THEN
    v_page_count := COALESCE(v_existing_page_count, 1);
    v_billable_pages := v_page_count;
    v_per_page_rate := v_screenshot_rate;
    v_translation_cost := v_billable_pages * v_per_page_rate;

    SELECT COALESCE(SUM(qp.word_count), 0)
      INTO v_total_word_count
    FROM ai_analysis_results ar
    LEFT JOIN quote_pages qp ON qp.quote_file_id = ar.quote_file_id
    WHERE ar.id = p_analysis_id;
    v_total_word_count := COALESCE(v_total_word_count, 0);
    IF v_total_word_count = 0 THEN
      SELECT COALESCE(word_count, 0) INTO v_total_word_count
      FROM ai_analysis_results WHERE id = p_analysis_id;
    END IF;

    UPDATE ai_analysis_results
    SET
      word_count       = v_total_word_count,
      page_count       = v_page_count,
      billable_pages   = v_billable_pages,
      base_rate        = v_per_page_rate,
      -- NORMALIZED: line_total is translation cost ONLY.
      line_total       = v_translation_cost,
      calculation_unit = 'per_screenshot',
      unit_quantity    = v_page_count,
      complexity_multiplier = 1.0,
      updated_at       = NOW()
    WHERE id = p_analysis_id;
    RETURN;
  END IF;

  -- BRANCH B: standard words/225 × language × complexity
  SELECT
    ar.quote_file_id,
    ar.complexity_multiplier,
    COALESCE(l.price_multiplier, 1.0),
    q.base_rate_override
  INTO v_quote_file_id, v_complexity_multiplier, v_language_multiplier, v_rate_override
  FROM ai_analysis_results ar
  JOIN quotes q ON ar.quote_id = q.id
  LEFT JOIN languages l ON q.source_language_id = l.id
  WHERE ar.id = p_analysis_id;

  IF v_rate_override IS NOT NULL THEN
    v_base_rate := v_rate_override;
  END IF;
  v_complexity_multiplier := COALESCE(v_complexity_multiplier, 1.0);

  v_billable_pages := 0;
  v_total_word_count := 0;
  v_page_count := 0;

  FOR page_rec IN
    SELECT qp.word_count FROM quote_pages qp
    WHERE qp.quote_file_id = v_quote_file_id
    ORDER BY qp.page_number
  LOOP
    v_billable_pages := v_billable_pages +
      CEIL((page_rec.word_count::DECIMAL / v_words_per_page) * v_complexity_multiplier * 10) / 10;
    v_total_word_count := v_total_word_count + page_rec.word_count;
    v_page_count := v_page_count + 1;
  END LOOP;

  IF v_page_count = 0 THEN
    SELECT word_count, page_count INTO v_total_word_count, v_page_count
    FROM ai_analysis_results WHERE id = p_analysis_id;
    v_total_word_count := COALESCE(v_total_word_count, 0);
    v_page_count := COALESCE(v_page_count, 1);
    v_billable_pages := CEIL((v_total_word_count::DECIMAL / v_words_per_page) * v_complexity_multiplier * 10) / 10;
  END IF;
  v_billable_pages := GREATEST(v_billable_pages, 1.0);

  IF v_rate_override IS NOT NULL THEN
    v_per_page_rate := v_base_rate * v_language_multiplier;
  ELSE
    v_per_page_rate := CEIL(v_base_rate * v_language_multiplier / 2.5) * 2.5;
  END IF;
  v_translation_cost := v_billable_pages * v_per_page_rate;

  UPDATE ai_analysis_results
  SET
    word_count = v_total_word_count,
    page_count = v_page_count,
    billable_pages = v_billable_pages,
    base_rate = v_per_page_rate,
    -- NORMALIZED: translation cost only.
    line_total = v_translation_cost,
    updated_at = NOW()
  WHERE id = p_analysis_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.recalculate_document_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_pages INTEGER := 0;
  v_total_words INTEGER := 0;
  v_billable_pages NUMERIC(10,2) := 0;
  v_certification_price NUMERIC(10,2) := 0;
  v_complexity_multiplier NUMERIC(4,2) := 1.0;
  v_base_rate NUMERIC(10,2) := 65.00;
  v_rate_override NUMERIC(10,2);
  v_language_multiplier NUMERIC(4,2) := 1.0;
  v_words_per_page INTEGER := 225;
  v_per_page_rate NUMERIC(10,2);
  v_translation_cost NUMERIC(10,2);
  v_quote_id UUID;
BEGIN
  SELECT COALESCE(setting_value::numeric, 65.00) INTO v_base_rate
  FROM app_settings WHERE setting_key = 'base_rate_per_page';
  SELECT COALESCE(setting_value::integer, 225) INTO v_words_per_page
  FROM app_settings WHERE setting_key = 'words_per_page';

  SELECT COALESCE(complexity_multiplier, 1.0) INTO v_complexity_multiplier
  FROM quote_document_groups WHERE id = p_group_id;

  SELECT qdg.quote_id INTO v_quote_id
  FROM quote_document_groups qdg WHERE qdg.id = p_group_id;

  IF v_quote_id IS NOT NULL THEN
    SELECT q.base_rate_override, COALESCE(l.price_multiplier, 1.0)
    INTO v_rate_override, v_language_multiplier
    FROM quotes q
    LEFT JOIN languages l ON q.source_language_id = l.id
    WHERE q.id = v_quote_id;

    IF v_rate_override IS NOT NULL THEN
      v_base_rate := v_rate_override;
    END IF;
  END IF;

  SELECT COALESCE(ct.price, 0) INTO v_certification_price
  FROM quote_document_groups qdg
  LEFT JOIN certification_types ct ON ct.id = qdg.certification_type_id
  WHERE qdg.id = p_group_id;

  SELECT
    COUNT(DISTINCT COALESCE(qpga.page_id::text, qpga.file_id::text)),
    COALESCE(SUM(
      COALESCE(
        (SELECT translatable_word_count FROM ai_analysis_results WHERE quote_file_id = qpga.file_id LIMIT 1),
        qp.word_count,
        (SELECT word_count FROM ai_analysis_results WHERE quote_file_id = qpga.file_id LIMIT 1),
        0
      )
    ), 0)
  INTO v_total_pages, v_total_words
  FROM quote_page_group_assignments qpga
  LEFT JOIN quote_pages qp ON qp.id = qpga.page_id
  WHERE qpga.group_id = p_group_id;

  IF v_total_words > 0 AND v_words_per_page > 0 THEN
    v_billable_pages := CEIL((v_total_words::numeric / v_words_per_page) * v_complexity_multiplier * 10) / 10;
    v_billable_pages := GREATEST(v_billable_pages, 1.0);
  ELSE
    v_billable_pages := 1.0;
  END IF;

  IF v_rate_override IS NOT NULL THEN
    v_per_page_rate := v_base_rate * v_language_multiplier;
  ELSE
    v_per_page_rate := CEIL(v_base_rate * v_language_multiplier / 2.5) * 2.5;
  END IF;
  v_translation_cost := v_billable_pages * v_per_page_rate;

  UPDATE quote_document_groups
  SET
    total_pages = v_total_pages,
    total_word_count = v_total_words,
    billable_pages = v_billable_pages,
    -- NORMALIZED: translation cost only. certification_price stored separately.
    line_total = v_translation_cost,
    certification_price = v_certification_price,
    updated_at = NOW()
  WHERE id = p_group_id;
END;
$$;


-- ───────────────────────── 2. Quote-level recalcs ───────────────────────────

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
  v_pct_base DECIMAL(10,2);          -- subtotal + cert; base for % rush & % adjustments (option B)
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
BEGIN
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
    COALESCE(delivery_fee, 0)
  INTO v_is_rush, v_turnaround_type, v_rush_fee_type, v_rush_fee_custom_value, v_delivery_fee
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

  -- NORMALIZED: line_total is translation only, so SUM(line_total) IS the
  -- translation total. No more "line_total - certification_price" subtract.
  --
  -- IMPORTANT: rows that pre-date this migration still have line_total =
  -- translation+certification. The next time a row's recalc trigger fires
  -- those rows will be recomputed under the new convention. Until then,
  -- summing line_total on an old row over-counts certification — but only
  -- for that one quote's history view. quote.total is computed from the
  -- current sum so it remains correct after any recalc on the quote.
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

  -- NORMALIZED: subtotal = translation only.
  v_subtotal := v_translation_total;
  -- Option B: percentage rush/adjustments apply to (subtotal + cert).
  v_pct_base := v_subtotal + v_certification_total;

  -- AUTO CHAT-SCREENSHOT QUOTE MINIMUM
  DELETE FROM quote_adjustments
  WHERE quote_id = p_quote_id AND reason = 'auto_screenshot_minimum';

  SELECT (setting_value = 'true' OR setting_value = '1') INTO v_screenshot_enabled
  FROM app_settings WHERE setting_key = 'screenshot_pricing_enabled';
  v_screenshot_enabled := COALESCE(v_screenshot_enabled, true);

  IF v_screenshot_enabled = true THEN
    SELECT COALESCE(setting_value::DECIMAL, 120.00) INTO v_screenshot_quote_min
    FROM app_settings WHERE setting_key = 'screenshot_quote_minimum';
    v_screenshot_quote_min := COALESCE(v_screenshot_quote_min, 120.00);

    -- NORMALIZED: line_total is translation only.
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

  -- AUTO VOLUME DISCOUNT (thresholds use pct_base = subtotal + cert)
  DELETE FROM quote_adjustments
  WHERE quote_id = p_quote_id AND reason = 'auto_volume_discount';

  IF v_pct_base >= 2000 THEN
    v_volume_discount_pct := 15;
  ELSIF v_pct_base >= 1000 THEN
    v_volume_discount_pct := 10;
  ELSE
    v_volume_discount_pct := 0;
  END IF;

  IF v_volume_discount_pct > 0 THEN
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

  -- Adjustments total — percentage values use v_pct_base (option B).
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

  -- Rush base — option B: subtotal + cert + adjustments.
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

  -- NORMALIZED tax & total:
  --   pre_tax = subtotal + cert + adjustments + rush + delivery
  --   total   = pre_tax + tax
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
      'subtotal', v_subtotal,                          -- translation only
      'pct_base', v_pct_base,                          -- subtotal + cert
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


CREATE OR REPLACE FUNCTION public.recalculate_quote_from_groups(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_subtotal        DECIMAL(10,2) := 0;
  v_cert_total      DECIMAL(10,2) := 0;
  v_pct_base        DECIMAL(10,2) := 0;
  v_doc_count       INTEGER := 0;
  v_surcharge_total DECIMAL(10,2) := 0;
  v_discount_total  DECIMAL(10,2) := 0;
  v_quote           RECORD;
  v_pre_tax_base    DECIMAL(10,2);
  v_tax_amount      DECIMAL(10,2);
  v_total           DECIMAL(10,2);
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF v_quote IS NULL THEN RETURN; END IF;

  PERFORM recalculate_document_group(id)
  FROM quote_document_groups
  WHERE quote_id = p_quote_id;

  -- NORMALIZED: line_total is translation only.
  SELECT
    COALESCE(SUM(line_total), 0),
    COALESCE(SUM(certification_price), 0),
    COUNT(*)
  INTO v_subtotal, v_cert_total, v_doc_count
  FROM quote_document_groups
  WHERE quote_id = p_quote_id;

  v_pct_base := v_subtotal + v_cert_total;

  SELECT
    COALESCE(SUM(
      CASE WHEN adjustment_type = 'surcharge' THEN
        CASE WHEN value_type = 'percentage'
             THEN ROUND(v_pct_base * (COALESCE(value, 0) / 100), 2)
             ELSE COALESCE(calculated_amount, value, 0)
        END
      ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN adjustment_type = 'discount' THEN
        CASE WHEN value_type = 'percentage'
             THEN ROUND(v_pct_base * (COALESCE(value, 0) / 100), 2)
             ELSE COALESCE(calculated_amount, value, 0)
        END
      ELSE 0 END
    ), 0)
  INTO v_surcharge_total, v_discount_total
  FROM quote_adjustments
  WHERE quote_id = p_quote_id;

  v_pre_tax_base := v_subtotal + v_cert_total
                    + COALESCE(v_quote.rush_fee, 0)
                    + COALESCE(v_quote.delivery_fee, 0)
                    + v_surcharge_total
                    - v_discount_total;

  v_tax_amount := ROUND(v_pre_tax_base * COALESCE(v_quote.tax_rate, 0.05), 2);
  v_total      := v_pre_tax_base + v_tax_amount;

  UPDATE quotes
  SET
    subtotal            = v_subtotal,
    certification_total = v_cert_total,
    surcharge_total     = v_surcharge_total,
    discount_total      = v_discount_total,
    tax_amount          = v_tax_amount,
    total               = v_total,
    calculated_totals   = jsonb_build_object(
      'subtotal',            v_subtotal,              -- translation only
      'translation_total',   v_subtotal,
      'certification_total', v_cert_total,
      'pct_base',            v_pct_base,
      'rush_fee',            COALESCE(v_quote.rush_fee, 0),
      'delivery_fee',        COALESCE(v_quote.delivery_fee, 0),
      'surcharge_total',     v_surcharge_total,
      'discount_total',      v_discount_total,
      'pre_tax',             v_pre_tax_base,
      'tax_amount',          v_tax_amount,
      'total',               v_total,
      'document_count',      v_doc_count
    ),
    updated_at = NOW()
  WHERE id = p_quote_id;
END;
$$;

COMMIT;
