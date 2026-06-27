-- qms_register_export(): read-only SECURITY DEFINER export of QMS operational
-- records as a single JSONB payload, used by the qms-dropbox-sync
-- `scaffold_registers` action to build one-time Excel register scaffolds in
-- the team Dropbox (QMS/Registers/). The qms schema is NOT exposed to PostgREST
-- (service role included), so an edge function cannot read it directly; this
-- public SECURITY DEFINER wrapper does the cross-schema joins and name
-- resolution centrally. Read-only; execute restricted to service_role.

create or replace function public.qms_register_export()
returns jsonb
language sql
security definer
set search_path = public, qms
as $$
  select jsonb_build_object(
    'generated_at', now(),

    'qualification_summary', (
      -- only linguists who actually hold a role qualification (the view lists
      -- every vendor; the register should show the qualified population).
      select coalesce(jsonb_agg(to_jsonb(s) order by s.full_name), '[]'::jsonb)
      from qms.v_qualification_summary s
      where s.vendor_id in (select distinct vendor_id from qms.role_qualifications)
    ),

    'role_qualifications', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'vendor', coalesce(v.full_name, v.business_name),
        'email', v.email,
        'country', v.country,
        'role', rt.name,
        'role_code', rt.code,
        'competence_basis', cb.short_label,
        'iso_clause', rt.iso_clause_reference,
        'status', rq.status,
        'qualified_at', rq.qualified_at,
        'qualified_by', qb.full_name,
        'last_re_qualified_at', rq.last_re_qualified_at,
        're_qualification_due', rq.re_qualification_due,
        'notes', rq.competence_basis_notes
      ) order by coalesce(v.full_name, v.business_name), rt.name), '[]'::jsonb)
      from qms.role_qualifications rq
      left join public.vendors v on v.id = rq.vendor_id
      left join qms.role_types rt on rt.id = rq.role_type_id
      left join qms.competence_bases cb on cb.id = rq.competence_basis_id
      left join public.staff_users qb on qb.auth_user_id = rq.qualified_by
    ),

    'language_pairs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'vendor', coalesce(v.full_name, v.business_name),
        'role', rt.name,
        'source', sl.code,
        'target', tl.code,
        'direction', lpq.direction,
        'notes', lpq.notes
      ) order by coalesce(v.full_name, v.business_name)), '[]'::jsonb)
      from qms.language_pair_qualifications lpq
      left join qms.role_qualifications rq on rq.id = lpq.role_qualification_id
      left join public.vendors v on v.id = rq.vendor_id
      left join qms.role_types rt on rt.id = rq.role_type_id
      left join public.languages sl on sl.id = lpq.source_language_id
      left join public.languages tl on tl.id = lpq.target_language_id
    ),

    'competence_evidence', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'vendor', coalesce(v.full_name, v.business_name),
        'evidence_type', et.name,
        'title', ce.title,
        'issuing_organization', ce.issuing_organization,
        'issuing_country', ce.issuing_country_code,
        'issued_date', ce.issued_date,
        'expiry_date', ce.expiry_date,
        'verified', ce.verified,
        'verified_by', vb.full_name,
        'verified_at', ce.verified_at,
        'verification_method', ce.verification_method,
        'file_name', ce.file_name
      ) order by coalesce(v.full_name, v.business_name)), '[]'::jsonb)
      from qms.competence_evidence ce
      left join public.vendors v on v.id = ce.vendor_id
      left join qms.evidence_types et on et.id = ce.evidence_type_id
      left join public.staff_users vb on vb.auth_user_id = ce.verified_by
    ),

    'capa', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'capa_number', c.capa_number,
        'nc_number', nc.nc_number,
        'action_type', c.action_type,
        'description', c.description,
        'owner', ow.full_name,
        'due_date', c.due_date,
        'status', c.status,
        'completed_at', c.completed_at,
        'effectiveness_result', c.effectiveness_result,
        'effectiveness_checked_at', c.effectiveness_checked_at
      ) order by c.capa_number), '[]'::jsonb)
      from qms.capa_actions c
      left join qms.nonconformities nc on nc.id = c.nonconformity_id
      left join public.staff_users ow on ow.id = c.owner_staff_id
    ),

    'complaints', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'complaint_number', q.complaint_number,
        'source', q.source,
        'received_at', q.received_at,
        'received_via', q.received_via,
        'complainant', q.complainant_name,
        'category', q.category,
        'severity', q.severity,
        'summary', q.summary,
        'status', q.status,
        'vendor', coalesce(v.full_name, v.business_name),
        'resolution_note', q.resolution_note,
        'resolved_at', q.resolved_at
      ) order by q.complaint_number), '[]'::jsonb)
      from qms.quality_complaints q
      left join public.vendors v on v.id = q.vendor_id
    ),

    'nonconformities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nc_number', n.nc_number,
        'title', n.title,
        'description', n.description,
        'source', n.source,
        'vendor', coalesce(v.full_name, v.business_name),
        'severity', n.severity,
        'discovered_at', n.discovered_at,
        'root_cause', n.root_cause,
        'status', n.status,
        'closure_summary', n.closure_summary,
        'closed_at', n.closed_at,
        'attributed_to_vendor', n.attributed_to_vendor
      ) order by n.nc_number), '[]'::jsonb)
      from qms.nonconformities n
      left join public.vendors v on v.id = n.vendor_id
    ),

    'performance', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'vendor', coalesce(v.full_name, v.business_name),
        'event_type', p.event_type,
        'severity', p.severity,
        'occurred_at', p.occurred_at,
        'recorded_at', p.recorded_at,
        'project_reference', p.project_reference,
        'description', p.description
      ) order by p.occurred_at desc), '[]'::jsonb)
      from qms.performance_events p
      left join public.vendors v on v.id = p.vendor_id
    ),

    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'full_name', su.full_name,
        'email', su.email,
        'role', su.role,
        'job_title', su.job_title
      ) order by su.full_name), '[]'::jsonb)
      from public.staff_users su
      where su.is_active = true
    )
  );
$$;

revoke all on function public.qms_register_export() from public;
grant execute on function public.qms_register_export() to service_role;
