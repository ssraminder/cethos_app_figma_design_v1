-- Prevent duplicate non-cancelled payables per workflow step.
-- Bug: direct_assign and offer_vendor in update-workflow-step could create
-- duplicate payable records on double-click or race conditions, causing
-- the financial summary to double-count vendor costs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_payables_step_active
ON vendor_payables (workflow_step_id)
WHERE status != 'cancelled';
