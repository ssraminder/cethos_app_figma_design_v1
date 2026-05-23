-- Consolidated GST return: one row of manual adjustments per period across
-- all selected branches. Storing with branch_id NULL distinguishes the
-- consolidated row from per-branch rows.

ALTER TABLE public.tax_return_adjustments
  ALTER COLUMN branch_id DROP NOT NULL;

ALTER TABLE public.tax_return_adjustments
  DROP CONSTRAINT IF EXISTS tax_return_adjustments_unique;

CREATE UNIQUE INDEX IF NOT EXISTS tax_return_adjustments_per_branch_unique
  ON public.tax_return_adjustments (branch_id, period_start, period_end)
  WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tax_return_adjustments_consolidated_unique
  ON public.tax_return_adjustments (period_start, period_end)
  WHERE branch_id IS NULL;

COMMENT ON COLUMN public.tax_return_adjustments.branch_id IS
  'Branch this manual-adjustment row applies to. NULL = consolidated return across all selected branches for the period.';
