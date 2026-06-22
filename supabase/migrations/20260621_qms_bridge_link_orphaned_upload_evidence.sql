-- At approval, attach the applicant's AI-screened upload evidence (orphaned:
-- vendor_id set, no role_qualification) to the role_qualification the bridge
-- creates, so the ISO 17100 §3.1.4 file carries the documentary evidence the
-- applicant uploaded. Screened rows stay verified=false (Tier-1) so they do NOT
-- auto-promote the qualification — a human still verifies before the §3.1.4 basis.
-- Adds the linking UPDATE + an evidence_linked counter to the bridge result.
-- (Verified on a synthetic vendor: evidence_linked=1, qual stayed under_review.)
CREATE OR REPLACE FUNCTION public.qms_bridge_cvp_competence(p_vendor_id uuid, p_application_id uuid, p_acting_user_id uuid, p_basis_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'qms', 'public'
AS $function$
DECLARE
  v_role_id uuid; v_qual_id uuid; v_type_id uuid; v_basis_id uuid;
  v_ev int := 0; v_pairs int := 0; r record; v_promoted int := 0;
  v_actor uuid; v_linked int := 0;
BEGIN
  IF p_vendor_id IS NULL OR p_acting_user_id IS NULL THEN RAISE EXCEPTION 'vendor + actor required'; END IF;
  v_actor := public.qms_resolve_actor(p_acting_user_id);

  SELECT id INTO v_role_id FROM qms.role_types WHERE code='translator';
  SELECT id INTO v_type_id FROM qms.evidence_types WHERE code='internal_test_passed';
  SELECT id INTO v_qual_id FROM qms.role_qualifications WHERE vendor_id=p_vendor_id AND role_type_id=v_role_id LIMIT 1;
  IF v_qual_id IS NULL THEN
    IF p_basis_code IS NOT NULL THEN SELECT id INTO v_basis_id FROM qms.competence_bases WHERE code=p_basis_code; END IF;
    INSERT INTO qms.role_qualifications
      (vendor_id, role_type_id, competence_basis_id, status, competence_basis_notes, internal_notes,
       recruitment_approved, recruitment_approved_by, created_by)
    VALUES (p_vendor_id, v_role_id, v_basis_id, 'under_review',
      'Competence demonstrated via internal test/quiz (ISO 17100 §6.1.2). §3.1.4 route pending document verification.',
      'Created by CVP->QMS bridge from application '||p_application_id||'.',
      true, v_actor, v_actor)
    RETURNING id INTO v_qual_id;
  ELSE
    UPDATE qms.role_qualifications
      SET recruitment_approved = true,
          recruitment_approved_by = COALESCE(recruitment_approved_by, v_actor),
          updated_at = now()
      WHERE id = v_qual_id;
  END IF;

  -- Attach previously-orphaned AI-screened upload evidence to this qualification.
  UPDATE qms.competence_evidence
    SET role_qualification_id = v_qual_id, updated_at = now(), updated_by = v_actor
    WHERE vendor_id = p_vendor_id AND role_qualification_id IS NULL;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

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
        'Internal translation test passed ('||r.score||'%)', true, v_actor, now(),
        'internal_test', 'Translation test AI-assessed at '||r.score||'% (>=75% pass). ISO 17100 §6.1.2 competence evidence.',
        p_application_id, r.id, v_actor);
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
        'ISO competence quiz passed ('||r.score||'%)', true, v_actor, now(),
        'internal_quiz', 'Competence quiz auto-graded at '||r.score||'% (>=80% pass). ISO 17100 §6.1.2 competence evidence.',
        p_application_id, 'cvpquiz:'||r.id, v_actor);
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
      VALUES (v_qual_id, r.s, r.t, 'source_to_target', 'From CVP approved combo.', v_actor);
      v_pairs := v_pairs + 1;
    END IF;
  END LOOP;

  v_promoted := public.qms_promote_provisional_if_verified(p_vendor_id, v_actor);
  RETURN jsonb_build_object('vendor_id', p_vendor_id, 'role_qualification_id', v_qual_id,
    'evidence_added', v_ev, 'evidence_linked', v_linked, 'language_pairs_added', v_pairs, 'requalified', v_promoted);
END $function$;
