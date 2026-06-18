-- Create a translator qualification for a legacy vendor on the §3.1.4(c)
-- documented-experience basis (VM-001 §5.5 first-party records). Bridges the
-- portal NDA into qms.nda_agreements, creates the role qualification
-- (under_review), then attaches verified first-party evidence via the generator
-- which promotes to qualified. Applied to prod via MCP 2026-06-18 for the 20
-- legacy roster vendors with >=3 jobs + active + NDA on file (incl. COA panel
-- members Tejinder Soodan, Mugdha Ghate).
CREATE OR REPLACE FUNCTION public.qms_create_legacy_qualification(
  p_vendor_id uuid, p_acting_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE
  v_sig record; v_role_id uuid; v_basis_id uuid; v_qual_id uuid; v_gen jsonb;
  v_nda_bridged boolean := false;
BEGIN
  IF p_acting_user_id IS NULL OR p_vendor_id IS NULL THEN RAISE EXCEPTION 'vendor + actor required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM qms.nda_agreements n WHERE n.vendor_id=p_vendor_id AND n.status='active'
                   AND (n.expiry_date IS NULL OR n.expiry_date>=current_date)) THEN
    SELECT * INTO v_sig FROM public.vendor_nda_signatures s
    WHERE s.vendor_id=p_vendor_id AND s.is_current AND s.agreement_type='nda'
    ORDER BY s.signed_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'vendor % has no current portal NDA to bridge', p_vendor_id; END IF;
    INSERT INTO qms.nda_agreements
      (vendor_id, template_version, signed_date, effective_date, status, signed_method, signed_via,
       storage_path, countersigned, internal_notes, created_by)
    VALUES
      (p_vendor_id, 'vendor-portal', v_sig.signed_at::date, v_sig.signed_at::date, 'active', 'electronic',
       'vendor_portal', v_sig.signed_pdf_storage_path, false,
       'Bridged from vendor_nda_signatures ' || v_sig.id || ' for legacy qualification.', p_acting_user_id);
    v_nda_bridged := true;
  END IF;

  SELECT id INTO v_role_id FROM qms.role_types WHERE code='translator';
  SELECT id INTO v_basis_id FROM qms.competence_bases WHERE code='t_c_5y_experience';
  SELECT id INTO v_qual_id FROM qms.role_qualifications
    WHERE vendor_id=p_vendor_id AND role_type_id=v_role_id LIMIT 1;
  IF v_qual_id IS NULL THEN
    INSERT INTO qms.role_qualifications
      (vendor_id, role_type_id, competence_basis_id, status, competence_basis_notes, internal_notes, created_by)
    VALUES
      (p_vendor_id, v_role_id, v_basis_id, 'under_review',
       'ISO 17100 §3.1.4(c) documented professional experience, evidenced by Cethos first-party payment/PO records (VM-001 §5.5).',
       'Legacy qualification created 2026-06-18 from pre-2023 + portal first-party records.', p_acting_user_id)
    RETURNING id INTO v_qual_id;
  END IF;

  v_gen := public.qms_build_first_party_experience(p_vendor_id, p_acting_user_id, false);

  RETURN jsonb_build_object('vendor_id', p_vendor_id, 'qualification_id', v_qual_id,
    'nda_bridged', v_nda_bridged, 'generator', v_gen);
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_create_legacy_qualification(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_create_legacy_qualification(uuid,uuid) TO service_role;
