-- ============================================================================
-- comms.* schema — RingCentral phone integration (call log, SMS, notes)
--
-- Surfaces inbound + outbound calls in the staff admin portal, lets staff
-- attach call notes and link callers to customer/order records, and sends
-- preset SMS messages (e.g. secure document-upload links) from the company
-- RingCentral number.
--
-- Twilio remains the system-SMS provider for OTPs and apostille reminders.
-- RingCentral is the customer-facing channel: same number the caller dialed.
-- ============================================================================

create schema if not exists comms;
grant usage on schema comms to authenticated, service_role;

-- ── staff_users: map to RingCentral identity ───────────────────────────────
alter table public.staff_users
  add column if not exists rc_extension_id text,
  add column if not exists rc_user_id text;

create index if not exists staff_users_rc_extension_id_idx
  on public.staff_users (rc_extension_id)
  where rc_extension_id is not null;

-- ── Phone normalization (E.164) ────────────────────────────────────────────
create or replace function comms.normalize_phone(p text) returns text
  language sql
  immutable
  set search_path = comms, public
as $$
  with d as (
    select case
      when p is null or length(trim(p)) = 0 then null
      else regexp_replace(trim(p), '[^0-9+]', '', 'g')
    end as v
  ),
  s as (
    select case
      when v is null then null
      when v like '+%' then '+' || regexp_replace(substring(v from 2), '[^0-9]', '', 'g')
      else regexp_replace(v, '[^0-9]', '', 'g')
    end as v
    from d
  )
  select case
    when v is null or v = '' then null
    when v like '+%' then v
    when length(v) = 10 then '+1' || v
    when length(v) = 11 and left(v, 1) = '1' then '+' || v
    else '+' || v
  end
  from s;
$$;

