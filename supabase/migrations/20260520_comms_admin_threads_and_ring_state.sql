-- ============================================================================
-- Part A: comms_list_admin_threads — drop-in replacement RPC for
-- get_admin_conversation_summaries that includes SMS-only customer threads.
--
-- Part B: ring-state webhook path.
--   - unique partial index on comms.call_logs (rc_telephony_session_id)
--   - comms_upsert_call_ring_state RPC (called from rc-webhook on telephony
--     session events)
--   - comms_upsert_call_log updated to match by rc_telephony_session_id
--     first, so the row the webhook created gets the final rc_session_id
--     stamped on it instead of staying as 'ts_<tsid>'.
-- ============================================================================

create or replace function public.comms_list_admin_threads(
  p_limit integer default 30,
  p_offset integer default 0
) returns table(
  customer_id uuid,
  customer_name text,
  customer_email text,
  last_message_text text,
  last_message_at timestamptz,
  last_sender_type text,
  last_channel text,
  unread_count bigint,
  unread_sms bigint,
  conversation_id uuid,
  order_id uuid,
  order_number text,
  quote_id uuid,
  quote_number text,
  has_sms boolean
)
  language plpgsql stable security definer set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  with per_customer_last as (
    select
      um.customer_id,
      (array_agg(um.body order by um.occurred_at desc))[1] as last_body,
      max(um.occurred_at) as last_at,
      (array_agg(case
        when um.direction = 'inbound' then 'customer'
        when um.direction = 'outbound' then 'staff'
        else um.direction end order by um.occurred_at desc))[1] as last_sender,
      (array_agg(um.channel order by um.occurred_at desc))[1] as last_channel,
      sum(case when um.direction = 'inbound' and um.channel <> 'sms' and um.read_at is null then 1 else 0 end)::bigint as msg_unread,
      sum(case when um.direction = 'inbound' and um.channel = 'sms' and um.read_at is null then 1 else 0 end)::bigint as sms_unread,
      bool_or(um.channel = 'sms') as has_sms_flag
    from public.v_unified_messages um
    where um.customer_id is not null
    group by um.customer_id
  ),
  per_customer_last_cm as (
    select distinct on (cm_customer)
      cm_customer,
      cm.conversation_id,
      cm.order_id,
      cm.quote_id,
      cm.created_at
    from (
      select
        coalesce(cm.sender_customer_id, q.customer_id, o.customer_id, cc.customer_id) as cm_customer,
        cm.*
      from public.conversation_messages cm
      left join public.quotes q on q.id = cm.quote_id
      left join public.orders o on o.id = cm.order_id
      left join public.customer_conversations cc on cc.id = cm.conversation_id
    ) cm
    where cm_customer is not null
    order by cm_customer, created_at desc
  )
  select
    pcl.customer_id,
    coalesce(c.full_name, c.company_name, c.email)::text as customer_name,
    c.email::text as customer_email,
    pcl.last_body as last_message_text,
    pcl.last_at as last_message_at,
    pcl.last_sender::text as last_sender_type,
    pcl.last_channel::text as last_channel,
    pcl.msg_unread as unread_count,
    pcl.sms_unread as unread_sms,
    pclcm.conversation_id,
    pclcm.order_id,
    o.order_number::text as order_number,
    pclcm.quote_id,
    q.quote_number::text as quote_number,
    coalesce(pcl.has_sms_flag, false) as has_sms
  from per_customer_last pcl
  join public.customers c on c.id = pcl.customer_id
  left join per_customer_last_cm pclcm on pclcm.cm_customer = pcl.customer_id
  left join public.orders o on o.id = pclcm.order_id
  left join public.quotes q on q.id = pclcm.quote_id
  order by pcl.last_at desc nulls last
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.comms_list_admin_threads(integer, integer) to authenticated, service_role;

-- ── Ring-state ─────────────────────────────────────────────────────────────
create unique index if not exists call_logs_telephony_session_unique
  on comms.call_logs (rc_telephony_session_id)
  where rc_telephony_session_id is not null;

