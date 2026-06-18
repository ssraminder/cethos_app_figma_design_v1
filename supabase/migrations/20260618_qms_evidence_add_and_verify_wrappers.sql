-- Public SECURITY DEFINER wrappers so the admin edge function (manage-qms-evidence)
-- can write to qms.competence_evidence (the qms schema isn't exposed to PostgREST).
--   * add    — insert a new evidence document (diploma, reference, certification,
--              first-party payment statement, etc.), optionally already verified.
--   * verify — flip an existing (e.g. screened) evidence row to Tier-2 verified.
-- Applied to prod via MCP 2026-06-18.

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

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.qms_verify_evidence_wrapper(
  p_evidence_id uuid,
  p_verification_method text,
  p_verification_notes text,
  p_acting_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE v_id uuid;
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
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN RAISE EXCEPTION 'evidence % not found', p_evidence_id; END IF;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_add_evidence_wrapper(uuid,uuid,text,text,text,text,date,date,text,text,text,bigint,text,boolean,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_add_evidence_wrapper(uuid,uuid,text,text,text,text,date,date,text,text,text,bigint,text,boolean,text,text,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.qms_verify_evidence_wrapper(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_verify_evidence_wrapper(uuid,text,text,uuid) TO service_role;
