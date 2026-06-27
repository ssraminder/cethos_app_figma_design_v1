-- qms-dropbox-sync: ledger + on-change triggers + weekly safety-net cron.
--
-- Replicates QMS SOPs into the team Dropbox as .docx (one folder per SOP, one
-- file per version). The edge function `qms-dropbox-sync` does the work; this
-- migration provides the idempotency ledger and the two ways it gets invoked:
--   1. on-change DB triggers on sops + sop_versions (immediate, per-SOP)
--   2. a weekly full-reconcile cron (safety net)

-- 1) Idempotency ledger (keyed by sop_version_id). Service-role only (RLS on,
--    no policies) — consistent with the anon-exposure remediation.
create table if not exists public.qms_dropbox_syncs (
  id                   uuid primary key default gen_random_uuid(),
  sop_id               uuid not null references public.sops(id) on delete cascade,
  sop_version_id       uuid not null references public.sop_versions(id) on delete cascade,
  dropbox_path         text,
  content_sha256       text,
  generator_version    integer not null default 1,
  status               text not null default 'pending',
  file_size_bytes      bigint,
  dropbox_content_hash text,
  error_message        text,
  synced_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint qms_dropbox_syncs_version_uk unique (sop_version_id)
);

create index if not exists qms_dropbox_syncs_sop_idx on public.qms_dropbox_syncs (sop_id);

alter table public.qms_dropbox_syncs enable row level security;

-- 2) Trigger helper: fire-and-forget POST to the edge function for one SOP.
create or replace function public.qms_dropbox_notify(p_sop_id uuid)
returns void
language plpgsql
security definer
set search_path = public, net
as $$
begin
  perform net.http_post(
    url     := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/qms-dropbox-sync',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object('sop_id', p_sop_id)
  );
exception when others then
  -- Never let Dropbox replication block a SOP edit.
  raise warning 'qms_dropbox_notify failed for %: %', p_sop_id, sqlerrm;
end;
$$;

-- Trigger fn for sop_versions: new/changed version content -> reconcile its SOP.
create or replace function public.qms_dropbox_versions_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.qms_dropbox_notify(new.sop_id);
  return new;
end;
$$;

-- Trigger fn for sops: title / current-pointer / archived change -> reconcile.
create or replace function public.qms_dropbox_sops_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.qms_dropbox_notify(new.id);
  return new;
end;
$$;

drop trigger if exists trg_qms_dropbox_versions on public.sop_versions;
create trigger trg_qms_dropbox_versions
  after insert or update of status, effective_date, approved_by_name, content_md
  on public.sop_versions
  for each row execute function public.qms_dropbox_versions_trg();

-- INSERT and UPDATE need separate triggers: a WHEN clause that references OLD
-- is rejected on an INSERT trigger.
drop trigger if exists trg_qms_dropbox_sops on public.sops;
drop trigger if exists trg_qms_dropbox_sops_ins on public.sops;
drop trigger if exists trg_qms_dropbox_sops_upd on public.sops;

create trigger trg_qms_dropbox_sops_ins
  after insert on public.sops
  for each row execute function public.qms_dropbox_sops_trg();

create trigger trg_qms_dropbox_sops_upd
  after update of title, current_version_id, is_archived on public.sops
  for each row
  when (
    old.title is distinct from new.title
    or old.current_version_id is distinct from new.current_version_id
    or old.is_archived is distinct from new.is_archived
  )
  execute function public.qms_dropbox_sops_trg();

-- 3) Weekly full reconcile (Sundays 03:30 UTC) as a safety net.
select cron.unschedule('qms-dropbox-sync-weekly')
where exists (select 1 from cron.job where jobname = 'qms-dropbox-sync-weekly');

select cron.schedule(
  'qms-dropbox-sync-weekly',
  '30 3 * * 0',
  $$
  select net.http_post(
    url     := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/qms-dropbox-sync',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"limit":200}'::jsonb
  );
  $$
);
