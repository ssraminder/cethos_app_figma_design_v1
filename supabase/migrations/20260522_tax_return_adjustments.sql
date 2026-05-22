-- Manual entries for CRA GST/HST return lines that cannot be auto-computed
-- from invoices: bad-debt adjustments, instalments, rebates, self-assessed
-- amounts, and any ITC claimed outside the vendor-payable pipeline (e.g.
-- software subscriptions, office expenses paid by credit card).
--
-- One row per (branch_id, reporting period). Staff fill these in before
-- finalizing the GST return for a quarter. Persisted so the Reports view
-- can show last-saved values on return visits.

CREATE TABLE IF NOT EXISTS public.tax_return_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id integer NOT NULL REFERENCES public.branches(id),
  period_start date NOT NULL,
  period_end date NOT NULL,

  -- CRA working-copy line items (all CAD)
  line_104 numeric(14,2) NOT NULL DEFAULT 0,  -- adjustments added to net tax (bad-debt recovery)
  line_104_notes text,
  line_107 numeric(14,2) NOT NULL DEFAULT 0,  -- adjustments deducted (bad debts written off)
  line_107_notes text,
  line_110 numeric(14,2) NOT NULL DEFAULT 0,  -- instalments + annual filer payments
  line_110_notes text,
  line_111 numeric(14,2) NOT NULL DEFAULT 0,  -- rebates claimed on the return
  line_111_notes text,
  line_205 numeric(14,2) NOT NULL DEFAULT 0,  -- real-property GST/HST due
  line_205_notes text,
  line_405 numeric(14,2) NOT NULL DEFAULT 0,  -- self-assessed GST/HST
  line_405_notes text,

  -- Additional ITC row (user request) — added to the computed Line 106 total.
  -- For ITCs from sources outside vendor invoices: software subscriptions,
  -- office supplies on a credit card, utilities, etc.
  additional_itc_amount numeric(14,2) NOT NULL DEFAULT 0,
  additional_itc_notes text,

  -- Lock state — once submitted to CRA, staff can mark the return as filed
  -- so the values become read-only.
  filed_at timestamptz,
  filed_by uuid,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tax_return_adjustments_period CHECK (period_end >= period_start),
  CONSTRAINT tax_return_adjustments_unique UNIQUE (branch_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS tax_return_adjustments_branch_period_idx
  ON public.tax_return_adjustments (branch_id, period_start, period_end);

COMMENT ON TABLE public.tax_return_adjustments IS
  'Manual CRA working-copy line entries per branch per reporting period. Auto-computed lines (101, 103, 105, 106-computed, 108, 109, 112, 113A-C) are derived from invoices and not stored here.';

COMMENT ON COLUMN public.tax_return_adjustments.additional_itc_amount IS
  'ITCs claimed outside the vendor-payable pipeline (subscriptions, office expenses, etc). Added to the computed Line 106 total at report time.';

ALTER TABLE public.tax_return_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff full access tax_return_adjustments" ON public.tax_return_adjustments;
CREATE POLICY "Staff full access tax_return_adjustments"
  ON public.tax_return_adjustments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.tax_return_adjustments TO authenticated, service_role;
