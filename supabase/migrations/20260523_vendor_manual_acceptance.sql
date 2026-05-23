-- ============================================================================
-- Vendor manual acceptance: direct_assign now goes to "assigned" instead of
-- "accepted". Vendor must manually accept via the portal.
-- ============================================================================

-- 1. Add assigned_at column to order_workflow_steps
ALTER TABLE order_workflow_steps
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- 2. Backfill assigned_at for any existing accepted rows that were direct-assigned
-- (they have a vendor_id but no offer in vendor_step_offers)
UPDATE order_workflow_steps ows
SET assigned_at = ows.accepted_at
WHERE ows.status IN ('accepted', 'in_progress', 'delivered', 'approved', 'completed')
  AND ows.vendor_id IS NOT NULL
  AND ows.accepted_at IS NOT NULL
  AND ows.assigned_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM vendor_step_offers vso
    WHERE vso.step_id = ows.id AND vso.status IN ('pending', 'accepted')
  );
