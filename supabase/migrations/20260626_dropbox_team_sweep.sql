-- 20260626_dropbox_team_sweep.sql
-- Hourly auto-replication of order files into the TEAM Dropbox.
--
-- WHY: the real-time triggers in _shared/dropbox-trigger.ts still point at the
-- LEGACY `dropbox-sync` (-> /Cethos/Orders/...). The go-forward TEAM folder
-- (/Cethos Team Folder/01_Clients/...) was only ever populated by the manual
-- tmp/backfill-*.mjs scripts, so newly-paid orders never auto-reached it.
--
-- This adds the state + candidate selection for a scheduled sweeper edge
-- function (dropbox-team-sync-sweep) that re-runs the idempotent
-- `dropbox-team-sync` `backfill_order` on orders whose team copy is stale.
-- backfill_order dedups by destination path, so re-sweeping only uploads
-- missing files.

-- 1) Sweep ledger -----------------------------------------------------------
-- One row per order the sweeper has processed. Gates re-sweeping so a
-- permanently-failing order (e.g. deleted source -> "Object not found") is not
-- re-attempted every hour: it is swept once, then only again when the order is
-- updated or (while still active) on the periodic refresh interval.
create table if not exists public.dropbox_team_sweep_state (
  order_id          uuid primary key references public.orders(id) on delete cascade,
  last_swept_at     timestamptz not null default now(),
  last_files_synced integer,
  last_status       text,        -- 'ok' | 'skipped' | 'error'
  last_error        text,
  run_count         integer not null default 0,
  updated_at        timestamptz not null default now()
);

comment on table public.dropbox_team_sweep_state is
  'Per-order bookkeeping for the hourly dropbox-team-sync-sweep. Gates re-sweeping so permanently-failing orders are not re-attempted every run.';

alter table public.dropbox_team_sweep_state enable row level security;

-- Staff may read sweep status; writes are service-role only (bypasses RLS).
drop policy if exists dropbox_team_sweep_state_staff_read on public.dropbox_team_sweep_state;
create policy dropbox_team_sweep_state_staff_read
  on public.dropbox_team_sweep_state for select
  to authenticated
  using (public.is_active_staff());

-- 2) Candidate selection ----------------------------------------------------
-- A paid order within the lookback window is "dirty" (needs a team sync) when:
--   * it has never been swept, OR
--   * the order row changed since the last sweep (orders.updated_at), OR
--   * it is still active (not completed) and the periodic refresh interval has
--     elapsed -- this catches new step deliveries / files added to the child
--     tables, which do not always bump orders.updated_at.
create or replace function public.dropbox_team_sweep_candidates(
  p_lookback_days int default 21,
  p_resweep_hours int default 6,
  p_limit         int default 40
)
returns table (order_id uuid, order_number text, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.order_number::text,
    case
      when s.order_id is null              then 'never_swept'
      when o.updated_at > s.last_swept_at  then 'order_updated'
      else                                      'periodic_refresh'
    end as reason
  from public.orders o
  left join public.dropbox_team_sweep_state s on s.order_id = o.id
  where o.status = 'paid'
    and o.created_at >= now() - make_interval(days => p_lookback_days)
    and (
      s.order_id is null
      or o.updated_at > s.last_swept_at
      or (
        coalesce(o.work_status, '') not in ('completed', 'cancelled', 'closed', 'archived', 'delivered')
        and s.last_swept_at < now() - make_interval(hours => p_resweep_hours)
      )
    )
  order by s.last_swept_at asc nulls first, o.updated_at asc
  limit greatest(p_limit, 1);
$$;

comment on function public.dropbox_team_sweep_candidates(int, int, int) is
  'Orders whose TEAM Dropbox copy is stale and should be re-run through backfill_order. Used by the dropbox-team-sync-sweep edge function.';

-- Lock down execute: service-role (sweeper) + staff (manual UI), never anon.
revoke all on function public.dropbox_team_sweep_candidates(int, int, int) from public, anon;
grant execute on function public.dropbox_team_sweep_candidates(int, int, int) to service_role, authenticated;

-- 3) Atomic upsert of a sweep result ---------------------------------------
create or replace function public.dropbox_team_sweep_record(
  p_order_id uuid,
  p_files    int,
  p_status   text,
  p_error    text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.dropbox_team_sweep_state
    (order_id, last_swept_at, last_files_synced, last_status, last_error, run_count, updated_at)
  values (p_order_id, now(), p_files, p_status, p_error, 1, now())
  on conflict (order_id) do update set
    last_swept_at     = now(),
    last_files_synced = excluded.last_files_synced,
    last_status       = excluded.last_status,
    last_error        = excluded.last_error,
    run_count         = public.dropbox_team_sweep_state.run_count + 1,
    updated_at        = now();
$$;

revoke all on function public.dropbox_team_sweep_record(uuid, int, text, text) from public, anon;
grant execute on function public.dropbox_team_sweep_record(uuid, int, text, text) to service_role;
