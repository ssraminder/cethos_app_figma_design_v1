-- ============================================================================
-- QMS bridge / promote: actor FK fix (2026-06-19)
--
-- BUG: qms.role_qualifications.created_by, qms.competence_evidence.created_by /
-- verified_by, and qms.language_pair_qualifications.created_by are FKs to
-- auth.users(id). The CVP->QMS bridge was passed p_acting_user_id verbatim.
-- For NORMAL staff approvals that value is auth.uid() (valid). But for the
-- internalAuto / auto-approval path it is a staff_users.id, which is NOT an
-- auth.users.id (staff link to auth via staff_users.auth_user_id). The insert
-- then violates the created_by FK, the whole SECURITY DEFINER function rolls
-- back, and cvp-approve-application swallows the error ("never block the welcome
-- email") -> the vendor is created ACTIVE with ZERO QMS qualification rows.
-- This is an ISO 17100 §6.1 audit gap on every auto-approved vendor.
--
-- FIX: resolve the actor to a valid auth.users id before using it for any
-- auth.users-FK column. Accept an auth.users id as-is; otherwise map a
-- staff_users.id via staff_users.auth_user_id; otherwise NULL (columns are
-- nullable, so the row still persists with an unknown actor rather than
-- rolling back the whole qualification).
-- ============================================================================

-- Resolver: auth.users id (or staff_users.id -> its auth_user_id, or NULL).
CREATE OR REPLACE FUNCTION public.qms_resolve_actor(p_actor uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (SELECT u.id FROM auth.users u WHERE u.id = p_actor),
    (SELECT s.auth_user_id FROM public.staff_users s
       WHERE s.id = p_actor AND s.auth_user_id IS NOT NULL)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.qms_resolve_actor(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_resolve_actor(uuid) TO service_role;

-- ── Bridge: resolve the actor once, use it for every auth.users-FK column. ──
CREATE OR REPLACE FUNCTION public.qms_bridge_cvp_competence(
  p_vendor_id uuid,
  p_application_id uuid,
  p_acting_user_id uuid,
  p_basis_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE
  v_role_id uuid; v_qual_id uuid; v_type_id uuid; v_basis_id uuid;
  v_ev int := 0; v_pairs int := 0; r record; v_promoted int := 0;
  v_actor uuid;
BEGIN
  IF p_vendor_id IS NULL OR p_acting_user_id IS NULL THEN RAISE EXCEPTION 'vendor + actor required'; END IF;
  v_actor := public.qms_resolve_actor(p_acting_user_id);  -- valid auth.users id (or NULL)

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
    'evidence_added', v_ev, 'language_pairs_added', v_pairs, 'requalified', v_promoted);
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_bridge_cvp_competence(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_bridge_cvp_competence(uuid,uuid,uuid,text) TO service_role;

-- ── Promote: resolve the actor for the qualified_by FK too (defensive for any
-- caller that passes a staff_users.id, e.g. the NDA-sync trigger). ──
CREATE OR REPLACE FUNCTION public.qms_promote_provisional_if_verified(p_vendor_id uuid, p_acting_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'qms', 'public'
AS $function$
DECLARE v_q int := 0; v_p int := 0; v_actor uuid;
BEGIN
  IF p_vendor_id IS NULL THEN RETURN 0; END IF;
  v_actor := public.qms_resolve_actor(p_acting_user_id);
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
    UPDATE qms.role_qualifications rq
    SET status = 'qualified',
        qualified_by = COALESCE(rq.qualified_by, public.qms_resolve_actor(rq.recruitment_approved_by), v_actor),
        qualified_at = COALESCE(rq.qualified_at, now()),
        internal_notes = COALESCE(rq.internal_notes || E'\n', '')
          || '[auto] Auto-qualified: recruitment-approved + verified competence evidence + active NDA. Single-gate (no second QMS approval).',
        updated_at = now()
    WHERE rq.vendor_id = p_vendor_id
      AND rq.status = 'under_review'
      AND rq.competence_basis_id IS NOT NULL
      AND rq.recruitment_approved = true;
    GET DIAGNOSTICS v_q = ROW_COUNT;

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
END $function$;

REVOKE EXECUTE ON FUNCTION public.qms_promote_provisional_if_verified(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_promote_provisional_if_verified(uuid,uuid) TO service_role;
