-- ============================================================================
-- CAPA + Complaint handling (ISO 17100 §4.6 / IQVIA "CAPA Management & Complaints
-- Handling"). Adds the nonconformity + corrective/preventive-action layer on top
-- of the existing qms.performance_events monitoring spine, plus a tamper-evident,
-- append-only event log mirroring qms.qualification_audit_log.
--
-- Access model: qms schema is NOT exposed over PostgREST. All reads/writes go
-- through SECURITY DEFINER edge functions (service_role). RLS is enabled with no
-- authenticated policy (deny-all to authenticated; service_role bypasses RLS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Atomic numbering (never count(*)+1 — see fix_application_number_count_collision)
-- ---------------------------------------------------------------------------
create sequence if not exists qms.seq_complaint_number;
create sequence if not exists qms.seq_nonconformity_number;
create sequence if not exists qms.seq_capa_number;

create or replace function public.qms_next_quality_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = qms, public
as $fn$
declare
  n bigint;
  y text := to_char(now(), 'YYYY');
begin
  if p_prefix = 'CMP' then
    n := nextval('qms.seq_complaint_number');
  elsif p_prefix = 'NC' then
    n := nextval('qms.seq_nonconformity_number');
  elsif p_prefix = 'CAPA' then
    n := nextval('qms.seq_capa_number');
  else
    raise exception 'unknown quality number prefix: %', p_prefix;
  end if;
  return p_prefix || '-' || y || '-' || lpad(n::text, 5, '0');
end
$fn$;

revoke execute on function public.qms_next_quality_number(text) from public, anon, authenticated;
grant execute on function public.qms_next_quality_number(text) to service_role;

-- ---------------------------------------------------------------------------
-- quality_complaints — client / internal quality complaint intake (ISO §4.6)
-- ---------------------------------------------------------------------------
create table qms.quality_complaints (
  id uuid primary key default gen_random_uuid(),
  complaint_number text unique not null,
  source text not null default 'client',            -- client | internal_qa | reviser | pm | audit | other
  received_at timestamptz not null default now(),
  received_via text,                                 -- email | phone | portal | meeting | other
  complainant_name text,
  complainant_email text,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  step_id uuid references public.order_workflow_steps(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  role_qualification_id uuid references qms.role_qualifications(id) on delete set null,
  category text,                                     -- accuracy | terminology | formatting | timeliness | confidentiality | service | other
  severity qms.severity not null default 'medium',
  summary text not null,
  detail text,
  status text not null default 'new'
    check (status in ('new','triaged','linked_nc','resolved','closed_no_action')),
  triaged_by uuid references public.staff_users(id),
  triaged_at timestamptz,
  resolution_note text,
  resolved_by uuid references public.staff_users(id),
  resolved_at timestamptz,
  nonconformity_id uuid,                             -- FK added after nonconformities exists
  created_by uuid references public.staff_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quality_complaints_status_idx on qms.quality_complaints (status, received_at desc);
create index quality_complaints_vendor_idx on qms.quality_complaints (vendor_id, received_at desc) where vendor_id is not null;
create index quality_complaints_order_idx on qms.quality_complaints (order_id) where order_id is not null;

-- ---------------------------------------------------------------------------
-- nonconformities — the documented problem (mirrors SOP VM-001 §9 language)
-- ---------------------------------------------------------------------------
create table qms.nonconformities (
  id uuid primary key default gen_random_uuid(),
  nc_number text unique not null,
  title text not null,
  description text,
  source text not null,                              -- complaint | revision_finding | late_delivery | internal_audit | quality_issue | other
  source_complaint_id uuid references qms.quality_complaints(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  role_qualification_id uuid references qms.role_qualifications(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  step_id uuid references public.order_workflow_steps(id) on delete set null,
  severity qms.severity not null default 'medium',
  discovered_at timestamptz not null default now(),
  discovered_by uuid references public.staff_users(id),
  root_cause text,
  root_cause_method text,                            -- 5_whys | fishbone | other
  root_cause_at timestamptz,
  root_cause_by uuid references public.staff_users(id),
  status text not null default 'open'
    check (status in ('open','investigating','capa_planned','capa_in_progress','verifying','closed')),
  closure_summary text,
  closed_at timestamptz,
  closed_by uuid references public.staff_users(id),
  created_by uuid references public.staff_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index nonconformities_status_idx on qms.nonconformities (status, discovered_at desc);
create index nonconformities_vendor_idx on qms.nonconformities (vendor_id, discovered_at desc) where vendor_id is not null;
create index nonconformities_role_qual_idx on qms.nonconformities (role_qualification_id) where role_qualification_id is not null;
create index nonconformities_complaint_idx on qms.nonconformities (source_complaint_id) where source_complaint_id is not null;

alter table qms.quality_complaints
  add constraint quality_complaints_nonconformity_fk
  foreign key (nonconformity_id) references qms.nonconformities(id) on delete set null;

-- ---------------------------------------------------------------------------
-- capa_actions — corrective + preventive actions under a nonconformity
-- ---------------------------------------------------------------------------
create table qms.capa_actions (
  id uuid primary key default gen_random_uuid(),
  capa_number text unique not null,
  nonconformity_id uuid not null references qms.nonconformities(id) on delete restrict,
  action_type text not null check (action_type in ('correction','corrective','preventive')),
  description text not null,
  owner_staff_id uuid references public.staff_users(id),
  due_date date,
  status text not null default 'open'
    check (status in ('open','in_progress','done','verified','cancelled')),
  completed_at timestamptz,
  completed_by uuid references public.staff_users(id),
  effectiveness_due date,
  effectiveness_result text check (effectiveness_result in ('pending','effective','not_effective')),
  effectiveness_checked_at timestamptz,
  effectiveness_checked_by uuid references public.staff_users(id),
  effectiveness_note text,
  created_by uuid references public.staff_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index capa_actions_nc_idx on qms.capa_actions (nonconformity_id);
create index capa_actions_status_idx on qms.capa_actions (status, due_date);
create index capa_actions_owner_idx on qms.capa_actions (owner_staff_id) where owner_staff_id is not null;

-- ---------------------------------------------------------------------------
-- quality_event_log — append-only, hash-chained (copy of the qualification log
-- pattern: REVOKE + no-mutate trigger + sha256 chain + verify fn).
-- ---------------------------------------------------------------------------
create table qms.quality_event_log (
  id bigserial primary key,
  entity_type text not null check (entity_type in ('complaint','nonconformity','capa_action')),
  entity_id uuid not null,
  action text not null,
  prior_status text,
  new_status text,
  vendor_id uuid,
  payload jsonb,
  performed_by uuid references auth.users(id),
  performed_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  prev_hash text,
  row_hash text not null
);
comment on table qms.quality_event_log is 'Append-only audit log for complaints/nonconformities/CAPA. Same three-layer tamper resistance as qms.qualification_audit_log. Verify with qms.verify_quality_log_integrity().';
create index quality_event_log_entity_idx on qms.quality_event_log (entity_type, entity_id, performed_at desc);
create index quality_event_log_vendor_idx on qms.quality_event_log (vendor_id, performed_at desc) where vendor_id is not null;

create or replace function qms.quality_log_hash_chain()
returns trigger language plpgsql as $fn$
declare v_prev text; v_canon text;
begin
  select row_hash into v_prev from qms.quality_event_log order by id desc limit 1;
  new.prev_hash := coalesce(v_prev, repeat('0', 64));
  v_canon := concat_ws('|',
    new.prev_hash, new.entity_type, new.entity_id::text, new.action,
    coalesce(new.prior_status,''), coalesce(new.new_status,''),
    coalesce(new.vendor_id::text,''), coalesce(new.payload::text,''),
    coalesce(new.performed_by::text,''), new.performed_at::text,
    coalesce(new.ip_address::text,''), coalesce(new.user_agent,''));
  new.row_hash := encode(extensions.digest(v_canon, 'sha256'), 'hex');
  return new;
end
$fn$;
create trigger trg_quality_log_hash_chain
  before insert on qms.quality_event_log
  for each row execute function qms.quality_log_hash_chain();

create or replace function qms.quality_log_no_mutate()
returns trigger language plpgsql as $fn$
begin
  raise exception 'qms.quality_event_log is append-only. UPDATE and DELETE are prohibited.'
    using errcode = 'insufficient_privilege';
end
$fn$;
create trigger trg_quality_log_no_update before update on qms.quality_event_log
  for each row execute function qms.quality_log_no_mutate();
create trigger trg_quality_log_no_delete before delete on qms.quality_event_log
  for each row execute function qms.quality_log_no_mutate();

revoke update, delete, truncate on qms.quality_event_log from public;
revoke update, delete, truncate on qms.quality_event_log from authenticated;
revoke update, delete, truncate on qms.quality_event_log from anon;
revoke update, delete, truncate on qms.quality_event_log from service_role;

create or replace function qms.verify_quality_log_integrity()
returns table (ok boolean, rows_checked bigint, first_bad_id bigint, message text)
language plpgsql stable security definer set search_path = qms, public as $fn$
declare
  r record; v_expected_prev text; v_canon text; v_recomputed text;
  v_count bigint := 0; v_first_bad bigint;
begin
  v_expected_prev := repeat('0', 64);
  for r in select * from qms.quality_event_log order by id asc loop
    v_count := v_count + 1;
    if r.prev_hash is distinct from v_expected_prev then
      return query select false, v_count, r.id,
        format('Row %s prev_hash mismatch', r.id);
      return;
    end if;
    v_canon := concat_ws('|',
      r.prev_hash, r.entity_type, r.entity_id::text, r.action,
      coalesce(r.prior_status,''), coalesce(r.new_status,''),
      coalesce(r.vendor_id::text,''), coalesce(r.payload::text,''),
      coalesce(r.performed_by::text,''), r.performed_at::text,
      coalesce(r.ip_address::text,''), coalesce(r.user_agent,''));
    v_recomputed := encode(extensions.digest(v_canon, 'sha256'), 'hex');
    if r.row_hash <> v_recomputed then
      return query select false, v_count, r.id,
        format('Row %s row_hash mismatch', r.id);
      return;
    end if;
    v_expected_prev := r.row_hash;
  end loop;
  return query select true, v_count, null::bigint, format('OK — %s rows verified.', v_count);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Auto-logging triggers — every insert/update on the three operational tables
-- writes an immutable row to quality_event_log. performed_by is resolved from a
-- staff_users.id to its auth.users.id via qms_resolve_actor (raw staff id would
-- violate the auth.users FK and roll the write back).
-- ---------------------------------------------------------------------------
create or replace function qms.log_quality_entity_change()
returns trigger language plpgsql security definer set search_path = qms, public as $fn$
declare
  v_entity text := tg_argv[0];
  v_actor uuid;
  v_action text;
  v_prior text;
  v_new text;
  v_vendor uuid;
  v_new_j jsonb := to_jsonb(new);
begin
  v_actor := qms_resolve_actor(
    coalesce((v_new_j->>'updated_by')::uuid, (v_new_j->>'created_by')::uuid,
             (v_new_j->>'discovered_by')::uuid, (v_new_j->>'owner_staff_id')::uuid));
  v_new := v_new_j->>'status';
  v_vendor := (v_new_j->>'vendor_id')::uuid;
  if tg_op = 'INSERT' then
    v_action := 'created';
    v_prior := null;
  else
    v_prior := to_jsonb(old)->>'status';
    v_action := case when v_prior is distinct from v_new then 'status_change' else 'updated' end;
  end if;
  insert into qms.quality_event_log
    (entity_type, entity_id, action, prior_status, new_status, vendor_id, payload, performed_by)
  values
    (v_entity, new.id, v_action, v_prior, v_new, v_vendor,
     jsonb_build_object('table', tg_table_name, 'number',
       coalesce(v_new_j->>'complaint_number', v_new_j->>'nc_number', v_new_j->>'capa_number')),
     v_actor);
  return new;
end
$fn$;

create trigger trg_quality_complaints_log
  after insert or update on qms.quality_complaints
  for each row execute function qms.log_quality_entity_change('complaint');
create trigger trg_nonconformities_log
  after insert or update on qms.nonconformities
  for each row execute function qms.log_quality_entity_change('nonconformity');
create trigger trg_capa_actions_log
  after insert or update on qms.capa_actions
  for each row execute function qms.log_quality_entity_change('capa_action');

-- ---------------------------------------------------------------------------
-- RLS: enable on all four tables, grant to service_role only (UI uses edge fns).
-- ---------------------------------------------------------------------------
alter table qms.quality_complaints enable row level security;
alter table qms.nonconformities enable row level security;
alter table qms.capa_actions enable row level security;
alter table qms.quality_event_log enable row level security;

grant all on qms.quality_complaints to service_role;
grant all on qms.nonconformities to service_role;
grant all on qms.capa_actions to service_role;
grant select, insert on qms.quality_event_log to service_role;
grant usage on sequence qms.seq_complaint_number to service_role;
grant usage on sequence qms.seq_nonconformity_number to service_role;
grant usage on sequence qms.seq_capa_number to service_role;
grant usage, select on sequence qms.quality_event_log_id_seq to service_role;
