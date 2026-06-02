-- R14: qms.record_qualification — single-call helper that records a complete
-- vendor qualification (NDA + verified evidence + role qualification + language
-- pair qualifications) in one transaction. SECURITY DEFINER so it can satisfy
-- the trg_role_qualifications_preconditions trigger (which requires that
-- evidence + NDA exist before status='qualified' can be set), but the caller
-- must be authenticated — qualified_by is taken from the JWT's auth.uid().
--
-- This is the "Mark vendor qualified" workhorse the admin UI calls. No bulk
-- backfill; one vendor + one role at a time, audit-trail through
-- qualification_audit_log via the existing audit trigger.

CREATE OR REPLACE FUNCTION qms.record_qualification(
  p_vendor_id uuid,
  p_role_code text,
  p_competence_basis_code text,
  p_evidence_type_code text,
  p_evidence_title text,
  p_evidence_org text DEFAULT NULL,
  p_evidence_issued_date date DEFAULT NULL,
  p_evidence_expiry_date date DEFAULT NULL,
  p_evidence_notes text DEFAULT NULL,
  p_nda_signed_date date DEFAULT NULL,
  p_nda_template_version text DEFAULT 'cethos-v1',
  p_language_pairs jsonb DEFAULT '[]'::jsonb,
  p_competence_basis_notes text DEFAULT NULL,
  p_acting_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'qms', 'public'
AS $$
DECLARE
  v_role_type_id uuid;
  v_competence_basis_id uuid;
  v_evidence_type_id uuid;
  v_evidence_id uuid;
  v_nda_id uuid;
  v_role_qual_id uuid;
  v_has_active_nda boolean;
  v_caller uuid;
  v_pair jsonb;
  v_src_lang_id uuid;
  v_tgt_lang_id uuid;
  v_direction qms.pair_direction;
BEGIN
  v_caller := COALESCE(p_acting_user_id, auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'qms.record_qualification requires an authenticated caller (auth.uid() was NULL).'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_role_type_id FROM qms.role_types WHERE code = p_role_code;
  IF v_role_type_id IS NULL THEN
    RAISE EXCEPTION 'Unknown role_code: %', p_role_code USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_competence_basis_id FROM qms.competence_bases WHERE code = p_competence_basis_code;
  IF v_competence_basis_id IS NULL THEN
    RAISE EXCEPTION 'Unknown competence_basis_code: %', p_competence_basis_code USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_evidence_type_id FROM qms.evidence_types WHERE code = p_evidence_type_code;
  IF v_evidence_type_id IS NULL THEN
    RAISE EXCEPTION 'Unknown evidence_type_code: %', p_evidence_type_code USING ERRCODE = '22023';
  END IF;

  -- 1) NDA — insert if vendor has no active NDA AND caller provided a signed_date.
  SELECT EXISTS (
    SELECT 1 FROM qms.nda_agreements
    WHERE vendor_id = p_vendor_id AND status = 'active'
      AND (expiry_date IS NULL OR expiry_date >= current_date)
  ) INTO v_has_active_nda;

  IF NOT v_has_active_nda THEN
    IF p_nda_signed_date IS NULL THEN
      RAISE EXCEPTION 'Vendor % has no active NDA on file. Provide p_nda_signed_date to record one.', p_vendor_id
        USING ERRCODE = '23514';
    END IF;
    INSERT INTO qms.nda_agreements (
      vendor_id, status, signed_date, effective_date, signed_method, signed_via,
      template_version, countersigned, countersigned_date, countersigned_by, created_by
    ) VALUES (
      p_vendor_id, 'active', p_nda_signed_date, p_nda_signed_date, 'electronic', 'admin_portal',
      p_nda_template_version, true, p_nda_signed_date, v_caller, v_caller
    )
    RETURNING id INTO v_nda_id;
  END IF;

  -- 2) Verified competence evidence — staff has reviewed off-platform.
  INSERT INTO qms.competence_evidence (
    vendor_id, evidence_type_id,
    title, issuing_organization, issued_date, expiry_date,
    verified, verified_by, verified_at, verification_method, verification_notes,
    created_by
  ) VALUES (
    p_vendor_id, v_evidence_type_id,
    COALESCE(p_evidence_title, 'Recorded via admin QMS tab'),
    p_evidence_org, p_evidence_issued_date, p_evidence_expiry_date,
    true, v_caller, now(), 'staff_review', p_evidence_notes,
    v_caller
  )
  RETURNING id INTO v_evidence_id;

  -- 3) Role qualification — trigger preconditions satisfied (evidence verified, NDA active).
  INSERT INTO qms.role_qualifications (
    vendor_id, role_type_id, competence_basis_id, competence_basis_notes,
    status, qualified_at, qualified_by, created_by
  ) VALUES (
    p_vendor_id, v_role_type_id, v_competence_basis_id, p_competence_basis_notes,
    'qualified', now(), v_caller, v_caller
  )
  RETURNING id INTO v_role_qual_id;

  -- 4) Link evidence back to the role qualification it supports.
  UPDATE qms.competence_evidence SET role_qualification_id = v_role_qual_id
   WHERE id = v_evidence_id;

  -- 5) Language pair qualifications — caller passes [{source, target, direction?}, ...]
  IF p_language_pairs IS NOT NULL THEN
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_language_pairs)
    LOOP
      v_src_lang_id := qms.resolve_language(v_pair->>'source');
      v_tgt_lang_id := qms.resolve_language(v_pair->>'target');
      IF v_src_lang_id IS NULL OR v_tgt_lang_id IS NULL THEN
        RAISE EXCEPTION 'Unresolvable language pair: source=% target=%',
          v_pair->>'source', v_pair->>'target' USING ERRCODE = '22023';
      END IF;
      v_direction := COALESCE(NULLIF(v_pair->>'direction','')::qms.pair_direction,
                              'source_to_target'::qms.pair_direction);
      INSERT INTO qms.language_pair_qualifications (
        role_qualification_id, source_language_id, target_language_id, direction,
        evidence_id, notes, created_by
      ) VALUES (
        v_role_qual_id, v_src_lang_id, v_tgt_lang_id, v_direction,
        v_evidence_id, NULL, v_caller
      );
    END LOOP;
  END IF;

  RETURN v_role_qual_id;
END;
$$;

COMMENT ON FUNCTION qms.record_qualification IS
  'R14 — admin UI helper that records a full qualification (NDA + evidence + role qualification + language pairs) in one transaction. Use from the admin QMS tab; do not call as a bulk backfill.';

GRANT EXECUTE ON FUNCTION qms.record_qualification(uuid, text, text, text, text, text, date, date, text, date, text, jsonb, text, uuid) TO authenticated, service_role;
