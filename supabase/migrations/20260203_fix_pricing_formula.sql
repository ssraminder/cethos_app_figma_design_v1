-- ============================================================================
-- CETHOS: Fix Pricing Formula - 250 → 225 Words Per Page
-- Migration: 20260203_fix_pricing_formula.sql
--
-- Issue: Database functions had hardcoded 250 words/page instead of 225
-- Reference: app_settings.words_per_page = 225
-- ============================================================================

-- ============================================================================
-- 1. RECREATE VIEW: v_document_groups_with_items
-- Fixed: 250 → 225 in billable pages calculation
-- ============================================================================

DROP VIEW IF EXISTS v_document_groups_with_items;
CREATE OR REPLACE VIEW v_document_groups_with_items AS
SELECT
  dg.id as group_id,
  dg.quote_id,
  dg.group_number,
  dg.group_label,
  dg.document_type,
  dg.complexity,
  dg.complexity_multiplier,
  dg.certification_type_id,
  ct.name as certification_type_name,
  COALESCE(dg.certification_price, ct.price, 0) as certification_price,
  dg.is_ai_suggested,
  dg.ai_confidence,
  dg.analysis_status,
  dg.last_analyzed_at,
  -- Calculated stats from assignments
  COALESCE(stats.total_pages, 0) as total_pages,
  COALESCE(stats.total_word_count, 0) as total_word_count,
  COALESCE(stats.billable_pages, 0) as billable_pages,
  COALESCE(stats.line_total, 0) as line_total,
  -- Assigned items as JSONB array
  COALESCE(items.assigned_items, '[]'::jsonb) as assigned_items
FROM quote_document_groups dg
LEFT JOIN certification_types ct ON ct.id = dg.certification_type_id
-- Calculate stats from assignments
LEFT JOIN LATERAL (
  SELECT
    SUM(
      CASE
        -- For file assignments: get page count from analysis or default to 1
        WHEN a.file_id IS NOT NULL THEN COALESCE(ar.page_count, 1)
        -- For page assignments: always 1 page
        ELSE 1
      END
    )::INTEGER as total_pages,
    SUM(
      COALESCE(
        a.word_count_override,
        CASE
          -- For file: get words from analysis
          WHEN a.file_id IS NOT NULL THEN ar.word_count
          -- For page: get words from quote_pages
          ELSE qp.word_count
        END,
        0
      )
    )::INTEGER as total_word_count,
    -- Billable pages calculation: words / 225 * complexity_multiplier, minimum 1 if has items
    GREATEST(
      CASE WHEN COUNT(a.id) > 0 THEN 1 ELSE 0 END,
      CEIL(
        SUM(
          COALESCE(
            a.word_count_override,
            CASE
              WHEN a.file_id IS NOT NULL THEN ar.word_count
              ELSE qp.word_count
            END,
            0
          )
        )::DECIMAL / NULLIF(225, 0) * COALESCE(dg.complexity_multiplier, 1.0)
      )
    ) as billable_pages,
    -- Line total: billable_pages * per_page_rate (default $65) + certification
    GREATEST(
      CASE WHEN COUNT(a.id) > 0 THEN 1 ELSE 0 END,
      CEIL(
        SUM(
          COALESCE(
            a.word_count_override,
            CASE
              WHEN a.file_id IS NOT NULL THEN ar.word_count
              ELSE qp.word_count
            END,
            0
          )
        )::DECIMAL / NULLIF(225, 0) * COALESCE(dg.complexity_multiplier, 1.0)
      )
    ) * 65.00 + COALESCE(dg.certification_price, ct.price, 0) as line_total
  FROM quote_page_group_assignments a
  LEFT JOIN ai_analysis_results ar ON ar.quote_file_id = a.file_id
  LEFT JOIN quote_pages qp ON qp.id = a.page_id
  WHERE a.group_id = dg.id
) stats ON true
-- Get assigned items as JSON array
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'assignment_id', a.id,
      'file_id', a.file_id,
      'page_id', a.page_id,
      'sequence_order', a.sequence_order,
      'item_type', CASE WHEN a.file_id IS NOT NULL THEN 'file' ELSE 'page' END,
      'page_number', qp.page_number,
      'word_count', COALESCE(
        a.word_count_override,
        CASE
          WHEN a.file_id IS NOT NULL THEN ar.word_count
          ELSE qp.word_count
        END,
        0
      ),
      'file_name', qf.original_filename,
      'storage_path', COALESCE(qp.storage_path, qf.storage_path)
    ) ORDER BY a.sequence_order, qp.page_number
  ) as assigned_items
  FROM quote_page_group_assignments a
  LEFT JOIN quote_files qf ON qf.id = a.file_id OR qf.id = (
    SELECT quote_file_id FROM quote_pages WHERE id = a.page_id
  )
  LEFT JOIN ai_analysis_results ar ON ar.quote_file_id = a.file_id
  LEFT JOIN quote_pages qp ON qp.id = a.page_id
  WHERE a.group_id = dg.id
) items ON true;

