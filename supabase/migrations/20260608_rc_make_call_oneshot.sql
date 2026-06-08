-- ============================================================================
-- rc-make-call infrastructure:
--   1. public.cron_unschedule_by_name(text) — security-definer wrapper so
--      edge functions can self-unschedule a pg_cron job by name.
--   2. One-shot schedule 'rc-call-317-once' — fires at 12:00 UTC on
--      2026-06-08 (8 AM EDT) to call +1 317 935 1831 and follow up with an
--      SMS. The edge function unschedules itself after a successful fire,
--      so the cron expression matching subsequent June 8s is moot.
-- ============================================================================

create or replace function public.cron_unschedule_by_name(p_job_name text)
returns boolean
language plpgsql
security definer
set search_path = cron, public
as $$
declare
  v_exists boolean;
begin
  select exists (select 1 from cron.job where jobname = p_job_name) into v_exists;
  if v_exists then
    perform cron.unschedule(p_job_name);
    return true;
  end if;
  return false;
end;
$$;

grant execute on function public.cron_unschedule_by_name(text) to service_role;

-- ── One-shot schedule ───────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'rc-call-317-once') then
    perform cron.unschedule('rc-call-317-once');
  end if;
end $$;

select cron.schedule(
  'rc-call-317-once',
  '0 12 8 6 *',  -- 12:00 UTC on June 8 = 8 AM EDT (DST in effect)
  $$
  select net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/rc-make-call',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{
      "to_number": "+13179351831",
      "sms_after": { "custom_body": "This call was from Raminder''s office." },
      "cron_job_name": "rc-call-317-once"
    }'::jsonb
  );
  $$
);
