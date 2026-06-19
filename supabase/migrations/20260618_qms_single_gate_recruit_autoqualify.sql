-- Single final gate (C2): a recruit approved in recruitment (cvp-approve-application
-- → qms_bridge_cvp_competence) has ALREADY had its one human review. Once their NDA
-- lands during onboarding, they should auto-qualify — NOT sit in the QMS approvals
-- queue for a SECOND human approval. Legacy / first-party vendors (assembled with no
-- human review) keep the QMS-queue gate ('preliminary'). So every vendor hits exactly
-- one human gate. Applied to prod via MCP 2026-06-18.

ALTER TABLE qms.role_qualifications
  ADD COLUMN IF NOT EXISTS recruitment_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recruitment_approved_by uuid;

-- Promote: when competence (verified evidence) + §3.1.4 basis + active NDA are all
-- present, settle an under_review qualification. recruitment_approved → qualified
-- (human reviewed in recruitment); otherwise → preliminary (QMS human gate).
CREATE OR REPLACE FUNCTION public.qms_promote_provisional_if_verified(
  p_vendor_id uuid,
  p_acting_user_id uuid
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE v_q int := 0; v_p int := 0;
BEGIN
  IF p_vendor_id IS NULL THEN RETURN 0; END IF;

  IF EXISTS (
        SELECT 1 FROM qms.competence_evidence ce
        WHERE ce.vendor_id = p_vendor_id AND ce.verified = true
          AND (ce.expiry_date IS NULL OR ce.expiry_date >= current_date)
     )
     AND EXISTS (
        SELECT 1 FROM qms.nda_agreements n
        WHERE n.vendor_id = p_vendor_id AND n.status = 'active'
          AND (n.expiry_date IS NULL OR n.expiry_date >= current_date)
     )
  THEN
    -- Recruitment-approved → qualified directly (human already signed off).
    UPDATE qms.role_qualifications rq
    SET status = 'qualified',
        qualified_by = COALESCE(rq.qualified_by, rq.recruitment_approved_by, p_acting_user_id),
        qualified_at = COALESCE(rq.qualified_at, now()),
        internal_notes = COALESCE(rq.internal_notes || E'\n', '')
          || '[auto] Auto-qualified: recruitment-approved + verified competence evidence + active NDA. Single-gate (no second QMS approval).',
        updated_at = now()
    WHERE rq.vendor_id = p_vendor_id
      AND rq.status = 'under_review'
      AND rq.competence_basis_id IS NOT NULL
      AND rq.recruitment_approved = true;
    GET DIAGNOSTICS v_q = ROW_COUNT;

    -- Legacy / auto-assembled (never human-reviewed) → preliminary (QMS queue).
    UPDATE qms.role_qualifications rq
    SET status = 'preliminary',
        internal_notes = COALESCE(rq.internal_notes || E'\n', '')
          || '[auto] Ready for approval: verified evidence + active NDA on file. Awaiting human qualification sign-off.',
        updated_at = now()
    WHERE rq.vendor_id = p_vendor_id
      AND rq.status = 'under_review'
      AND rq.competence_basis_id IS NOT NULL
      AND rq.recruitment_approved = false;
    GET DIAGNOSTICS v_p = ROW_COUNT;
  END IF;
  RETURN v_q + v_p;
END $$;

-- NDA sync: after mirroring portal signatures into qms.nda_agreements, run the
-- promote so a recruit who just signed their NDA auto-qualifies in the same txn.
CREATE OR REPLACE FUNCTION public.qms_sync_nda_from_signatures(
  p_acting_user_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE r record; v_ver text; v_added int := 0; v_promoted int := 0; v_vendors uuid[] := '{}'; v_vid uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (s.vendor_id)
           s.vendor_id, s.id AS sig_id, s.signed_at, s.nda_template_id, s.signed_pdf_storage_path
    FROM public.vendor_nda_signatures s
    WHERE s.is_current = true
      AND COALESCE(s.agreement_type,'nda') = 'nda'
      AND (p_vendor_id IS NULL OR s.vendor_id = p_vendor_id)
      AND NOT EXISTS (
        SELECT 1 FROM qms.nda_agreements n
        WHERE n.vendor_id = s.vendor_id AND n.status = 'active'
          AND (n.expiry_date IS NULL OR n.expiry_date >= current_date)
      )
    ORDER BY s.vendor_id, s.signed_at DESC
  LOOP
    SELECT version_label INTO v_ver FROM public.nda_templates WHERE id = r.nda_template_id;
    INSERT INTO qms.nda_agreements
      (vendor_id, template_version, signed_date, effective_date, status, signed_method,
       signed_via, storage_path, countersigned, internal_notes, created_by)
    VALUES
      (r.vendor_id, COALESCE(v_ver,'vendor-portal'), r.signed_at::date, r.signed_at::date,
       'active', 'electronic', 'vendor_portal', r.signed_pdf_storage_path, false,
       'Synced from vendor_nda_signatures ' || r.sig_id || ' (portal clickwrap).', p_acting_user_id);
    v_added := v_added + 1;
    v_vendors := array_append(v_vendors, r.vendor_id);
  END LOOP;

  -- Auto-settle any now-eligible qualifications for the vendors we just synced.
  FOREACH v_vid IN ARRAY v_vendors LOOP
    v_promoted := v_promoted + public.qms_promote_provisional_if_verified(v_vid, p_acting_user_id);
  END LOOP;

  RETURN jsonb_build_object('synced', v_added, 'settled', v_promoted);
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_sync_nda_from_signatures(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_sync_nda_from_signatures(uuid,uuid) TO service_role;

-- Bridge: mark the qualification recruitment_approved (this function is only
-- called from cvp-approve-application = the single human recruitment approval),
-- so the promote above can auto-qualify it once the NDA lands. Otherwise
-- identical to the prior definition.
CREATE OR REPLACE FUNCTION public.qms_bridge_cvp_competence(p_vendor_id uuid, p_application_id uuid, p_acting_user_id uuid, p_basis_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'qms', 'public'
AS $function$
DECLARE
  v_role_id uuid; v_qual_id uuid; v_type_id uuid; v_basis_id uuid;
  v_ev int := 0; v_pairs int := 0; r record; v_promoted int := 0;
BEGIN
  IF p_vendor_id IS NULL OR p_acting_user_id IS NULL THEN RAISE EXCEPTION 'vendor + actor required'; END IF;

  SELECT id INTO v_role_id FROM qms.role_types WHERE code='translator';
  SELECT id INTO v_type_id FROM qms.evidence_types WHERE code='internal_test_passed';

  SELECT id INTO v_qual_id FROM qms.role_qualifications
    WHERE vendor_id=p_vendor_id AND role_type_id=v_role_id LIMIT 1;
  IF v_qual_id IS NULL THEN
    IF p_basis_code IS NOT NULL THEN SELECT id INTO v_basis_id FROM qms.competence_bases WHERE code=p_basis_code; END IF;
    INSERT INTO qms.role_qualifications
      (vendor_id, role_type_id, competence_basis_id, status, competence_basis_notes, internal_notes,
       recruitment_approved, recruitment_approved_by, created_by)
    VALUES (p_vendor_id, v_role_id, v_basis_id, 'under_review',
      'Competence demonstrated via internal test/quiz (ISO 17100 §6.1.2). §3.1.4 route pending document verification.',
      'Created by CVP->QMS bridge from application '||p_application_id||'.',
      true, p_acting_user_id, p_acting_user_id)
    RETURNING id INTO v_qual_id;
  ELSE
    -- Existing qual: mark it recruitment-approved (human just approved in recruitment).
    UPDATE qms.role_qualifications
      SET recruitment_approved = true,
          recruitment_approved_by = COALESCE(recruitment_approved_by, p_acting_user_id),
          updated_at = now()
      WHERE id = v_qual_id;
  END IF;

  FOR r IN
    SELECT ts.id, ts.ai_assessment_score AS score
    FROM public.cvp_test_submissions ts
    WHERE ts.application_id = p_application_id
      AND ts.status IN ('assessed','approved')
      AND COALESCE(ts.ai_assessment_score,0) >= 75
  LOOP
    IF NOT EXISTS (SELECT 1 FROM qms.competence_evidence ce WHERE ce.source_cvp_test_submission_id = r.id) THEN
      INSERT INTO qms.competence_evidence
        (vendor_id, role_qualification_id, evidence_type_id, title, verified, verified_by, verified_at,
         verification_method, verification_notes, source_cvp_application_id, source_cvp_test_submission_id, created_by)
      VALUES (p_vendor_id, v_qual_id, v_type_id,
        'Internal translation test passed ('||r.score||'%)', true, p_acting_user_id, now(),
        'internal_test', 'Translation test AI-assessed at '||r.score||'% (>=75% pass). ISO 17100 §6.1.2 competence evidence.',
        p_application_id, r.id, p_acting_user_id);
      v_ev := v_ev + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT qs.id, qs.score_pct AS score FROM public.cvp_quiz_submissions qs
    WHERE qs.application_id = p_application_id AND COALESCE(qs.score_pct,0) >= 80
  LOOP
    IF NOT EXISTS (SELECT 1 FROM qms.competence_evidence ce
                   WHERE ce.vendor_id=p_vendor_id AND ce.internal_notes LIKE '%cvpquiz:'||r.id||'%') THEN
      INSERT INTO qms.competence_evidence
        (vendor_id, role_qualification_id, evidence_type_id, title, verified, verified_by, verified_at,
         verification_method, verification_notes, source_cvp_application_id, internal_notes, created_by)
      VALUES (p_vendor_id, v_qual_id, v_type_id,
        'ISO competence quiz passed ('||r.score||'%)', true, p_acting_user_id, now(),
        'internal_quiz', 'Competence quiz auto-graded at '||r.score||'% (>=80% pass). ISO 17100 §6.1.2 competence evidence.',
        p_application_id, 'cvpquiz:'||r.id, p_acting_user_id);
      v_ev := v_ev + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT DISTINCT c.source_language_id AS s, c.target_language_id AS t
    FROM public.cvp_test_combinations c
    WHERE c.application_id = p_application_id AND c.status = 'approved'
      AND c.source_language_id IS NOT NULL AND c.target_language_id IS NOT NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM qms.language_pair_qualifications lp
                   WHERE lp.role_qualification_id=v_qual_id AND lp.source_language_id=r.s AND lp.target_language_id=r.t) THEN
      INSERT INTO qms.language_pair_qualifications
        (role_qualification_id, source_language_id, target_language_id, direction, notes, created_by)
      VALUES (v_qual_id, r.s, r.t, 'source_to_target', 'From CVP approved combo.', p_acting_user_id);
      v_pairs := v_pairs + 1;
    END IF;
  END LOOP;

  -- If basis is set and NDA already active, this qualifies immediately;
  -- otherwise it settles later when the NDA lands (qms_sync_nda_from_signatures).
  v_promoted := public.qms_promote_provisional_if_verified(p_vendor_id, p_acting_user_id);

  RETURN jsonb_build_object('vendor_id', p_vendor_id, 'role_qualification_id', v_qual_id,
    'evidence_added', v_ev, 'language_pairs_added', v_pairs, 'requalified', v_promoted);
END $function$;
