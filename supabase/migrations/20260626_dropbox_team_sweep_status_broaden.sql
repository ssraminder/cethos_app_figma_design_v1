-- 20260626_dropbox_team_sweep_status_broaden.sql
-- Broaden the sweeper candidate filter beyond status='paid'.
--
-- Agency + CD/clinician orders (Welocalize, RWS, TRSB, TransPerfect) are billed
-- on AR net terms, so they sit in 'balance_due' / 'in_production', NOT 'paid'.
-- The original paid-only filter silently excluded ~all of them, so the hourly
-- cron never auto-synced agency/CD/clinician work. Include the confirmed
-- revenue/production states; still exclude draft_review / cancelled / quote.

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
  where o.status in ('paid', 'balance_due', 'in_production', 'delivered')
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

revoke all on function public.dropbox_team_sweep_candidates(int, int, int) from public, anon;
grant execute on function public.dropbox_team_sweep_candidates(int, int, int) to service_role, authenticated;
