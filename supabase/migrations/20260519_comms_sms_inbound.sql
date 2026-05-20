-- ============================================================================
-- Inbound SMS support — extends comms.sms_messages to capture incoming
-- messages alongside outbound sends, plus RPCs for the unified inbox UI.
-- ============================================================================

alter table comms.sms_messages
  add column if not exists direction text not null default 'outbound'
    check (direction in ('inbound','outbound')),
  add column if not exists received_at timestamptz,
  add column if not exists rc_conversation_id text,
  add column if not exists from_name text,
  add column if not exists to_name text,
  add column if not exists read_at timestamptz,
  add column if not exists from_number_e164 text generated always as (comms.normalize_phone(from_number)) stored;

create index if not exists sms_messages_conversation_idx
  on comms.sms_messages (rc_conversation_id) where rc_conversation_id is not null;
create index if not exists sms_messages_direction_received_idx
  on comms.sms_messages (direction, received_at desc) where direction = 'inbound';
create index if not exists sms_messages_from_e164_idx
  on comms.sms_messages (from_number_e164);
create index if not exists sms_messages_unread_idx
  on comms.sms_messages (received_at desc) where direction = 'inbound' and read_at is null;

create or replace function public.comms_upsert_inbound_sms(
  p_rc_message_id text,
  p_rc_conversation_id text,
  p_from_number text,
  p_from_name text,
  p_to_number text,
  p_to_name text,
  p_body text,
  p_received_at timestamptz,
  p_status text
) returns uuid
  language plpgsql security definer set search_path = comms, public
as $$
declare
  v_id uuid;
  v_customer_id uuid;
  v_source text;
  v_source_row uuid;
begin
  select customer_id, source, source_row_id into v_customer_id, v_source, v_source_row
    from comms.find_customer_by_phone(p_from_number);

  if p_rc_message_id is not null then
    select id into v_id from comms.sms_messages where rc_message_id = p_rc_message_id limit 1;
    if v_id is not null then
      update comms.sms_messages
        set status = coalesce(p_status, status),
            customer_id = coalesce(customer_id, v_customer_id),
            received_at = coalesce(p_received_at, received_at),
            rc_conversation_id = coalesce(rc_conversation_id, p_rc_conversation_id)
        where id = v_id;
      return v_id;
    end if;
  end if;

  insert into comms.sms_messages (
    direction, to_number, to_name, from_number, from_name, body, status,
    rc_message_id, rc_conversation_id, received_at, customer_id
  ) values (
    'inbound', p_to_number, p_to_name, p_from_number, p_from_name, p_body, coalesce(p_status, 'received'),
    p_rc_message_id, p_rc_conversation_id, p_received_at, v_customer_id
  ) returning id into v_id;
  return v_id;
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
        case when direction = 'inbound' then from_number_e164 else to_number_e164 end,
        case when direction = 'inbound' then from_number else to_number end
      ) as peer,
      case when direction = 'inbound' then from_name else to_name end as peer_name_raw,
      direction, body, sent_at, received_at, read_at, customer_id, id, created_at
    from comms.sms_messages
  ),
  msg_ts as (
    select peer, peer_name_raw, direction, body, customer_id, read_at,
      coalesce(received_at, sent_at, created_at) as ts
    from all_msgs
  ),
  threads as (
    select peer,
      max(ts) as last_message_at,
      sum(case when direction = 'inbound' and read_at is null then 1 else 0 end) as unread_count,
      count(*) as total_messages,
      (array_agg(customer_id order by ts desc nulls last) filter (where customer_id is not null))[1] as customer_id,
      (array_agg(peer_name_raw order by ts desc nulls last) filter (where peer_name_raw is not null))[1] as peer_name
    from msg_ts
    where peer is not null
    group by peer
  ),
  enriched as (
    select t.*, c.company_name, c.email,
      (select body from msg_ts m where m.peer = t.peer order by ts desc limit 1) as last_body,
      (select direction from msg_ts m where m.peer = t.peer order by ts desc limit 1) as last_direction
    from threads t
    left join public.customers c on c.id = t.customer_id
    where (p_unread_only = false or t.unread_count > 0)
      and (
        p_search is null
        or t.peer like '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'
        or t.peer_name ilike '%' || p_search || '%'
        or c.company_name ilike '%' || p_search || '%'
        or c.email ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select *, count(*) over () as total_count from enriched
  )
  select peer, peer_name, customer_id, company_name, email,
    last_message_at, last_direction, last_body, unread_count, total_messages, total_count
  from counted
  order by last_message_at desc nulls last
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
declare
  v_peer text;
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  v_peer := comms.normalize_phone(p_peer_phone);
  if v_peer is null then return; end if;

  return query
  select sm.id, sm.direction, sm.from_number, sm.to_number, sm.from_name, sm.to_name,
    sm.body, sm.status, sm.sent_at, sm.received_at, sm.read_at, sm.template_key,
    sm.staff_user_id, su.full_name, sm.customer_id, sm.created_at
  from comms.sms_messages sm
  left join public.staff_users su on su.id = sm.staff_user_id
  where (
      (sm.direction = 'inbound' and sm.from_number_e164 = v_peer)
      or (sm.direction = 'outbound' and sm.to_number_e164 = v_peer)
    )
  order by coalesce(sm.received_at, sm.sent_at, sm.created_at) asc;
end;
$$;

create or replace function public.comms_mark_sms_thread_read(p_peer_phone text)
  returns integer
  language plpgsql security definer set search_path = comms, public
as $$
declare v_peer text; v_count integer;
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  v_peer := comms.normalize_phone(p_peer_phone);
  if v_peer is null then return 0; end if;
  update comms.sms_messages set read_at = now()
    where direction = 'inbound' and from_number_e164 = v_peer and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
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
    su.full_name, sm.created_at
  from comms.sms_messages sm
  left join public.staff_users su on su.id = sm.staff_user_id
  where sm.customer_id = p_customer_id
  order by coalesce(sm.received_at, sm.sent_at, sm.created_at) desc;
end;
$$;

revoke all on function public.comms_upsert_inbound_sms(text,text,text,text,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.comms_upsert_inbound_sms(text,text,text,text,text,text,text,timestamptz,text) to service_role;
grant execute on function public.comms_list_sms_threads(integer,integer,text,boolean) to authenticated, service_role;
grant execute on function public.comms_get_sms_thread(text) to authenticated, service_role;
grant execute on function public.comms_mark_sms_thread_read(text) to authenticated, service_role;
grant execute on function public.comms_list_customer_sms(uuid) to authenticated, service_role;
