-- ============================================================================
-- Unified customer conversation: bridge view + RPCs that UNION ALL
-- conversation_messages (email/in-app) and comms.sms_messages into one
-- chronological feed per customer.
--
-- Keeps both source tables intact. Lead SMS (customer_id is null) does NOT
-- appear here — those stay in /admin/sms.
-- ============================================================================

drop view if exists public.v_unified_messages;

create view public.v_unified_messages as
-- Email / in-app messages from conversation_messages
select
  cm.id::uuid as id,
  -- Resolve customer: sender_customer_id > quotes.customer_id > orders.customer_id
  coalesce(cm.sender_customer_id, q.customer_id, o.customer_id) as customer_id,
  cm.conversation_id::text as thread_id,
  (case
    when cm.source = 'email' then 'email'
    when cm.source = 'inapp' then 'inapp'
    else coalesce(cm.source, 'inapp')
  end)::text as channel,
  (case
    when cm.sender_type = 'customer' then 'inbound'
    when cm.sender_type = 'staff' then 'outbound'
    when cm.sender_type = 'system' then 'system'
    else cm.sender_type
  end)::text as direction,
  cm.message_text::text as body,
  cm.created_at as occurred_at,
  cm.read_by_staff_at as read_at,
  cm.sender_staff_id as staff_user_id,
  cm.sender_customer_id as sender_customer_id,
  cm.quote_id as quote_id,
  cm.order_id as order_id,
  cm.metadata as metadata,
  null::text as peer_phone_e164,
  null::text as template_key,
  null::text as status,
  cm.email_message_id::text as external_id
from public.conversation_messages cm
left join public.quotes q on q.id = cm.quote_id
left join public.orders o on o.id = cm.order_id

union all

-- SMS messages from comms.sms_messages (only those linked to a customer)
select
  sm.id,
  sm.customer_id,
  coalesce(
    case when sm.direction = 'inbound' then sm.from_number_e164 else sm.to_number_e164 end,
    case when sm.direction = 'inbound' then sm.from_number else sm.to_number end
  )::text as thread_id,
  'sms'::text as channel,
  sm.direction::text as direction,
  sm.body::text as body,
  coalesce(sm.received_at, sm.sent_at, sm.created_at) as occurred_at,
  sm.read_at,
  sm.staff_user_id,
  null::uuid as sender_customer_id,
  null::uuid as quote_id,
  null::uuid as order_id,
  jsonb_build_object(
    'rc_message_id', sm.rc_message_id,
    'rc_conversation_id', sm.rc_conversation_id,
    'template_key', sm.template_key,
    'call_log_id', sm.call_log_id
  ) as metadata,
  coalesce(
    case when sm.direction = 'inbound' then sm.from_number_e164 else sm.to_number_e164 end,
    case when sm.direction = 'inbound' then sm.from_number else sm.to_number end
  )::text as peer_phone_e164,
  sm.template_key::text as template_key,
  sm.status::text as status,
  sm.rc_message_id::text as external_id
from comms.sms_messages sm
where sm.customer_id is not null;

grant select on public.v_unified_messages to authenticated, service_role;

-- Per-customer chronological feed
create or replace function public.comms_list_customer_conversation(
  p_customer_id uuid,
  p_limit integer default 200,
  p_before_ts timestamptz default null
) returns table(
  id uuid,
  channel text,
  direction text,
  body text,
  occurred_at timestamptz,
  read_at timestamptz,
  staff_user_id uuid,
  staff_full_name text,
  thread_id text,
  peer_phone_e164 text,
  template_key text,
  status text,
  quote_id uuid,
  order_id uuid,
  metadata jsonb
) language plpgsql stable security definer set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  select
    um.id, um.channel, um.direction, um.body, um.occurred_at, um.read_at,
    um.staff_user_id, su.full_name::text as staff_full_name,
    um.thread_id, um.peer_phone_e164, um.template_key, um.status,
    um.quote_id, um.order_id, um.metadata
  from public.v_unified_messages um
  left join public.staff_users su on su.id = um.staff_user_id
  where um.customer_id = p_customer_id
    and (p_before_ts is null or um.occurred_at < p_before_ts)
  order by um.occurred_at asc
  limit p_limit;
end;
$$;

create or replace function public.comms_get_customer_unread_counts(p_customer_id uuid)
  returns table(channel text, unread_count bigint)
  language plpgsql stable security definer set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  select um.channel, count(*)::bigint as unread_count
  from public.v_unified_messages um
  where um.customer_id = p_customer_id
    and um.direction = 'inbound'
    and um.read_at is null
  group by um.channel;
end;
$$;

-- Mark every inbound message for a customer as read, across both sources.
create or replace function public.comms_mark_customer_thread_read(p_customer_id uuid)
  returns integer
  language plpgsql security definer set search_path = comms, public
as $$
declare
  v_total integer := 0;
  v_count integer;
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  update public.conversation_messages cm
    set read_by_staff_at = now()
    where cm.sender_type = 'customer'
      and cm.read_by_staff_at is null
      and (
        cm.sender_customer_id = p_customer_id
        or cm.quote_id in (select id from public.quotes where customer_id = p_customer_id)
        or cm.order_id in (select id from public.orders where customer_id = p_customer_id)
      );
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  update comms.sms_messages
    set read_at = now()
    where customer_id = p_customer_id
      and direction = 'inbound'
      and read_at is null;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  return v_total;
end;
$$;

-- Reachable channels + last-used hint for the composer
create or replace function public.comms_get_customer_channel_state(p_customer_id uuid)
  returns table(
    has_email boolean,
    has_phone boolean,
    last_used_channel text,
    customer_email text,
    customer_phone text
  ) language plpgsql stable security definer set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  select
    (c.email is not null and length(c.email) > 0) as has_email,
    (c.phone is not null and length(c.phone) > 0) as has_phone,
    (
      select um.channel
      from public.v_unified_messages um
      where um.customer_id = p_customer_id
      order by um.occurred_at desc
      limit 1
    ) as last_used_channel,
    c.email::text as customer_email,
    c.phone::text as customer_phone
  from public.customers c
  where c.id = p_customer_id;
end;
$$;

-- Batch lookup: which customer_ids in this set have SMS activity, and how
-- many unread inbound. Used by AdminMessages to overlay an SMS badge per row.
create or replace function public.comms_customers_sms_activity(p_customer_ids uuid[])
  returns table(customer_id uuid, sms_count bigint, sms_unread bigint)
  language plpgsql stable security definer set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  select sm.customer_id,
    count(*)::bigint as sms_count,
    count(*) filter (where sm.direction = 'inbound' and sm.read_at is null)::bigint as sms_unread
  from comms.sms_messages sm
  where sm.customer_id = any(p_customer_ids)
  group by sm.customer_id;
end;
$$;

grant execute on function public.comms_list_customer_conversation(uuid, integer, timestamptz) to authenticated, service_role;
grant execute on function public.comms_get_customer_unread_counts(uuid) to authenticated, service_role;
grant execute on function public.comms_mark_customer_thread_read(uuid) to authenticated, service_role;
grant execute on function public.comms_get_customer_channel_state(uuid) to authenticated, service_role;
grant execute on function public.comms_customers_sms_activity(uuid[]) to authenticated, service_role;
