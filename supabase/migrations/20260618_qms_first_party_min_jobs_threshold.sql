-- Minimum-jobs threshold for first-party experience to count as Tier-2.
-- A single Cethos job is too thin for ISO §3.1.4(c). Require >= N jobs (config,
-- default 3); below that the evidence is recorded but NOT verified, and does not
-- qualify the vendor. Also reverts existing thin (<3) first-party qualifications
-- to provisional. Applied to prod via MCP 2026-06-18.
-- Supersedes 20260618_qms_build_first_party_experience_with_legacy.sql (generator body).

INSERT INTO qms.config (key, value, description, iso_clause_reference)
VALUES ('first_party_min_jobs', '3'::jsonb,
  'Minimum number of completed Cethos jobs (portal + legacy) for first-party engagement to count as Tier-2 verified evidence of documented professional experience. Below this, evidence is recorded but unverified and does not qualify the vendor.',
  'ISO 17100:2015 §3.1.4(c)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.qms_build_first_party_experience(
  p_vendor_id uuid,
  p_acting_user_id uuid,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE
  v_jobs int; v_earliest date; v_latest date; v_pairs int; v_total numeric; v_currencies text;
  v_leg_n int; v_leg_min date; v_leg_max date; v_leg_cad numeric;
  v_role_id uuid; v_qual_id uuid; v_type_id uuid; v_evidence_id uuid; v_pe_id uuid;
  v_note text; v_promoted int := 0; v_has_legacy boolean := false;
  v_min int; v_qualifying boolean;
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
  WHERE p.vendor_id = p_vendor_id AND p.voided_at IS NULL AND p.cancelled_at IS NULL;

  SELECT sum(n_invoices), min(earliest), max(latest), round(sum(total_cad))
    INTO v_leg_n, v_leg_min, v_leg_max, v_leg_cad
  FROM public.legacy_supplier_invoice_summary WHERE vendor_id = p_vendor_id;
  v_has_legacy := COALESCE(v_leg_n,0) > 0;

  v_jobs := COALESCE(v_jobs,0) + COALESCE(v_leg_n,0);
  v_earliest := least(v_earliest, v_leg_min);
  v_latest := greatest(v_latest, v_leg_max);
  v_total := COALESCE(v_total,0) + COALESCE(v_leg_cad,0);
  IF v_has_legacy AND (v_currencies IS NULL OR v_currencies NOT LIKE '%CAD%') THEN
    v_currencies := COALESCE(NULLIF(v_currencies,'') || ', ', '') || 'CAD';
  END IF;

  IF v_jobs = 0 THEN
    RETURN jsonb_build_object('found', false, 'vendor_id', p_vendor_id,
      'message', 'No portal or legacy payment records for this vendor.');
  END IF;

  SELECT (value::text)::int INTO v_min FROM qms.config WHERE key='first_party_min_jobs';
  v_min := COALESCE(v_min, 3);
  v_qualifying := v_jobs >= v_min;

  v_note := 'Cethos Translations first-party records: ' || v_jobs
    || ' completed job(s) from ' || to_char(v_earliest,'YYYY-MM-DD')
    || ' to ' || to_char(v_latest,'YYYY-MM-DD')
    || CASE WHEN v_pairs > 0 THEN ' across ' || v_pairs || ' language pair(s)' ELSE '' END
    || CASE WHEN v_total IS NOT NULL AND v_total > 0 THEN '; total billed ~' || v_total || ' ' || COALESCE(v_currencies,'') ELSE '' END
    || CASE WHEN v_has_legacy THEN ' (incl. ' || v_leg_n || ' pre-2023 legacy invoices)' ELSE '' END
    || CASE WHEN NOT v_qualifying THEN '. BELOW the ' || v_min || '-job minimum — recorded but not counted as Tier-2 ISO/COA evidence' ELSE '' END
    || '. First-party payment/PO evidence (ISO 17100 §3.1.4 documented professional experience; VM-001 §5.5).';

  IF p_dry_run THEN
    RETURN jsonb_build_object('found', true, 'dry_run', true, 'vendor_id', p_vendor_id,
      'jobs', v_jobs, 'earliest', v_earliest, 'latest', v_latest, 'pairs', v_pairs,
      'total', v_total, 'currencies', v_currencies, 'legacy_invoices', COALESCE(v_leg_n,0),
      'qualifying', v_qualifying, 'min_jobs', v_min, 'note', v_note);
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
     v_qualifying,
     CASE WHEN v_qualifying THEN p_acting_user_id ELSE NULL END,
     CASE WHEN v_qualifying THEN now() ELSE NULL END,
     'first_party_records', v_note, p_acting_user_id)
  RETURNING id INTO v_evidence_id;

  INSERT INTO qms.professional_experience
    (vendor_id, role_type_id, employer_or_client, description, start_date, end_date,
     volume_indicator, is_documented, evidence_id, verified, verified_by, verified_at, notes, created_by)
  VALUES
    (p_vendor_id, v_role_id, 'Cethos Translations (internal POs)',
     'Professional translation engagement evidenced by Cethos first-party payment/PO records (portal + pre-2023 legacy).',
     v_earliest, v_latest,
     v_jobs || ' jobs' || CASE WHEN v_total IS NOT NULL AND v_total > 0 THEN ' / ~' || v_total || ' ' || COALESCE(v_currencies,'') ELSE '' END,
     v_qualifying, v_evidence_id,
     v_qualifying, CASE WHEN v_qualifying THEN p_acting_user_id ELSE NULL END,
     CASE WHEN v_qualifying THEN now() ELSE NULL END, v_note, p_acting_user_id)
  RETURNING id INTO v_pe_id;

  IF v_qualifying THEN
    v_promoted := public.qms_promote_provisional_if_verified(p_vendor_id, p_acting_user_id);
  END IF;

  RETURN jsonb_build_object('found', true, 'dry_run', false, 'vendor_id', p_vendor_id,
    'jobs', v_jobs, 'earliest', v_earliest, 'latest', v_latest, 'pairs', v_pairs,
    'total', v_total, 'currencies', v_currencies, 'legacy_invoices', COALESCE(v_leg_n,0),
    'qualifying', v_qualifying, 'min_jobs', v_min,
    'evidence_id', v_evidence_id, 'professional_experience_id', v_pe_id,
    'role_qualification_id', v_qual_id, 'requalified_count', v_promoted);
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_build_first_party_experience(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_build_first_party_experience(uuid,uuid,boolean) TO service_role;

-- Cleanup: existing thin (<3 job) first-party evidence → unverified, and revert
-- any qualification left without Tier-2 verified evidence to provisional.
UPDATE qms.competence_evidence ce
SET verified=false, verified_by=NULL, verified_at=NULL,
    verification_notes = verification_notes || ' [reverted: below 3-job minimum]', updated_at=now()
WHERE ce.verification_method='first_party_records'
  AND (regexp_match(ce.verification_notes,'([0-9]+) completed job'))[1]::int < 3
  AND ce.verified = true;

UPDATE qms.professional_experience pe
SET verified=false, verified_by=NULL, verified_at=NULL
WHERE pe.employer_or_client='Cethos Translations (internal POs)'
  AND (regexp_match(pe.notes,'([0-9]+) completed job'))[1]::int < 3 AND pe.verified = true;

UPDATE qms.role_qualifications rq
SET status='under_review',
    internal_notes = COALESCE(rq.internal_notes||E'\n','')
      || '[2026-06-18] Reverted to provisional: first-party evidence below 3-job minimum; no Tier-2 evidence on file.',
    updated_at=now()
WHERE rq.status='qualified'
  AND NOT EXISTS (
    SELECT 1 FROM qms.competence_evidence ce
    WHERE ce.vendor_id=rq.vendor_id AND ce.verified=true
      AND (ce.expiry_date IS NULL OR ce.expiry_date>=current_date));
