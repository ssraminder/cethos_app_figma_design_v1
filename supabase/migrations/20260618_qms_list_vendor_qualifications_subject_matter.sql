-- Surface subject-matter qualifications on the admin QMS tab.
-- The QMS tab reads via qms_list_vendor_qualifications (the qms schema isn't
-- exposed to PostgREST). It returned role qualifications + language pairs + NDA
-- but NOT subject_matter_qualifications, so the §5.2 / §6.1.6 clinical-competence
-- records were invisible in the UI an auditor browses. Add them, nested per role
-- qualification. Additive — existing keys unchanged.
CREATE OR REPLACE FUNCTION public.qms_list_vendor_qualifications(p_vendor_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'qms', 'public'
AS $function$
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
        ), '[]'::jsonb),
        'subject_matter_qualifications', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'subject_matter', (SELECT jsonb_build_object('id', sm.id, 'name', sm.name) FROM qms.subject_matters sm WHERE sm.id = smq.subject_matter_id),
            'proficiency', smq.proficiency,
            'notes', smq.notes
          ))
          FROM qms.subject_matter_qualifications smq WHERE smq.role_qualification_id = q.id
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
    'portal_nda_signed_at', (
      SELECT max(s.signed_at) FROM public.vendor_nda_signatures s
      WHERE s.vendor_id = p_vendor_id AND s.is_current AND s.agreement_type = 'nda'
    )
  );
$function$;
