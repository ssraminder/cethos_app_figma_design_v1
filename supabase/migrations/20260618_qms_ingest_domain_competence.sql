-- Phase 3 — domain-layer merge. Roll a vendor's APPROVED cvp_translator_domains
-- up into qms.subject_matter_qualifications, and record passed post-onboarding
-- competence quizzes (iso_competence_quiz_submissions) as competence_evidence —
-- so the "Competence tests" tab and the QMS tab show one truth. Idempotent.
-- Applied to prod via MCP 2026-06-18; called from cvp-approve-application.
CREATE OR REPLACE FUNCTION public.qms_map_domain_to_subject_matter(p_domain text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = qms, public AS $$
  SELECT sm.id FROM qms.subject_matters sm WHERE sm.name = CASE lower(p_domain)
    WHEN 'legal' THEN 'Legal'
    WHEN 'medical' THEN 'Life Sciences / Medical'
    WHEN 'life_sciences' THEN 'Life Sciences / Medical'
    WHEN 'pharmaceutical' THEN 'Pharmaceutical'
    WHEN 'financial' THEN 'Finance / Banking'
    WHEN 'insurance' THEN 'Finance / Banking'
    WHEN 'technical' THEN 'Technical'
    WHEN 'it_software' THEN 'Software / IT / Localization'
    WHEN 'it___software' THEN 'Software / IT / Localization'
    WHEN 'automotive_engineering' THEN 'Engineering / Manufacturing'
    WHEN 'marketing_advertising' THEN 'Marketing / Transcreation'
    WHEN 'government_public' THEN 'Government / Public Sector'
    WHEN 'business_corporate' THEN 'General Business'
    WHEN 'general' THEN 'General Business'
    WHEN 'immigration' THEN 'Immigration'
    WHEN 'energy' THEN 'Oil & Gas / Energy'
    WHEN 'academic_scientific' THEN 'Education'
    WHEN 'certified_official' THEN 'Certified Translation (legal documents)'
    ELSE NULL END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.qms_ingest_domain_competence(
  p_vendor_id uuid, p_acting_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE
  v_role_id uuid; v_qual_id uuid; v_type_id uuid;
  r record; v_sm uuid; v_sm_added int := 0; v_ev int := 0;
BEGIN
  IF p_vendor_id IS NULL OR p_acting_user_id IS NULL THEN RAISE EXCEPTION 'vendor + actor required'; END IF;
  SELECT id INTO v_role_id FROM qms.role_types WHERE code='translator';
  SELECT id INTO v_qual_id FROM qms.role_qualifications WHERE vendor_id=p_vendor_id AND role_type_id=v_role_id LIMIT 1;
  IF v_qual_id IS NULL THEN
    RETURN jsonb_build_object('vendor_id', p_vendor_id, 'skipped', 'no translator role_qualification');
  END IF;
  SELECT id INTO v_type_id FROM qms.evidence_types WHERE code='internal_test_passed';

  FOR r IN
    SELECT DISTINCT td.domain
    FROM public.cvp_translator_domains td
    JOIN public.cvp_translators t ON t.id = td.translator_id
    WHERE t.vendor_id = p_vendor_id AND td.status = 'approved'
  LOOP
    v_sm := public.qms_map_domain_to_subject_matter(r.domain);
    IF v_sm IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM qms.subject_matter_qualifications smq
      WHERE smq.role_qualification_id = v_qual_id AND smq.subject_matter_id = v_sm
    ) THEN
      INSERT INTO qms.subject_matter_qualifications
        (role_qualification_id, subject_matter_id, proficiency, notes, created_by)
      VALUES (v_qual_id, v_sm, 'experienced', 'From CVP approved domain: '||r.domain, p_acting_user_id);
      v_sm_added := v_sm_added + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT q.id, q.competence_slug, q.domain, q.score_pct
    FROM public.iso_competence_quiz_submissions q
    WHERE q.vendor_id = p_vendor_id AND q.passed = true
  LOOP
    IF NOT EXISTS (SELECT 1 FROM qms.competence_evidence ce
                   WHERE ce.vendor_id=p_vendor_id AND ce.internal_notes LIKE '%isoquiz:'||r.id||'%') THEN
      INSERT INTO qms.competence_evidence
        (vendor_id, role_qualification_id, evidence_type_id, title, verified, verified_by, verified_at,
         verification_method, verification_notes, internal_notes, created_by)
      VALUES (p_vendor_id, v_qual_id, v_type_id,
        'Competence quiz passed: '||r.competence_slug||COALESCE(' / '||r.domain,'')||' ('||r.score_pct||'%)',
        true, p_acting_user_id, now(), 'internal_quiz',
        'ISO §6.1.2 competence quiz auto-graded at '||r.score_pct||'% (passed). Domain: '||COALESCE(r.domain,'n/a')||'.',
        'isoquiz:'||r.id, p_acting_user_id);
      v_ev := v_ev + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('vendor_id', p_vendor_id, 'role_qualification_id', v_qual_id,
    'subject_matter_added', v_sm_added, 'quiz_evidence_added', v_ev);
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_ingest_domain_competence(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_ingest_domain_competence(uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.qms_map_domain_to_subject_matter(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_map_domain_to_subject_matter(text) TO service_role;