create or replace function public.comms_upsert_call_ring_state(
  p_telephony_session_id text,
  p_party_id text,
  p_direction text,
  p_from_number text,
  p_from_name text,
  p_to_number text,
  p_to_name text,
  p_extension_id text,
  p_status text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_raw jsonb
) returns uuid
  language plpgsql security definer set search_path = comms, public
as $$
declare
  v_id uuid;
  v_staff_id uuid;
  v_customer_id uuid;
  v_source text;
  v_source_row uuid;
  v_lookup_phone text;
begin
  select id into v_staff_id from public.staff_users
    where rc_extension_id = p_extension_id and p_extension_id is not null
    limit 1;

  v_lookup_phone := case
    when p_direction = 'Inbound' then p_from_number
    when p_direction = 'Outbound' then p_to_number
    else p_from_number
  end;
  select customer_id, source, source_row_id into v_customer_id, v_source, v_source_row
    from comms.find_customer_by_phone(v_lookup_phone);

  select id into v_id
    from comms.call_logs
    where rc_telephony_session_id = p_telephony_session_id
    limit 1;

  if v_id is null then
    insert into comms.call_logs (
      rc_session_id, rc_telephony_session_id, rc_party_id,
      direction, from_number, from_name, to_number, to_name,
      rc_extension_id, staff_user_id,
      customer_id, matched_source, matched_source_row_id,
      started_at, ended_at, result, raw
    ) values (
      'ts_' || p_telephony_session_id, p_telephony_session_id, p_party_id,
      coalesce(p_direction, 'Inbound'), p_from_number, p_from_name, p_to_number, p_to_name,
      p_extension_id, v_staff_id,
      v_customer_id, v_source, v_source_row,
      coalesce(p_started_at, now()), p_ended_at, p_status, p_raw
    )
    returning id into v_id;
  else
    update comms.call_logs cl
      set rc_party_id = coalesce(p_party_id, cl.rc_party_id),
          direction = coalesce(p_direction, cl.direction),
          from_number = coalesce(cl.from_number, p_from_number),
          from_name = coalesce(cl.from_name, p_from_name),
          to_number = coalesce(cl.to_number, p_to_number),
          to_name = coalesce(cl.to_name, p_to_name),
          rc_extension_id = coalesce(p_extension_id, cl.rc_extension_id),
          staff_user_id = coalesce(cl.staff_user_id, v_staff_id),
          customer_id = coalesce(cl.customer_id, v_customer_id),
          matched_source = coalesce(cl.matched_source, v_source),
          matched_source_row_id = coalesce(cl.matched_source_row_id, v_source_row),
          started_at = least(cl.started_at, coalesce(p_started_at, cl.started_at)),
          ended_at = coalesce(p_ended_at, cl.ended_at),
          result = coalesce(p_status, cl.result),
          raw = coalesce(p_raw, cl.raw)
      where cl.id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.comms_upsert_call_ring_state(text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.comms_upsert_call_ring_state(text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,jsonb) to service_role;

-- Update comms_upsert_call_log to merge by rc_telephony_session_id first so
-- the webhook-created row gets the final rc_session_id stamped on it.
create or replace function public.comms_upsert_call_log(
  p_rc_session_id text,
  p_rc_telephony_session_id text,
  p_rc_party_id text,
  p_direction text,
  p_from_number text,
  p_from_name text,
  p_to_number text,
  p_to_name text,
  p_rc_extension_id text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_sec integer,
  p_result text,
  p_recording_id text,
  p_recording_url text,
  p_raw jsonb
) returns uuid
  language plpgsql security definer set search_path = comms, public
as $$
declare
  v_id uuid;
  v_staff_id uuid;
  v_customer_id uuid;
  v_source text;
  v_source_row uuid;
  v_lookup_phone text;
begin
  select id into v_staff_id from public.staff_users
    where rc_extension_id = p_rc_extension_id and p_rc_extension_id is not null
    limit 1;

  v_lookup_phone := case
    when p_direction = 'Inbound' then p_from_number
    when p_direction = 'Outbound' then p_to_number
    else p_from_number
  end;
  select customer_id, source, source_row_id into v_customer_id, v_source, v_source_row
    from comms.find_customer_by_phone(v_lookup_phone);

  if p_rc_telephony_session_id is not null then
    select id into v_id
      from comms.call_logs
      where rc_telephony_session_id = p_rc_telephony_session_id
      limit 1;
  end if;

  if v_id is not null then
    update comms.call_logs cl
      set rc_session_id = coalesce(p_rc_session_id, cl.rc_session_id),
          rc_party_id = coalesce(p_rc_party_id, cl.rc_party_id),
          direction = coalesce(p_direction, cl.direction),
          from_number = coalesce(p_from_number, cl.from_number),
          from_name = coalesce(p_from_name, cl.from_name),
          to_number = coalesce(p_to_number, cl.to_number),
          to_name = coalesce(p_to_name, cl.to_name),
          rc_extension_id = coalesce(p_rc_extension_id, cl.rc_extension_id),
          staff_user_id = coalesce(cl.staff_user_id, v_staff_id),
          customer_id = coalesce(cl.customer_id, v_customer_id),
          matched_source = coalesce(cl.matched_source, v_source),
          matched_source_row_id = coalesce(cl.matched_source_row_id, v_source_row),
          started_at = coalesce(p_started_at, cl.started_at),
          ended_at = coalesce(p_ended_at, cl.ended_at),
          duration_sec = coalesce(p_duration_sec, cl.duration_sec),
          result = coalesce(p_result, cl.result),
          recording_id = coalesce(p_recording_id, cl.recording_id),
          recording_url = coalesce(p_recording_url, cl.recording_url),
          has_recording = (p_recording_id is not null) or cl.has_recording,
          raw = coalesce(p_raw, cl.raw)
      where cl.id = v_id;
    return v_id;
  end if;

  insert into comms.call_logs (
    rc_session_id, rc_telephony_session_id, rc_party_id,
    direction, from_number, from_name, to_number, to_name,
    rc_extension_id, staff_user_id,
    customer_id, matched_source, matched_source_row_id,
    started_at, ended_at, duration_sec, result,
    recording_id, recording_url, has_recording, raw
  ) values (
    p_rc_session_id, p_rc_telephony_session_id, p_rc_party_id,
    p_direction, p_from_number, p_from_name, p_to_number, p_to_name,
    p_rc_extension_id, v_staff_id,
    v_customer_id, v_source, v_source_row,
    p_started_at, p_ended_at, p_duration_sec, p_result,
    p_recording_id, p_recording_url, p_recording_id is not null, p_raw
  )
  on conflict (rc_session_id) do update set
    rc_telephony_session_id = excluded.rc_telephony_session_id,
    rc_party_id = excluded.rc_party_id,
    direction = excluded.direction,
    from_number = excluded.from_number,
    from_name = excluded.from_name,
    to_number = excluded.to_number,
    to_name = excluded.to_name,
    rc_extension_id = excluded.rc_extension_id,
    staff_user_id = coalesce(comms.call_logs.staff_user_id, excluded.staff_user_id),
    customer_id = coalesce(comms.call_logs.customer_id, excluded.customer_id),
    matched_source = coalesce(comms.call_logs.matched_source, excluded.matched_source),
    matched_source_row_id = coalesce(comms.call_logs.matched_source_row_id, excluded.matched_source_row_id),
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    duration_sec = excluded.duration_sec,
    result = excluded.result,
    recording_id = excluded.recording_id,
    recording_url = excluded.recording_url,
    has_recording = excluded.has_recording,
    raw = excluded.raw
  returning id into v_id;

  return v_id;
end;
$$;
