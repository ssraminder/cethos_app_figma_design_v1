-- Record a vendor's RECEIVED professional references as QMS competence evidence
-- so they show on the QMS tab and count toward the qualification — not just the
-- advisory AI assessment. Sources: public.vendor_references (by vendor_id) +
-- public.cvp_application_references (via email-matched application). Only
-- received, non-declined, non-negative (rating null or >=3) references.
-- Idempotent via 'ref:<id>' marker in internal_notes.
-- With a staff actor → Tier-2 verified (+ auto-promote); auto-runs with no
-- actor → Tier-1 screened, pending a human Verify on the QMS tab.
-- Applied to prod via MCP 2026-06-18; called from vendor-iso17100-assess.
CREATE OR REPLACE FUNCTION public.qms_ingest_vendor_references(
  p_vendor_id uuid, p_acting_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE
  v_email text; v_type_id uuid; v_qual_id uuid; v_role_id uuid;
  r record; v_added int := 0; v_marker text; v_note text;
  v_verified boolean := (p_acting_user_id IS NOT NULL);
BEGIN
  IF p_vendor_id IS NULL THEN RAISE EXCEPTION 'vendor required'; END IF;
  SELECT lower(email) INTO v_email FROM public.vendors WHERE id = p_vendor_id;
  SELECT id INTO v_type_id FROM qms.evidence_types WHERE code = 'references_verified';
  SELECT id INTO v_role_id FROM qms.role_types WHERE code = 'translator';
  SELECT id INTO v_qual_id FROM qms.role_qualifications
    WHERE vendor_id = p_vendor_id AND role_type_id = v_role_id
    ORDER BY (status='qualified') DESC, qualified_at DESC NULLS LAST LIMIT 1;

  FOR r IN
    SELECT vr.id, vr.reference_name AS name, vr.reference_company AS company,
           vr.reference_relationship AS rel, vr.feedback_rating AS rating, vr.ai_analysis AS ai
    FROM public.vendor_references vr
    WHERE vr.vendor_id = p_vendor_id AND vr.feedback_received_at IS NOT NULL
      AND vr.declined_at IS NULL AND (vr.feedback_rating IS NULL OR vr.feedback_rating >= 3)
    UNION ALL
    SELECT ar.id, ar.reference_name, ar.reference_company, ar.reference_relationship,
           ar.feedback_rating, ar.ai_analysis
    FROM public.cvp_application_references ar
    JOIN public.cvp_applications a ON a.id = ar.application_id
    WHERE v_email IS NOT NULL AND lower(a.email) = v_email
      AND ar.feedback_received_at IS NOT NULL AND ar.declined_at IS NULL
      AND (ar.feedback_rating IS NULL OR ar.feedback_rating >= 3)
  LOOP
    v_marker := 'ref:' || r.id;
    IF EXISTS (SELECT 1 FROM qms.competence_evidence ce
               WHERE ce.vendor_id = p_vendor_id AND ce.internal_notes LIKE '%' || v_marker || '%') THEN
      CONTINUE;
    END IF;
    v_note := 'Professional reference received'
      || CASE WHEN r.rel IS NOT NULL THEN ' (' || r.rel || ')' ELSE '' END
      || CASE WHEN r.rating IS NOT NULL THEN ', rating ' || r.rating || '/5' ELSE '' END
      || CASE WHEN r.ai->>'summary' IS NOT NULL THEN '. ' || (r.ai->>'summary') ELSE '' END
      || CASE WHEN NOT v_verified THEN ' [auto-recorded — pending staff verification]' ELSE '' END;
    INSERT INTO qms.competence_evidence
      (vendor_id, role_qualification_id, evidence_type_id, title, issuing_organization,
       verified, verified_by, verified_at, verification_method, verification_notes, internal_notes, created_by)
    VALUES
      (p_vendor_id, v_qual_id, v_type_id,
       'Professional reference — ' || COALESCE(r.name, r.company, 'unnamed'),
       r.company, v_verified,
       CASE WHEN v_verified THEN p_acting_user_id ELSE NULL END,
       CASE WHEN v_verified THEN now() ELSE NULL END,
       'reference_check', v_note, v_marker, p_acting_user_id);
    v_added := v_added + 1;
  END LOOP;

  IF v_added > 0 AND v_verified THEN PERFORM public.qms_promote_provisional_if_verified(p_vendor_id, p_acting_user_id); END IF;
  RETURN jsonb_build_object('vendor_id', p_vendor_id, 'references_recorded', v_added, 'tier', CASE WHEN v_verified THEN 'verified' ELSE 'screened' END);
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_ingest_vendor_references(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_ingest_vendor_references(uuid,uuid) TO service_role;
