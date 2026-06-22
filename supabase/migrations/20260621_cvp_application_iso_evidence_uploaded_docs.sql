-- Surface applicant-uploaded supporting documents in the recruitment ISO evidence.
-- Applicants upload via the tokenized /iso-evidence link into their auto-created
-- applicant-status vendor account (vendors.certifications jsonb). Those docs were
-- orphaned from the recruitment review (the panel read only the CV bucket + form
-- fields). Join them in by email so the panel shows the real diplomas/credentials;
-- a degree/diploma on file also clears the "thin experience" prompt (route a).
-- Appends uploaded_docs_count / uploaded_doc_names / has_degree_doc; the
-- thin-experience flag and badge now also consider has_degree_doc.
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
  coalesce(vd.has_degree, false) as has_degree_doc
from cvp_applications a
left join refs r on r.application_id = a.id
left join comb c on c.application_id = a.id
left join quiz q on q.application_id = a.id
left join lateral (
  select
    jsonb_array_length(certs) as docs_count,
    (select array_agg(distinct
        coalesce(nullif(regexp_replace(e->>'storage_path', '^.*/[0-9]+-', ''), ''), e->>'name'))
      from jsonb_array_elements(certs) e) as doc_names,
    exists(select 1 from jsonb_array_elements(certs) e where (e->>'name') ~* 'degree|diploma') as has_degree
  from (
    select case when jsonb_typeof(v.certifications) = 'array' then v.certifications else '[]'::jsonb end as certs
    from vendors v
    where v.status = 'applicant' and lower(v.email) = lower(a.email)
    order by v.created_at desc nulls last
    limit 1
  ) vc
) vd on true;

grant select on public.cvp_application_iso_evidence to authenticated;
