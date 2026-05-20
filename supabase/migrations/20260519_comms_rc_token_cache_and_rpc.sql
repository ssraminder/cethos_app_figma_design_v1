-- ============================================================================
-- comms.rc_token_cache + public RPC proxies for RingCentral OAuth token caching
--
-- The `comms` schema isn't exposed via PostgREST, so edge functions reach
-- comms.rc_token_cache through security-definer RPCs in public:
--   public.comms_get_rc_token()       — read current cached token
--   public.comms_upsert_rc_token(...) — write a freshly-issued token
-- ============================================================================

create table if not exists comms.rc_token_cache (
  id smallint primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text,
  token_type text,
  scope text,
  owner_id text,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table comms.rc_token_cache enable row level security;
-- no policies → only service_role (which bypasses RLS) can read/write

create or replace function public.comms_get_rc_token()
  returns table(
    access_token text,
    refresh_token text,
    token_type text,
    scope text,
    owner_id text,
    expires_at timestamptz,
    refresh_expires_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = comms, public
as $$
  select access_token, refresh_token, token_type, scope, owner_id, expires_at, refresh_expires_at
    from comms.rc_token_cache where id = 1;
$$;

create or replace function public.comms_upsert_rc_token(
  p_access_token text,
  p_refresh_token text,
  p_token_type text,
  p_scope text,
  p_owner_id text,
  p_expires_at timestamptz,
  p_refresh_expires_at timestamptz
) returns void
  language sql
  security definer
  set search_path = comms, public
as $$
  insert into comms.rc_token_cache (id, access_token, refresh_token, token_type, scope, owner_id, expires_at, refresh_expires_at, updated_at)
  values (1, p_access_token, p_refresh_token, p_token_type, p_scope, p_owner_id, p_expires_at, p_refresh_expires_at, now())
  on conflict (id) do update set
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    token_type = excluded.token_type,
    scope = excluded.scope,
    owner_id = excluded.owner_id,
    expires_at = excluded.expires_at,
    refresh_expires_at = excluded.refresh_expires_at,
    updated_at = now();
$$;

revoke all on function public.comms_get_rc_token() from public, anon, authenticated;
revoke all on function public.comms_upsert_rc_token(text,text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.comms_get_rc_token() to service_role;
grant execute on function public.comms_upsert_rc_token(text,text,text,text,text,timestamptz,timestamptz) to service_role;
