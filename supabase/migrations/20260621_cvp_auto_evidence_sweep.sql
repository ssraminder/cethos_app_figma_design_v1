-- Durable evidence sweep: auto-request references from EVERY assessment-passed
-- applicant who is missing them — not just status='test_assessed' (cvp-auto-advance
-- Phase C). Candidates passed competence while sitting in staff_review /
-- prescreened / references_requested(for other reasons) etc. never got a
-- reference request, so they never reach the "Ready for Approval" queue
-- (assessment + >=1 reference). References are the binding constraint.
--
-- Eligible = in-pipeline + assessment passed (approved/skip_manual_review combo
-- OR submitted quiz) + NO reference request ever sent + NO reference received +
-- not a test/dummy row. is_clinical drives clinical-first ordering so the
-- COA/audit pool is served first under the per-run throttle.
create or replace view public.cvp_pipeline_needs_reference_request as
select
  a.id as application_id,
  (a.role_type = 'cognitive_debriefing'
    or a.domains_offered::text ~* 'medical|life_scien|pharmaceutical') as is_clinical,
  a.created_at
from cvp_applications a
where a.status not in ('approved', 'rejected', 'archived', 'waitlisted')
  and coalesce(a.full_name, '') !~* 'smoke test|dummy'
  and coalesce(a.email, '') !~* '@example|\.invalid$|@cethos-test'
  and (
    exists (
      select 1 from cvp_test_combinations c
      where c.application_id = a.id and c.status in ('approved', 'skip_manual_review')
    )
    or exists (
      select 1 from cvp_quiz_submissions q
      where q.application_id = a.id and q.status = 'submitted'
    )
  )
  and not exists (
    select 1 from cvp_application_reference_requests rr where rr.application_id = a.id
  )
  and not exists (
    select 1 from cvp_application_references r
    where r.application_id = a.id and r.status = 'received'
  );

comment on view public.cvp_pipeline_needs_reference_request is
  'cvp-auto-advance Phase C2 source: assessment-passed applicants with no reference request and no reference received. Drives the durable references sweep that feeds the Ready-for-Approval queue. Clinical-first via is_clinical.';

-- Safe-rollout toggle (mirrors auto_doc_request). Default OFF: deploy the engine
-- change dark, e2e on a test app, then flip enabled=true. Fail-closed.
insert into public.cvp_system_config (key, value)
values ('auto_evidence_sweep', '{"enabled": false, "acting_staff_id": null}'::jsonb)
on conflict (key) do nothing;
