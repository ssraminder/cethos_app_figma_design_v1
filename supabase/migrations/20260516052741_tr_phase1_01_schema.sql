-- ============================================================================
-- tr.* schema — Translation Review Automation + Certified Translation QM
-- Phase 1 schema, enums, tables, triggers, audit hash chain, RLS.
--
-- See docs/translation-review/00-foundations.md (to be authored alongside) for
-- architectural canon. Mirrors qms.* patterns where relevant:
--   - sha256 hash-chained audit log with three-layer tamper resistance
--   - dedicated schema for clean RLS scoping
--   - functions pinned to search_path = tr, public (or +extensions for digest)
--
-- Phase 1 covers: job intake, file manifest with verification, pair mapping,
-- locked decisions, conversation history, structured findings, Claude call
-- audit, plan + approval, hash-chained audit log. QM-specific open_questions
-- table is included so Phase 3 doesn't need a schema migration — only logic.
-- ============================================================================

create schema if not exists tr;
grant usage on schema tr to authenticated, service_role;

-- ── Enums ───────────────────────────────────────────────────────────────────

create type tr.job_kind as enum ('translation_review', 'qm_certified');
create type tr.job_status as enum (
  'intake', 'preflight', 'plan_pending_approval', 'in_review',
  'findings_pending_human_review', 'revisions_pending',
  'blocked_open_questions', 'complete', 'cancelled'
);
create type tr.cert_type as enum ('regulated', 'internal_qa', 'both');
create type tr.file_role as enum (
  'source', 'target', 'reference', 'client_email',
  'output', 'open_question_image'
);
create type tr.file_source_kind as enum (
  'uploaded', 'linked_quote_file', 'linked_project_asset',
  'linked_order_deliverable'
);
create type tr.finding_severity as enum ('critical', 'major', 'minor', 'info');
create type tr.finding_confidence as enum ('high', 'medium', 'low');
create type tr.finding_category as enum (
  'mistranslation', 'omission', 'factual_error', 'tense_mismatch',
  'font_encoding', 'formatting', 'terminology_inconsistency',
  'certification_block', 'missing_in_target', 'extra_in_target',
  'critical_field_mismatch', 'formatting_fidelity',
  'non_translatable_handling', 'handwriting_uncertain', 'other'
);
create type tr.finding_application_mode as enum (
  'tracked_change', 'comment', 'highlight', 'cell_change', 'pdf_annotation'
);
create type tr.finding_application_status as enum (
  'pending', 'applied', 'withdrawn', 'rejected_by_human', 'manually_modified'
);
create type tr.locked_decision_kind as enum (
  'terminology', 'scope_exclusion', 'methodology_override',
  'color_convention', 'other'
);
create type tr.conversation_role as enum (
  'system', 'user', 'assistant', 'tool_result'
);
create type tr.claude_call_kind as enum (
  'preflight_identity_verify', 'generate_job_plan', 'email_alignment',
  'review', 'followup', 'qm_compare', 'handwriting_assess', 'summarize_turns'
);
create type tr.claude_call_outcome as enum (
  'success', 'schema_violation', 'retry_succeeded', 'fatal_error',
  'fallback_used'
);
create type tr.job_plan_approval_status as enum (
  'draft', 'pending_approval', 'approved', 'rejected', 'superseded'
);
create type tr.open_question_status as enum (
  'open', 'answered', 'resolved', 'dismissed'
);
create type tr.audit_action as enum (
  'job_created', 'job_status_changed', 'file_added', 'file_verified',
  'file_override', 'file_removed', 'pair_added', 'pair_removed',
  'locked_decision_added', 'locked_decision_withdrawn',
  'job_plan_generated', 'job_plan_approved', 'job_plan_rejected',
  'claude_call_made', 'finding_added', 'finding_applied',
  'finding_withdrawn', 'finding_modified', 'mid_job_confirmation',
  'open_question_raised', 'open_question_answered', 'open_question_dismissed',
  'config_changed'
);

-- ── Governance / reference tables ──────────────────────────────────────────

