-- Live recruitment approval-queue view: classifies reviewable applicants into
-- ready / need_info / other using the ISO 17100 evidence view, NULL-safe.
-- Powers the admin "Recruitment Approval Queue" report (recruitment-approval-queue
-- edge function, service role). NOT granted to authenticated, so it stays staff-gated.
--
-- NULL-safe note: the bucket CASE treats a NULL ready-condition (has_degree_doc /
-- ref_documented_years NULL) as "not ready" and lets engaged applicants fall into
-- need_info. An earlier `NOT (ref5 OR has_degree)` form dropped those rows via NULL
-- propagation and undercounted need_info (19 vs the true 83).
CREATE OR REPLACE VIEW public.cvp_approval_queue AS
SELECT
  a.id,
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
  (e.ref_documented_years >= 5) AS is_ref5,
  EXISTS (
    SELECT 1 FROM vendor_nda_signatures n
    WHERE n.application_id = a.id OR lower(n.signed_email) = lower(a.email)
  ) AS has_nda,
  (
    SELECT string_agg(DISTINCT l.name, ', ' ORDER BY l.name)
    FROM cvp_test_combinations c
    JOIN languages l ON l.id = c.target_language_id
    WHERE c.application_id = a.id
  ) AS target_langs,
  EXISTS (
    SELECT 1 FROM cvp_test_combinations c
    WHERE c.application_id = a.id
      AND c.domain IN ('medical','life_sciences','pharmaceutical','coa_linguistic_validation')
  ) AS clinical,
  CASE
    WHEN (e.ref_documented_years >= 5 OR e.has_degree_doc) THEN 'ready'
    WHEN (COALESCE(e.real_passed_combos,0) > 0 OR COALESCE(e.refs_received,0) > 0 OR COALESCE(e.uploaded_docs_count,0) > 0) THEN 'need_info'
    ELSE 'other'
  END AS bucket,
  CASE
    WHEN e.ref_documented_years >= 5 THEN 'References (5+ yrs)'
    WHEN e.has_verified_degree_doc THEN 'Degree (verified)'
    WHEN e.has_degree_doc THEN 'Degree (verify)'
    ELSE NULL
  END AS approval_route
FROM cvp_applications a
JOIN cvp_application_iso_evidence e ON e.application_id = a.id
WHERE a.status NOT IN ('rejected','archived','approved','waitlisted')
  AND a.full_name !~* '(lda|llc|language lab|gmbh| inc\.| ltd|\bsnc\b|traduzioni|translations?\b|s\.r\.l)';

REVOKE ALL ON public.cvp_approval_queue FROM anon, authenticated;
