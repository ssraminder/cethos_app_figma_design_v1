-- R15: ISO 17100 §6.2 — Revision shall be performed by a person other than
-- the translator. Add a per-step config that names which other steps the
-- assignee must NOT match. Server-side enforcement lives in
-- update-workflow-step direct_assign / offer_vendor / offer_multiple.
--
-- requires_different_vendor_from_step is an int[] of step_numbers in the
-- same template that this step's vendor must differ from. NULL = no
-- separation constraint (today's behaviour preserved for backwards compat).

ALTER TABLE public.workflow_template_steps
  ADD COLUMN IF NOT EXISTS requires_different_vendor_from_step integer[];

COMMENT ON COLUMN public.workflow_template_steps.requires_different_vendor_from_step IS
  'ISO 17100 §6.2 — step_numbers in the same template that this step must NOT share a vendor with. Server enforces in update-workflow-step before assignment. NULL = no constraint.';

-- R22: override audit
ALTER TABLE qms.assignment_eligibility_events
  ADD COLUMN IF NOT EXISTS override_reason text;

COMMENT ON COLUMN qms.assignment_eligibility_events.override_reason IS
  'R22 — staff justification when force-overriding a §6.2 block or QMS-ineligible warning. NULL when no override occurred.';

-- Seed constraints on multi-vendor templates
UPDATE public.workflow_template_steps
SET requires_different_vendor_from_step = ARRAY[1]::int[]
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='standard_tep') AND step_number = 2;
UPDATE public.workflow_template_steps
SET requires_different_vendor_from_step = ARRAY[1,2]::int[]
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='standard_tep') AND step_number = 3;
UPDATE public.workflow_template_steps
SET requires_different_vendor_from_step = ARRAY[1]::int[]
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='translation_review') AND step_number = 2;
UPDATE public.workflow_template_steps
SET requires_different_vendor_from_step = ARRAY[1]::int[]
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='mtpe_review') AND step_number = 2;
UPDATE public.workflow_template_steps
SET requires_different_vendor_from_step = ARRAY[1]::int[]
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='medical_back_translation') AND step_number = 2;
UPDATE public.workflow_template_steps
SET requires_different_vendor_from_step = ARRAY[2]::int[]
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='transcription_translation') AND step_number = 3;
