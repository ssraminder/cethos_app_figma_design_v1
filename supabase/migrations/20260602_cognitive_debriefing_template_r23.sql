-- R23: cognitive_debriefing workflow template
-- Service exists since 2026-03-24 but no template — Phase B-E audit found
-- customers could order Cognitive Debriefing but PMs had no workflow.
-- 5 steps following the standard PRO-instrument linguistic-validation pattern.

INSERT INTO public.workflow_templates (code, name, description, service_id, is_default, is_active)
VALUES (
  'cognitive_debriefing',
  'Cognitive Debriefing',
  'PRO-instrument cognitive debriefing pipeline. Forward translation → debriefing interviews with target-language speakers → harmonization → QA → Final Deliverable. Used for patient-reported outcome (PRO) translations where target speaker comprehension must be verified by interview.',
  '568599b9-e6b4-4be6-9fa9-805df929dcd2',
  true,
  true
);

INSERT INTO public.workflow_template_steps (
  template_id, step_number, name, service_id, actor_type, default_actor_type,
  allowed_actor_types, assignment_mode, auto_advance, is_optional,
  requires_file_upload, calculation_unit
)
VALUES
  ((SELECT id FROM public.workflow_templates WHERE code='cognitive_debriefing'), 1, 'Translation',
   '568599b9-e6b4-4be6-9fa9-805df929dcd2', 'external_vendor', 'external_vendor',
   ARRAY['external_vendor','internal_work']::text[], 'manual', true, false, true, 'per_word'),
  ((SELECT id FROM public.workflow_templates WHERE code='cognitive_debriefing'), 2, 'Cognitive Debriefing',
   '568599b9-e6b4-4be6-9fa9-805df929dcd2', 'external_vendor', 'external_vendor',
   ARRAY['external_vendor']::text[], 'manual', true, false, true, 'per_hour'),
  ((SELECT id FROM public.workflow_templates WHERE code='cognitive_debriefing'), 3, 'Harmonization',
   '4bb10465-3274-427d-aa36-1dd11e852d33', 'external_vendor', 'external_vendor',
   ARRAY['external_vendor','internal_work']::text[], 'manual', false, false, true, 'per_hour'),
  ((SELECT id FROM public.workflow_templates WHERE code='cognitive_debriefing'), 4, 'QA Review',
   NULL, 'internal_review', 'internal_review',
   ARRAY['internal_review','internal_work']::text[], 'auto', false, false, false, NULL),
  ((SELECT id FROM public.workflow_templates WHERE code='cognitive_debriefing'), 5, 'Final Deliverable',
   NULL, 'internal_work', NULL,
   NULL, 'manual', false, false, true, NULL);
