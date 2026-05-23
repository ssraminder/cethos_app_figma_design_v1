-- Add Cethos TM integration columns to workflow steps.
-- When use_cethos_tm is true, the vendor portal shows "Translate Now"
-- and a TM job is auto-provisioned via the provision-tm-job edge function.
ALTER TABLE public.order_workflow_steps
  ADD COLUMN IF NOT EXISTS use_cethos_tm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tm_job_id text,
  ADD COLUMN IF NOT EXISTS tm_job_reference text,
  ADD COLUMN IF NOT EXISTS tm_provisioned_at timestamptz;