-- Re-grant permissions on recreated view
GRANT SELECT ON v_document_groups_with_items TO authenticated;
GRANT SELECT ON v_document_groups_with_items TO anon;

COMMENT ON VIEW v_document_groups_with_items IS 'Document groups with their assigned items and calculated totals derived from assignments. Uses 225 words/page for billable calculation.';

-- ============================================================================
-- 2. RECREATE FUNCTION: recalculate_group_from_assignments(group_id)
-- Fixed: 250 → 225 in billable pages calculation
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_group_from_assignments(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_pages INTEGER;
  v_total_words INTEGER;
  v_billable_pages DECIMAL(10,2);
  v_complexity_mult DECIMAL(5,2);
  v_cert_price DECIMAL(10,2);
  v_line_total DECIMAL(10,2);
  v_per_page_rate DECIMAL(10,2) := 65.00; -- Default rate, could be configurable
BEGIN
  -- Get complexity multiplier and certification price for the group
  SELECT
    COALESCE(dg.complexity_multiplier, 1.0),
    COALESCE(dg.certification_price, ct.price, 0)
  INTO v_complexity_mult, v_cert_price
  FROM quote_document_groups dg
  LEFT JOIN certification_types ct ON ct.id = dg.certification_type_id
  WHERE dg.id = p_group_id;

  -- Calculate totals from assignments
  SELECT
    COALESCE(SUM(
      CASE
        WHEN a.file_id IS NOT NULL THEN COALESCE(ar.page_count, 1)
        ELSE 1
      END
    ), 0)::INTEGER,
    COALESCE(SUM(
      COALESCE(
        a.word_count_override,
        CASE
          WHEN a.file_id IS NOT NULL THEN ar.word_count
          ELSE qp.word_count
        END,
        0
      )
    ), 0)::INTEGER
  INTO v_total_pages, v_total_words
  FROM quote_page_group_assignments a
  LEFT JOIN ai_analysis_results ar ON ar.quote_file_id = a.file_id
  LEFT JOIN quote_pages qp ON qp.id = a.page_id
  WHERE a.group_id = p_group_id;

  -- Calculate billable pages (words / 225 * complexity, minimum 1 if has items)
  IF v_total_words > 0 THEN
    v_billable_pages := GREATEST(1, CEIL(v_total_words::DECIMAL / 225.0 * v_complexity_mult));
  ELSE
    v_billable_pages := 0;
  END IF;

  -- Calculate line total
  v_line_total := (v_billable_pages * v_per_page_rate) + v_cert_price;

  -- Update the group with calculated values
  UPDATE quote_document_groups
  SET
    total_pages = v_total_pages,
    total_word_count = v_total_words,
    billable_pages = v_billable_pages,
    line_total = v_line_total,
    updated_at = NOW()
  WHERE id = p_group_id;
END;
$$;

COMMENT ON FUNCTION recalculate_group_from_assignments(UUID) IS 'Recalculates and caches group totals (pages, words, billable pages, line total) from its assignments. Uses 225 words/page for billable calculation.';

-- ============================================================================
-- 3. SUMMARY
-- ============================================================================
-- Fixed locations:
-- - v_document_groups_with_items: billable_pages calculation (line ~68)
-- - v_document_groups_with_items: line_total calculation (line ~83)
-- - recalculate_group_from_assignments: billable_pages calculation (line ~37)
--
-- All now use 225 words/page to match app_settings.words_per_page
-- ============================================================================
