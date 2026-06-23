-- public.qms_* SECURITY DEFINER function layer for CAPA + complaints + linguist
-- performance reads/writes. The qms schema is not exposed over PostgREST, so the
-- admin UI's edge functions (quality-read / manage-quality) call these via rpc.
-- Writes emit qms.performance_events; the quality_event_log auto-log triggers
-- (20260623_qms_capa_complaints_schema.sql) record every change immutably.

-- ---------------------------------------------------------------------------
-- helper: emit a performance event for a vendor (no-op if no role qualification)
-- ---------------------------------------------------------------------------
create or replace function public.qms_emit_perf_event(
  p_vendor uuid, p_event qms.performance_event_type, p_severity qms.severity,
  p_ref text, p_desc text, p_recorded_by uuid)
returns void language plpgsql security definer set search_path = qms, public as $fn$
declare v_rq uuid;
begin
  if p_vendor is null then return; end if;
  select r.id into v_rq from qms.role_qualifications r
    where r.vendor_id = p_vendor
    order by (r.role_type_id = 'ac148fbe-2cce-4d7b-9d69-3fc2a01f7ee5') desc
    limit 1;
  if v_rq is null then return; end if;
  insert into qms.performance_events
    (role_qualification_id, vendor_id, event_type, severity, occurred_at, recorded_at, recorded_by, project_reference, description)
  values (v_rq, p_vendor, p_event, p_severity, now(), now(), p_recorded_by, p_ref, p_desc);
end $fn$;

