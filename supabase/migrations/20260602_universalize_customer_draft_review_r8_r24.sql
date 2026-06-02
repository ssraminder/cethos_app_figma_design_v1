-- R8 + R24: Universalize the Customer Draft Review step + reverse
-- approval_depends_on_step pattern from certified_translation. Applies to
-- the 3 review-heavy templates (standard_tep, translation_review,
-- mtpe_review). New orders fan out a customer-visible review step before
-- QA; in-flight orders are unaffected.
--
-- step_number renumbering uses a 2-phase +100 / -99 hop to dodge the
-- unique (template_id, step_number) constraint.

-- standard_tep: insert Customer Draft Review at step 4
UPDATE public.workflow_template_steps
SET step_number = step_number + 100
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='standard_tep')
  AND step_number >= 4;
UPDATE public.workflow_template_steps
SET step_number = step_number - 99
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='standard_tep')
  AND step_number >= 104;
INSERT INTO public.workflow_template_steps (
  template_id, step_number, name, actor_type, default_actor_type,
  allowed_actor_types, assignment_mode, auto_advance, is_optional,
  requires_file_upload, calculation_unit
)
VALUES
  ((SELECT id FROM public.workflow_templates WHERE code='standard_tep'), 4,
   'Customer Draft Review', 'customer', 'customer', NULL, 'auto', false, false, false, NULL);
UPDATE public.workflow_template_steps
SET approval_depends_on_step = 4
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='standard_tep')
  AND step_number = 3;

-- translation_review: insert at step 3
UPDATE public.workflow_template_steps
SET step_number = step_number + 100
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='translation_review')
  AND step_number >= 3;
UPDATE public.workflow_template_steps
SET step_number = step_number - 99
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='translation_review')
  AND step_number >= 103;
INSERT INTO public.workflow_template_steps (
  template_id, step_number, name, actor_type, default_actor_type,
  allowed_actor_types, assignment_mode, auto_advance, is_optional,
  requires_file_upload, calculation_unit
)
VALUES
  ((SELECT id FROM public.workflow_templates WHERE code='translation_review'), 3,
   'Customer Draft Review', 'customer', 'customer', NULL, 'auto', false, false, false, NULL);
UPDATE public.workflow_template_steps
SET approval_depends_on_step = 3
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='translation_review')
  AND step_number = 2;

-- mtpe_review: insert at step 3
UPDATE public.workflow_template_steps
SET step_number = step_number + 100
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='mtpe_review')
  AND step_number >= 3;
UPDATE public.workflow_template_steps
SET step_number = step_number - 99
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='mtpe_review')
  AND step_number >= 103;
INSERT INTO public.workflow_template_steps (
  template_id, step_number, name, actor_type, default_actor_type,
  allowed_actor_types, assignment_mode, auto_advance, is_optional,
  requires_file_upload, calculation_unit
)
VALUES
  ((SELECT id FROM public.workflow_templates WHERE code='mtpe_review'), 3,
   'Customer Draft Review', 'customer', 'customer', NULL, 'auto', false, false, false, NULL);
UPDATE public.workflow_template_steps
SET approval_depends_on_step = 3
WHERE template_id = (SELECT id FROM public.workflow_templates WHERE code='mtpe_review')
  AND step_number = 2;
