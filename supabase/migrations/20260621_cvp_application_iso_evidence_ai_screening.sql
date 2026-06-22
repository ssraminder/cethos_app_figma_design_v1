-- Surface the AI document-screening results in the recruitment ISO evidence.
-- vendor-upload-certification's screen-evidence-document AI-classifies each
-- applicant upload and writes qms.competence_evidence (verification_method=
-- 'ai_document_screen', verified=false, notes carry "AI confidence: N%"). Those
-- rows are orphaned (vendor_id set, no role_qualification) and invisible in the
-- recruitment review. Join them by the matched applicant vendor so the panel can
-- show the AI classification (type + confidence + screened/verified) per document.
-- has_degree_doc now also counts a screened degree_* evidence type. Appends
-- screened_count / screened_any_verified / screened_items.
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
  coalesce(vd.has_degree, false) as has_degree_doc,
  coalesce(vd.screened_count, 0) as screened_count,
  coalesce(vd.any_verified, false) as screened_any_verified,
  vd.screened_items
from cvp_applications a
left join refs r on r.application_id = a.id
left join comb c on c.application_id = a.id
left join quiz q on q.application_id = a.id
left join lateral (
  select
    jsonb_array_length(mv.certs) as docs_count,
    (select array_agg(distinct coalesce(nullif(regexp_replace(e->>'storage_path', '^.*/[0-9]+-', ''), ''), e->>'name'))
       from jsonb_array_elements(mv.certs) e) as doc_names,
    (exists(select 1 from jsonb_array_elements(mv.certs) e where (e->>'name') ~* 'degree|diploma')
       or exists(select 1 from qms.competence_evidence ce
                 left join qms.evidence_types et on et.id = ce.evidence_type_id
                 where ce.vendor_id = mv.id and et.code ~* 'degree')) as has_degree,
    (select count(*) from qms.competence_evidence ce where ce.vendor_id = mv.id) as screened_count,
    coalesce((select bool_or(ce.verified) from qms.competence_evidence ce where ce.vendor_id = mv.id), false) as any_verified,
    (select jsonb_agg(jsonb_build_object(
        'title', ce.title,
        'type', et.code,
        'verified', ce.verified,
        'confidence', (regexp_match(ce.verification_notes, 'AI confidence: ([0-9]+)%'))[1]
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
