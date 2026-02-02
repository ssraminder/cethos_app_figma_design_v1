-- ============================================================================
-- CETHOS: Unified Document Group Editor Migration
-- Fixes document group assignment and calculation issues for HITL, Manual Quote, and Order Edit
-- Migration: 20260202_document_group_editor.sql
-- ============================================================================

-- ============================================================================
-- 1. ENSURE quote_document_groups TABLE EXISTS WITH PROPER COLUMNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS quote_document_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  group_number INTEGER NOT NULL,
  group_label VARCHAR(255),
  document_type VARCHAR(100),
  complexity VARCHAR(50) DEFAULT 'easy',
  complexity_multiplier DECIMAL(5,2) DEFAULT 1.0,

  -- Stats (calculated from assignments, but cached for performance)
  total_pages INTEGER DEFAULT 0,
  total_word_count INTEGER DEFAULT 0,
  billable_pages DECIMAL(10,2) DEFAULT 0,
  line_total DECIMAL(10,2) DEFAULT 0,

  -- Certification
  certification_type_id UUID REFERENCES certification_types(id),
  certification_price DECIMAL(10,2) DEFAULT 0,

  -- AI metadata
  is_ai_suggested BOOLEAN DEFAULT FALSE,
  ai_confidence DECIMAL(5,4),
  analysis_status VARCHAR(50) DEFAULT 'pending',
  last_analyzed_at TIMESTAMPTZ,

  -- Audit
  created_by_staff_id UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_quote_group_number UNIQUE (quote_id, group_number)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_doc_groups_quote ON quote_document_groups(quote_id);
CREATE INDEX IF NOT EXISTS idx_doc_groups_analysis_status ON quote_document_groups(analysis_status);

-- Enable RLS
ALTER TABLE quote_document_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS doc_groups_select ON quote_document_groups;
CREATE POLICY doc_groups_select ON quote_document_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS doc_groups_insert ON quote_document_groups;
CREATE POLICY doc_groups_insert ON quote_document_groups FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS doc_groups_update ON quote_document_groups;
CREATE POLICY doc_groups_update ON quote_document_groups FOR UPDATE USING (true);

DROP POLICY IF EXISTS doc_groups_delete ON quote_document_groups;
CREATE POLICY doc_groups_delete ON quote_document_groups FOR DELETE USING (true);

