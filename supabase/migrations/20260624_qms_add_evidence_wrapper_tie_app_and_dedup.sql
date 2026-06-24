-- 20260624_qms_add_evidence_wrapper_tie_app_and_dedup
-- Completes the responder-resurface loop (with 20260624_cvp_resurface_info_requested).
-- The upload/AI-screen helper (_shared/screen-evidence-document.ts) files screened
-- documents via this wrapper. Two fixes here, both inside the DB function so NO edge
-- function needs redeploying (signature is unchanged):
--   (1) source_cvp_application_id — resolved from the vendor's email to the latest
--       cvp_applications row — so a genuine re-upload is tied to the application and the
--       resurface sweep (signal: ce.source_cvp_application_id = a.id AND created_at >
--       staff_reviewed_at) flips info_requested -> staff_review.
--   (2) dedup by (vendor_id, sha256) — re-screens / backfills of an already-recorded file
--       return the existing row instead of inserting a duplicate. This removes the
--       same-day duplicate-evidence noise that made the vendor-email join unusable as a
--       response signal.
-- Applied to prod via MCP 2026-06-24.
CREATE OR REPLACE FUNCTION public.qms_add_evidence_wrapper(p_vendor_id uuid, p_role_qualification_id uuid, p_evidence_type_code text, p_title text, p_org text, p_country text, p_issued_date date, p_expiry_date date, p_storage_path text, p_file_name text, p_file_mime text, p_file_size bigint, p_sha256 text, p_verified boolean, p_verification_method text, p_verification_notes text, p_acting_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'qms', 'public'
AS $function$
DECLARE
  v_type_id uuid;
  v_id uuid;
  v_app_id uuid;
BEGIN
  IF p_vendor_id IS NULL THEN RAISE EXCEPTION 'p_vendor_id required'; END IF;
  IF p_acting_user_id IS NULL AND COALESCE(p_verified, false) THEN
    RAISE EXCEPTION 'p_acting_user_id required to record verified evidence';
  END IF;

  SELECT id INTO v_type_id FROM qms.evidence_types WHERE code = p_evidence_type_code;
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'unknown evidence_type code %', p_evidence_type_code; END IF;

  -- (2) Dedup: the same file (vendor + sha256) is already recorded — return it, don't duplicate.
  IF p_sha256 IS NOT NULL THEN
    SELECT id INTO v_id FROM qms.competence_evidence
      WHERE vendor_id = p_vendor_id AND sha256 = p_sha256 LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  -- (1) Tie to the applicant's recruitment application (latest by email).
  SELECT a.id INTO v_app_id
    FROM public.cvp_applications a
    WHERE lower(a.email) = lower((SELECT email FROM public.vendors WHERE id = p_vendor_id))
    ORDER BY a.created_at DESC
    LIMIT 1;

  INSERT INTO qms.competence_evidence
    (vendor_id, role_qualification_id, evidence_type_id, title, issuing_organization,
     issuing_country_code, issued_date, expiry_date, storage_path, file_name, file_mime,
     file_size_bytes, sha256, verified, verified_by, verified_at, verification_method,
     verification_notes, source_cvp_application_id, created_by)
  VALUES
    (p_vendor_id, p_role_qualification_id, v_type_id, p_title, p_org,
     p_country, p_issued_date, p_expiry_date, p_storage_path, p_file_name, p_file_mime,
     p_file_size, p_sha256,
     COALESCE(p_verified, false),
     CASE WHEN COALESCE(p_verified, false) THEN p_acting_user_id ELSE NULL END,
     CASE WHEN COALESCE(p_verified, false) THEN now() ELSE NULL END,
     COALESCE(p_verification_method, CASE WHEN COALESCE(p_verified, false) THEN 'document_review' ELSE NULL END),
     p_verification_notes, v_app_id, p_acting_user_id)
  RETURNING id INTO v_id;

  IF COALESCE(p_verified, false) THEN
    PERFORM public.qms_promote_provisional_if_verified(p_vendor_id, p_acting_user_id);
  END IF;
  RETURN v_id;
END $function$;