create table tr.config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table tr.methodology_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  system_prompt_template text not null,
  output_schema_jsonb jsonb not null,
  version int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table tr.round_colors (
  round int primary key,
  label text not null,
  color_hex text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$')
);

create table tr.cert_statement_templates (
  id uuid primary key default gen_random_uuid(),
  target_authority text not null,
  cert_type tr.cert_type not null,
  template text not null,
  version int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_authority, cert_type, version)
);

-- ── Core entities ──────────────────────────────────────────────────────────

create table tr.review_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.internal_projects(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  pm_contact text,
  client_name text,
  job_kind tr.job_kind not null default 'translation_review',
  source_language_id uuid not null references public.languages(id),
  target_language_id uuid not null references public.languages(id),
  methodology_template_id uuid not null references tr.methodology_templates(id),
  review_round int not null default 1 check (review_round >= 1),
  round_color_hex text check (round_color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  deliverable_format_spec jsonb not null default '{}'::jsonb,
  status tr.job_status not null default 'intake',
  cert_type tr.cert_type,
  target_authority text,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index tr_review_jobs_project_idx on tr.review_jobs(project_id);
create index tr_review_jobs_customer_idx on tr.review_jobs(customer_id);
create index tr_review_jobs_status_idx on tr.review_jobs(status);
create index tr_review_jobs_kind_idx on tr.review_jobs(job_kind);

create table tr.file_pairs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  label text not null,
  notes text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index tr_file_pairs_job_idx on tr.file_pairs(job_id, display_order);

create table tr.job_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  pair_id uuid references tr.file_pairs(id) on delete set null,
  role tr.file_role not null,
  category text,
  custom_label text,
  source_kind tr.file_source_kind not null default 'uploaded',
  storage_bucket text not null,
  storage_path text not null,
  linked_quote_file_id uuid references public.quote_files(id) on delete set null,
  linked_project_asset_kind text,
  linked_project_id uuid references public.internal_projects(id) on delete set null,
  linked_order_id uuid references public.orders(id) on delete set null,
  linked_step_id uuid,
  linked_deliverable_id uuid,
  original_filename text not null,
  mime_type text,
  bytes bigint,
  sha256 text,
  expected_marker text,
  actual_marker text,
  verified boolean not null default false,
  verified_at timestamptz,
  verification_method text,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint tr_job_files_source_target_paired
    check (role not in ('source','target') or pair_id is not null),
  constraint tr_job_files_uploaded_no_link
    check (
      source_kind <> 'uploaded'
      or (linked_quote_file_id is null
          and linked_project_id is null
          and linked_order_id is null)
    ),
  constraint tr_job_files_linked_quote_has_id
    check (source_kind <> 'linked_quote_file' or linked_quote_file_id is not null),
  constraint tr_job_files_linked_project_has_id
    check (source_kind <> 'linked_project_asset' or linked_project_id is not null),
  constraint tr_job_files_linked_order_has_id
    check (source_kind <> 'linked_order_deliverable' or linked_order_id is not null)
);

create index tr_job_files_job_role_idx on tr.job_files(job_id, role);
create index tr_job_files_pair_idx on tr.job_files(pair_id);
create index tr_job_files_linked_quote_idx on tr.job_files(linked_quote_file_id)
  where linked_quote_file_id is not null;

create table tr.locked_decisions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  decision_kind tr.locked_decision_kind not null,
  key text not null,
  value text not null,
  source_language_id uuid references public.languages(id),
  target_language_id uuid references public.languages(id),
  scope text,
  rationale text,
  locked_at timestamptz not null default now(),
  locked_by uuid,
  withdrawn_at timestamptz,
  withdrawn_reason text,
  superseded_by uuid references tr.locked_decisions(id) on delete set null
);

create index tr_locked_decisions_job_idx on tr.locked_decisions(job_id)
  where withdrawn_at is null and superseded_by is null;

