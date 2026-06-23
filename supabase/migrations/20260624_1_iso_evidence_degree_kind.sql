-- Approval-queue unblock (part 1/2): degree-kind classification on the applicant
-- ISO 17100 evidence view.
--
-- WHY: the "Degree (verify)" route conflated three cases — a real translation
-- degree (ISO route a), a degree in another field (route b, needs +2 yrs
-- experience), and a filename-only false positive (no AI-classified degree).
-- This adds the typed-degree flags + a surfaced "degree_doc" so the approval
-- queue can split the route and let reviewers open the actual degree in-place.
--
-- Append-only: every existing column is preserved in the same order; four columns
-- are added at the end (has_translation_degree, has_other_degree,
-- has_experience_doc, degree_doc). Transcribed from the live prod view def.
CREATE OR REPLACE VIEW public.cvp_application_iso_evidence AS
 WITH refs AS (
         SELECT cvp_application_references.application_id,
            count(*) FILTER (WHERE cvp_application_references.status = 'received'::text) AS recv
           FROM cvp_application_references
          GROUP BY cvp_application_references.application_id
        ), refsx AS (
         SELECT cvp_application_references.application_id,
            min(cvp_application_references.reference_confirmed_start_year) FILTER (WHERE cvp_application_references.status = 'received'::text AND cvp_application_references.reference_confirmed_start_year IS NOT NULL) AS min_confirmed_year,
            count(*) FILTER (WHERE cvp_application_references.status = 'received'::text AND ((cvp_application_references.competence_responses ->> 'would_work_again'::text) = ANY (ARRAY['yes'::text, 'probably'::text]))) AS positive_refs
           FROM cvp_application_references
          GROUP BY cvp_application_references.application_id
        ), comb AS (
         SELECT cvp_test_combinations.application_id,
            count(*) FILTER (WHERE cvp_test_combinations.status::text = ANY (ARRAY['approved'::character varying, 'skip_manual_review'::character varying]::text[])) AS approved_combos,
            count(*) FILTER (WHERE cvp_test_combinations.status::text = 'approved'::text AND cvp_test_combinations.test_submission_id IS NOT NULL AND cvp_test_combinations.ai_score IS NOT NULL) AS real_passed_combos,
            count(*) FILTER (WHERE cvp_test_combinations.status::text = 'skip_manual_review'::text) AS skip_review_combos,
            string_agg(DISTINCT cvp_test_combinations.domain::text, ', '::text) FILTER (WHERE cvp_test_combinations.status::text = ANY (ARRAY['approved'::character varying, 'skip_manual_review'::character varying]::text[])) AS tested_domains,
            string_agg(DISTINCT cvp_test_combinations.domain::text, ','::text) FILTER (WHERE cvp_test_combinations.status::text = 'approved'::text AND cvp_test_combinations.test_submission_id IS NOT NULL AND cvp_test_combinations.ai_score IS NOT NULL) AS passed_domains
           FROM cvp_test_combinations
          GROUP BY cvp_test_combinations.application_id
        ), quiz AS (
         SELECT cvp_quiz_submissions.application_id,
            round(max(cvp_quiz_submissions.score_pct)) AS quiz_score
           FROM cvp_quiz_submissions
          WHERE cvp_quiz_submissions.status = 'submitted'::text
          GROUP BY cvp_quiz_submissions.application_id
        )
 SELECT a.id AS application_id,
    a.role_type,
    a.ai_prescreening_score,
    a.education_level,
    a.years_experience,
    a.cv_storage_path IS NOT NULL AS has_cv,
    COALESCE(r.recv, 0::bigint) AS refs_received,
    COALESCE(c.approved_combos, 0::bigint) AS approved_combos,
    c.tested_domains,
    COALESCE(array_length(a.domains_offered, 1), 0) AS declared_domains,
    q.quiz_score,
    a.cv_storage_path IS NULL AS flag_no_cv,
    COALESCE(a.ai_prescreening_score, 100) < 50 AS flag_low_prescreen,
    a.role_type::text = 'translator'::text AND a.years_experience IS NOT NULL AND a.years_experience < 2 AND NOT COALESCE(vd.has_degree, false) AS flag_thin_experience,
    COALESCE(array_length(a.domains_offered, 1), 0) > 6 AS flag_broad_domains,
        CASE
            WHEN a.cv_storage_path IS NULL THEN 'hold'::text
            WHEN COALESCE(a.ai_prescreening_score, 100) < 50 OR a.role_type::text = 'translator'::text AND a.years_experience IS NOT NULL AND a.years_experience < 2 AND NOT COALESCE(vd.has_degree, false) OR COALESCE(array_length(a.domains_offered, 1), 0) > 6 THEN 'check'::text
            ELSE 'ready'::text
        END AS iso_badge,
    COALESCE(vd.docs_count, 0) AS uploaded_docs_count,
    vd.doc_names AS uploaded_doc_names,
    COALESCE(vd.has_degree, false) AS has_degree_doc,
    COALESCE(vd.screened_count, 0::bigint) AS screened_count,
    COALESCE(vd.any_verified, false) AS screened_any_verified,
    vd.screened_items,
    vd.applicant_vendor_id,
    refsx.min_confirmed_year AS ref_min_confirmed_year,
        CASE
            WHEN refsx.min_confirmed_year IS NOT NULL THEN GREATEST(0, EXTRACT(year FROM now())::integer - refsx.min_confirmed_year)
            ELSE NULL::integer
        END AS ref_documented_years,
    COALESCE(refsx.positive_refs, 0::bigint) AS ref_positive_count,
    COALESCE(c.real_passed_combos, 0::bigint) AS real_passed_combos,
    COALESCE(c.skip_review_combos, 0::bigint) AS skip_review_combos,
    array_to_string(a.domains_offered, ','::text) AS declared_domain_list,
    COALESCE(vd.has_verified_degree, false) AS has_verified_degree_doc,
    COALESCE(c.passed_domains, ''::text) AS passed_domains,
    COALESCE(vd.has_translation_degree, false) AS has_translation_degree,
    COALESCE(vd.has_other_degree, false) AS has_other_degree,
    COALESCE(vd.has_experience_doc, false) AS has_experience_doc,
    vd.degree_doc
   FROM cvp_applications a
     LEFT JOIN refs r ON r.application_id = a.id
     LEFT JOIN refsx ON refsx.application_id = a.id
     LEFT JOIN comb c ON c.application_id = a.id
     LEFT JOIN quiz q ON q.application_id = a.id
     LEFT JOIN LATERAL ( SELECT mv.id AS applicant_vendor_id,
            jsonb_array_length(mv.certs) AS docs_count,
            ( SELECT array_agg(DISTINCT COALESCE(NULLIF(regexp_replace(e.value ->> 'storage_path'::text, '^.*/[0-9]+-'::text, ''::text), ''::text), e.value ->> 'name'::text)) AS array_agg
                   FROM jsonb_array_elements(mv.certs) e(value)) AS doc_names,
            (EXISTS ( SELECT 1
                   FROM jsonb_array_elements(mv.certs) e(value)
                  WHERE (e.value ->> 'name'::text) ~* 'degree|diploma'::text)) OR (EXISTS ( SELECT 1
                   FROM qms.competence_evidence ce
                     LEFT JOIN qms.evidence_types et ON et.id = ce.evidence_type_id
                  WHERE ce.vendor_id = mv.id AND et.code ~* 'degree'::text)) AS has_degree,
            (EXISTS ( SELECT 1
                   FROM qms.competence_evidence ce
                     LEFT JOIN qms.evidence_types et ON et.id = ce.evidence_type_id
                  WHERE ce.vendor_id = mv.id AND et.code ~* 'degree'::text AND ce.verified)) AS has_verified_degree,
            ( SELECT count(*) AS count
                   FROM qms.competence_evidence ce
                  WHERE ce.vendor_id = mv.id) AS screened_count,
            COALESCE(( SELECT bool_or(ce.verified) AS bool_or
                   FROM qms.competence_evidence ce
                  WHERE ce.vendor_id = mv.id), false) AS any_verified,
            ( SELECT jsonb_agg(jsonb_build_object('title', ce.title, 'type', et.code, 'verified', ce.verified, 'confidence', (regexp_match(ce.verification_notes, 'AI confidence: ([0-9]+)%'::text))[1], 'storage_path', ce.storage_path) ORDER BY ce.created_at DESC) AS jsonb_agg
                   FROM qms.competence_evidence ce
                     LEFT JOIN qms.evidence_types et ON et.id = ce.evidence_type_id
                  WHERE ce.vendor_id = mv.id) AS screened_items,
            (EXISTS ( SELECT 1
                   FROM qms.competence_evidence ce
                     JOIN qms.evidence_types et ON et.id = ce.evidence_type_id
                  WHERE ce.vendor_id = mv.id AND et.code = 'degree_translation'::text)) AS has_translation_degree,
            (EXISTS ( SELECT 1
                   FROM qms.competence_evidence ce
                     JOIN qms.evidence_types et ON et.id = ce.evidence_type_id
                  WHERE ce.vendor_id = mv.id AND et.code = 'degree_other'::text)) AS has_other_degree,
            (EXISTS ( SELECT 1
                   FROM qms.competence_evidence ce
                     JOIN qms.evidence_types et ON et.id = ce.evidence_type_id
                  WHERE ce.vendor_id = mv.id AND et.code = 'documented_translation_experience'::text)) AS has_experience_doc,
            ( SELECT jsonb_build_object('title', ce.title, 'type', et.code, 'confidence', (regexp_match(ce.verification_notes, 'AI confidence: ([0-9]+)%'::text))[1], 'storage_path', ce.storage_path, 'verified', ce.verified)
                   FROM qms.competence_evidence ce
                     JOIN qms.evidence_types et ON et.id = ce.evidence_type_id
                  WHERE ce.vendor_id = mv.id AND et.code = ANY (ARRAY['degree_translation'::text, 'degree_other'::text])
                  ORDER BY (et.code = 'degree_translation'::text) DESC, NULLIF((regexp_match(ce.verification_notes, 'AI confidence: ([0-9]+)%'::text))[1], ''::text)::integer DESC NULLS LAST, ce.created_at DESC
                 LIMIT 1) AS degree_doc
           FROM ( SELECT v.id,
                        CASE
                            WHEN jsonb_typeof(v.certifications) = 'array'::text THEN v.certifications
                            ELSE '[]'::jsonb
                        END AS certs
                   FROM vendors v
                  WHERE v.status = 'applicant'::text AND lower(v.email) = lower(a.email::text)
                  ORDER BY v.created_at DESC NULLS LAST
                 LIMIT 1) mv) vd ON true;