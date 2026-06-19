-- Portal Documents & Manuals library
--
-- Internal documents / manuals with a per-document audience
-- (staff / vendor / customer / all) and full file-version history.
-- Service-role-only, managed via the manage-portal-documents edge function;
-- RLS is enabled with NO client policies, mirroring the SOPs module.

create table if not exists public.portal_documents (
  id uuid primary key default gen_random_uuid(),
  doc_code text unique,                 -- e.g. CTH-VPG-001 (optional, human-facing)
  title text not null,
  description text,
  category text not null default 'General',
  audience text not null default 'staff'
    check (audience in ('staff', 'vendor', 'customer', 'all')),
  current_file_id uuid,                 -- -> portal_document_files.id (set after insert)
  is_published boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff_users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.portal_documents(id) on delete cascade,
  version text not null,                -- human label, e.g. "1.0"
  storage_path text not null,           -- path within the portal-documents bucket
  file_name text not null,
  file_size bigint,
  mime_type text,
  change_summary text,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff_users(id),
  created_by_name text,
  unique (document_id, version)
);

alter table public.portal_documents
  add constraint portal_documents_current_file_fk
  foreign key (current_file_id)
  references public.portal_document_files(id) on delete set null;

create index if not exists portal_document_files_doc_idx
  on public.portal_document_files(document_id);

-- Enable RLS with no policies: client access is blocked; all reads/writes
-- go through the service-role manage-portal-documents edge function.
alter table public.portal_documents enable row level security;
alter table public.portal_document_files enable row level security;

-- Private bucket for the actual files (downloads via signed URL from the fn).
insert into storage.buckets (id, name, public)
values ('portal-documents', 'portal-documents', false)
on conflict (id) do nothing;
