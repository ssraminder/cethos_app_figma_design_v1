-- Two follow-on fixes to comms_get_realtime_status:
--   1. status OUT column shadowed comms.rc_subscriptions.status in the
--      WHERE clause → "column reference 'status' is ambiguous". Pull each
--      column into a scalar variable before returning.
--   2. extract(epoch ...)/3600 returns numeric; the function signature
--      declares double precision. Cast explicitly.

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
  v_id text;
  v_status text;
  v_expires_at timestamptz;
  v_last_sms timestamptz;
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select sub.id, sub.status, sub.expires_at
    into v_id, v_status, v_expires_at
    from comms.rc_subscriptions sub
    where sub.status = 'Active'
    order by sub.expires_at desc
    limit 1;

  select max(coalesce(sm.received_at, sm.sent_at, sm.created_at))
    into v_last_sms
    from comms.sms_messages sm;

  if v_id is null then
    return query select
      false as healthy,
      'missing'::text as status,
      null::timestamptz as expires_at,
      null::double precision as hours_until_expiry,
      v_last_sms as last_sms_at;
    return;
  end if;

  return query select
    (v_expires_at > now() + interval '6 hours') as healthy,
    v_status as status,
    v_expires_at as expires_at,
    (extract(epoch from (v_expires_at - now())) / 3600.0)::double precision as hours_until_expiry,
    v_last_sms as last_sms_at;
end;
$$;