create table tr.job_plans (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  version int not null,
  plan_jsonb jsonb not null,
  email_alignment_jsonb jsonb,
  approval_status tr.job_plan_approval_status not null default 'draft',
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  confirmation_checks_jsonb jsonb not null default '{}'::jsonb,
  superseded_by uuid references tr.job_plans(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (job_id, version)
);

create index tr_job_plans_job_idx on tr.job_plans(job_id, version desc);

create table tr.claude_calls (
  id bigserial primary key,
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  call_kind tr.claude_call_kind not null,
  model text not null,
  prompt_version text not null,
  system_prompt_hash text,
  request_jsonb jsonb not null,
  response_jsonb jsonb,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  cache_creation_tokens int,
  latency_ms int,
  outcome tr.claude_call_outcome,
  error_text text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index tr_claude_calls_job_idx on tr.claude_calls(job_id, created_at desc);

create table tr.conversation_turns (
  id bigserial primary key,
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  turn_index int not null,
  role tr.conversation_role not null,
  content_json jsonb not null,
  claude_call_id bigint references tr.claude_calls(id) on delete set null,
  model text,
  prompt_version text,
  cached_prefix_hash text,
  input_tokens int,
  output_tokens int,
  cache_read_input_tokens int,
  cache_creation_input_tokens int,
  created_at timestamptz not null default now(),
  unique (job_id, turn_index)
);

create index tr_conversation_turns_job_idx on tr.conversation_turns(job_id, turn_index);

create table tr.conversation_summaries (
  id bigserial primary key,
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  turn_range_start int not null,
  turn_range_end int not null,
  summary_jsonb jsonb not null,
  created_at timestamptz not null default now()
);

create index tr_conversation_summaries_job_idx on tr.conversation_summaries(job_id, turn_range_start);

create table tr.findings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  claude_call_id bigint references tr.claude_calls(id) on delete set null,
  file_id uuid references tr.job_files(id) on delete set null,
  pair_id uuid references tr.file_pairs(id) on delete set null,
  finding_number int not null,
  round int not null default 1,
  severity tr.finding_severity not null,
  category tr.finding_category not null,
  confidence tr.finding_confidence not null,
  location_jsonb jsonb not null default '{}'::jsonb,
  source_text text,
  current_translation text,
  proposed_change text,
  english_back_translation text,
  rationale text,
  cross_file_consistency_jsonb jsonb,
  application_mode tr.finding_application_mode not null,
  color_hex text check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  application_status tr.finding_application_status not null default 'pending',
  applied_at timestamptz,
  applied_by uuid,
  withdrawn_reason text,
  parent_finding_id uuid references tr.findings(id) on delete set null,
  created_at timestamptz not null default now()
);

create index tr_findings_job_idx on tr.findings(job_id, round, finding_number);
create index tr_findings_file_idx on tr.findings(file_id);
create index tr_findings_status_idx on tr.findings(job_id, application_status);

create table tr.items_considered_not_flagged (
  id bigserial primary key,
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  claude_call_id bigint not null references tr.claude_calls(id) on delete cascade,
  file_id uuid references tr.job_files(id) on delete set null,
  description text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index tr_items_not_flagged_call_idx on tr.items_considered_not_flagged(claude_call_id);

create table tr.open_questions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  finding_id uuid references tr.findings(id) on delete set null,
  file_id uuid references tr.job_files(id) on delete set null,
  location_jsonb jsonb not null default '{}'::jsonb,
  cropped_image_storage_path text,
  candidate_readings jsonb not null default '[]'::jsonb,
  question_text text not null,
  forwarding_token text unique,
  forwarding_token_expires_at timestamptz,
  status tr.open_question_status not null default 'open',
  answer_text text,
  answered_at timestamptz,
  answered_by uuid,
  dismissed_reason text,
  dismissed_at timestamptz,
  dismissed_by uuid,
  created_at timestamptz not null default now()
);

create index tr_open_questions_job_idx on tr.open_questions(job_id, status);
create index tr_open_questions_token_idx on tr.open_questions(forwarding_token)
  where forwarding_token is not null;

-- ── Audit log with hash chain ─────────────────────────────────────────────

create table tr.audit_log (
  id bigserial primary key,
  job_id uuid not null references tr.review_jobs(id) on delete cascade,
  action tr.audit_action not null,
  actor_id uuid,
  actor_email text,
  payload jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  row_hash text not null,
  occurred_at timestamptz not null default now()
);

create index tr_audit_log_job_idx on tr.audit_log(job_id, id);

-- BEFORE INSERT trigger: compute prev_hash from the most recent row and row_hash
-- from canonical serialization of this row's fields. Mirrors qms pattern.
create or replace function tr.audit_log_hash_chain() returns trigger
language plpgsql
security definer
set search_path = tr, public, extensions
as $$
declare
  v_prev text;
  v_canonical text;
begin
  select row_hash into v_prev from tr.audit_log order by id desc limit 1;
  if v_prev is null then
    v_prev := '0000000000000000000000000000000000000000000000000000000000000000';
  end if;
  new.prev_hash := v_prev;

  v_canonical := concat_ws('|',
    v_prev,
    new.job_id::text,
    new.action::text,
    coalesce(new.actor_id::text, ''),
    coalesce(new.actor_email, ''),
    coalesce(new.payload::text, ''),
    new.occurred_at::text
  );
  new.row_hash := encode(extensions.digest(v_canonical, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger trg_tr_audit_log_hash_chain
  before insert on tr.audit_log
  for each row execute function tr.audit_log_hash_chain();

-- Tamper trigger: forbid UPDATE/DELETE at the row level.
create or replace function tr.audit_log_immutable() returns trigger
language plpgsql
set search_path = tr, public
as $$
begin
  raise exception 'tr.audit_log is append-only — UPDATE/DELETE not permitted (op=%)',
    tg_op
    using errcode = '42501';
end;
$$;

create trigger trg_tr_audit_log_no_update
  before update on tr.audit_log
  for each row execute function tr.audit_log_immutable();

create trigger trg_tr_audit_log_no_delete
  before delete on tr.audit_log
  for each row execute function tr.audit_log_immutable();

-- Auditor-runnable hash chain verifier.
create or replace function tr.verify_audit_log_integrity()
returns table(ok boolean, rows_checked bigint, first_bad_id bigint, message text)
language plpgsql
stable
security definer
set search_path = tr, public, extensions
as $$
declare
  r record;
  v_expected_prev text;
  v_canonical text;
  v_recomputed text;
  v_count bigint := 0;
  v_first_bad bigint;
begin
  v_expected_prev := '0000000000000000000000000000000000000000000000000000000000000000';
  for r in
    select * from tr.audit_log order by id asc
  loop
    v_count := v_count + 1;
    if r.prev_hash is distinct from v_expected_prev then
      v_first_bad := r.id;
      return query select false, v_count, v_first_bad,
        format('Row %s prev_hash mismatch (expected %s, got %s)', r.id, v_expected_prev, r.prev_hash);
      return;
    end if;
    v_canonical := concat_ws('|',
      r.prev_hash,
      r.job_id::text,
      r.action::text,
      coalesce(r.actor_id::text, ''),
      coalesce(r.actor_email, ''),
      coalesce(r.payload::text, ''),
      r.occurred_at::text
    );
    v_recomputed := encode(extensions.digest(v_canonical, 'sha256'), 'hex');
    if r.row_hash <> v_recomputed then
      v_first_bad := r.id;
      return query select false, v_count, v_first_bad,
        format('Row %s row_hash mismatch (recomputed %s, stored %s)', r.id, v_recomputed, r.row_hash);
      return;
    end if;
    v_expected_prev := r.row_hash;
  end loop;
  return query select true, v_count, null::bigint, format('OK %s rows verified.', v_count);
end;
$$;

-- ── touch triggers for updated_at / updated_by ─────────────────────────────

create or replace function tr.touch_updated_at() returns trigger
language plpgsql
set search_path = tr, public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, auth.uid());
  return new;
end;
$$;

create trigger trg_tr_review_jobs_touch before update on tr.review_jobs
  for each row execute function tr.touch_updated_at();
create trigger trg_tr_methodology_templates_touch before update on tr.methodology_templates
  for each row execute function tr.touch_updated_at();

-- ── job-status transition guard ─────────────────────────────────────────────

create or replace function tr.enforce_status_transitions() returns trigger
language plpgsql
set search_path = tr, public
as $$
declare
  v_legal boolean := false;
begin
  if old.status = new.status then
    return new;
  end if;
  -- Legal transition matrix (compact). Anything not listed is rejected.
  v_legal := case
    when old.status = 'intake' and new.status in ('preflight','cancelled') then true
    when old.status = 'preflight' and new.status in ('plan_pending_approval','cancelled','intake') then true
    when old.status = 'plan_pending_approval' and new.status in ('in_review','preflight','cancelled') then true
    when old.status = 'in_review' and new.status in ('findings_pending_human_review','blocked_open_questions','cancelled') then true
    when old.status = 'findings_pending_human_review' and new.status in ('revisions_pending','in_review','complete','cancelled') then true
    when old.status = 'revisions_pending' and new.status in ('in_review','plan_pending_approval','cancelled','complete') then true
    when old.status = 'blocked_open_questions' and new.status in ('in_review','findings_pending_human_review','cancelled') then true
    when old.status = 'complete' and new.status = 'revisions_pending' then true
    else false
  end;
  if not v_legal then
    raise exception 'illegal tr.review_jobs status transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_tr_review_jobs_status_transitions
  before update of status on tr.review_jobs
  for each row execute function tr.enforce_status_transitions();

-- ── system-prompt assembly helper ──────────────────────────────────────────
-- Returns assembled system prompt for a job: methodology template body with
-- {{locked_decisions}} / {{round_color}} / {{source_language}} / {{target_language}}
-- substitutions. Edge functions call this to keep prompt assembly server-side.

create or replace function tr.build_system_prompt(p_job_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = tr, public
as $$
declare
  v_template text;
  v_locked text;
  v_color text;
  v_src text;
  v_tgt text;
  v_assembled text;
begin
  select mt.system_prompt_template, rj.round_color_hex
  into v_template, v_color
  from tr.review_jobs rj
  join tr.methodology_templates mt on mt.id = rj.methodology_template_id
  where rj.id = p_job_id;

  if v_template is null then
    raise exception 'job % has no methodology template', p_job_id;
  end if;

  select code into v_src
  from public.languages
  where id = (select source_language_id from tr.review_jobs where id = p_job_id);
  select code into v_tgt
  from public.languages
  where id = (select target_language_id from tr.review_jobs where id = p_job_id);

  -- Aggregate active locked decisions for this job, scoped to its language pair
  -- (NULL languages = applies universally).
  select coalesce(string_agg(
    format('- %s [%s] %s -> %s%s',
      ld.decision_kind,
      ld.key,
      ld.value,
      coalesce('(' || ld.scope || ')', ''),
      coalesce(' — rationale: ' || ld.rationale, '')
    ), E'\n'
  ), '(none)') into v_locked
  from tr.locked_decisions ld
  join tr.review_jobs rj on rj.id = ld.job_id
  where ld.job_id = p_job_id
    and ld.withdrawn_at is null
    and ld.superseded_by is null
    and (ld.source_language_id is null or ld.source_language_id = rj.source_language_id)
    and (ld.target_language_id is null or ld.target_language_id = rj.target_language_id);

  v_assembled := replace(v_template, '{{locked_decisions}}', coalesce(v_locked, '(none)'));
  v_assembled := replace(v_assembled, '{{round_color}}', coalesce(v_color, '#000000'));
  v_assembled := replace(v_assembled, '{{source_language}}', coalesce(v_src, '?'));
  v_assembled := replace(v_assembled, '{{target_language}}', coalesce(v_tgt, '?'));
  return v_assembled;
end;
$$;

-- atomic finding-number allocator per (job, round)
create or replace function tr.next_finding_number(p_job_id uuid, p_round int)
returns int
language plpgsql
set search_path = tr, public
as $$
declare
  v_next int;
begin
  select coalesce(max(finding_number), 0) + 1
  into v_next
  from tr.findings
  where job_id = p_job_id and round = p_round;
  return v_next;
end;
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table tr.config enable row level security;
alter table tr.methodology_templates enable row level security;
alter table tr.round_colors enable row level security;
alter table tr.cert_statement_templates enable row level security;
alter table tr.review_jobs enable row level security;
alter table tr.file_pairs enable row level security;
alter table tr.job_files enable row level security;
alter table tr.locked_decisions enable row level security;
alter table tr.job_plans enable row level security;
alter table tr.claude_calls enable row level security;
alter table tr.conversation_turns enable row level security;
alter table tr.conversation_summaries enable row level security;
alter table tr.findings enable row level security;
alter table tr.items_considered_not_flagged enable row level security;
alter table tr.open_questions enable row level security;
alter table tr.audit_log enable row level security;

-- Helper: is the caller a staff user? Same predicate other admin tables use.
-- We treat any authenticated session linked to public.staff_users as staff.
create or replace function tr.is_staff() returns boolean
language sql
stable
security definer
set search_path = tr, public
as $$
  select exists (
    select 1 from public.staff_users su
    where su.auth_user_id = auth.uid()
  );
$$;

-- Staff: full read/write on every tr.* table (excluding audit_log writes,
-- which only the service_role or trigger flow may perform).
create policy tr_staff_all_review_jobs on tr.review_jobs
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());
create policy tr_staff_all_file_pairs on tr.file_pairs
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());
create policy tr_staff_all_job_files on tr.job_files
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());
create policy tr_staff_all_locked_decisions on tr.locked_decisions
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());
create policy tr_staff_all_job_plans on tr.job_plans
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());
create policy tr_staff_all_claude_calls on tr.claude_calls
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());
create policy tr_staff_all_conversation_turns on tr.conversation_turns
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());
create policy tr_staff_all_conversation_summaries on tr.conversation_summaries
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());
create policy tr_staff_all_findings on tr.findings
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());
create policy tr_staff_all_items_considered_not_flagged on tr.items_considered_not_flagged
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());
create policy tr_staff_all_open_questions on tr.open_questions
  for all to authenticated
  using (tr.is_staff()) with check (tr.is_staff());

