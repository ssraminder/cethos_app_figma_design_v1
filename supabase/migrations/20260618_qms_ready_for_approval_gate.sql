-- Phase 2 — human qualification-approval gate (unification).
-- Auto-assembly now stops at 'preliminary' (= fully assembled: competence +
-- verified §3.1.4 basis + active NDA, ready for a human to approve) instead of
-- silently flipping to 'qualified'. A human approves via qms_approve_qualification.
-- Applied to prod via MCP 2026-06-18. Supersedes the promote helper in
-- 20260618_qms_auto_promote_provisional_on_verify.sql.
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
    SET status = 'preliminary',
        internal_notes = COALESCE(rq.internal_notes || E'\n', '')
          || '[auto] Ready for approval: Tier-2 verified evidence + active NDA on file. Awaiting human qualification sign-off.',
        updated_at = now()
    WHERE rq.vendor_id = p_vendor_id
      AND rq.status = 'under_review'
      AND rq.competence_basis_id IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.qms_approve_qualification(
  p_vendor_id uuid,
  p_acting_user_id uuid,
  p_role_qualification_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE v_count int := 0;
BEGIN
  IF p_vendor_id IS NULL OR p_acting_user_id IS NULL THEN RAISE EXCEPTION 'vendor + actor required'; END IF;
  UPDATE qms.role_qualifications rq
  SET status = 'qualified',
      qualified_by = COALESCE(rq.qualified_by, p_acting_user_id),
      qualified_at = COALESCE(rq.qualified_at, now()),
      internal_notes = COALESCE(rq.internal_notes || E'\n', '')
        || '[2026-06-18] Qualification approved by staff (ready-for-approval gate).',
      updated_at = now()
  WHERE rq.vendor_id = p_vendor_id
    AND rq.status = 'preliminary'
    AND (p_role_qualification_id IS NULL OR rq.id = p_role_qualification_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('vendor_id', p_vendor_id, 'approved', v_count);
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_approve_qualification(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_approve_qualification(uuid,uuid,uuid) TO service_role;
