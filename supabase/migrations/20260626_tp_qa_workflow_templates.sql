-- TransPerfect LSP QA-service workflow templates: Screenshot Review,
-- Post-Editing (MTPE), Quality Management. Each follows the established
-- QA-service pattern: <Service> (external vendor) -> QA Review (internal) ->
-- Final Deliverable. The services already exist; this adds the templates.
DO $$
DECLARE
  t_ssr uuid := gen_random_uuid();
  t_pe  uuid := gen_random_uuid();
  t_qm  uuid := gen_random_uuid();
BEGIN
  INSERT INTO workflow_templates (id, code, name, description, is_default, is_active)
  VALUES (t_ssr, 'screenshot_review', 'Screenshot Review',
    'In-context linguistic review of translated UI/material against client-supplied screenshots. Reviewer verifies the translation in context (accuracy, terminology, truncation/layout, functional context), logs and categorises issues, and returns an annotated review -> QA Review -> Final Deliverable. Used for localization QA jobs such as TransPerfect Screenshot Review (SSR). See SOP-041.',
    false, true);
  INSERT INTO workflow_template_steps (id, template_id, step_number, name, service_id, actor_type, assignment_mode, auto_advance, is_optional, requires_file_upload, allowed_actor_types, default_actor_type, calculation_unit) VALUES
    (gen_random_uuid(), t_ssr, 1, 'Screenshot Review', '14fe783b-e738-47c8-83f9-7c678d870d22', 'external_vendor', 'manual', true, false, true, ARRAY['external_vendor'], 'external_vendor', 'per_hour'),
    (gen_random_uuid(), t_ssr, 2, 'QA Review',         '14fe783b-e738-47c8-83f9-7c678d870d22', 'internal_review', 'auto',  false, false, false, ARRAY['internal_review','internal_work'], 'internal_review', NULL),
    (gen_random_uuid(), t_ssr, 3, 'Final Deliverable', '14fe783b-e738-47c8-83f9-7c678d870d22', 'internal_work',  'manual', false, false, true, NULL, NULL, NULL);

  INSERT INTO workflow_templates (id, code, name, description, is_default, is_active)
  VALUES (t_pe, 'post_editing', 'Post-Editing (MTPE)',
    'Machine-translation post-editing (MTPE): a qualified linguist edits machine/neural translation output to publishable quality against source, glossary and client spec -> QA Review -> Final Deliverable. Used for jobs such as TransPerfect PostEdit. See SOP-042.',
    false, true);
  INSERT INTO workflow_template_steps (id, template_id, step_number, name, service_id, actor_type, assignment_mode, auto_advance, is_optional, requires_file_upload, allowed_actor_types, default_actor_type, calculation_unit) VALUES
    (gen_random_uuid(), t_pe, 1, 'Post-Editing',      '180233a2-59be-4455-af75-70de95455ecd', 'external_vendor', 'manual', true, false, true, ARRAY['external_vendor'], 'external_vendor', 'per_hour'),
    (gen_random_uuid(), t_pe, 2, 'QA Review',         '180233a2-59be-4455-af75-70de95455ecd', 'internal_review', 'auto',  false, false, false, ARRAY['internal_review','internal_work'], 'internal_review', NULL),
    (gen_random_uuid(), t_pe, 3, 'Final Deliverable', '180233a2-59be-4455-af75-70de95455ecd', 'internal_work',  'manual', false, false, true, NULL, NULL, NULL);

  INSERT INTO workflow_templates (id, code, name, description, is_default, is_active)
  VALUES (t_qm, 'quality_management', 'Quality Management (QM)',
    'Independent quality-management check of a completed translation against source, glossary/TM and client specification (accuracy, terminology, completeness, formatting) producing an error-categorised QM report -> QA Review -> Final Deliverable. Used for jobs such as TransPerfect QM. See SOP-043.',
    false, true);
  INSERT INTO workflow_template_steps (id, template_id, step_number, name, service_id, actor_type, assignment_mode, auto_advance, is_optional, requires_file_upload, allowed_actor_types, default_actor_type, calculation_unit) VALUES
    (gen_random_uuid(), t_qm, 1, 'Quality Management', 'f2867955-e868-474d-9ae2-ccab25ba6325', 'external_vendor', 'manual', true, false, true, ARRAY['external_vendor'], 'external_vendor', 'per_hour'),
    (gen_random_uuid(), t_qm, 2, 'QA Review',          'f2867955-e868-474d-9ae2-ccab25ba6325', 'internal_review', 'auto',  false, false, false, ARRAY['internal_review','internal_work'], 'internal_review', NULL),
    (gen_random_uuid(), t_qm, 3, 'Final Deliverable',  'f2867955-e868-474d-9ae2-ccab25ba6325', 'internal_work',  'manual', false, false, true, NULL, NULL, NULL);
END $$;
