-- ============================================================================
-- Fix Document Grouping Views for HITL Review
--
-- Issues fixed:
-- 1. v_unassigned_quote_items was not showing newly uploaded files with 'skipped' status
-- 2. Word counts were showing as 0 for assigned items
-- 3. Groups were not showing correct item counts
-- ============================================================================

-- ============================================================================
-- 1. FIX: v_unassigned_quote_items
-- This view should return ALL files and pages that are not yet assigned to a group
-- Files with ANY processing status should appear (including 'skipped')
-- ============================================================================

DROP VIEW IF EXISTS v_unassigned_quote_items;

CREATE OR REPLACE VIEW v_unassigned_quote_items AS
-- Part 1: Unassigned FILES (files not in any group assignment)
SELECT
    qf.quote_id,
    'file'::text AS item_type,
    qf.id AS item_id,
    qf.id AS file_id,
    NULL::uuid AS page_id,
    NULL::integer AS page_number,
    COALESCE(
        -- Try to get word count from ai_analysis_results first
        (SELECT word_count FROM ai_analysis_results WHERE quote_file_id = qf.id LIMIT 1),
        -- Otherwise estimate from file size (rough: ~5 chars per word, ~1 byte per char)
        CASE WHEN qf.file_size > 0 THEN GREATEST(1, (qf.file_size / 5)::integer) ELSE 0 END
    ) AS word_count,
    qf.original_filename AS file_name,
    qf.storage_path,
    qf.mime_type,
    qf.ai_processing_status
FROM quote_files qf
WHERE
    -- File is not in any group assignment
    NOT EXISTS (
        SELECT 1
        FROM quote_page_group_assignments qpga
        WHERE qpga.file_id = qf.id
    )
    -- File doesn't have pages that are assigned (if file has pages, pages should be assigned, not the file)
    AND NOT EXISTS (
        SELECT 1
        FROM quote_pages qp
        WHERE qp.quote_file_id = qf.id
    )

UNION ALL

-- Part 2: Unassigned PAGES (pages not in any group assignment)
SELECT
    qf.quote_id,
    'page'::text AS item_type,
    qp.id AS item_id,
    qf.id AS file_id,
    qp.id AS page_id,
    qp.page_number,
    COALESCE(qp.word_count, 0) AS word_count,
    qf.original_filename AS file_name,
    qf.storage_path,
    qf.mime_type,
    qf.ai_processing_status
FROM quote_pages qp
JOIN quote_files qf ON qf.id = qp.quote_file_id
WHERE
    -- Page is not in any group assignment
    NOT EXISTS (
        SELECT 1
        FROM quote_page_group_assignments qpga
        WHERE qpga.page_id = qp.id
    );

-- Grant access
GRANT SELECT ON v_unassigned_quote_items TO authenticated, anon, service_role;

-- ============================================================================
-- 2. FIX: v_document_groups_with_items
-- This view returns document groups with their assigned items as a JSON array
-- ============================================================================

DROP VIEW IF EXISTS v_document_groups_with_items;

