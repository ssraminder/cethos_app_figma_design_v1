-- Gap 5: the Ready-for-Approval queue must require REAL evidence. Before, it
-- counted approved OR skip_manual_review combos, OR any *submitted* quiz. Tighten:
-- a real GRADED+passed test (status='approved' + test_submission_id + ai_score) OR a
-- PASSED quiz (score_pct >= 70), plus >=1 received reference. Drops skip_manual_review
-- (not a pass) and submitted-but-failed quizzes. (Queue went 70+ -> 39.)
create or replace view public.cvp_ready_for_approval as
select a.id as application_id,
  a.role_type::text = 'cognitive_debriefing'::text as is_cogdeb,
  a.role_type::text = 'cognitive_debriefing'::text
    or a.domains_offered::text ~* 'medical|life_scien|pharmaceutical'::text as is_clinical
from cvp_applications a
where (a.status::text <> all (array['approved','rejected','archived','waitlisted']::text[]))
  and coalesce(a.full_name, ''::character varying)::text !~* 'smoke test|dummy'::text
  and coalesce(a.email, ''::character varying)::text !~* '@example|\.invalid$|@cethos-test'::text
  and (
    exists (select 1 from cvp_test_combinations c
            where c.application_id = a.id and c.status::text = 'approved'::text
              and c.test_submission_id is not null and c.ai_score is not null)
    or exists (select 1 from cvp_quiz_submissions q
               where q.application_id = a.id and q.status = 'submitted'::text and q.score_pct >= 70)
  )
  and exists (select 1 from cvp_application_references r
              where r.application_id = a.id and r.status = 'received'::text);
