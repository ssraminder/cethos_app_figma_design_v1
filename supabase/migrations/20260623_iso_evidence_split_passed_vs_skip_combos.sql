-- NC-2 + NC-4 (ISO 17100 audit): the iso-evidence view counted skip_manual_review
-- combos as approved_combos, so the panel said "Test passed (N)" when the test was
-- BYPASSED (routed to credential review), not passed. Expose genuinely-passed
-- combos (real_passed_combos) and skipped ones (skip_review_combos) separately;
-- expose the full declared-domain list so the reviewer guide can risk-classify ALL
-- declared domains; expose has_verified_degree_doc so the verdict can require a
-- VERIFIED basis. Additive — original columns kept in order, new columns appended,
-- so the queue/badges that read approved_combos are unaffected.
create or replace view public.cvp_application_iso_evidence
with (security_invoker = true) as
with refs as (
  select application_id, count(*) filter (where status='received') recv
  from cvp_application_references group by application_id
),
refsx as (
  select application_id,
    min(reference_confirmed_start_year) filter (where status='received' and reference_confirmed_start_year is not null) min_confirmed_year,
    count(*) filter (where status='received' and (competence_responses->>'would_work_again') in ('yes','probably')) positive_refs
  from cvp_application_references group by application_id
),
comb as (
  select application_id,
    count(*) filter (where status in ('approved','skip_manual_review')) approved_combos,
    count(*) filter (where status = 'approved') real_passed_combos,
    count(*) filter (where status = 'skip_manual_review') skip_review_combos,
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
  (a.role_type = 'translator' and a.years_experience is not null and a.years_experience < 2
     and not coalesce(vd.has_degree, false)) as flag_thin_experience,
  (coalesce(array_length(a.domains_offered, 1), 0) > 6) as flag_broad_domains,
  (case
    when a.cv_storage_path is null then 'hold'
    when coalesce(a.ai_prescreening_score, 100) < 50
      or (a.role_type = 'translator' and a.years_experience is not null and a.years_experience < 2
          and not coalesce(vd.has_degree, false))
      or coalesce(array_length(a.domains_offered, 1), 0) > 6
      then 'check'
    else 'ready'
  end) as iso_badge,
  coalesce(vd.docs_count, 0) as uploaded_docs_count,
  vd.doc_names as uploaded_doc_names,
  coalesce(vd.has_degree, false) as has_degree_doc,
  coalesce(vd.screened_count, 0) as screened_count,
  coalesce(vd.any_verified, false) as screened_any_verified,
  vd.screened_items,
  vd.applicant_vendor_id,
  refsx.min_confirmed_year as ref_min_confirmed_year,
  case when refsx.min_confirmed_year is not null
       then greatest(0, extract(year from now())::int - refsx.min_confirmed_year) end as ref_documented_years,
  coalesce(refsx.positive_refs, 0) as ref_positive_count,
  coalesce(c.real_passed_combos, 0) as real_passed_combos,
  coalesce(c.skip_review_combos, 0) as skip_review_combos,
  array_to_string(a.domains_offered, ',') as declared_domain_list,
  coalesce(vd.has_verified_degree, false) as has_verified_degree_doc
from cvp_applications a
left join refs r on r.application_id = a.id
left join refsx on refsx.application_id = a.id
left join comb c on c.application_id = a.id
left join quiz q on q.application_id = a.id
left join lateral (
  select
    mv.id as applicant_vendor_id,
    jsonb_array_length(mv.certs) as docs_count,
    (select array_agg(distinct coalesce(nullif(regexp_replace(e->>'storage_path', '^.*/[0-9]+-', ''), ''), e->>'name'))
       from jsonb_array_elements(mv.certs) e) as doc_names,
    (exists(select 1 from jsonb_array_elements(mv.certs) e where (e->>'name') ~* 'degree|diploma')
       or exists(select 1 from qms.competence_evidence ce
                 left join qms.evidence_types et on et.id = ce.evidence_type_id
                 where ce.vendor_id = mv.id and et.code ~* 'degree')) as has_degree,
    exists(select 1 from qms.competence_evidence ce
           left join qms.evidence_types et on et.id = ce.evidence_type_id
           where ce.vendor_id = mv.id and et.code ~* 'degree' and ce.verified) as has_verified_degree,
    (select count(*) from qms.competence_evidence ce where ce.vendor_id = mv.id) as screened_count,
    coalesce((select bool_or(ce.verified) from qms.competence_evidence ce where ce.vendor_id = mv.id), false) as any_verified,
    (select jsonb_agg(jsonb_build_object(
        'title', ce.title, 'type', et.code, 'verified', ce.verified,
        'confidence', (regexp_match(ce.verification_notes, 'AI confidence: ([0-9]+)%'))[1],
        'storage_path', ce.storage_path
      ) order by ce.created_at desc)
      from qms.competence_evidence ce
      left join qms.evidence_types et on et.id = ce.evidence_type_id
      where ce.vendor_id = mv.id) as screened_items
  from (
    select v.id, case when jsonb_typeof(v.certifications) = 'array' then v.certifications else '[]'::jsonb end as certs
    from vendors v
    where v.status = 'applicant' and lower(v.email) = lower(a.email)
    order by v.created_at desc nulls last
    limit 1
  ) mv
) vd on true;

grant select on public.cvp_application_iso_evidence to authenticated;
