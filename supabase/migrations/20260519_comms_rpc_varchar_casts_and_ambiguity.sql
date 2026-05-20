-- ============================================================================
-- Fix two silent failures in the comms_* RPCs introduced in the prior PRs:
--
-- 1. `staff_users.full_name`, `customers.company_name`, and `customers.email`
--    are varchar(255), but the RPC returns-tables declared `text`. PostgreSQL
--    raises a *runtime* mismatch ("structure of query does not match function
--    result type") and the function returns zero rows — making the /admin/calls
--    page (and several other surfaces) appear empty even though the data is
--    there. Cast every cross-schema column to ::text.
--
-- 2. comms_list_sms_threads declared OUT columns named `customer_id`,
--    `direction`, etc., which plpgsql treats as local variables that shadow
--    the column references inside its CTEs ("column reference 'customer_id'
--    is ambiguous"). Qualify every column with its CTE alias.
-- ============================================================================

create or replace function public.comms_list_call_logs(
  p_limit integer default 50,
  p_offset integer default 0,
  p_direction text default null,
  p_customer_id uuid default null,
  p_staff_user_id uuid default null,
  p_search text default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null
) returns table(
  id uuid, rc_session_id text, direction text,
  from_number text, from_number_e164 text, from_name text,
  to_number text, to_number_e164 text, to_name text,
  staff_user_id uuid, staff_full_name text,
  customer_id uuid, customer_company_name text, customer_email text,
  started_at timestamptz, duration_sec integer, result text,
  has_recording boolean, note_count bigint, total_count bigint
) language plpgsql stable security definer set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  with q as (
    select cl.*,
      su.full_name::text as staff_full_name,
      c.company_name::text as customer_company_name,
      c.email::text as customer_email,
      (select count(*) from comms.call_notes cn where cn.call_log_id = cl.id and cn.deleted_at is null) as note_count
    from comms.call_logs cl
    left join public.staff_users su on su.id = cl.staff_user_id
    left join public.customers c on c.id = cl.customer_id
    where (p_direction is null or cl.direction = p_direction)
      and (p_customer_id is null or cl.customer_id = p_customer_id)
      and (p_staff_user_id is null or cl.staff_user_id = p_staff_user_id)
      and (p_from_date is null or cl.started_at >= p_from_date)
      and (p_to_date is null or cl.started_at <= p_to_date)
      and (
        p_search is null
        or cl.from_number_e164 like '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'
        or cl.to_number_e164 like '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'
        or cl.from_name ilike '%' || p_search || '%'
        or cl.to_name ilike '%' || p_search || '%'
        or c.company_name ilike '%' || p_search || '%'
        or c.email ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select *, count(*) over () as total_count from q
  )
  select c2.id, c2.rc_session_id, c2.direction, c2.from_number, c2.from_number_e164, c2.from_name,
    c2.to_number, c2.to_number_e164, c2.to_name, c2.staff_user_id, c2.staff_full_name,
    c2.customer_id, c2.customer_company_name, c2.customer_email,
    c2.started_at, c2.duration_sec, c2.result, c2.has_recording, c2.note_count, c2.total_count
  from counted c2
  order by c2.started_at desc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.comms_get_call_detail(p_call_id uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = comms, public
as $$
declare v_result jsonb;
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'call', to_jsonb(cl) ||
      jsonb_build_object(
        'staff_full_name', su.full_name::text,
        'customer_company_name', c.company_name::text,
        'customer_email', c.email::text
      ),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cn.id, 'body', cn.body,
        'staff_user_id', cn.staff_user_id,
        'staff_full_name', su2.full_name::text,
        'created_at', cn.created_at, 'updated_at', cn.updated_at
      ) order by cn.created_at desc)
      from comms.call_notes cn
      left join public.staff_users su2 on su2.id = cn.staff_user_id
      where cn.call_log_id = cl.id and cn.deleted_at is null
    ), '[]'::jsonb),
    'recent_sms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sm.id, 'to_number', sm.to_number, 'body', sm.body,
        'status', sm.status, 'sent_at', sm.sent_at, 'template_key', sm.template_key
      ) order by sm.created_at desc)
      from comms.sms_messages sm
      where sm.call_log_id = cl.id
        or (cl.customer_id is not null and sm.customer_id = cl.customer_id)
      limit 10
    ), '[]'::jsonb)
  ) into v_result
  from comms.call_logs cl
  left join public.staff_users su on su.id = cl.staff_user_id
  left join public.customers c on c.id = cl.customer_id
  where cl.id = p_call_id;
  return v_result;
end;
$$;

