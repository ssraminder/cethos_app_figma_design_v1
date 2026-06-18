-- QMS data-integrity fix: mirror portal NDA signatures into qms.nda_agreements.
--
-- The vendor portal clickwrap (vendor-sign-nda) only ever wrote
-- public.vendor_nda_signatures. The QMS qualification preconditions and the
-- Phase-2 ready-for-approval gate read qms.nda_agreements — so 288 vendors who
-- genuinely signed were invisible to QMS and could never auto-qualify. This adds
-- (1) an idempotent sync RPC, (2) a forward trigger so every future signature
-- mirrors automatically. Applied to prod via MCP 2026-06-18.

-- (1) Idempotent sync. p_vendor_id NULL = sweep everyone. Inserts one active
-- qms.nda_agreements row per vendor that has a current portal NDA signature but
-- no active QMS NDA. Never duplicates (guards on an existing active row).
CREATE OR REPLACE FUNCTION public.qms_sync_nda_from_signatures(
  p_acting_user_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE r record; v_ver text; v_added int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (s.vendor_id)
           s.vendor_id, s.id AS sig_id, s.signed_at, s.nda_template_id, s.signed_pdf_storage_path
    FROM public.vendor_nda_signatures s
    WHERE s.is_current = true
      AND COALESCE(s.agreement_type,'nda') = 'nda'
      AND (p_vendor_id IS NULL OR s.vendor_id = p_vendor_id)
      AND NOT EXISTS (
        SELECT 1 FROM qms.nda_agreements n
        WHERE n.vendor_id = s.vendor_id AND n.status = 'active'
          AND (n.expiry_date IS NULL OR n.expiry_date >= current_date)
      )
    ORDER BY s.vendor_id, s.signed_at DESC
  LOOP
    SELECT version_label INTO v_ver FROM public.nda_templates WHERE id = r.nda_template_id;
    INSERT INTO qms.nda_agreements
      (vendor_id, template_version, signed_date, effective_date, status, signed_method,
       signed_via, storage_path, countersigned, internal_notes, created_by)
    VALUES
      (r.vendor_id, COALESCE(v_ver,'vendor-portal'), r.signed_at::date, r.signed_at::date,
       'active', 'electronic', 'vendor_portal', r.signed_pdf_storage_path, false,
       'Synced from vendor_nda_signatures ' || r.sig_id || ' (portal clickwrap).', p_acting_user_id);
    v_added := v_added + 1;
  END LOOP;
  RETURN jsonb_build_object('synced', v_added, 'scope', COALESCE(p_vendor_id::text,'all'));
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_sync_nda_from_signatures(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_sync_nda_from_signatures(uuid,uuid) TO service_role;

-- (2) Forward trigger: any new/updated current NDA signature self-mirrors into
-- QMS. created_by stays NULL (system/automatic). Only adds on a current 'nda'
-- signature; supersession/revocation handling is left for a later refinement.
CREATE OR REPLACE FUNCTION public.qms_tg_sync_nda_signature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
BEGIN
  IF NEW.is_current = true AND COALESCE(NEW.agreement_type,'nda') = 'nda' THEN
    PERFORM public.qms_sync_nda_from_signatures(NULL, NEW.vendor_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_qms_sync_nda ON public.vendor_nda_signatures;
CREATE TRIGGER trg_qms_sync_nda
  AFTER INSERT OR UPDATE OF is_current ON public.vendor_nda_signatures
  FOR EACH ROW EXECUTE FUNCTION public.qms_tg_sync_nda_signature();
