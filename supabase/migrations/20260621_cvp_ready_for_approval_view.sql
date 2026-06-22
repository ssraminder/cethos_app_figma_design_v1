-- Ready-for-Approval queue for the recruitment list.
--
-- Surfaces in-pipeline applicants who are ASSEMBLED ENOUGH for the single human
-- review/approval gate, so staff (e.g. the vendor manager) have a live queue
-- instead of hunting through the "In Progress" tab. Readiness =
--   (1) assessment passed  — at least one approved/skip_manual_review test
--       combination, OR a submitted quiz (cog-debrief / COA route has no combos)
--   AND
--   (2) at least one reference RECEIVED — per the "request 2, approve on 1 good
--       reference" ISO policy. The human applies the quality/§3.1.4 judgment at
--       approval; this view only surfaces the candidate for that review.
--
-- NDA is intentionally NOT required here: for recruits the NDA is signed during
-- onboarding (post-approval), so gating the review queue on it would empty it.
--
-- security_invoker = the querying admin's RLS applies (same access they already
-- have selecting cvp_applications / _test_combinations / _application_references
-- directly in the recruitment list).
create or replace view public.cvp_ready_for_approval
with (security_invoker = true) as
select
  a.id as application_id,
  (a.role_type = 'cognitive_debriefing') as is_cogdeb,
  (a.role_type = 'cognitive_debriefing'
    or a.domains_offered::text ~* 'medical|life_scien|pharmaceutical') as is_clinical
from cvp_applications a
where a.status not in ('approved', 'rejected', 'archived', 'waitlisted')
  -- exclude obvious test/dummy artifacts so the staff queue stays clean
  and coalesce(a.full_name, '') !~* 'smoke test|dummy'
  and coalesce(a.email, '') !~* '@example|\.invalid$|@cethos-test'
  and (
    exists (
      select 1 from cvp_test_combinations c
      where c.application_id = a.id
        and c.status in ('approved', 'skip_manual_review')
    )
    or exists (
      select 1 from cvp_quiz_submissions q
      where q.application_id = a.id and q.status = 'submitted'
    )
  )
  and exists (
    select 1 from cvp_application_references r
    where r.application_id = a.id and r.status = 'received'
  );

grant select on public.cvp_ready_for_approval to authenticated;

comment on view public.cvp_ready_for_approval is
  'Recruitment applicants ready for the single human approval gate: assessment passed (approved/skip_manual_review combo or submitted quiz) AND >=1 reference received. Feeds the "Ready for Approval" tab in /admin/recruitment. NDA gated post-approval, not here.';
