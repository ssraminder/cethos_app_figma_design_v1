-- Per-application ISO 17100 evidence summary for the recruitment reviewer:
-- competence + §3.1.4 basis signals + references + domain scope + deterministic
-- flags/badge. Pure data (no AI) so it is reproducible/audit-safe. Drives the
-- ISO-evidence panel on the RecruitmentDetail profile + the badge on the
-- Ready-for-Approval list.
create or replace view public.cvp_application_iso_evidence
with (security_invoker = true) as
with refs as (
  select application_id, count(*) filter (where status='received') recv
  from cvp_application_references group by application_id
),
comb as (
  select application_id,
    count(*) filter (where status in ('approved','skip_manual_review')) approved_combos,
    string_agg(distinct domain, ', ') filter (where status in ('approved','skip_manual_review')) tested_domains
  from cvp_test_combinations group by application_id
),
quiz as (
  select application_id, round(max(score_pct)) quiz_score
  from cvp_quiz_submissions where status='submitted' group by application_id
)
select
  a.id as application_id,
  a.role_type,
  a.ai_prescreening_score,
  a.education_level,
  a.years_experience,
  (a.cv_storage_path is not null) as has_cv,
  coalesce(r.recv, 0) as refs_received,
  coalesce(c.approved_combos, 0) as approved_combos,
  c.tested_domains,
  coalesce(array_length(a.domains_offered, 1), 0) as declared_domains,
  q.quiz_score,
  (a.cv_storage_path is null) as flag_no_cv,
  (coalesce(a.ai_prescreening_score, 100) < 50) as flag_low_prescreen,
  (a.role_type = 'translator' and a.years_experience is not null and a.years_experience < 2) as flag_thin_experience,
  (coalesce(array_length(a.domains_offered, 1), 0) > 6) as flag_broad_domains,
  (case
    when a.cv_storage_path is null then 'hold'
    when coalesce(a.ai_prescreening_score, 100) < 50
      or (a.role_type = 'translator' and a.years_experience is not null and a.years_experience < 2)
      or coalesce(array_length(a.domains_offered, 1), 0) > 6
      then 'check'
    else 'ready'
  end) as iso_badge
from cvp_applications a
left join refs r on r.application_id = a.id
left join comb c on c.application_id = a.id
left join quiz q on q.application_id = a.id;

grant select on public.cvp_application_iso_evidence to authenticated;

comment on view public.cvp_application_iso_evidence is
  'Deterministic ISO 17100 evidence summary per application (competence, §3.1.4 basis signals, references, domain scope, flags, badge) for the recruitment review/approval UI.';