-- ===========================================================================
-- WRITES
-- ===========================================================================
create or replace function public.qms_create_complaint(p_payload jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
declare v_id uuid; v_num text; v_auth uuid; v_vendor uuid := (p_payload->>'vendor_id')::uuid;
begin
  v_num := public.qms_next_quality_number('CMP');
  v_auth := qms_resolve_actor(p_actor);
  insert into qms.quality_complaints(
    complaint_number, source, received_via, complainant_name, complainant_email,
    customer_id, order_id, step_id, vendor_id, role_qualification_id, category, severity,
    summary, detail, created_by)
  values(
    v_num, coalesce(p_payload->>'source','client'), p_payload->>'received_via',
    p_payload->>'complainant_name', p_payload->>'complainant_email',
    (p_payload->>'customer_id')::uuid, (p_payload->>'order_id')::uuid,
    (p_payload->>'step_id')::uuid, v_vendor, (p_payload->>'role_qualification_id')::uuid,
    p_payload->>'category', coalesce((p_payload->>'severity')::qms.severity,'medium'),
    p_payload->>'summary', p_payload->>'detail', p_actor)
  returning id into v_id;
  if v_vendor is not null then
    perform public.qms_emit_perf_event(v_vendor, 'client_complaint',
      coalesce((p_payload->>'severity')::qms.severity,'medium'),
      coalesce((select order_number from public.orders where id=(p_payload->>'order_id')::uuid), v_num),
      'Client complaint '||v_num||': '||left(coalesce(p_payload->>'summary',''),120), v_auth);
  end if;
  return (select to_jsonb(c) from qms.quality_complaints c where c.id=v_id);
end $fn$;

create or replace function public.qms_triage_complaint(p_id uuid, p_status text, p_note text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
begin
  update qms.quality_complaints
    set status = p_status, triaged_by = p_actor, triaged_at = now(),
        resolution_note = coalesce(p_note, resolution_note),
        resolved_by = case when p_status in ('resolved','closed_no_action') then p_actor else resolved_by end,
        resolved_at = case when p_status in ('resolved','closed_no_action') then now() else resolved_at end,
        updated_at = now()
    where id = p_id;
  return (select to_jsonb(c) from qms.quality_complaints c where c.id=p_id);
end $fn$;

create or replace function public.qms_create_nonconformity(p_payload jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
declare
  v_id uuid; v_num text; v_auth uuid;
  v_vendor uuid := (p_payload->>'vendor_id')::uuid;
  v_sev qms.severity := coalesce((p_payload->>'severity')::qms.severity,'medium');
  v_complaint uuid := (p_payload->>'source_complaint_id')::uuid;
begin
  v_num := public.qms_next_quality_number('NC');
  v_auth := qms_resolve_actor(p_actor);
  insert into qms.nonconformities(
    nc_number, title, description, source, source_complaint_id, vendor_id,
    role_qualification_id, order_id, step_id, severity, discovered_by, created_by)
  values(
    v_num, p_payload->>'title', p_payload->>'description',
    coalesce(p_payload->>'source','other'), v_complaint, v_vendor,
    (p_payload->>'role_qualification_id')::uuid, (p_payload->>'order_id')::uuid,
    (p_payload->>'step_id')::uuid, v_sev, p_actor, p_actor)
  returning id into v_id;
  if v_complaint is not null then
    update qms.quality_complaints set status='linked_nc', nonconformity_id=v_id, updated_at=now()
      where id=v_complaint;
  end if;
  if v_vendor is not null then
    perform public.qms_emit_perf_event(v_vendor, 'quality_issue', v_sev,
      coalesce((select order_number from public.orders where id=(p_payload->>'order_id')::uuid), v_num),
      'Nonconformity '||v_num||': '||left(coalesce(p_payload->>'title',''),120), v_auth);
  end if;
  return (select to_jsonb(n) from qms.nonconformities n where n.id=v_id);
end $fn$;

create or replace function public.qms_set_nc_root_cause(p_id uuid, p_root_cause text, p_method text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
begin
  update qms.nonconformities
    set root_cause = p_root_cause, root_cause_method = p_method,
        root_cause_at = now(), root_cause_by = p_actor,
        status = case when status = 'open' then 'investigating' else status end,
        updated_at = now()
    where id = p_id;
  return (select to_jsonb(n) from qms.nonconformities n where n.id=p_id);
end $fn$;

create or replace function public.qms_update_nc_status(p_id uuid, p_status text, p_summary text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
begin
  update qms.nonconformities
    set status = p_status,
        closure_summary = case when p_status='closed' then coalesce(p_summary, closure_summary) else closure_summary end,
        closed_at = case when p_status='closed' then now() else closed_at end,
        closed_by = case when p_status='closed' then p_actor else closed_by end,
        updated_at = now()
    where id = p_id;
  return (select to_jsonb(n) from qms.nonconformities n where n.id=p_id);
end $fn$;

create or replace function public.qms_create_capa(p_payload jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
declare
  v_id uuid; v_num text; v_auth uuid;
  v_nc uuid := (p_payload->>'nonconformity_id')::uuid;
  v_vendor uuid;
begin
  v_num := public.qms_next_quality_number('CAPA');
  v_auth := qms_resolve_actor(p_actor);
  insert into qms.capa_actions(
    capa_number, nonconformity_id, action_type, description, owner_staff_id,
    due_date, effectiveness_due, created_by)
  values(
    v_num, v_nc, p_payload->>'action_type', p_payload->>'description',
    (p_payload->>'owner_staff_id')::uuid, (p_payload->>'due_date')::date,
    (p_payload->>'effectiveness_due')::date, p_actor)
  returning id into v_id;
  update qms.nonconformities
    set status = case when status in ('open','investigating','capa_planned') then 'capa_in_progress' else status end,
        updated_at = now()
    where id = v_nc;
  select vendor_id into v_vendor from qms.nonconformities where id = v_nc;
  if v_vendor is not null then
    perform public.qms_emit_perf_event(v_vendor, 'capa_action_opened', 'low',
      v_num, 'CAPA opened ('||coalesce(p_payload->>'action_type','')||') for '||
        coalesce((select nc_number from qms.nonconformities where id=v_nc),''), v_auth);
  end if;
  return (select to_jsonb(ca) from qms.capa_actions ca where ca.id=v_id);
end $fn$;

create or replace function public.qms_update_capa(p_payload jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
declare
  v_id uuid := (p_payload->>'id')::uuid;
  v_status text := p_payload->>'status';
  v_auth uuid; v_nc uuid; v_vendor uuid;
begin
  v_auth := qms_resolve_actor(p_actor);
  update qms.capa_actions
    set status = coalesce(v_status, status),
        completed_at = case when v_status in ('done','verified') and completed_at is null then now() else completed_at end,
        completed_by = case when v_status in ('done','verified') and completed_by is null then p_actor else completed_by end,
        effectiveness_result = coalesce((p_payload->>'effectiveness_result'), effectiveness_result),
        effectiveness_note = coalesce((p_payload->>'effectiveness_note'), effectiveness_note),
        effectiveness_checked_at = case when (p_payload->>'effectiveness_result') is not null then now() else effectiveness_checked_at end,
        effectiveness_checked_by = case when (p_payload->>'effectiveness_result') is not null then p_actor else effectiveness_checked_by end,
        updated_at = now()
    where id = v_id
    returning nonconformity_id into v_nc;
  if v_status = 'verified' then
    select vendor_id into v_vendor from qms.nonconformities where id = v_nc;
    if v_vendor is not null then
      perform public.qms_emit_perf_event(v_vendor, 'capa_action_closed', 'low',
        (select capa_number from qms.capa_actions where id=v_id),
        'CAPA verified for '||coalesce((select nc_number from qms.nonconformities where id=v_nc),''), v_auth);
    end if;
  end if;
  return (select to_jsonb(ca) from qms.capa_actions ca where ca.id=v_id);
end $fn$;

-- ===========================================================================
-- READS
-- ===========================================================================
create or replace function public.qms_quality_dashboard()
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
declare v_metrics jsonb; v_register jsonb; v_watch jsonb;
begin
  select jsonb_build_object(
    'open_complaints', (select count(*) from qms.quality_complaints where status in ('new','triaged')),
    'open_nonconformities', (select count(*) from qms.nonconformities where status <> 'closed'),
    'capa_due_14d', (select count(*) from qms.capa_actions where status in ('open','in_progress') and due_date is not null and due_date <= current_date + 14),
    'capa_overdue', (select count(*) from qms.capa_actions where status in ('open','in_progress') and due_date is not null and due_date < current_date),
    'linguists_under_review', (select count(*) from public.qms_requalification_reviews where status = 'open')
  ) into v_metrics;

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_register from (
    select n.id, n.nc_number, n.title, n.severity, n.status, n.discovered_at,
           v.full_name as vendor_name,
           (select order_number from public.orders o where o.id = n.order_id) as order_number,
           (select min(c.due_date) from qms.capa_actions c where c.nonconformity_id = n.id and c.status in ('open','in_progress')) as next_due,
           (select count(*) from qms.capa_actions c where c.nonconformity_id = n.id) as capa_count
    from qms.nonconformities n
    left join public.vendors v on v.id = n.vendor_id
    where n.status <> 'closed'
    order by n.discovered_at desc
    limit 100
  ) r;

  select coalesce(jsonb_agg(w), '[]'::jsonb) into v_watch from (
    select s.vendor_id, v.full_name as vendor_name,
           sum(s.projects_completed) as projects_completed,
           sum(s.revision_findings) as revision_findings,
           sum(s.client_complaints) as client_complaints,
           sum(s.late_deliveries) as late_deliveries,
           sum(s.high_severity_events) as high_severity_events,
           case when sum(s.projects_completed) > 0
                then round(100.0 * (sum(s.projects_completed) - least(sum(s.late_deliveries), sum(s.projects_completed))) / sum(s.projects_completed))
                else null end as on_time_pct,
           exists(select 1 from public.qms_requalification_reviews q where q.vendor_id = s.vendor_id and q.status = 'open') as under_review
    from qms.linguist_performance_snapshot s
    join public.vendors v on v.id = s.vendor_id
    group by s.vendor_id, v.full_name
    having sum(s.revision_findings) > 0 or sum(s.client_complaints) > 0
        or sum(s.late_deliveries) > 0 or sum(s.high_severity_events) > 0
    order by sum(s.high_severity_events) desc, sum(s.late_deliveries) desc
    limit 50
  ) w;

  return jsonb_build_object('metrics', v_metrics, 'register', v_register, 'linguists_to_watch', v_watch);
end $fn$;

create or replace function public.qms_list_complaints(p_status text default null)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
begin
  return (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select c.id, c.complaint_number, c.source, c.category, c.severity, c.status,
           c.summary, c.received_at, c.vendor_id, c.nonconformity_id,
           v.full_name as vendor_name
    from qms.quality_complaints c
    left join public.vendors v on v.id = c.vendor_id
    where p_status is null or c.status = p_status
    order by c.received_at desc
    limit 200
  ) x);
end $fn$;

create or replace function public.qms_list_nonconformities(p_status text default null)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
begin
  return (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select n.id, n.nc_number, n.title, n.source, n.severity, n.status, n.discovered_at,
           n.vendor_id, v.full_name as vendor_name,
           (select count(*) from qms.capa_actions c where c.nonconformity_id = n.id) as capa_count
    from qms.nonconformities n
    left join public.vendors v on v.id = n.vendor_id
    where p_status is null or n.status = p_status
    order by n.discovered_at desc
    limit 200
  ) x);
end $fn$;

create or replace function public.qms_get_nonconformity(p_id uuid)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
begin
  return jsonb_build_object(
    'nonconformity', (select to_jsonb(n) ||
        jsonb_build_object(
          'vendor_name', (select full_name from public.vendors where id = n.vendor_id),
          'order_number', (select order_number from public.orders where id = n.order_id))
      from qms.nonconformities n where n.id = p_id),
    'complaint', (select to_jsonb(c) from qms.quality_complaints c
        where c.id = (select source_complaint_id from qms.nonconformities where id = p_id)),
    'capa_actions', (select coalesce(jsonb_agg(to_jsonb(ca) ||
          jsonb_build_object('owner_name', (select full_name from public.staff_users su where su.id = ca.owner_staff_id))
          order by ca.created_at), '[]'::jsonb)
        from qms.capa_actions ca where ca.nonconformity_id = p_id),
    'timeline', (select coalesce(jsonb_agg(to_jsonb(el) order by el.performed_at), '[]'::jsonb)
        from qms.quality_event_log el
        where (el.entity_type = 'nonconformity' and el.entity_id = p_id)
           or (el.entity_type = 'capa_action' and el.entity_id in (select id from qms.capa_actions where nonconformity_id = p_id)))
  );
end $fn$;

create or replace function public.qms_linguist_performance(p_vendor_id uuid)
returns jsonb language plpgsql security definer set search_path = qms, public as $fn$
begin
  return jsonb_build_object(
    'vendor', (select jsonb_build_object('id', v.id, 'full_name', v.full_name, 'email', v.email, 'status', v.status)
        from public.vendors v where v.id = p_vendor_id),
    'snapshot', (select jsonb_build_object(
          'projects_completed', coalesce(sum(projects_completed),0),
          'revision_findings', coalesce(sum(revision_findings),0),
          'client_complaints', coalesce(sum(client_complaints),0),
          'client_compliments', coalesce(sum(client_compliments),0),
          'late_deliveries', coalesce(sum(late_deliveries),0),
          'quality_issues', coalesce(sum(quality_issues),0),
          'high_severity_events', coalesce(sum(high_severity_events),0),
          'last_event_at', max(last_event_at),
          'on_time_pct', case when coalesce(sum(projects_completed),0) > 0
              then round(100.0 * (sum(projects_completed) - least(sum(late_deliveries), sum(projects_completed))) / sum(projects_completed))
              else null end)
        from qms.linguist_performance_snapshot where vendor_id = p_vendor_id),
    'recent_events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc), '[]'::jsonb)
        from (select * from qms.performance_events where vendor_id = p_vendor_id order by occurred_at desc limit 25) e),
    'nonconformities', (select coalesce(jsonb_agg(to_jsonb(n) order by n.discovered_at desc), '[]'::jsonb)
        from qms.nonconformities n where n.vendor_id = p_vendor_id),
    'capa_actions', (select coalesce(jsonb_agg(to_jsonb(ca) order by ca.created_at desc), '[]'::jsonb)
        from qms.capa_actions ca where ca.nonconformity_id in (select id from qms.nonconformities where vendor_id = p_vendor_id)),
    'qualifications', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', rq.id, 'status', rq.status, 'role_type_id', rq.role_type_id, 're_qualification_due', rq.re_qualification_due)), '[]'::jsonb)
        from qms.role_qualifications rq where rq.vendor_id = p_vendor_id),
    'open_review', (select to_jsonb(q) from public.qms_requalification_reviews q
        where q.vendor_id = p_vendor_id and q.status = 'open' limit 1)
  );
end $fn$;

-- ---------------------------------------------------------------------------
-- grants: service_role only (edge fns); deny direct authenticated/anon/public
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  for f in
    select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'qms_emit_perf_event','qms_create_complaint','qms_triage_complaint',
      'qms_create_nonconformity','qms_set_nc_root_cause','qms_update_nc_status',
      'qms_create_capa','qms_update_capa','qms_quality_dashboard',
      'qms_list_complaints','qms_list_nonconformities','qms_get_nonconformity',
      'qms_linguist_performance')
  loop
    execute 'revoke execute on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
end $$;
