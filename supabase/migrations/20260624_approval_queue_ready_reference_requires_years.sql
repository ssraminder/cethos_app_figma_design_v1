-- 20260624_approval_queue_ready_reference_requires_years
-- Refinement of cvp_approval_queue 'ready': the reference (no-degree) route must document
-- ENOUGH years, not merely have one confirming reference. Profiles surfaced with a single
-- confirming reference but only 1-4 documented years (route c needs 5; route b needs an
-- other-field degree + 2) — decidable-looking but not actually approvable. Now:
--   route c (no degree): confirming reference AND ref_documented_years >= 5
--   route b (other degree): has_other_degree AND confirming reference AND ref_documented_years >= 2
-- Screened-degree routes (verified / translation) unchanged — verified by opening the file
-- at decision time. Applied to prod via MCP 2026-06-24. Supersedes the same-day
-- require_confirming_reference iteration. This is the current production view definition.
CREATE OR REPLACE VIEW public.cvp_approval_queue AS
 SELECT a.id, a.application_number, a.full_name, a.country, a.email, a.status, a.created_at,
    e.ref_documented_years, e.has_degree_doc, e.has_verified_degree_doc, e.refs_received, e.real_passed_combos, e.uploaded_docs_count,
    e.ref_documented_years >= 5 AS is_ref5,
    (EXISTS ( SELECT 1 FROM vendor_nda_signatures n WHERE n.application_id = a.id OR lower(n.signed_email) = lower(a.email::text))) AS has_nda,
    ( SELECT string_agg(DISTINCT l.name::text, ', '::text ORDER BY (l.name::text)) AS string_agg FROM cvp_test_combinations c JOIN languages l ON l.id = c.target_language_id WHERE c.application_id = a.id) AS target_langs,
    (EXISTS ( SELECT 1 FROM cvp_test_combinations c WHERE c.application_id = a.id AND (c.domain::text = ANY (ARRAY['medical'::character varying::text, 'life_sciences'::character varying::text, 'pharmaceutical'::character varying::text, 'coa_linguistic_validation'::character varying::text])))) AS clinical,
        CASE
            WHEN a.status::text <> 'info_requested'
             AND (EXISTS ( SELECT 1 FROM vendor_nda_signatures n WHERE n.application_id = a.id OR lower(n.signed_email) = lower(a.email::text)))
             AND (EXISTS ( SELECT 1 FROM cvp_test_combinations c JOIN languages sl ON sl.id = c.source_language_id JOIN languages tl ON tl.id = c.target_language_id WHERE c.application_id = a.id AND sl.code = ANY (ARRAY['en'::text,'en-US'::text,'en-GB'::text,'en-CA'::text]) AND NOT (tl.code = ANY (ARRAY['en'::text,'en-US'::text,'en-GB'::text,'en-CA'::text]))))
             AND (e.has_verified_degree_doc OR e.has_translation_degree
                  OR (e.ref_documented_years >= 5 AND EXISTS ( SELECT 1 FROM cvp_application_references r WHERE r.application_id = a.id AND r.status = 'received' AND r.referee_independent AND r.year_verification = ANY (ARRAY['matches'::text,'close'::text])))
                  OR (e.has_other_degree AND e.ref_documented_years >= 2 AND EXISTS ( SELECT 1 FROM cvp_application_references r WHERE r.application_id = a.id AND r.status = 'received' AND r.referee_independent AND r.year_verification = ANY (ARRAY['matches'::text,'close'::text]))))
            THEN 'ready'::text
            WHEN e.has_verified_degree_doc OR e.has_translation_degree OR e.has_other_degree OR e.ref_documented_years >= 5 OR COALESCE(e.real_passed_combos, 0::bigint) > 0 OR COALESCE(e.refs_received, 0::bigint) > 0 OR COALESCE(e.uploaded_docs_count, 0) > 0
            THEN 'need_info'::text
            ELSE 'other'::text
        END AS bucket,
        CASE
            WHEN e.ref_documented_years >= 5 THEN 'References (5+ yrs)'::text
            WHEN e.has_verified_degree_doc THEN 'Degree (verified)'::text
            WHEN e.has_translation_degree THEN 'Degree — translation (route a)'::text
            WHEN e.has_other_degree THEN 'Degree — other field (route b · +2yr exp)'::text
            ELSE NULL::text
        END AS approval_route,
    e.degree_doc, e.has_translation_degree, e.has_other_degree, e.has_experience_doc
   FROM cvp_applications a
     JOIN cvp_application_iso_evidence e ON e.application_id = a.id
  WHERE (a.status::text <> ALL (ARRAY['rejected'::character varying::text, 'archived'::character varying::text, 'approved'::character varying::text, 'waitlisted'::character varying::text])) AND a.full_name::text !~* '(lda|llc|language lab|gmbh| inc\.| ltd|\bsnc\b|traduzioni|translations?\b|s\.r\.l)'::text AND NOT (EXISTS ( SELECT 1 FROM vendors v WHERE lower(v.email) = lower(a.email::text) AND v.status = 'active'::text));
