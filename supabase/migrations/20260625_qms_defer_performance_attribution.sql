-- Defer the linguist performance impact: never ding on complaint/NC creation.
-- The perf event is emitted only at NC closure, and only when staff attribute
-- fault to the linguist. Linking a linguist becomes pure traceability until then.

ALTER TABLE qms.nonconformities
  ADD COLUMN IF NOT EXISTS attributed_to_vendor boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN qms.nonconformities.attributed_to_vendor IS
  'Set at closure: whether the resolved NC is attributed to the linked linguist (drives the performance-scorecard event). Never inferred from mere linkage.';

-- create_complaint: store the vendor link, but DO NOT emit a perf event on create.
CREATE OR REPLACE FUNCTION public.qms_create_complaint(p_payload jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'qms','public'
AS $function$
declare v_id uuid; v_num text; v_vendor uuid := (p_payload->>'vendor_id')::uuid;
begin
  v_num := public.qms_next_quality_number('CMP');
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
  -- Performance impact is DEFERRED to resolution; no perf event on create.
  return (select to_jsonb(c) from qms.quality_complaints c where c.id=v_id);
end $function$;

-- create_nonconformity: store the vendor link, but DO NOT emit a perf event on create.
CREATE OR REPLACE FUNCTION public.qms_create_nonconformity(p_payload jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'qms','public'
AS $function$
declare v_id uuid; v_num text;
  v_vendor uuid := (p_payload->>'vendor_id')::uuid;
  v_sev qms.severity := coalesce((p_payload->>'severity')::qms.severity,'medium');
  v_complaint uuid := (p_payload->>'source_complaint_id')::uuid;
begin
  v_num := public.qms_next_quality_number('NC');
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
  -- Performance impact is DEFERRED to closure (see qms_update_nc_status); no perf event on create.
  return (select to_jsonb(n) from qms.nonconformities n where n.id=v_id);
end $function$;

-- update_nc_status: gains p_attributed_to_vendor; emits the perf event only at
-- closure when attributed to the linguist (drop the old 4-arg signature first).
DROP FUNCTION IF EXISTS public.qms_update_nc_status(uuid, text, text, uuid);
CREATE OR REPLACE FUNCTION public.qms_update_nc_status(
  p_id uuid, p_status text, p_summary text, p_actor uuid, p_attributed_to_vendor boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'qms','public'
AS $function$
declare v_prev text; v_vendor uuid; v_sev qms.severity; v_num text; v_order text; v_auth uuid;
begin
  select status, vendor_id, severity, nc_number into v_prev, v_vendor, v_sev, v_num
    from qms.nonconformities where id=p_id;
  update qms.nonconformities
    set status = p_status,
        closure_summary = case when p_status='closed' then coalesce(p_summary, closure_summary) else closure_summary end,
        closed_at = case when p_status='closed' then now() else closed_at end,
        closed_by = case when p_status='closed' then p_actor else closed_by end,
        attributed_to_vendor = case when p_status='closed' then p_attributed_to_vendor else attributed_to_vendor end,
        updated_at = now()
    where id = p_id;
  -- Deferred performance impact: only on first close, only if attributed, only if a linguist is linked.
  if p_status='closed' and coalesce(v_prev,'') <> 'closed' and p_attributed_to_vendor and v_vendor is not null then
    v_auth := qms_resolve_actor(p_actor);
    select o.order_number into v_order from public.orders o where o.id =
      (select order_id from qms.nonconformities where id=p_id);
    perform public.qms_emit_perf_event(v_vendor, 'quality_issue', coalesce(v_sev,'medium'),
      coalesce(v_order, v_num), 'Nonconformity '||v_num||' closed — attributed to linguist', v_auth);
  end if;
  return (select to_jsonb(n) from qms.nonconformities n where n.id=p_id);
end $function$;

-- link_vendor: attach (or change) the linked linguist on an existing complaint/NC. No perf event.
CREATE OR REPLACE FUNCTION public.qms_link_vendor(p_kind text, p_id uuid, p_vendor_id uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'qms','public'
AS $function$
begin
  perform qms_resolve_actor(p_actor);
  if p_kind = 'complaint' then
    update qms.quality_complaints set vendor_id = p_vendor_id, updated_at=now() where id = p_id;
    return (select to_jsonb(c) from qms.quality_complaints c where c.id=p_id);
  elsif p_kind = 'nonconformity' then
    update qms.nonconformities set vendor_id = p_vendor_id, updated_at=now() where id = p_id;
    return (select to_jsonb(n) from qms.nonconformities n where n.id=p_id);
  else
    raise exception 'qms_link_vendor: invalid kind %', p_kind;
  end if;
end $function$;

GRANT EXECUTE ON FUNCTION public.qms_update_nc_status(uuid,text,text,uuid,boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qms_link_vendor(text,uuid,uuid,uuid) TO anon, authenticated, service_role;