CREATE OR REPLACE VIEW v_document_groups_with_items AS
SELECT
    qdg.id AS group_id,
    qdg.quote_id,
    qdg.group_number,
    qdg.group_label,
    qdg.document_type,
    qdg.source_language,
    qdg.complexity,
    qdg.complexity_multiplier,
    qdg.total_pages,
    qdg.total_word_count,
    qdg.billable_pages,
    qdg.line_total,
    qdg.certification_type_id,
    ct.name AS certification_type_name,
    COALESCE(qdg.certification_price, ct.price, 0) AS certification_price,
    qdg.is_ai_suggested,
    qdg.ai_confidence,
    qdg.last_analyzed_at,
    qdg.analysis_status,
    qdg.created_at,
    qdg.updated_at,
    -- Aggregate assigned items as JSON array
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'assignment_id', qpga.id,
                    'page_id', qpga.page_id,
                    'file_id', qpga.file_id,
                    'sequence_order', qpga.sequence_order,
                    'page_number', qp.page_number,
                    'word_count', COALESCE(
                        qp.word_count,  -- Page word count
                        (SELECT word_count FROM ai_analysis_results WHERE quote_file_id = qpga.file_id LIMIT 1),  -- File analysis word count
                        0
                    ),
                    'file_name', qf.original_filename,
                    'storage_path', qf.storage_path,
                    'item_type', CASE WHEN qpga.page_id IS NOT NULL THEN 'page' ELSE 'file' END
                )
                ORDER BY qpga.sequence_order, qp.page_number NULLS LAST
            )
            FROM quote_page_group_assignments qpga
            LEFT JOIN quote_pages qp ON qp.id = qpga.page_id
            LEFT JOIN quote_files qf ON qf.id = COALESCE(qp.quote_file_id, qpga.file_id)
            WHERE qpga.group_id = qdg.id
        ),
        '[]'::json
    ) AS assigned_items
FROM quote_document_groups qdg
LEFT JOIN certification_types ct ON ct.id = qdg.certification_type_id;

-- Grant access
GRANT SELECT ON v_document_groups_with_items TO authenticated, anon, service_role;