-- ============================================================================
-- 2. ENSURE quote_page_group_assignments TABLE EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS quote_page_group_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES quote_document_groups(id) ON DELETE CASCADE,

  -- Item reference (EITHER file_id OR page_id, never both)
  file_id UUID REFERENCES quote_files(id) ON DELETE CASCADE,
  page_id UUID REFERENCES quote_pages(id) ON DELETE CASCADE,

  -- Sequence within the group
  sequence_order INTEGER DEFAULT 0,

  -- Manual override for word count (when no AI analysis available)
  word_count_override INTEGER,

  -- Tracking who assigned
  assigned_by_ai BOOLEAN DEFAULT FALSE,
  assigned_by_staff_id UUID REFERENCES staff_users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: must have exactly one of file_id or page_id
  CONSTRAINT assignment_item_xor CHECK (
    (file_id IS NOT NULL AND page_id IS NULL) OR
    (file_id IS NULL AND page_id IS NOT NULL)
  ),

  -- Constraint: file can only be assigned to one group
  CONSTRAINT unique_file_assignment UNIQUE (quote_id, file_id),

  -- Constraint: page can only be assigned to one group
  CONSTRAINT unique_page_assignment UNIQUE (quote_id, page_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_page_assignments_quote ON quote_page_group_assignments(quote_id);
CREATE INDEX IF NOT EXISTS idx_page_assignments_group ON quote_page_group_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_page_assignments_file ON quote_page_group_assignments(file_id) WHERE file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_assignments_page ON quote_page_group_assignments(page_id) WHERE page_id IS NOT NULL;

-- Enable RLS
ALTER TABLE quote_page_group_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS page_assign_select ON quote_page_group_assignments;
CREATE POLICY page_assign_select ON quote_page_group_assignments FOR SELECT USING (true);

DROP POLICY IF EXISTS page_assign_insert ON quote_page_group_assignments;
CREATE POLICY page_assign_insert ON quote_page_group_assignments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS page_assign_update ON quote_page_group_assignments;
CREATE POLICY page_assign_update ON quote_page_group_assignments FOR UPDATE USING (true);

DROP POLICY IF EXISTS page_assign_delete ON quote_page_group_assignments;
CREATE POLICY page_assign_delete ON quote_page_group_assignments FOR DELETE USING (true);

-- ============================================================================
-- 3. ENSURE quote_pages TABLE EXISTS (for page-level assignments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS quote_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_file_id UUID NOT NULL REFERENCES quote_files(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  word_count INTEGER DEFAULT 0,
  thumbnail_path TEXT,
  storage_path TEXT,
  ocr_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_file_page UNIQUE (quote_file_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_quote_pages_file ON quote_pages(quote_file_id);

ALTER TABLE quote_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_pages_select ON quote_pages;
CREATE POLICY quote_pages_select ON quote_pages FOR SELECT USING (true);

DROP POLICY IF EXISTS quote_pages_insert ON quote_pages;
CREATE POLICY quote_pages_insert ON quote_pages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS quote_pages_update ON quote_pages;
CREATE POLICY quote_pages_update ON quote_pages FOR UPDATE USING (true);

DROP POLICY IF EXISTS quote_pages_delete ON quote_pages;
CREATE POLICY quote_pages_delete ON quote_pages FOR DELETE USING (true);

-- ============================================================================
-- 4. CREATE VIEW: v_unassigned_quote_items
-- Returns files and pages that are NOT assigned to any group
-- ============================================================================

DROP VIEW IF EXISTS v_unassigned_quote_items;
CREATE OR REPLACE VIEW v_unassigned_quote_items AS
-- Unassigned entire files (file not directly assigned AND no pages from this file assigned)
SELECT
  qf.quote_id,
  'file' as item_type,
  qf.id as item_id,
  qf.id as file_id,
  NULL::UUID as page_id,
  NULL::INTEGER as page_number,
  COALESCE(ar.word_count, 0) as word_count,
  qf.original_filename as file_name,
  qf.storage_path,
  (ar.id IS NOT NULL) as has_analysis,
  ar.id as analysis_id,
  COALESCE(ar.page_count, 1) as page_count,
  ar.detected_document_type,
  ar.detected_language,
  ar.assessed_complexity
FROM quote_files qf
LEFT JOIN ai_analysis_results ar ON ar.quote_file_id = qf.id
WHERE qf.deleted_at IS NULL
  -- File itself is not assigned to any group
  AND NOT EXISTS (
    SELECT 1 FROM quote_page_group_assignments a
    WHERE a.file_id = qf.id
  )
  -- No pages from this file are assigned to any group
  AND NOT EXISTS (
    SELECT 1 FROM quote_page_group_assignments a
    JOIN quote_pages p ON p.id = a.page_id
    WHERE p.quote_file_id = qf.id
  )

UNION ALL

-- Unassigned individual pages (only shown when file has split page assignments)
SELECT
  qf.quote_id,
  'page' as item_type,
  qp.id as item_id,
  qp.quote_file_id as file_id,
  qp.id as page_id,
  qp.page_number,
  COALESCE(qp.word_count, 0) as word_count,
  qf.original_filename as file_name,
  COALESCE(qp.storage_path, qf.storage_path) as storage_path,
  TRUE as has_analysis,
  NULL::UUID as analysis_id,
  1 as page_count,
  NULL as detected_document_type,
  NULL as detected_language,
  NULL as assessed_complexity
FROM quote_pages qp
JOIN quote_files qf ON qf.id = qp.quote_file_id
WHERE qf.deleted_at IS NULL
  -- Page is not assigned
  AND NOT EXISTS (
    SELECT 1 FROM quote_page_group_assignments a
    WHERE a.page_id = qp.id
  )
  -- File is not assigned as whole (if file is assigned, pages are implicit)
  AND NOT EXISTS (
    SELECT 1 FROM quote_page_group_assignments a
    WHERE a.file_id = qp.quote_file_id
  )
  -- Only show individual pages if this file has SOME pages assigned (split scenario)
  AND EXISTS (
    SELECT 1 FROM quote_page_group_assignments a
    JOIN quote_pages p ON p.id = a.page_id
    WHERE p.quote_file_id = qp.quote_file_id
  );

-- ============================================================================
-- 5. CREATE VIEW: v_document_groups_with_items
-- Returns document groups with their assigned items aggregated
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
    -- Billable pages calculation: words / 250 * complexity_multiplier, minimum 1 if has items
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
        )::DECIMAL / NULLIF(250, 0) * COALESCE(dg.complexity_multiplier, 1.0)
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
        )::DECIMAL / NULLIF(250, 0) * COALESCE(dg.complexity_multiplier, 1.0)
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

-- ============================================================================
-- 6. FUNCTION: get_unassigned_items(quote_id)
-- More efficient function-based approach for getting unassigned items
-- ============================================================================

CREATE OR REPLACE FUNCTION get_unassigned_items(p_quote_id UUID)
RETURNS TABLE (
  quote_id UUID,
  item_type TEXT,
  item_id UUID,
  file_id UUID,
  page_id UUID,
  page_number INTEGER,
  word_count INTEGER,
  file_name TEXT,
  storage_path TEXT,
  has_analysis BOOLEAN,
  analysis_id UUID,
  page_count INTEGER,
  detected_document_type TEXT,
  detected_language TEXT,
  assessed_complexity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM v_unassigned_quote_items v
  WHERE v.quote_id = p_quote_id;
END;
$$;

-- ============================================================================
-- 7. FUNCTION: recalculate_group_from_assignments(group_id)
-- Recalculates and caches group totals from assigned items
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

  -- Calculate billable pages (words / 250 * complexity, minimum 1 if has items)
  IF v_total_words > 0 THEN
    v_billable_pages := GREATEST(1, CEIL(v_total_words::DECIMAL / 250.0 * v_complexity_mult));
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

-- ============================================================================
-- 8. FUNCTION: create_document_group(quote_id, label, doc_type, complexity, staff_id)
-- Creates a new document group with auto-incrementing group_number
-- ============================================================================

CREATE OR REPLACE FUNCTION create_document_group(
  p_quote_id UUID,
  p_group_label TEXT,
  p_document_type TEXT,
  p_complexity TEXT DEFAULT 'easy',
  p_staff_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_number INTEGER;
  v_complexity_mult DECIMAL(5,2);
  v_new_group_id UUID;
  v_default_cert_id UUID;
  v_default_cert_price DECIMAL(10,2);
BEGIN
  -- Get next group number for this quote
  SELECT COALESCE(MAX(group_number), 0) + 1 INTO v_group_number
  FROM quote_document_groups
  WHERE quote_id = p_quote_id;

  -- Map complexity to multiplier
  v_complexity_mult := CASE p_complexity
    WHEN 'easy' THEN 1.0
    WHEN 'medium' THEN 1.15
    WHEN 'hard' THEN 1.25
    ELSE 1.0
  END;

  -- Get default certification
  SELECT id, price INTO v_default_cert_id, v_default_cert_price
  FROM certification_types
  WHERE is_active = true
  ORDER BY is_default DESC NULLS LAST, sort_order ASC
  LIMIT 1;

  -- Insert new group
  INSERT INTO quote_document_groups (
    quote_id,
    group_number,
    group_label,
    document_type,
    complexity,
    complexity_multiplier,
    certification_type_id,
    certification_price,
    is_ai_suggested,
    analysis_status,
    created_by_staff_id
  ) VALUES (
    p_quote_id,
    v_group_number,
    p_group_label,
    p_document_type,
    p_complexity,
    v_complexity_mult,
    v_default_cert_id,
    COALESCE(v_default_cert_price, 0),
    FALSE,
    'pending',
    p_staff_id
  )
  RETURNING id INTO v_new_group_id;

  RETURN v_new_group_id;
END;
$$;

-- ============================================================================
-- 9. FUNCTION: assign_item_to_group(group_id, item_type, item_id, staff_id)
-- Assigns a file or page to a document group
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_item_to_group(
  p_group_id UUID,
  p_item_type TEXT, -- 'file' or 'page'
  p_item_id UUID,
  p_staff_id UUID DEFAULT NULL,
  p_word_count_override INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_id UUID;
  v_next_sequence INTEGER;
  v_assignment_id UUID;
BEGIN
  -- Get quote_id from group
  SELECT quote_id INTO v_quote_id
  FROM quote_document_groups
  WHERE id = p_group_id;

  IF v_quote_id IS NULL THEN
    RAISE EXCEPTION 'Document group not found';
  END IF;

  -- Get next sequence order
  SELECT COALESCE(MAX(sequence_order), 0) + 1 INTO v_next_sequence
  FROM quote_page_group_assignments
  WHERE group_id = p_group_id;

  -- Insert assignment
  IF p_item_type = 'file' THEN
    INSERT INTO quote_page_group_assignments (
      quote_id,
      group_id,
      file_id,
      sequence_order,
      word_count_override,
      assigned_by_ai,
      assigned_by_staff_id,
      assigned_at
    ) VALUES (
      v_quote_id,
      p_group_id,
      p_item_id,
      v_next_sequence,
      p_word_count_override,
      FALSE,
      p_staff_id,
      NOW()
    )
    RETURNING id INTO v_assignment_id;
  ELSIF p_item_type = 'page' THEN
    INSERT INTO quote_page_group_assignments (
      quote_id,
      group_id,
      page_id,
      sequence_order,
      word_count_override,
      assigned_by_ai,
      assigned_by_staff_id,
      assigned_at
    ) VALUES (
      v_quote_id,
      p_group_id,
      p_item_id,
      v_next_sequence,
      p_word_count_override,
      FALSE,
      p_staff_id,
      NOW()
    )
    RETURNING id INTO v_assignment_id;
  ELSE
    RAISE EXCEPTION 'Invalid item_type: must be file or page';
  END IF;

  -- Recalculate group totals
  PERFORM recalculate_group_from_assignments(p_group_id);

  RETURN v_assignment_id;
END;
$$;

-- ============================================================================
-- 10. FUNCTION: unassign_item_from_group(assignment_id)
-- Removes an item from a document group
-- ============================================================================

CREATE OR REPLACE FUNCTION unassign_item_from_group(p_assignment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  -- Get group_id before deleting
  SELECT group_id INTO v_group_id
  FROM quote_page_group_assignments
  WHERE id = p_assignment_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  -- Delete the assignment
  DELETE FROM quote_page_group_assignments
  WHERE id = p_assignment_id;

  -- Recalculate group totals
  PERFORM recalculate_group_from_assignments(v_group_id);
END;
$$;

-- ============================================================================
-- 11. FUNCTION: delete_document_group(group_id)
-- Deletes a document group and all its assignments
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_document_group(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_id UUID;
BEGIN
  -- Get quote_id for renumbering
  SELECT quote_id INTO v_quote_id
  FROM quote_document_groups
  WHERE id = p_group_id;

  -- Delete assignments first (cascade should handle this, but explicit is safer)
  DELETE FROM quote_page_group_assignments
  WHERE group_id = p_group_id;

  -- Delete the group
  DELETE FROM quote_document_groups
  WHERE id = p_group_id;

  -- Renumber remaining groups for this quote
  WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY group_number) as new_number
    FROM quote_document_groups
    WHERE quote_id = v_quote_id
  )
  UPDATE quote_document_groups dg
  SET group_number = n.new_number
  FROM numbered n
  WHERE dg.id = n.id;
END;
$$;

-- ============================================================================
-- 12. FUNCTION: update_document_group(group_id, label, doc_type, complexity, cert_id)
-- Updates document group properties and recalculates totals
-- ============================================================================

CREATE OR REPLACE FUNCTION update_document_group(
  p_group_id UUID,
  p_group_label TEXT DEFAULT NULL,
  p_document_type TEXT DEFAULT NULL,
  p_complexity TEXT DEFAULT NULL,
  p_certification_type_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_complexity_mult DECIMAL(5,2);
  v_cert_price DECIMAL(10,2);
BEGIN
  -- Calculate complexity multiplier if complexity changed
  IF p_complexity IS NOT NULL THEN
    v_complexity_mult := CASE p_complexity
      WHEN 'easy' THEN 1.0
      WHEN 'medium' THEN 1.15
      WHEN 'hard' THEN 1.25
      ELSE 1.0
    END;
  END IF;

  -- Get certification price if changed
  IF p_certification_type_id IS NOT NULL THEN
    SELECT price INTO v_cert_price
    FROM certification_types
    WHERE id = p_certification_type_id;
  END IF;

  -- Update the group
  UPDATE quote_document_groups
  SET
    group_label = COALESCE(p_group_label, group_label),
    document_type = COALESCE(p_document_type, document_type),
    complexity = COALESCE(p_complexity, complexity),
    complexity_multiplier = COALESCE(v_complexity_mult, complexity_multiplier),
    certification_type_id = COALESCE(p_certification_type_id, certification_type_id),
    certification_price = COALESCE(v_cert_price, certification_price),
    updated_at = NOW()
  WHERE id = p_group_id;

  -- Recalculate totals with new multiplier/certification
  PERFORM recalculate_group_from_assignments(p_group_id);
END;
$$;

-- ============================================================================
-- 13. TRIGGER: Auto-recalculate group when assignment changes
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_recalc_group_on_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_group_from_assignments(OLD.group_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_group_from_assignments(NEW.group_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_group_on_assignment ON quote_page_group_assignments;
CREATE TRIGGER trg_recalc_group_on_assignment
  AFTER INSERT OR UPDATE OR DELETE ON quote_page_group_assignments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalc_group_on_assignment_change();

-- ============================================================================
-- 14. GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON quote_document_groups TO authenticated;
GRANT ALL ON quote_document_groups TO anon;
GRANT ALL ON quote_page_group_assignments TO authenticated;
GRANT ALL ON quote_page_group_assignments TO anon;
GRANT ALL ON quote_pages TO authenticated;
GRANT ALL ON quote_pages TO anon;

GRANT SELECT ON v_unassigned_quote_items TO authenticated;
GRANT SELECT ON v_unassigned_quote_items TO anon;
GRANT SELECT ON v_document_groups_with_items TO authenticated;
GRANT SELECT ON v_document_groups_with_items TO anon;

GRANT EXECUTE ON FUNCTION get_unassigned_items(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unassigned_items(UUID) TO anon;
GRANT EXECUTE ON FUNCTION recalculate_group_from_assignments(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_group_from_assignments(UUID) TO anon;
GRANT EXECUTE ON FUNCTION create_document_group(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_document_group(UUID, TEXT, TEXT, TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION assign_item_to_group(UUID, TEXT, UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_item_to_group(UUID, TEXT, UUID, UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION unassign_item_from_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unassign_item_from_group(UUID) TO anon;
GRANT EXECUTE ON FUNCTION delete_document_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_document_group(UUID) TO anon;
GRANT EXECUTE ON FUNCTION update_document_group(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_document_group(UUID, TEXT, TEXT, TEXT, UUID) TO anon;

-- ============================================================================
-- 15. COMMENTS
-- ============================================================================

COMMENT ON VIEW v_unassigned_quote_items IS 'Files and pages not yet assigned to any document group. Shows files first, then individual pages only when file has split assignments.';
COMMENT ON VIEW v_document_groups_with_items IS 'Document groups with their assigned items and calculated totals derived from assignments.';
COMMENT ON FUNCTION get_unassigned_items(UUID) IS 'Returns unassigned files and pages for a quote.';
COMMENT ON FUNCTION recalculate_group_from_assignments(UUID) IS 'Recalculates and caches group totals (pages, words, billable pages, line total) from its assignments.';
COMMENT ON FUNCTION create_document_group(UUID, TEXT, TEXT, TEXT, UUID) IS 'Creates a new document group with auto-incrementing group number.';
COMMENT ON FUNCTION assign_item_to_group(UUID, TEXT, UUID, UUID, INTEGER) IS 'Assigns a file or page to a document group and recalculates totals.';
COMMENT ON FUNCTION unassign_item_from_group(UUID) IS 'Removes an item from a group and recalculates totals.';
COMMENT ON FUNCTION delete_document_group(UUID) IS 'Deletes a document group and renumbers remaining groups.';
COMMENT ON FUNCTION update_document_group(UUID, TEXT, TEXT, TEXT, UUID) IS 'Updates group properties and recalculates totals.';

-- ============================================================================
-- 16. LEGACY COMPATIBILITY FUNCTIONS
-- These functions maintain backwards compatibility with existing HITL code
-- ============================================================================

-- Alias for recalculate_group_from_assignments (used by HITLReviewDetail)
CREATE OR REPLACE FUNCTION recalculate_document_group(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM recalculate_group_from_assignments(p_group_id);
END;
$$;

-- Assign a page to a group (convenience wrapper)
CREATE OR REPLACE FUNCTION assign_page_to_group(
  p_group_id UUID,
  p_page_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN assign_item_to_group(p_group_id, 'page', p_page_id, p_staff_id, NULL);
END;
$$;

-- Assign a file to a group (convenience wrapper)
CREATE OR REPLACE FUNCTION assign_file_to_group(
  p_group_id UUID,
  p_file_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN assign_item_to_group(p_group_id, 'file', p_file_id, p_staff_id, NULL);
END;
$$;

-- Remove item from group (alias for unassign_item_from_group)
CREATE OR REPLACE FUNCTION remove_from_group(p_assignment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM unassign_item_from_group(p_assignment_id);
END;
$$;

-- Grant permissions for compatibility functions
GRANT EXECUTE ON FUNCTION recalculate_document_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_document_group(UUID) TO anon;
GRANT EXECUTE ON FUNCTION assign_page_to_group(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_page_to_group(UUID, UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION assign_file_to_group(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_file_to_group(UUID, UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION remove_from_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_from_group(UUID) TO anon;

COMMENT ON FUNCTION recalculate_document_group(UUID) IS 'Alias for recalculate_group_from_assignments - backwards compatibility.';
COMMENT ON FUNCTION assign_page_to_group(UUID, UUID, UUID) IS 'Convenience wrapper to assign a page to a group.';
COMMENT ON FUNCTION assign_file_to_group(UUID, UUID, UUID) IS 'Convenience wrapper to assign a file to a group.';
COMMENT ON FUNCTION remove_from_group(UUID) IS 'Alias for unassign_item_from_group - backwards compatibility.';
