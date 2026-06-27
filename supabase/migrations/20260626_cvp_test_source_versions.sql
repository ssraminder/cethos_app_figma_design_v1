-- Versioned test sources (English qualification-test samples).
-- Append-only immutable history of every cvp_test_library content edit, so an
-- auditor can prove exactly which source + version an applicant was tested on.
-- Applied to prod 2026-06-26 via MCP; committed here to mirror prod.

create table if not exists public.cvp_test_source_versions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.cvp_test_library(id),
  version_number int not null,
  title text,
  source_text text,
  instructions text,
  reference_translation text,
  ai_assessment_rubric text,
  source_file_path text,
  content_hash text,
  change_reason text,
  created_by uuid,            -- staff_users.id (nullable; null = system/backfill)
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (test_id, version_number)
);
create index if not exists idx_cvp_test_source_versions_test
  on public.cvp_test_source_versions (test_id, version_number desc);

-- Pointer columns on the live library row (always reflect the latest version).
alter table public.cvp_test_library
  add column if not exists current_version_id uuid references public.cvp_test_source_versions(id),
  add column if not exists current_version_number int not null default 1;

-- Stamp the exact version sent onto each submission (the audit link).
alter table public.cvp_test_submissions
  add column if not exists test_version_id uuid references public.cvp_test_source_versions(id);

-- Append-only guard: block UPDATE/DELETE on the version history.
create or replace function public.cvp_test_source_versions_no_mutate()
returns trigger language plpgsql as $$
begin
  raise exception 'cvp_test_source_versions is append-only (no % allowed)', tg_op;
end $$;

drop trigger if exists cvp_test_source_versions_no_update on public.cvp_test_source_versions;
create trigger cvp_test_source_versions_no_update
  before update on public.cvp_test_source_versions
  for each row execute function public.cvp_test_source_versions_no_mutate();

drop trigger if exists cvp_test_source_versions_no_delete on public.cvp_test_source_versions;
create trigger cvp_test_source_versions_no_delete
  before delete on public.cvp_test_source_versions
  for each row execute function public.cvp_test_source_versions_no_mutate();

-- RLS: deny by default (no policies). Access is via service-role edge functions only.
alter table public.cvp_test_source_versions enable row level security;

-- Auto-version helper: every save creates a new immutable version and repoints
-- the library row at it. SECURITY DEFINER so the edge function can call it.
create or replace function public.cvp_test_source_save_version(
  p_test_id uuid,
  p_title text,
  p_source_text text,
  p_instructions text,
  p_reference_translation text,
  p_ai_assessment_rubric text,
  p_source_file_path text,
  p_change_reason text,
  p_staff_id uuid
) returns public.cvp_test_source_versions
language plpgsql security definer set search_path = public as $$
declare
  v_next int;
  v_name text;
  v_row public.cvp_test_source_versions;
begin
  select coalesce(max(version_number), 0) + 1 into v_next
    from public.cvp_test_source_versions where test_id = p_test_id;
  select full_name into v_name from public.staff_users where id = p_staff_id;

  insert into public.cvp_test_source_versions(
    test_id, version_number, title, source_text, instructions,
    reference_translation, ai_assessment_rubric, source_file_path,
    content_hash, change_reason, created_by, created_by_name
  ) values (
    p_test_id, v_next, p_title, p_source_text, p_instructions,
    p_reference_translation, p_ai_assessment_rubric, p_source_file_path,
    md5(coalesce(p_source_text,'') || '|' || coalesce(p_reference_translation,'') || '|' ||
        coalesce(p_instructions,'') || '|' || coalesce(p_ai_assessment_rubric,'')),
    p_change_reason, p_staff_id, v_name
  ) returning * into v_row;

  update public.cvp_test_library set
    title = coalesce(p_title, title),
    source_text = p_source_text,
    instructions = p_instructions,
    reference_translation = p_reference_translation,
    ai_assessment_rubric = p_ai_assessment_rubric,
    source_file_path = p_source_file_path,
    current_version_id = v_row.id,
    current_version_number = v_next,
    updated_at = now()
  where id = p_test_id;

  return v_row;
end $$;

-- ── Backfill ────────────────────────────────────────────────────────────────
insert into public.cvp_test_source_versions(
  test_id, version_number, title, source_text, instructions,
  reference_translation, ai_assessment_rubric, source_file_path,
  content_hash, change_reason, created_by, created_by_name, created_at
)
select id, 1, title, source_text, instructions, reference_translation,
       ai_assessment_rubric, source_file_path,
       md5(coalesce(source_text,'')),
       'Initial version (backfill of existing test source)', null, 'system (backfill)',
       coalesce(created_at, now())
from public.cvp_test_library
on conflict (test_id, version_number) do nothing;

update public.cvp_test_library l
set current_version_id = v.id, current_version_number = 1
from public.cvp_test_source_versions v
where v.test_id = l.id and v.version_number = 1
  and l.current_version_id is null;

update public.cvp_test_submissions s
set test_version_id = v.id
from public.cvp_test_source_versions v
where v.test_id = s.test_id and v.version_number = 1
  and s.test_version_id is null;