-- ============================================================================
-- 3. UPDATE: recalculate_document_group function
-- Make sure it properly calculates word counts from assigned items
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_document_group(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_pages INTEGER := 0;
    v_total_words INTEGER := 0;
    v_billable_pages NUMERIC(10,2) := 0;
    v_line_total NUMERIC(10,2) := 0;
    v_certification_price NUMERIC(10,2) := 0;
    v_complexity_multiplier NUMERIC(4,2) := 1.0;
    v_base_rate NUMERIC(10,2) := 65.00;
    v_words_per_page INTEGER := 225;
BEGIN
    -- Get settings
    SELECT COALESCE(setting_value::numeric, 65.00) INTO v_base_rate
    FROM app_settings WHERE setting_key = 'base_rate_per_page';

    SELECT COALESCE(setting_value::integer, 225) INTO v_words_per_page
    FROM app_settings WHERE setting_key = 'words_per_page';

    -- Get group's complexity multiplier
    SELECT COALESCE(complexity_multiplier, 1.0) INTO v_complexity_multiplier
    FROM quote_document_groups WHERE id = p_group_id;

    -- Get certification price
    SELECT COALESCE(ct.price, 0) INTO v_certification_price
    FROM quote_document_groups qdg
    LEFT JOIN certification_types ct ON ct.id = qdg.certification_type_id
    WHERE qdg.id = p_group_id;

    -- Count assigned items and sum word counts
    SELECT
        COUNT(DISTINCT COALESCE(qpga.page_id::text, qpga.file_id::text)),
        COALESCE(SUM(
            COALESCE(
                qp.word_count,  -- Page word count
                (SELECT word_count FROM ai_analysis_results WHERE quote_file_id = qpga.file_id LIMIT 1),  -- File analysis word count
                0
            )
        ), 0)
    INTO v_total_pages, v_total_words
    FROM quote_page_group_assignments qpga
    LEFT JOIN quote_pages qp ON qp.id = qpga.page_id
    WHERE qpga.group_id = p_group_id;

    -- Calculate billable pages: CEIL((words / words_per_page) * complexity_multiplier * 10) / 10
    IF v_total_words > 0 AND v_words_per_page > 0 THEN
        v_billable_pages := CEIL((v_total_words::numeric / v_words_per_page) * v_complexity_multiplier * 10) / 10;
    ELSE
        v_billable_pages := 1.0;  -- Minimum 1 billable page
    END IF;

    -- Calculate line total: (billable_pages * base_rate) rounded to nearest $2.50 + certification
    v_line_total := CEIL((v_billable_pages * v_base_rate) / 2.5) * 2.5 + v_certification_price;

    -- Update the group
    UPDATE quote_document_groups
    SET
        total_pages = v_total_pages,
        total_word_count = v_total_words,
        billable_pages = v_billable_pages,
        line_total = v_line_total,
        certification_price = v_certification_price,
        updated_at = NOW()
    WHERE id = p_group_id;
END;
$$;

-- ============================================================================
-- 4. ENSURE: assign_file_to_group function exists and works properly
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_file_to_group(
    p_group_id UUID,
    p_file_id UUID,
    p_staff_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assignment_id UUID;
    v_next_sequence INTEGER;
BEGIN
    -- Get next sequence order for this group
    SELECT COALESCE(MAX(sequence_order), 0) + 1 INTO v_next_sequence
    FROM quote_page_group_assignments
    WHERE group_id = p_group_id;

    -- Check if file is already assigned to this group
    SELECT id INTO v_assignment_id
    FROM quote_page_group_assignments
    WHERE group_id = p_group_id AND file_id = p_file_id;

    IF v_assignment_id IS NOT NULL THEN
        -- Already assigned, return existing assignment
        RETURN v_assignment_id;
    END IF;

    -- Remove file from any other groups first
    DELETE FROM quote_page_group_assignments
    WHERE file_id = p_file_id AND group_id != p_group_id;

    -- Create new assignment
    INSERT INTO quote_page_group_assignments (group_id, file_id, page_id, sequence_order, assigned_by_staff_id)
    VALUES (p_group_id, p_file_id, NULL, v_next_sequence, p_staff_id)
    RETURNING id INTO v_assignment_id;

    -- Recalculate group totals
    PERFORM recalculate_document_group(p_group_id);

    RETURN v_assignment_id;
END;
$$;

-- ============================================================================
-- 5. ENSURE: assign_page_to_group function exists and works properly
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_page_to_group(
    p_group_id UUID,
    p_page_id UUID,
    p_staff_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assignment_id UUID;
    v_next_sequence INTEGER;
BEGIN
    -- Get next sequence order for this group
    SELECT COALESCE(MAX(sequence_order), 0) + 1 INTO v_next_sequence
    FROM quote_page_group_assignments
    WHERE group_id = p_group_id;

    -- Check if page is already assigned to this group
    SELECT id INTO v_assignment_id
    FROM quote_page_group_assignments
    WHERE group_id = p_group_id AND page_id = p_page_id;

    IF v_assignment_id IS NOT NULL THEN
        -- Already assigned, return existing assignment
        RETURN v_assignment_id;
    END IF;

    -- Remove page from any other groups first
    DELETE FROM quote_page_group_assignments
    WHERE page_id = p_page_id AND group_id != p_group_id;

    -- Create new assignment
    INSERT INTO quote_page_group_assignments (group_id, page_id, file_id, sequence_order, assigned_by_staff_id)
    VALUES (p_group_id, p_page_id, NULL, v_next_sequence, p_staff_id)
    RETURNING id INTO v_assignment_id;

    -- Recalculate group totals
    PERFORM recalculate_document_group(p_group_id);

    RETURN v_assignment_id;
END;
$$;

-- ============================================================================
-- 6. ENSURE: remove_from_group function exists
-- ============================================================================

CREATE OR REPLACE FUNCTION remove_from_group(p_assignment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_group_id UUID;
BEGIN
    -- Get the group ID before deleting
    SELECT group_id INTO v_group_id
    FROM quote_page_group_assignments
    WHERE id = p_assignment_id;

    -- Delete the assignment
    DELETE FROM quote_page_group_assignments
    WHERE id = p_assignment_id;

    -- Recalculate group totals if we found the group
    IF v_group_id IS NOT NULL THEN
        PERFORM recalculate_document_group(v_group_id);
    END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION recalculate_document_group(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION assign_file_to_group(UUID, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION assign_page_to_group(UUID, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION remove_from_group(UUID) TO authenticated, service_role;

-- ============================================================================
-- Done! Apply this migration to fix document grouping in HITL Review.
-- ============================================================================