-- ── call_logs ──────────────────────────────────────────────────────────────
create table if not exists comms.call_logs (
  id uuid primary key default gen_random_uuid(),
  rc_session_id text not null,
  rc_telephony_session_id text,
  rc_party_id text,
  direction text not null check (direction in ('Inbound','Outbound')),
  from_number text,
  from_number_e164 text generated always as (comms.normalize_phone(from_number)) stored,
  from_name text,
  to_number text,
  to_number_e164 text generated always as (comms.normalize_phone(to_number)) stored,
  to_name text,
  rc_extension_id text,
  staff_user_id uuid references public.staff_users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  matched_source text,                                 -- 'customers' | 'cethosweb_quote_submissions' | 'public_submissions' | 'cvp_applications' | 'manual'
  matched_source_row_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_sec integer,
  result text,                                         -- 'Call connected' / 'Missed' / 'Voicemail' / ...
  recording_id text,
  recording_url text,                                  -- RC content URL (requires auth to fetch)
  has_recording boolean not null default false,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists call_logs_rc_session_unique
  on comms.call_logs (rc_session_id);
create index if not exists call_logs_started_at_idx
  on comms.call_logs (started_at desc);
create index if not exists call_logs_customer_id_idx
  on comms.call_logs (customer_id);
create index if not exists call_logs_staff_user_id_idx
  on comms.call_logs (staff_user_id);
create index if not exists call_logs_from_e164_idx
  on comms.call_logs (from_number_e164);
create index if not exists call_logs_to_e164_idx
  on comms.call_logs (to_number_e164);
create index if not exists call_logs_direction_started_idx
  on comms.call_logs (direction, started_at desc);

-- ── call_notes (one call → many notes) ─────────────────────────────────────
create table if not exists comms.call_notes (
  id uuid primary key default gen_random_uuid(),
  call_log_id uuid not null references comms.call_logs(id) on delete cascade,
  staff_user_id uuid references public.staff_users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists call_notes_call_log_id_idx
  on comms.call_notes (call_log_id) where deleted_at is null;
create index if not exists call_notes_customer_id_idx
  on comms.call_notes (customer_id) where deleted_at is null;

-- ── sms_templates ──────────────────────────────────────────────────────────
create table if not exists comms.sms_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  label text not null,
  body text not null,                                  -- supports {{variables}}
  variables text[] not null default '{}',
  generates_upload_token boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- partial unique respects soft delete (per repo convention — see memory)
create unique index if not exists sms_templates_key_unique
  on comms.sms_templates (key) where deleted_at is null;

-- ── sms_messages (audit + delivery log) ────────────────────────────────────
create table if not exists comms.sms_messages (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references comms.sms_templates(id) on delete set null,
  template_key text,
  to_number text not null,
  to_number_e164 text generated always as (comms.normalize_phone(to_number)) stored,
  from_number text not null,
  body text not null,
  variables jsonb,
  staff_user_id uuid references public.staff_users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  call_log_id uuid references comms.call_logs(id) on delete set null,
  upload_token text,                                   -- if template generated one
  rc_message_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','failed')),
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sms_messages_to_e164_idx
  on comms.sms_messages (to_number_e164);
create index if not exists sms_messages_customer_id_idx
  on comms.sms_messages (customer_id);
create index if not exists sms_messages_call_log_id_idx
  on comms.sms_messages (call_log_id);
create index if not exists sms_messages_sent_at_idx
  on comms.sms_messages (sent_at desc);

-- ── updated_at triggers ────────────────────────────────────────────────────
create or replace function comms.touch_updated_at() returns trigger
  language plpgsql
  set search_path = comms, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists call_logs_touch on comms.call_logs;
create trigger call_logs_touch before update on comms.call_logs
  for each row execute function comms.touch_updated_at();

drop trigger if exists call_notes_touch on comms.call_notes;
create trigger call_notes_touch before update on comms.call_notes
  for each row execute function comms.touch_updated_at();

drop trigger if exists sms_templates_touch on comms.sms_templates;
create trigger sms_templates_touch before update on comms.sms_templates
  for each row execute function comms.touch_updated_at();

drop trigger if exists sms_messages_touch on comms.sms_messages;
create trigger sms_messages_touch before update on comms.sms_messages
  for each row execute function comms.touch_updated_at();

-- ── RPC: find_customer_by_phone (used by auto-link in rc-sync-calls) ───────
create or replace function comms.find_customer_by_phone(p_phone text)
  returns table(customer_id uuid, source text, source_row_id uuid)
  language sql
  stable
  security definer
  set search_path = comms, public
as $$
  with norm as (select comms.normalize_phone(p_phone) as p)
  select c.id, 'customers'::text, c.id
    from public.customers c, norm
    where comms.normalize_phone(c.phone) = norm.p and norm.p is not null
  union all
  select ps.customer_id, 'public_submissions'::text, ps.id
    from public.public_submissions ps, norm
    where comms.normalize_phone(ps.phone) = norm.p
      and ps.customer_id is not null
      and norm.p is not null
  union all
  -- cethosweb_quote_submissions has no customer_id, so we bridge through email
  select c.id, 'cethosweb_quote_submissions'::text, sub.id
    from public.cethosweb_quote_submissions sub
    join public.customers c on lower(c.email) = lower(sub.email)
    cross join (select comms.normalize_phone(p_phone) as p) n
    where comms.normalize_phone(sub.phone) = n.p
      and n.p is not null
  limit 1;
$$;

grant execute on function comms.find_customer_by_phone(text) to authenticated, service_role;

-- ── is_staff() helper (mirrors tr.is_staff()) ──────────────────────────────
create or replace function comms.is_staff() returns boolean
  language sql
  stable
  security definer
  set search_path = comms, public
as $$
  select exists (
    select 1 from public.staff_users su where su.auth_user_id = auth.uid()
  );
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table comms.call_logs enable row level security;
alter table comms.call_notes enable row level security;
alter table comms.sms_templates enable row level security;
alter table comms.sms_messages enable row level security;

create policy comms_staff_all_call_logs on comms.call_logs
  for all to authenticated
  using (comms.is_staff()) with check (comms.is_staff());

create policy comms_staff_all_call_notes on comms.call_notes
  for all to authenticated
  using (comms.is_staff()) with check (comms.is_staff());

create policy comms_staff_select_sms_templates on comms.sms_templates
  for select to authenticated using (comms.is_staff());

create policy comms_staff_modify_sms_templates on comms.sms_templates
  for all to authenticated
  using (comms.is_staff()) with check (comms.is_staff());

create policy comms_staff_all_sms_messages on comms.sms_messages
  for all to authenticated
  using (comms.is_staff()) with check (comms.is_staff());

-- ── Seed: first SMS template ───────────────────────────────────────────────
insert into comms.sms_templates (key, label, body, variables, generates_upload_token, active)
values (
  'send_upload_link',
  'Send secure document upload link',
  'Hi {{first_name}}, this is {{staff_first_name}} from Cethos. You can securely upload your documents here: {{upload_url}} (expires in 24h). Reply STOP to opt out.',
  array['first_name','staff_first_name','upload_url'],
  true,
  true
)
on conflict do nothing;

insert into comms.sms_templates (key, label, body, variables, generates_upload_token, active)
values (
  'quote_ready',
  'Quote ready — view link',
  'Hi {{first_name}}, your Cethos quote is ready: {{quote_url}}. Reply to this number with questions.',
  array['first_name','quote_url'],
  false,
  true
)
on conflict do nothing;

insert into comms.sms_templates (key, label, body, variables, generates_upload_token, active)
values (
  'callback_request',
  'Callback acknowledgement',
  'Hi {{first_name}}, this is {{staff_first_name}} from Cethos. I tried calling — please reply with a good time to reach you.',
  array['first_name','staff_first_name'],
  false,
  true
)
on conflict do nothing;
