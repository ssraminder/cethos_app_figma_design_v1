-- ============================================================================
-- 20260525_final_deliverable_step.sql
-- Adds a "Final Deliverable" step at the end of every active workflow template
-- and backfills the step into every in-flight (non-completed) order workflow.
--
-- The new step is `actor_type='internal_work'`, requires_file_upload=true,
-- and serves as a record-keeping anchor for:
--   - the versioned final file(s) (step_deliveries.version)
--   - the staff member who delivered it (step_deliveries.delivered_by_name)
--   - the "Send to Client" action that approves the step, marks the
--     workflow complete, and emails the customer the final files.
-- ============================================================================

-- 1) Insert Final Deliverable into every active template at max(step_number)+1
INSERT INTO workflow_template_steps (
  template_id,
  step_number,
  name,
  actor_type,
  assignment_mode,
  auto_advance,
  is_optional,
  requires_file_upload,
  instructions
)
SELECT
  wt.id,
  COALESCE(MAX(wts.step_number), 0) + 1,
  'Final Deliverable',
  'internal_work',
  'manual',
  false,
  false,
  true,
  'Record-keeping: upload the version delivered to the customer and click "Send to Client" to ship.'
FROM workflow_templates wt
LEFT JOIN workflow_template_steps wts ON wts.template_id = wt.id
WHERE wt.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM workflow_template_steps existing
    WHERE existing.template_id = wt.id
      AND existing.name = 'Final Deliverable'
  )
GROUP BY wt.id;

-- 2) Backfill every in-flight order workflow that doesn't already have
--    a Final Deliverable step. Skip workflows that are already completed.
--    Use a CTE so we can compute the next step_number per workflow and
--    grab the source/target language from the most recent existing step.
WITH workflows_needing_backfill AS (
  SELECT
    ow.id AS workflow_id,
    ow.order_id,
    ow.total_steps,
    COALESCE(MAX(ows.step_number), 0) + 1 AS next_step_number,
    (ARRAY_AGG(ows.source_language ORDER BY ows.step_number DESC) FILTER (WHERE ows.source_language IS NOT NULL))[1] AS source_language,
    (ARRAY_AGG(ows.target_language ORDER BY ows.step_number DESC) FILTER (WHERE ows.target_language IS NOT NULL))[1] AS target_language
  FROM order_workflows ow
  LEFT JOIN order_workflow_steps ows ON ows.workflow_id = ow.id
  WHERE ow.status <> 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM order_workflow_steps existing
      WHERE existing.workflow_id = ow.id
        AND existing.name = 'Final Deliverable'
    )
  GROUP BY ow.id, ow.order_id, ow.total_steps
),
inserted AS (
  INSERT INTO order_workflow_steps (
    workflow_id,
    order_id,
    step_number,
    name,
    actor_type,
    assignment_mode,
    auto_advance,
    is_optional,
    requires_file_upload,
    status,
    vendor_currency,
    revision_count,
    source_language,
    target_language,
    instructions
  )
  SELECT
    workflow_id,
    order_id,
    next_step_number,
    'Final Deliverable',
    'internal_work',
    'manual',
    false,
    false,
    true,
    'pending',
    'CAD',
    0,
    source_language,
    target_language,
    'Record-keeping: upload the version delivered to the customer and click "Send to Client" to ship.'
  FROM workflows_needing_backfill
  RETURNING workflow_id
)
UPDATE order_workflows ow
SET total_steps = total_steps + 1,
    updated_at = now()
WHERE ow.id IN (SELECT workflow_id FROM inserted);
