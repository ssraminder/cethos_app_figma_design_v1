-- Approval-queue unblock (part 2/2): split the "Degree (verify)" route by ISO route.
--
-- WHY: a single "Degree (verify)" label conflated route (a) translation degrees,
-- route (b) other-field degrees (which also need +2 yrs experience), and
-- filename-only false positives with no AI-classified degree. This:
--   * splits approval_route into "Degree — translation (route a)" /
--     "Degree — other field (route b · +2yr exp)";
--   * bases "ready" on a TYPED degree (translation/other) or a verified degree or
--     5-yr references — so filename-only rows fall to need_info (nothing to verify);
--   * exposes degree_doc + the typed-degree flags for the queue UI.
--
-- Depends on 20260624_1_iso_evidence_degree_kind.sql (has_translation_degree,
-- has_other_degree, has_experience_doc, degree_doc).
--
-- Append-only on the output columns (bucket/approval_route expressions change;
-- degree_doc + 3 flags added at the end). get_approval_queue() returns SETOF this
-- view and picks up the new columns automatically.
CREATE OR REPLACE VIEW public.cvp_approval_queue AS
 SELECT a.id,
    a.application_number,
    a.full_name,
    a.country,
    a.email,
    a.status,
    a.created_at,
    e.ref_documented_years,
    e.has_degree_doc,
    e.has_verified_degree_doc,
    e.refs_received,
    e.real_passed_combos,
    e.uploaded_docs_count,
    e.ref_documented_years >= 5 AS is_ref5,
    (EXISTS ( SELECT 1
           FROM vendor_nda_signatures n
          WHERE n.application_id = a.id OR lower(n.signed_email) = lower(a.email::text))) AS has_nda,
    ( SELECT string_agg(DISTINCT l.name::text, ', '::text ORDER BY (l.name::text)) AS string_agg
           FROM cvp_test_combinations c
             JOIN languages l ON l.id = c.target_language_id
          WHERE c.application_id = a.id) AS target_langs,
    (EXISTS ( SELECT 1
           FROM cvp_test_combinations c
          WHERE c.application_id = a.id AND (c.domain::text = ANY (ARRAY['medical'::character varying, 'life_sciences'::character varying, 'pharmaceutical'::character varying, 'coa_linguistic_validation'::character varying]::text[])))) AS clinical,
        CASE
            WHEN e.ref_documented_years >= 5 OR e.has_verified_degree_doc OR e.has_translation_degree OR e.has_other_degree THEN 'ready'::text
            WHEN COALESCE(e.real_passed_combos, 0::bigint) > 0 OR COALESCE(e.refs_received, 0::bigint) > 0 OR COALESCE(e.uploaded_docs_count, 0) > 0 THEN 'need_info'::text
            ELSE 'other'::text
        END AS bucket,
        CASE
            WHEN e.ref_documented_years >= 5 THEN 'References (5+ yrs)'::text
            WHEN e.has_verified_degree_doc THEN 'Degree (verified)'::text
            WHEN e.has_translation_degree THEN 'Degree — translation (route a)'::text
            WHEN e.has_other_degree THEN 'Degree — other field (route b · +2yr exp)'::text
            ELSE NULL::text
        END AS approval_route,
    e.degree_doc,
    e.has_translation_degree,
    e.has_other_degree,
    e.has_experience_doc
   FROM cvp_applications a
     JOIN cvp_application_iso_evidence e ON e.application_id = a.id
  WHERE (a.status::text <> ALL (ARRAY['rejected'::character varying, 'archived'::character varying, 'approved'::character varying, 'waitlisted'::character varying]::text[])) AND a.full_name::text !~* '(lda|llc|language lab|gmbh| inc\.| ltd|\bsnc\b|traduzioni|translations?\b|s\.r\.l)'::text;