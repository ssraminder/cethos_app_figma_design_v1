-- ============================================================================
-- QMS verification tiers: "Screened" (AI-extracted from self-declared CV) vs
-- "Verified" (a human checked the primary document / first-party records).
-- Makes the proof claim honest without downgrading already-qualified vendors:
--   * verified=true now strictly means Tier-2 (document-verified).
--   * verification_method='ai_cv_extraction' marks Tier-1 (screened).
--   * the qualification control accepts screened evidence as a PROVISIONAL basis
--     (config flag), so existing vendors stay qualified, labelled "Screened".
-- The COA / regulated panel is raised to Tier-2 with real documents separately.
-- Applied to prod via MCP 2026-06-18; committed here so the repo reflects prod.
-- ============================================================================

INSERT INTO qms.config (key, value, description, iso_clause_reference)
VALUES (
  'qualification_accept_screened_evidence',
  'true'::jsonb,
  'If true, the qualification-precondition control accepts Tier-1 "screened" evidence (AI-extracted from the self-declared CV, verification_method=ai_cv_extraction) as a provisional basis for status=qualified. Set false to require Tier-2 document-verified evidence. The COA / regulated panel is verified to Tier-2 regardless.',
  'ISO 17100:2015 §3.1.4'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION qms.enforce_qualification_preconditions()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_role_code text;
  v_basis_role_code text;
  v_evidence_required boolean;
  v_accept_screened boolean;
  v_nda_required boolean;
  v_has_verified_evidence boolean;
  v_has_active_nda boolean;
  v_re_qual_months int;
BEGIN
  IF new.status <> 'qualified' THEN
    RETURN new;
  END IF;

  IF new.competence_basis_id IS NULL THEN
    RAISE EXCEPTION 'role_qualifications.status=qualified requires competence_basis_id.'
      USING errcode = '23514';
  END IF;
  IF new.qualified_at IS NULL THEN
    new.qualified_at := now();
  END IF;
  IF new.qualified_by IS NULL THEN
    new.qualified_by := auth.uid();
  END IF;
  IF new.qualified_by IS NULL THEN
    RAISE EXCEPTION 'role_qualifications.status=qualified requires qualified_by (auth.uid() was NULL — call from authenticated session).'
      USING errcode = '23514';
  END IF;

  SELECT cb.role_type_code INTO v_basis_role_code
  FROM qms.competence_bases cb WHERE cb.id = new.competence_basis_id;
  SELECT rt.code INTO v_role_code
  FROM qms.role_types rt WHERE rt.id = new.role_type_id;
  IF v_basis_role_code <> v_role_code THEN
    RAISE EXCEPTION 'competence_basis_id role (%) does not match role_qualifications.role_type (%).',
      v_basis_role_code, v_role_code
      USING errcode = '23514';
  END IF;

  SELECT (value::text)::boolean INTO v_evidence_required
  FROM qms.config WHERE key = 'qualification_requires_verified_evidence';
  v_evidence_required := COALESCE(v_evidence_required, true);

  SELECT (value::text)::boolean INTO v_accept_screened
  FROM qms.config WHERE key = 'qualification_accept_screened_evidence';
  v_accept_screened := COALESCE(v_accept_screened, true);

  IF v_evidence_required THEN
    SELECT EXISTS (
      SELECT 1 FROM qms.competence_evidence ce
      WHERE ce.vendor_id = new.vendor_id
        AND (ce.expiry_date IS NULL OR ce.expiry_date >= current_date)
        AND (
          ce.verified = true
          OR (v_accept_screened AND ce.verification_method = 'ai_cv_extraction')
        )
    ) INTO v_has_verified_evidence;
    IF NOT v_has_verified_evidence THEN
      RAISE EXCEPTION 'Cannot qualify vendor %: no verified or screened, non-expired competence_evidence rows.',
        new.vendor_id
        USING errcode = '23514';
    END IF;
  END IF;

  SELECT (value::text)::boolean INTO v_nda_required
  FROM qms.config WHERE key = 'qualification_requires_active_nda';
  v_nda_required := COALESCE(v_nda_required, true);

  IF v_nda_required THEN
    SELECT EXISTS (
      SELECT 1 FROM qms.nda_agreements n
      WHERE n.vendor_id = new.vendor_id
        AND n.status = 'active'
        AND (n.expiry_date IS NULL OR n.expiry_date >= current_date)
    ) INTO v_has_active_nda;
    IF NOT v_has_active_nda THEN
      RAISE EXCEPTION 'Cannot qualify vendor %: no active, non-expired NDA on file.',
        new.vendor_id
        USING errcode = '23514';
    END IF;
  END IF;

  IF new.re_qualification_due IS NULL THEN
    SELECT (value::text)::int INTO v_re_qual_months
    FROM qms.config WHERE key = 're_qualification_interval_months';
    v_re_qual_months := COALESCE(v_re_qual_months, 12);
    new.re_qualification_due := new.qualified_at + make_interval(months => v_re_qual_months);
  END IF;

  RETURN new;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.qms_apply_auto_qualification(p_result_id uuid, p_acting_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE
  r record;
  v_sig record;
  v_nda_bridged boolean := false;
  v_evidence_id uuid;
  v_evidence_type_id uuid;
  v_translator_qual uuid;
  v_reviser_qual uuid;
  v_role_id uuid;
  v_basis_id uuid;
  v_quals uuid[] := '{}';
  v_pairs int := 0;
BEGIN
  IF p_acting_user_id IS NULL THEN
    RAISE EXCEPTION 'p_acting_user_id required';
  END IF;

  SELECT * INTO r FROM public.qms_auto_qualification_results WHERE id = p_result_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'result % not found', p_result_id; END IF;
  IF r.decision <> 'auto_qualify' OR r.status <> 'processed' THEN
    RAISE EXCEPTION 'result % is not an auto_qualify/processed row (decision=%, status=%)', p_result_id, r.decision, r.status;
  END IF;
  IF r.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'result % already applied at %', p_result_id, r.applied_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM qms.nda_agreements n
    WHERE n.vendor_id = r.vendor_id AND n.status = 'active'
      AND (n.expiry_date IS NULL OR n.expiry_date >= current_date)
  ) THEN
    SELECT * INTO v_sig FROM public.vendor_nda_signatures s
    WHERE s.vendor_id = r.vendor_id AND s.is_current AND s.agreement_type = 'nda'
    ORDER BY s.signed_at DESC LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'vendor % has no current portal NDA signature to bridge', r.vendor_id;
    END IF;
    INSERT INTO qms.nda_agreements
      (vendor_id, template_version, signed_date, effective_date, status, signed_method, signed_via,
       storage_path, countersigned, internal_notes, created_by)
    VALUES
      (r.vendor_id, 'vendor-portal', v_sig.signed_at::date, v_sig.signed_at::date, 'active', 'electronic',
       'vendor_portal', v_sig.signed_pdf_storage_path, false,
       'Bridged from vendor_nda_signatures ' || v_sig.id || ' by automated_pipeline_v1 apply (result ' || r.id || ').',
       p_acting_user_id);
    v_nda_bridged := true;
  END IF;

  -- Evidence row — SCREENED (Tier-1): AI-extracted from the self-declared CV,
  -- not yet verified against a primary document. verified=false on purpose.
  SELECT id INTO v_evidence_type_id FROM qms.evidence_types WHERE code = CASE r.basis_code
    WHEN 't_a_degree_translation' THEN 'degree_translation'
    WHEN 't_b_degree_other_plus_2y' THEN 'degree_other'
    ELSE 'documented_translation_experience' END;
  INSERT INTO qms.competence_evidence
    (vendor_id, evidence_type_id, title, storage_path, sha256, verified, verified_by, verified_at,
     verification_method, verification_notes, internal_notes, created_by)
  VALUES
    (r.vendor_id, v_evidence_type_id, 'Vendor CV — automated extraction',
     r.inputs->>'cv_path', r.inputs->>'cv_sha256',
     false, NULL, NULL, 'ai_cv_extraction',
     'SCREENED (AI-extracted from self-declared CV; not yet verified against a primary document). '
       || 'Deterministic rules selected basis ' || r.basis_code
       || '. Reasons: ' || array_to_string(r.reasons, ' | '),
     'Pipeline run ' || r.run_id || ', result ' || r.id || '. Full extraction JSON retained on the result row.',
     p_acting_user_id)
  RETURNING id INTO v_evidence_id;

  SELECT id INTO v_role_id FROM qms.role_types WHERE code = 'translator';
  SELECT id INTO v_basis_id FROM qms.competence_bases WHERE code = r.basis_code;
  INSERT INTO qms.role_qualifications
    (vendor_id, role_type_id, competence_basis_id, status, qualified_at, qualified_by,
     competence_basis_notes, internal_notes, created_by)
  VALUES
    (r.vendor_id, v_role_id, v_basis_id, 'qualified', now(), p_acting_user_id,
     array_to_string(r.reasons, ' | '),
     'automated_pipeline_v1 — run ' || r.run_id || ', result ' || r.id || '; batch released by staff via qualification queue. Evidence tier: screened.',
     p_acting_user_id)
  RETURNING id INTO v_translator_qual;
  v_quals := v_quals || v_translator_qual;
  UPDATE qms.competence_evidence SET role_qualification_id = v_translator_qual WHERE id = v_evidence_id;

  INSERT INTO qms.language_pair_qualifications
    (role_qualification_id, source_language_id, target_language_id, direction, evidence_id, notes, created_by)
  SELECT v_translator_qual, sl.id, tl.id, 'source_to_target', v_evidence_id,
         'From vendor_language_pairs ' || p.id, p_acting_user_id
  FROM public.vendor_language_pairs p
  JOIN LATERAL (
    SELECT id FROM (
      SELECT l.id FROM public.languages l WHERE lower(l.code) = lower(p.source_language)
      UNION ALL
      SELECT a.language_id FROM qms.language_code_aliases a WHERE lower(a.alias_code) = lower(p.source_language)
    ) s LIMIT 1
  ) sl ON true
  JOIN LATERAL (
    SELECT id FROM (
      SELECT l.id FROM public.languages l WHERE lower(l.code) = lower(p.target_language)
      UNION ALL
      SELECT a.language_id FROM qms.language_code_aliases a WHERE lower(a.alias_code) = lower(p.target_language)
    ) t LIMIT 1
  ) tl ON true
  WHERE p.vendor_id = r.vendor_id
    AND COALESCE(p.is_active, true)
    AND upper(p.source_language) <> 'ANY'
    AND upper(p.target_language) <> 'ANY';
  GET DIAGNOSTICS v_pairs = ROW_COUNT;

  IF 'reviser' = ANY(r.roles) THEN
    SELECT id INTO v_role_id FROM qms.role_types WHERE code = 'reviser';
    SELECT id INTO v_basis_id FROM qms.competence_bases WHERE code = 'r_translator_plus_revision';
    INSERT INTO qms.role_qualifications
      (vendor_id, role_type_id, competence_basis_id, status, qualified_at, qualified_by,
       competence_basis_notes, internal_notes, created_by)
    VALUES
      (r.vendor_id, v_role_id, v_basis_id, 'qualified', now(), p_acting_user_id,
       'Translator competence + revision experience (see translator qualification ' || v_translator_qual || ').',
       'automated_pipeline_v1 — run ' || r.run_id || ', result ' || r.id || '. Evidence tier: screened.',
       p_acting_user_id)
    RETURNING id INTO v_reviser_qual;
    v_quals := v_quals || v_reviser_qual;
  END IF;

  UPDATE public.qms_auto_qualification_results
  SET applied_at = now(), applied_role_qualification_ids = v_quals
  WHERE id = r.id;

  RETURN jsonb_build_object(
    'translator_qualification_id', v_translator_qual,
    'reviser_qualification_id', v_reviser_qual,
    'nda_bridged', v_nda_bridged,
    'language_pairs', v_pairs,
    'evidence_tier', 'screened'
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_apply_auto_qualification(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qms_apply_auto_qualification(uuid, uuid) TO service_role;

-- Reclassify the existing AI rows from (overstated) verified=true to honest
-- screened/Tier-1. verified_by/at cleared; method + note corrected.
UPDATE qms.competence_evidence
SET verified = false,
    verified_by = NULL,
    verified_at = NULL,
    verification_method = 'ai_cv_extraction',
    verification_notes = 'SCREENED (AI-extracted from self-declared CV; not yet verified against a primary document). '
                         || COALESCE(verification_notes, ''),
    updated_at = now()
WHERE verification_method = 'automated_pipeline_v1';
