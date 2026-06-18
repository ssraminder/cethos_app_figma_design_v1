-- first-party generator, updated to auto-promote provisional quals after writing
-- Tier-2 evidence (and to prefer the qualified translator qual, else the latest).
-- Applied to prod via MCP 2026-06-18. Supersedes 20260618_qms_build_first_party_experience.sql.
CREATE OR REPLACE FUNCTION public.qms_build_first_party_experience(
  p_vendor_id uuid,
  p_acting_user_id uuid,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE
  v_jobs int;
  v_earliest date;
  v_latest date;
  v_pairs int;
  v_total numeric;
  v_currencies text;
  v_role_id uuid;
  v_qual_id uuid;
  v_type_id uuid;
  v_evidence_id uuid;
  v_pe_id uuid;
  v_note text;
  v_promoted int := 0;
BEGIN
  IF p_acting_user_id IS NULL THEN RAISE EXCEPTION 'p_acting_user_id required'; END IF;
  IF p_vendor_id IS NULL THEN RAISE EXCEPTION 'p_vendor_id required'; END IF;

  SELECT count(*),
         min(COALESCE(p.vendor_invoice_date, p.paid_at::date, p.approved_at::date, p.created_at::date)),
         max(COALESCE(p.vendor_invoice_date, p.paid_at::date, p.approved_at::date, p.created_at::date)),
         count(DISTINCT NULLIF(p.source_language,'')||'>'||NULLIF(p.target_language,'')),
         round(sum(COALESCE(p.total, p.subtotal, 0))),
         string_agg(DISTINCT p.currency, ', ')
    INTO v_jobs, v_earliest, v_latest, v_pairs, v_total, v_currencies
  FROM vendor_payables p
  WHERE p.vendor_id = p_vendor_id
    AND p.voided_at IS NULL AND p.cancelled_at IS NULL;

  IF COALESCE(v_jobs,0) = 0 THEN
    RETURN jsonb_build_object('found', false, 'vendor_id', p_vendor_id,
      'message', 'No portal payment records (vendor_payables) for this vendor. Legacy/XTRF history must be imported or recorded manually.');
  END IF;

  v_note := 'Cethos Translations first-party records: ' || v_jobs
    || ' completed job(s) from ' || to_char(v_earliest,'YYYY-MM-DD')
    || ' to ' || to_char(v_latest,'YYYY-MM-DD')
    || CASE WHEN v_pairs > 0 THEN ' across ' || v_pairs || ' language pair(s)' ELSE '' END
    || CASE WHEN v_total IS NOT NULL AND v_total > 0 THEN '; total billed ' || v_total || ' ' || COALESCE(v_currencies,'') ELSE '' END
    || '. First-party payment/PO evidence (ISO 17100 §3.1.4 documented professional experience; VM-001 §5.5).';

  IF p_dry_run THEN
    RETURN jsonb_build_object('found', true, 'dry_run', true, 'vendor_id', p_vendor_id,
      'jobs', v_jobs, 'earliest', v_earliest, 'latest', v_latest, 'pairs', v_pairs,
      'total', v_total, 'currencies', v_currencies, 'note', v_note);
  END IF;

  SELECT id INTO v_role_id FROM qms.role_types WHERE code = 'translator';
  SELECT id INTO v_qual_id FROM qms.role_qualifications
    WHERE vendor_id = p_vendor_id AND role_type_id = v_role_id
    ORDER BY (status='qualified') DESC, qualified_at DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_type_id FROM qms.evidence_types WHERE code = 'documented_translation_experience';

  DELETE FROM qms.professional_experience
   WHERE vendor_id = p_vendor_id AND employer_or_client = 'Cethos Translations (internal POs)';
  DELETE FROM qms.competence_evidence
   WHERE vendor_id = p_vendor_id AND verification_method = 'first_party_records'
     AND title = 'Cethos first-party engagement record';

  INSERT INTO qms.competence_evidence
    (vendor_id, role_qualification_id, evidence_type_id, title, issuing_organization,
     verified, verified_by, verified_at, verification_method, verification_notes, created_by)
  VALUES
    (p_vendor_id, v_qual_id, v_type_id, 'Cethos first-party engagement record', 'Cethos Translations',
     true, p_acting_user_id, now(), 'first_party_records', v_note, p_acting_user_id)
  RETURNING id INTO v_evidence_id;

  INSERT INTO qms.professional_experience
    (vendor_id, role_type_id, employer_or_client, description, start_date, end_date,
     volume_indicator, is_documented, evidence_id, verified, verified_by, verified_at, notes, created_by)
  VALUES
    (p_vendor_id, v_role_id, 'Cethos Translations (internal POs)',
     'Professional translation engagement evidenced by Cethos first-party payment/PO records.',
     v_earliest, v_latest,
     v_jobs || ' jobs' || CASE WHEN v_total IS NOT NULL AND v_total > 0 THEN ' / ' || v_total || ' ' || COALESCE(v_currencies,'') ELSE '' END,
     true, v_evidence_id, true, p_acting_user_id, now(), v_note, p_acting_user_id)
  RETURNING id INTO v_pe_id;

  -- Tier-2 evidence now exists → return any provisional quals to qualified.
  v_promoted := public.qms_promote_provisional_if_verified(p_vendor_id, p_acting_user_id);

  RETURN jsonb_build_object('found', true, 'dry_run', false, 'vendor_id', p_vendor_id,
    'jobs', v_jobs, 'earliest', v_earliest, 'latest', v_latest, 'pairs', v_pairs,
    'total', v_total, 'currencies', v_currencies,
    'evidence_id', v_evidence_id, 'professional_experience_id', v_pe_id,
    'role_qualification_id', v_qual_id, 'requalified_count', v_promoted);
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_build_first_party_experience(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_build_first_party_experience(uuid,uuid,boolean) TO service_role;
