-- Allow assigning trainings to VENDORS (not just staff). Exactly one of
-- staff_user_id / vendor_id is set per row. Vendor trainings can be explicitly
-- assigned to filtered vendors in bulk (on top of auto-matching). Applied via MCP.
ALTER TABLE public.cvp_training_assignments
  ALTER COLUMN staff_user_id DROP NOT NULL;
ALTER TABLE public.cvp_training_assignments
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE;

ALTER TABLE public.cvp_training_assignments DROP CONSTRAINT IF EXISTS cvp_ta_one_assignee;
ALTER TABLE public.cvp_training_assignments
  ADD CONSTRAINT cvp_ta_one_assignee CHECK ((staff_user_id IS NOT NULL) <> (vendor_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS cvp_ta_training_vendor_key
  ON public.cvp_training_assignments(training_id, vendor_id) WHERE vendor_id IS NOT NULL;
