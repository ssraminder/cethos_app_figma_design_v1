-- ============================================================================
-- RingCentral real-time:
--   1. pg_cron poll for SMS (every 1 min) + calls (every 2 min) — safety net
--   2. comms.rc_subscriptions table + RPCs to track the push subscription
--   3. Daily renewal cron for the webhook subscription
--
-- The rc-webhook edge function (separate file) is the primary push receiver;
-- pg_cron polling stays as a fallback so a missed/expired subscription never
-- silently loses inbound SMS or calls.
-- ============================================================================

-- ── Periodic sync ─────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'rc-sync-sms-1min') then
    perform cron.unschedule('rc-sync-sms-1min');
  end if;
  if exists (select 1 from cron.job where jobname = 'rc-sync-calls-2min') then
    perform cron.unschedule('rc-sync-calls-2min');
  end if;
end $$;

select cron.schedule(
  'rc-sync-sms-1min',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/rc-sync-sms',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'rc-sync-calls-2min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/rc-sync-calls',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ── Subscription tracking ─────────────────────────────────────────────────
create table if not exists comms.rc_subscriptions (
  id text primary key,
  status text not null,
  event_filters text[] not null,
  delivery_url text not null,
  verification_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw jsonb
);

create index if not exists rc_subscriptions_status_expires_idx
  on comms.rc_subscriptions (status, expires_at);

alter table comms.rc_subscriptions enable row level security;

create or replace function public.comms_get_active_rc_subscription()
  returns table(id text, status text, expires_at timestamptz, verification_token text, event_filters text[], delivery_url text)
  language sql stable security definer set search_path = comms, public
as $$
  select id, status, expires_at, verification_token, event_filters, delivery_url
  from comms.rc_subscriptions
  where status = 'Active'
  order by expires_at desc
  limit 1;
$$;

create or replace function public.comms_upsert_rc_subscription(
  p_id text, p_status text, p_event_filters text[], p_delivery_url text,
  p_verification_token text, p_expires_at timestamptz, p_raw jsonb
) returns void
  language sql security definer set search_path = comms, public
as $$
  insert into comms.rc_subscriptions (id, status, event_filters, delivery_url, verification_token, expires_at, raw)
  values (p_id, p_status, p_event_filters, p_delivery_url, p_verification_token, p_expires_at, p_raw)
  on conflict (id) do update set
    status = excluded.status,
    event_filters = excluded.event_filters,
    delivery_url = excluded.delivery_url,
    verification_token = excluded.verification_token,
    expires_at = excluded.expires_at,
    raw = excluded.raw,
    updated_at = now();
$$;

grant execute on function public.comms_get_active_rc_subscription() to service_role;
grant execute on function public.comms_upsert_rc_subscription(text,text,text[],text,text,timestamptz,jsonb) to service_role;

-- ── Renewal cron (6-day buffer ahead of RC's 7-day max expiry) ────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'rc-subscription-renew-daily') then
    perform cron.unschedule('rc-subscription-renew-daily');
  end if;
end $$;

select cron.schedule(
  'rc-subscription-renew-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/rc-webhook-manage',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action":"renew"}'::jsonb
  );
  $$
);