create or replace function public.comms_list_sms_threads(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_unread_only boolean default false
) returns table(
  peer_phone_e164 text,
  peer_name text,
  customer_id uuid,
  customer_company_name text,
  customer_email text,
  last_message_at timestamptz,
  last_direction text,
  last_body text,
  unread_count bigint,
  total_messages bigint,
  total_count bigint
) language plpgsql stable security definer set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  with all_msgs as (
    select
      coalesce(
        case when sm.direction = 'inbound' then sm.from_number_e164 else sm.to_number_e164 end,
        case when sm.direction = 'inbound' then sm.from_number else sm.to_number end
      ) as peer,
      (case when sm.direction = 'inbound' then sm.from_name else sm.to_name end)::text as peer_name_raw,
      sm.direction as m_direction,
      sm.body as m_body,
      sm.sent_at,
      sm.received_at,
      sm.read_at,
      sm.customer_id as m_customer_id,
      sm.id as m_id,
      sm.created_at
    from comms.sms_messages sm
  ),
  msg_ts as (
    select am.peer, am.peer_name_raw, am.m_direction, am.m_body, am.m_customer_id, am.read_at,
      coalesce(am.received_at, am.sent_at, am.created_at) as ts
    from all_msgs am
  ),
  threads as (
    select mt.peer,
      max(mt.ts) as last_message_at,
      sum(case when mt.m_direction = 'inbound' and mt.read_at is null then 1 else 0 end)::bigint as unread_count,
      count(*)::bigint as total_messages,
      (array_agg(mt.m_customer_id order by mt.ts desc nulls last) filter (where mt.m_customer_id is not null))[1] as t_customer_id,
      (array_agg(mt.peer_name_raw order by mt.ts desc nulls last) filter (where mt.peer_name_raw is not null))[1] as t_peer_name
    from msg_ts mt
    where mt.peer is not null
    group by mt.peer
  ),
  enriched as (
    select t.peer, t.last_message_at, t.unread_count, t.total_messages,
      t.t_customer_id,
      t.t_peer_name,
      c.company_name::text as company_name,
      c.email::text as email,
      (select m2.m_body from msg_ts m2 where m2.peer = t.peer order by m2.ts desc limit 1) as last_body,
      (select m2.m_direction from msg_ts m2 where m2.peer = t.peer order by m2.ts desc limit 1) as last_direction
    from threads t
    left join public.customers c on c.id = t.t_customer_id
    where (p_unread_only = false or t.unread_count > 0)
      and (
        p_search is null
        or t.peer like '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'
        or t.t_peer_name ilike '%' || p_search || '%'
        or c.company_name ilike '%' || p_search || '%'
        or c.email ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select e.*, count(*) over () as total_count from enriched e
  )
  select c2.peer, c2.t_peer_name, c2.t_customer_id, c2.company_name, c2.email,
    c2.last_message_at, c2.last_direction, c2.last_body, c2.unread_count, c2.total_messages, c2.total_count
  from counted c2
  order by c2.last_message_at desc nulls last
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.comms_get_sms_thread(p_peer_phone text)
  returns table(
    id uuid, direction text, from_number text, to_number text,
    from_name text, to_name text, body text, status text,
    sent_at timestamptz, received_at timestamptz, read_at timestamptz,
    template_key text, staff_user_id uuid, staff_full_name text,
    customer_id uuid, created_at timestamptz
  ) language plpgsql stable security definer set search_path = comms, public
as $$
declare v_peer text;
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  v_peer := comms.normalize_phone(p_peer_phone);
  if v_peer is null then return; end if;

  return query
  select sm.id, sm.direction, sm.from_number, sm.to_number, sm.from_name, sm.to_name,
    sm.body, sm.status, sm.sent_at, sm.received_at, sm.read_at, sm.template_key,
    sm.staff_user_id, su.full_name::text, sm.customer_id, sm.created_at
  from comms.sms_messages sm
  left join public.staff_users su on su.id = sm.staff_user_id
  where (
      (sm.direction = 'inbound' and sm.from_number_e164 = v_peer)
      or (sm.direction = 'outbound' and sm.to_number_e164 = v_peer)
    )
  order by coalesce(sm.received_at, sm.sent_at, sm.created_at) asc;
end;
$$;

create or replace function public.comms_list_customer_sms(p_customer_id uuid)
  returns table(
    id uuid, direction text, from_number text, to_number text, body text,
    status text, sent_at timestamptz, received_at timestamptz, read_at timestamptz,
    template_key text, staff_full_name text, created_at timestamptz
  ) language plpgsql stable security definer set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  select sm.id, sm.direction, sm.from_number, sm.to_number, sm.body, sm.status,
    sm.sent_at, sm.received_at, sm.read_at, sm.template_key,
    su.full_name::text, sm.created_at
  from comms.sms_messages sm
  left join public.staff_users su on su.id = sm.staff_user_id
  where sm.customer_id = p_customer_id
  order by coalesce(sm.received_at, sm.sent_at, sm.created_at) desc;
end;
$$;