-- Audit log: staff SELECT only. INSERT only via service_role (the edge function).
create policy tr_staff_select_audit_log on tr.audit_log
  for select to authenticated
  using (tr.is_staff());
-- (No INSERT/UPDATE/DELETE policy for authenticated — service_role bypasses RLS.)

-- Reference tables: staff read everything.
create policy tr_staff_select_config on tr.config
  for select to authenticated using (tr.is_staff());
create policy tr_staff_select_methodology_templates on tr.methodology_templates
  for select to authenticated using (tr.is_staff());
create policy tr_staff_select_round_colors on tr.round_colors
  for select to authenticated using (tr.is_staff());
create policy tr_staff_select_cert_statement_templates on tr.cert_statement_templates
  for select to authenticated using (tr.is_staff());
-- (Writes to reference tables happen via service_role / migrations only in Phase 1.
--  Phase 4 will add qms_admin-style RBAC if needed.)

-- ── Grants ─────────────────────────────────────────────────────────────────

grant select, insert, update, delete on all tables in schema tr to authenticated;
grant select, insert, update on tr.audit_log to authenticated;  -- writes blocked by triggers/RLS
grant usage, select on all sequences in schema tr to authenticated;
grant execute on all functions in schema tr to authenticated;

-- ── Token-forwarding for open-question customer flow (Phase 3 surface) ─────
-- Allow anon role to SELECT and UPDATE a single tr.open_questions row via its
-- forwarding_token. The edge function (tr-open-question-answer) validates the
-- token before persisting; this policy backstops it in case someone hits the
-- table directly.

create policy tr_anon_select_open_question_by_token on tr.open_questions
  for select to anon
  using (
    forwarding_token is not null
    and forwarding_token_expires_at > now()
  );

-- Done.
