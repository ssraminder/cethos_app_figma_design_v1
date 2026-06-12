-- Audit remediation 2026-06-12: list-vendor-qms and admin-record-qualification
-- both failed with "Invalid schema: qms" — PostgREST does not expose the qms
-- schema, so supabase-js clients scoped with { db: { schema: 'qms' } } never
-- worked, even with service_role. Public SECURITY DEFINER wrappers instead.

CREATE OR REPLACE FUNCTION public.qms_list_vendor_qualifications(p_vendor_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = qms, public AS $$
  SELECT jsonb_build_object(
    'qualifications', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id,
        'status', q.status,
        'qualified_at', q.qualified_at,
        're_qualification_due', q.re_qualification_due,
        'role_type', (SELECT jsonb_build_object('id', rt.id, 'code', rt.code, 'name', rt.name) FROM qms.role_types rt WHERE rt.id = q.role_type_id),
        'competence_basis', (SELECT jsonb_build_object('id', cb.id, 'code', cb.code, 'short_label', cb.short_label) FROM qms.competence_bases cb WHERE cb.id = q.competence_basis_id),
        'language_pair_qualifications', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'direction', lp.direction,
            'source_language', (SELECT jsonb_build_object('id', sl.id, 'code', sl.code, 'name', sl.name) FROM public.languages sl WHERE sl.id = lp.source_language_id),
            'target_language', (SELECT jsonb_build_object('id', tl.id, 'code', tl.code, 'name', tl.name) FROM public.languages tl WHERE tl.id = lp.target_language_id)
          ))
          FROM qms.language_pair_qualifications lp WHERE lp.role_qualification_id = q.id
        ), '[]'::jsonb)
      ) ORDER BY q.qualified_at DESC)
      FROM qms.role_qualifications q WHERE q.vendor_id = p_vendor_id
    ), '[]'::jsonb),
    'ndas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'status', n.status, 'signed_date', n.signed_date,
        'effective_date', n.effective_date, 'expiry_date', n.expiry_date,
        'template_version', n.template_version
      ) ORDER BY n.signed_date DESC)
      FROM qms.nda_agreements n WHERE n.vendor_id = p_vendor_id
    ), '[]'::jsonb),
    -- The portal agreements system (vendor_nda_signatures) is the legal NDA
    -- source of truth since 2026-06-10; surface it so the QMS tab stops
    -- claiming "No NDA" for vendors who have actually signed.
    'portal_nda_signed_at', (
      SELECT max(s.signed_at) FROM public.vendor_nda_signatures s
      WHERE s.vendor_id = p_vendor_id AND s.is_current AND s.agreement_type = 'nda'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.qms_record_qualification_wrapper(
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
LANGUAGE sql SECURITY DEFINER SET search_path = qms, public AS $$
  SELECT qms.record_qualification(
    p_vendor_id, p_role_code, p_competence_basis_code, p_evidence_type_code,
    p_evidence_title, p_evidence_org, p_evidence_issued_date, p_evidence_expiry_date,
    p_evidence_notes, p_nda_signed_date, p_nda_template_version, p_language_pairs,
    p_competence_basis_notes, p_acting_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.qms_list_vendor_qualifications(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.qms_record_qualification_wrapper(uuid, text, text, text, text, text, date, date, text, date, text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qms_list_vendor_qualifications(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.qms_record_qualification_wrapper(uuid, text, text, text, text, text, date, date, text, date, text, jsonb, text, uuid) TO service_role;
