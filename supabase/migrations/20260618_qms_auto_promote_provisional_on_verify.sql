-- When Tier-2 verified evidence is recorded for a vendor, their provisional
-- (under_review) role qualifications automatically return to 'qualified' —
-- provided an active NDA is on file. Wired into the verify / add(verified) /
-- first-party-experience paths so the qualify loop is coherent.
-- Applied to prod via MCP 2026-06-18.
CREATE OR REPLACE FUNCTION public.qms_promote_provisional_if_verified(
  p_vendor_id uuid,
  p_acting_user_id uuid
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE v_count int := 0;
BEGIN
  IF p_vendor_id IS NULL OR p_acting_user_id IS NULL THEN RETURN 0; END IF;

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
        qualified_by = COALESCE(rq.qualified_by, p_acting_user_id),
        qualified_at = COALESCE(rq.qualified_at, now()),
        internal_notes = COALESCE(rq.internal_notes || E'\n', '')
          || '[auto] Re-qualified: Tier-2 document-verified evidence now on file.',
        updated_at = now()
    WHERE rq.vendor_id = p_vendor_id
      AND rq.status = 'under_review'
      AND rq.competence_basis_id IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_promote_provisional_if_verified(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_promote_provisional_if_verified(uuid,uuid) TO service_role;

-- verify wrapper: promote after flipping a row to verified.
CREATE OR REPLACE FUNCTION public.qms_verify_evidence_wrapper(
  p_evidence_id uuid,
  p_verification_method text,
  p_verification_notes text,
  p_acting_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE v_id uuid; v_vendor uuid;
BEGIN
  IF p_acting_user_id IS NULL THEN RAISE EXCEPTION 'p_acting_user_id required'; END IF;

  UPDATE qms.competence_evidence
  SET verified = true,
      verified_by = p_acting_user_id,
      verified_at = now(),
      verification_method = COALESCE(p_verification_method, 'document_review'),
      verification_notes = CASE
        WHEN p_verification_notes IS NULL OR p_verification_notes = '' THEN verification_notes
        ELSE 'VERIFIED: ' || p_verification_notes
             || CASE WHEN verification_notes IS NULL THEN '' ELSE E'\n(prior: ' || verification_notes || ')' END
        END,
      updated_at = now(),
      updated_by = p_acting_user_id
  WHERE id = p_evidence_id
  RETURNING id, vendor_id INTO v_id, v_vendor;

  IF v_id IS NULL THEN RAISE EXCEPTION 'evidence % not found', p_evidence_id; END IF;
  PERFORM public.qms_promote_provisional_if_verified(v_vendor, p_acting_user_id);
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_verify_evidence_wrapper(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_verify_evidence_wrapper(uuid,text,text,uuid) TO service_role;

-- add wrapper: promote when a verified document is added.
CREATE OR REPLACE FUNCTION public.qms_add_evidence_wrapper(
  p_vendor_id uuid,
  p_role_qualification_id uuid,
  p_evidence_type_code text,
  p_title text,
  p_org text,
  p_country text,
  p_issued_date date,
  p_expiry_date date,
  p_storage_path text,
  p_file_name text,
  p_file_mime text,
  p_file_size bigint,
  p_sha256 text,
  p_verified boolean,
  p_verification_method text,
  p_verification_notes text,
  p_acting_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE
  v_type_id uuid;
  v_id uuid;
BEGIN
  IF p_acting_user_id IS NULL THEN RAISE EXCEPTION 'p_acting_user_id required'; END IF;
  IF p_vendor_id IS NULL THEN RAISE EXCEPTION 'p_vendor_id required'; END IF;

  SELECT id INTO v_type_id FROM qms.evidence_types WHERE code = p_evidence_type_code;
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'unknown evidence_type code %', p_evidence_type_code; END IF;

  INSERT INTO qms.competence_evidence
    (vendor_id, role_qualification_id, evidence_type_id, title, issuing_organization,
     issuing_country_code, issued_date, expiry_date, storage_path, file_name, file_mime,
     file_size_bytes, sha256, verified, verified_by, verified_at, verification_method,
     verification_notes, created_by)
  VALUES
    (p_vendor_id, p_role_qualification_id, v_type_id, p_title, p_org,
     p_country, p_issued_date, p_expiry_date, p_storage_path, p_file_name, p_file_mime,
     p_file_size, p_sha256,
     COALESCE(p_verified, false),
     CASE WHEN COALESCE(p_verified, false) THEN p_acting_user_id ELSE NULL END,
     CASE WHEN COALESCE(p_verified, false) THEN now() ELSE NULL END,
     COALESCE(p_verification_method, CASE WHEN COALESCE(p_verified, false) THEN 'document_review' ELSE NULL END),
     p_verification_notes, p_acting_user_id)
  RETURNING id INTO v_id;

  IF COALESCE(p_verified, false) THEN
    PERFORM public.qms_promote_provisional_if_verified(p_vendor_id, p_acting_user_id);
  END IF;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_add_evidence_wrapper(uuid,uuid,text,text,text,text,date,date,text,text,text,bigint,text,boolean,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_add_evidence_wrapper(uuid,uuid,text,text,text,text,date,date,text,text,text,bigint,text,boolean,text,text,uuid) TO service_role;
