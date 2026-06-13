-- Phase B: live-apply for auto-qualification results.
-- A staff member releases a batch from the qualification queue; their auth
-- identity satisfies the qualified_by precondition while the evidence rows
-- stay honestly machine-labelled (verification_method='automated_pipeline_v1').

ALTER TABLE public.qms_auto_qualification_results
  ADD COLUMN applied_at timestamptz,
  ADD COLUMN applied_role_qualification_ids uuid[];

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

  -- 1. NDA bridge: the qualification precondition trigger demands an active
  --    qms.nda_agreements row; source it from the portal agreements system.
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

  -- 2. Evidence row — machine-verified, with the rule reasons (incl. verbatim quotes).
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
     true, p_acting_user_id, now(), 'automated_pipeline_v1',
     'AI-extracted facts with verbatim quotes; deterministic rules selected basis ' || r.basis_code ||
       '. Reasons: ' || array_to_string(r.reasons, ' | '),
     'Pipeline run ' || r.run_id || ', result ' || r.id || '. Full extraction JSON retained on the result row.',
     p_acting_user_id)
  RETURNING id INTO v_evidence_id;

  -- 3. Translator qualification.
  SELECT id INTO v_role_id FROM qms.role_types WHERE code = 'translator';
  SELECT id INTO v_basis_id FROM qms.competence_bases WHERE code = r.basis_code;
  INSERT INTO qms.role_qualifications
    (vendor_id, role_type_id, competence_basis_id, status, qualified_at, qualified_by,
     competence_basis_notes, internal_notes, created_by)
  VALUES
    (r.vendor_id, v_role_id, v_basis_id, 'qualified', now(), p_acting_user_id,
     array_to_string(r.reasons, ' | '),
     'automated_pipeline_v1 — run ' || r.run_id || ', result ' || r.id || '; batch released by staff via qualification queue.',
     p_acting_user_id)
  RETURNING id INTO v_translator_qual;
  v_quals := v_quals || v_translator_qual;
  UPDATE qms.competence_evidence SET role_qualification_id = v_translator_qual WHERE id = v_evidence_id;

  -- 4. Language pairs from vendor_language_pairs (codes resolve via languages or aliases; ANY rows skipped).
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

  -- 5. Reviser qualification when the dry run found revision experience.
  IF 'reviser' = ANY(r.roles) THEN
    SELECT id INTO v_role_id FROM qms.role_types WHERE code = 'reviser';
    SELECT id INTO v_basis_id FROM qms.competence_bases WHERE code = 'r_translator_plus_revision';
    INSERT INTO qms.role_qualifications
      (vendor_id, role_type_id, competence_basis_id, status, qualified_at, qualified_by,
       competence_basis_notes, internal_notes, created_by)
    VALUES
      (r.vendor_id, v_role_id, v_basis_id, 'qualified', now(), p_acting_user_id,
       'Translator competence + revision experience (see translator qualification ' || v_translator_qual || ').',
       'automated_pipeline_v1 — run ' || r.run_id || ', result ' || r.id || '.',
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
    'language_pairs', v_pairs
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_apply_auto_qualification(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qms_apply_auto_qualification(uuid, uuid) TO service_role;
