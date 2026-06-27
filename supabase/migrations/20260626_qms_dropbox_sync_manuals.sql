-- qms-dropbox-sync (manuals): ledger + on-change triggers for the portal
-- Documents & Manuals library (portal_documents / portal_document_files).
--
-- These are real stored files copied as-is into
-- /Cethos Team Folder/QMS/Manuals/<DocCode> - <Title>/, active version marked
-- with a "-current" suffix. The same `qms-dropbox-sync` edge function and the
-- existing weekly cron (jobid 1850, default kind = "all") handle them; this
-- migration only adds the idempotency ledger and the on-change invocations.

-- 1) Idempotency ledger (keyed by document_file_id). Service-role only.
create table if not exists public.qms_manual_dropbox_syncs (
  id                   uuid primary key default gen_random_uuid(),
  document_id          uuid not null references public.portal_documents(id) on delete cascade,
  document_file_id     uuid not null references public.portal_document_files(id) on delete cascade,
  dropbox_path         text,
  content_sha256       text,
  status               text not null default 'pending',
  file_size_bytes      bigint,
  dropbox_content_hash text,
  error_message        text,
  synced_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint qms_manual_dropbox_syncs_file_uk unique (document_file_id)
);

create index if not exists qms_manual_dropbox_syncs_doc_idx
  on public.qms_manual_dropbox_syncs (document_id);

alter table public.qms_manual_dropbox_syncs enable row level security;

-- 2) Fire-and-forget POST to the edge function for one document.
create or replace function public.qms_manual_dropbox_notify(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public, net
as $$
begin
  perform net.http_post(
    url     := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/qms-dropbox-sync',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object('document_id', p_document_id)
  );
exception when others then
  raise warning 'qms_manual_dropbox_notify failed for %: %', p_document_id, sqlerrm;
end;
$$;

create or replace function public.qms_manual_dropbox_docs_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.qms_manual_dropbox_notify(new.id);
  return new;
end;
$$;

create or replace function public.qms_manual_dropbox_files_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.qms_manual_dropbox_notify(new.document_id);
  return new;
end;
$$;

-- New version file uploaded -> reconcile its document.
drop trigger if exists trg_qms_manual_dropbox_files on public.portal_document_files;
create trigger trg_qms_manual_dropbox_files
  after insert on public.portal_document_files
  for each row execute function public.qms_manual_dropbox_files_trg();

-- Document published / renamed / current-pointer or archive flip -> reconcile.
-- INSERT and UPDATE split: a WHEN clause referencing OLD is illegal on INSERT.
drop trigger if exists trg_qms_manual_dropbox_docs_ins on public.portal_documents;
drop trigger if exists trg_qms_manual_dropbox_docs_upd on public.portal_documents;

create trigger trg_qms_manual_dropbox_docs_ins
  after insert on public.portal_documents
  for each row execute function public.qms_manual_dropbox_docs_trg();

create trigger trg_qms_manual_dropbox_docs_upd
  after update of title, doc_code, current_file_id, is_published, is_archived
  on public.portal_documents
  for each row
  when (
    old.title is distinct from new.title
    or old.doc_code is distinct from new.doc_code
    or old.current_file_id is distinct from new.current_file_id
    or old.is_published is distinct from new.is_published
    or old.is_archived is distinct from new.is_archived
  )
  execute function public.qms_manual_dropbox_docs_trg();
