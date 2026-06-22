-- Deterministic assessment summary + recommendation for quiz submissions
-- (quizzes are auto-graded, so unlike tests they had no prose summary). Reproducible
-- for the ISO audit. Folds in the COA Part-2 translation verdicts where applicable.
-- Adds columns + a compute function + triggers (keep fresh on score/COA grade) +
-- a backfill of all submitted quizzes.
alter table cvp_quiz_submissions add column if not exists assessment_summary text;
alter table cvp_quiz_submissions add column if not exists assessment_recommendation text;
alter table cvp_quiz_submissions add column if not exists assessment_at timestamptz;

create or replace function public.cvp_compute_quiz_assessment(p_submission_id uuid)
returns void language plpgsql as $fn$
declare
  s record; v_pass int; v_fail int; v_review int; v_total int;
  v_breakdown text; v_summary text; v_rec text; v_mcq_pass boolean;
begin
  select * into s from cvp_quiz_submissions where id = p_submission_id;
  if s.id is null or s.status <> 'submitted' then return; end if;
  v_mcq_pass := coalesce(s.score_pct, 0) >= 80;

  select string_agg(replace(replace(key, '_competence', ''), '_', ' ') || ' ' ||
                    (value->>'correct') || '/' || (value->>'total'), ', ' order by key)
    into v_breakdown
    from jsonb_each(coalesce(s.competence_breakdown, '{}'::jsonb))
    where jsonb_typeof(value) = 'object';

  if s.is_coa then
    select count(*) filter (where verdict = 'pass'),
           count(*) filter (where verdict = 'fail'),
           count(*) filter (where needs_human_review and verdict is distinct from 'fail'),
           count(*)
      into v_pass, v_fail, v_review, v_total
      from cvp_coa_translation_responses where application_id = s.application_id;
    if not v_mcq_pass then v_rec := 'Not recommended — MCQ below 80%';
    elsif coalesce(v_fail, 0) > 0 then v_rec := 'Not recommended — translation failure(s)';
    elsif coalesce(v_review, 0) > 0 then v_rec := 'Needs human review — translation(s) flagged';
    else v_rec := 'Recommend approve — passed';
    end if;
    v_summary := format('COA quiz · MCQ %s%% (%s/%s) · Competence: %s · Part-2 translations: %s pass / %s fail / %s need review (of %s).',
      round(coalesce(s.score_pct, 0)), s.correct_count, s.total_count, coalesce(v_breakdown, '—'),
      coalesce(v_pass, 0), coalesce(v_fail, 0), coalesce(v_review, 0), coalesce(v_total, 0));
  else
    v_rec := case when v_mcq_pass then 'Recommend approve — passed (>=80%)' else 'Not recommended — below 80%' end;
    v_summary := format('Quiz %s%% (%s/%s) · Competence: %s.',
      round(coalesce(s.score_pct, 0)), s.correct_count, s.total_count, coalesce(v_breakdown, '—'));
  end if;

  update cvp_quiz_submissions
    set assessment_summary = v_summary, assessment_recommendation = v_rec, assessment_at = now()
    where id = p_submission_id;
end $fn$;

create or replace function public.cvp_quiz_assessment_trg() returns trigger language plpgsql as $t$
begin perform public.cvp_compute_quiz_assessment(NEW.id); return NEW; end $t$;
drop trigger if exists trg_quiz_assessment on cvp_quiz_submissions;
create trigger trg_quiz_assessment after update of score_pct, competence_breakdown, status, is_coa
  on cvp_quiz_submissions for each row execute function public.cvp_quiz_assessment_trg();

create or replace function public.cvp_coa_resp_assessment_trg() returns trigger language plpgsql as $t$
declare r record;
begin
  for r in select id from cvp_quiz_submissions where application_id = NEW.application_id and is_coa and status = 'submitted'
  loop perform public.cvp_compute_quiz_assessment(r.id); end loop;
  return NEW;
end $t$;
drop trigger if exists trg_coa_resp_assessment on cvp_coa_translation_responses;
create trigger trg_coa_resp_assessment after insert or update on cvp_coa_translation_responses
  for each row execute function public.cvp_coa_resp_assessment_trg();

do $bf$ declare r record; begin
  for r in select id from cvp_quiz_submissions where status = 'submitted'
  loop perform public.cvp_compute_quiz_assessment(r.id); end loop;
end $bf$;
