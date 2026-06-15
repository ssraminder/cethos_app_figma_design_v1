-- Language-code resolver: exact match → alias → base-code fallback (strip the
-- region suffix after the first '-' or '_'). Exact match wins first, so
-- pt-br / en-gb / en-us still resolve to their own rows; only unmatched
-- region-suffixed codes (DE-DE, PT-PT, HI-IN, BN_IN, AM-ET) fall back to base.
CREATE OR REPLACE FUNCTION public.qms_resolve_language_id(p_code text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = qms, public AS $$
  SELECT id FROM (
    SELECT l.id, 1 AS ord FROM public.languages l WHERE lower(l.code) = lower(p_code)
    UNION ALL
    SELECT a.language_id, 2 FROM qms.language_code_aliases a WHERE lower(a.alias_code) = lower(p_code)
    UNION ALL
    SELECT l.id, 3 FROM public.languages l
      WHERE lower(l.code) = lower(split_part(replace(p_code, '_', '-'), '-', 1))
  ) c
  WHERE p_code IS NOT NULL AND upper(p_code) <> 'ANY'
  ORDER BY ord LIMIT 1;
$$;

-- Per-vendor qualified-role summary for the admin vendor list (qms not exposed
-- via PostgREST; this public view is — mirrors qms_competence_bases grants).
CREATE OR REPLACE VIEW public.qms_vendor_qualified_roles AS
  SELECT rq.vendor_id,
         array_agg(DISTINCT rt.code ORDER BY rt.code) AS role_codes,
         array_agg(DISTINCT rt.name ORDER BY rt.name) AS role_names,
         max(rq.qualified_at)        AS latest_qualified_at,
         min(rq.re_qualification_due) AS earliest_requal_due
  FROM qms.role_qualifications rq
  JOIN qms.role_types rt ON rt.id = rq.role_type_id
  WHERE rq.status = 'qualified'
  GROUP BY rq.vendor_id;

GRANT SELECT ON public.qms_vendor_qualified_roles TO anon, authenticated, service_role;

-- Backfill language pairs missed by the original apply because of region-
-- suffixed codes. Targets qualified TRANSLATOR qualifications (pairs attach
-- there) currently lacking the resolved pair; DISTINCT + NOT EXISTS guard.
INSERT INTO qms.language_pair_qualifications
  (role_qualification_id, source_language_id, target_language_id, direction, notes, created_by)
SELECT DISTINCT rq.id, sl, tl, 'source_to_target'::qms.pair_direction,
       'Backfill 2026-06-13: region-code resolver', rq.qualified_by
FROM qms.role_qualifications rq
JOIN qms.role_types rt ON rt.id = rq.role_type_id AND rt.code = 'translator'
JOIN public.vendor_language_pairs vlp ON vlp.vendor_id = rq.vendor_id AND COALESCE(vlp.is_active, true)
CROSS JOIN LATERAL public.qms_resolve_language_id(vlp.source_language) AS sl
CROSS JOIN LATERAL public.qms_resolve_language_id(vlp.target_language) AS tl
WHERE rq.status = 'qualified'
  AND sl IS NOT NULL AND tl IS NOT NULL AND sl <> tl
  AND NOT EXISTS (
    SELECT 1 FROM qms.language_pair_qualifications x
    WHERE x.role_qualification_id = rq.id AND x.source_language_id = sl AND x.target_language_id = tl
  );
