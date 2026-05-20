-- RPC powering the sidebar SMS-nav health dot.
-- Returns: healthy/status/expiry of the RC webhook subscription + last SMS ts.

create or replace function public.comms_get_realtime_status()
  returns table(
    healthy boolean,
    status text,
    expires_at timestamptz,
    hours_until_expiry double precision,
    last_sms_at timestamptz
  )
  language plpgsql stable security definer set search_path = comms, public
as $$
declare
  v_sub record;
  v_last_sms timestamptz;
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select id, status as sub_status, expires_at
    into v_sub
    from comms.rc_subscriptions
    where status = 'Active'
    order by expires_at desc
    limit 1;

  select max(coalesce(received_at, sent_at, created_at))
    into v_last_sms
    from comms.sms_messages;

  if v_sub.id is null then
    return query select
      false as healthy,
      'missing'::text as status,
      null::timestamptz as expires_at,
      null::double precision as hours_until_expiry,
      v_last_sms as last_sms_at;
    return;
  end if;

  return query select
    (v_sub.expires_at > now() + interval '6 hours') as healthy,
    v_sub.sub_status::text as status,
    v_sub.expires_at as expires_at,
    extract(epoch from (v_sub.expires_at - now())) / 3600.0 as hours_until_expiry,
    v_last_sms as last_sms_at;
end;
$$;

grant execute on function public.comms_get_realtime_status() to authenticated, service_role;
