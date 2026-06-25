-- Standalone single-step LV workflow templates (per docs/audits/2026-06-iqvia/LV-standalone-workflow-set-design.md).
-- Each = [LV step (external_vendor)] -> [QA Review (internal_review)] -> [Final Deliverable (internal_work)],
-- mirroring the cognitive_debriefing template shape. Reuse translation_only / cognitive_debriefing / clinician_review
-- for those step types. Services are pre-existing (Standard Translation, Proofreading, Harmonization, Cognitive
-- Debriefing, Reconciliation, Back Translation, Translation Review, Quality Management).
do $$
declare
  v_tmpl uuid;
  rec record;
begin
  for rec in select * from (values
    ('lv_adaptation','LV Adaptation','Adaptation','cad6e69a-1346-426c-a1f0-7bbb8a1631fb'::uuid),
    ('lv_proofreading','LV Proofreading','Proofreading','a14029b5-ae85-45c9-8a13-8f33022d6b25'::uuid),
    ('lv_harmonization','LV Harmonization','Harmonization','4bb10465-3274-427d-aa36-1dd11e852d33'::uuid),
    ('lv_interview','LV Interview','Interview','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid),
    ('lv_reconciliation','LV Reconciliation','Reconciliation','134b6e2a-5dee-4c49-b837-1e1e5f20bfbe'::uuid),
    ('lv_back_translation','LV Back-translation','Back Translation','10cb592e-e944-4329-9580-5a2ca20fe41f'::uuid),
    ('lv_bt_review','LV BT Review','BT Review','7ff4045b-d8ae-42e0-b828-ca905d4c2d82'::uuid),
    ('lv_finalization','LV Finalization','Finalization','f2867955-e868-474d-9ae2-ccab25ba6325'::uuid)
  ) as t(code,nm,step1,svc)
  loop
    if not exists (select 1 from workflow_templates where code=rec.code) then
      insert into workflow_templates (id, code, name, description, service_id, is_default, is_active, created_at, updated_at)
      values (gen_random_uuid(), rec.code, rec.nm,
              'Standalone LV step: '||rec.step1||' + independent QA + release (per SOP-LV-001).',
              rec.svc, false, true, now(), now())
      returning id into v_tmpl;

      insert into workflow_template_steps (id, template_id, step_number, name, service_id, actor_type, assignment_mode, auto_advance, is_optional, requires_file_upload, calculation_unit, allowed_actor_types, default_actor_type, created_at)
      values
        (gen_random_uuid(), v_tmpl, 1, rec.step1, rec.svc, 'external_vendor', 'manual', true, false, true, null, array['external_vendor'], 'external_vendor', now()),
        (gen_random_uuid(), v_tmpl, 2, 'QA Review', null, 'internal_review', 'auto', false, false, false, null, array['internal_review','internal_work'], 'internal_review', now()),
        (gen_random_uuid(), v_tmpl, 3, 'Final Deliverable', null, 'internal_work', 'manual', false, false, true, null, null, null, now());
    end if;
  end loop;
end $$;
