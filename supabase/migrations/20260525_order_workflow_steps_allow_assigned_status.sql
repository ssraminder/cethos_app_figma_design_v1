-- ============================================================================
-- Add "assigned" to order_workflow_steps.status CHECK constraint.
--
-- PR #206 (2026-05-23 vendor_manual_acceptance) split the direct-assign flow
-- into two stages: admin direct-assigns -> status='assigned', then the vendor
-- manually accepts via the portal -> status='accepted'. The matching code in
-- update-workflow-step.direct_assign writes status='assigned', but the CHECK
-- constraint was never expanded, so every direct-assign UPDATE silently
-- violates the constraint. supabase-js doesn't throw on UPDATE constraint
-- failures and the function doesn't check the result, so it proceeds to send
-- the vendor email and returns success while the row stays at status='pending'
-- with vendor_id=NULL. The vendor never sees the job.
--
-- This migration extends the allowed status set so the existing code path
-- works as designed.
-- ============================================================================

ALTER TABLE order_workflow_steps
  DROP CONSTRAINT IF EXISTS order_workflow_steps_status_check;

ALTER TABLE order_workflow_steps
  ADD CONSTRAINT order_workflow_steps_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'offered'::text,
    'assigned'::text,
    'accepted'::text,
    'in_progress'::text,
    'delivered'::text,
    'revision_requested'::text,
    'approved'::text,
    'skipped'::text,
    'cancelled'::text
  ]));
