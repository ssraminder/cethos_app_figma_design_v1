-- ============================================================================
-- public RPC proxies for the comms schema, gated by comms.is_staff()
--
-- The comms schema isn't exposed via PostgREST. These wrappers let the admin
-- UI (supabase-js .rpc(...)) and edge functions reach the underlying tables
-- through a security-definer surface. Every authenticated entrypoint checks
-- comms.is_staff() so customer-portal sessions can't read call logs.
-- ============================================================================

-- ---- Service-only: called by rc-sync-calls / rc-webhook / rc-send-sms -----

create or replace function public.comms_upsert_call_log(
  p_rc_session_id text,
  p_rc_telephony_session_id text,
  p_rc_party_id text,
  p_direction text,
  p_from_number text,
  p_from_name text,
  p_to_number text,
  p_to_name text,
  p_rc_extension_id text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_sec integer,
  p_result text,
  p_recording_id text,
  p_recording_url text,
  p_raw jsonb
) returns uuid
  language plpgsql
  security definer
  set search_path = comms, public
as $$
declare
  v_id uuid;
  v_staff_id uuid;
  v_customer_id uuid;
  v_source text;
  v_source_row uuid;
  v_lookup_phone text;
begin
  select id into v_staff_id from public.staff_users
    where rc_extension_id = p_rc_extension_id and p_rc_extension_id is not null
    limit 1;

  v_lookup_phone := case
    when p_direction = 'Inbound' then p_from_number
    when p_direction = 'Outbound' then p_to_number
    else p_from_number
  end;
  select customer_id, source, source_row_id into v_customer_id, v_source, v_source_row
    from comms.find_customer_by_phone(v_lookup_phone);

  insert into comms.call_logs (
    rc_session_id, rc_telephony_session_id, rc_party_id,
    direction, from_number, from_name, to_number, to_name,
    rc_extension_id, staff_user_id,
    customer_id, matched_source, matched_source_row_id,
    started_at, ended_at, duration_sec, result,
    recording_id, recording_url, has_recording, raw
  ) values (
    p_rc_session_id, p_rc_telephony_session_id, p_rc_party_id,
    p_direction, p_from_number, p_from_name, p_to_number, p_to_name,
    p_rc_extension_id, v_staff_id,
    v_customer_id, v_source, v_source_row,
    p_started_at, p_ended_at, p_duration_sec, p_result,
    p_recording_id, p_recording_url, p_recording_id is not null, p_raw
  )
  on conflict (rc_session_id) do update set
    rc_telephony_session_id = excluded.rc_telephony_session_id,
    rc_party_id = excluded.rc_party_id,
    direction = excluded.direction,
    from_number = excluded.from_number,
    from_name = excluded.from_name,
    to_number = excluded.to_number,
    to_name = excluded.to_name,
    rc_extension_id = excluded.rc_extension_id,
    staff_user_id = coalesce(comms.call_logs.staff_user_id, excluded.staff_user_id),
    customer_id = coalesce(comms.call_logs.customer_id, excluded.customer_id),
    matched_source = coalesce(comms.call_logs.matched_source, excluded.matched_source),
    matched_source_row_id = coalesce(comms.call_logs.matched_source_row_id, excluded.matched_source_row_id),
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    duration_sec = excluded.duration_sec,
    result = excluded.result,
    recording_id = excluded.recording_id,
    recording_url = excluded.recording_url,
    has_recording = excluded.has_recording,
    raw = excluded.raw
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.comms_log_sms(
  p_template_id uuid,
  p_template_key text,
  p_to_number text,
  p_from_number text,
  p_body text,
  p_variables jsonb,
  p_staff_user_id uuid,
  p_customer_id uuid,
  p_call_log_id uuid,
  p_upload_token text,
  p_rc_message_id text,
  p_status text,
  p_error text
) returns uuid
  language plpgsql
  security definer
  set search_path = comms, public
as $$
declare
  v_id uuid;
begin
  insert into comms.sms_messages (
    template_id, template_key, to_number, from_number, body, variables,
    staff_user_id, customer_id, call_log_id, upload_token, rc_message_id,
    status, error, sent_at
  ) values (
    p_template_id, p_template_key, p_to_number, p_from_number, p_body, p_variables,
    p_staff_user_id, p_customer_id, p_call_log_id, p_upload_token, p_rc_message_id,
    p_status, p_error, case when p_status in ('sent','delivered') then now() else null end
  ) returning id into v_id;
  return v_id;
end;
$$;

-- ---- Staff-callable: gated by comms.is_staff() ----------------------------

create or replace function public.comms_list_call_logs(
  p_limit integer default 50,
  p_offset integer default 0,
  p_direction text default null,
  p_customer_id uuid default null,
  p_staff_user_id uuid default null,
  p_search text default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null
) returns table(
  id uuid, rc_session_id text, direction text,
  from_number text, from_number_e164 text, from_name text,
  to_number text, to_number_e164 text, to_name text,
  staff_user_id uuid, staff_full_name text,
  customer_id uuid, customer_company_name text, customer_email text,
  started_at timestamptz, duration_sec integer, result text,
  has_recording boolean, note_count bigint, total_count bigint
) language plpgsql
  stable
  security definer
  set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  with q as (
    select cl.*,
      su.full_name as staff_full_name,
      c.company_name as customer_company_name,
      c.email as customer_email,
      (select count(*) from comms.call_notes cn where cn.call_log_id = cl.id and cn.deleted_at is null) as note_count
    from comms.call_logs cl
    left join public.staff_users su on su.id = cl.staff_user_id
    left join public.customers c on c.id = cl.customer_id
    where (p_direction is null or cl.direction = p_direction)
      and (p_customer_id is null or cl.customer_id = p_customer_id)
      and (p_staff_user_id is null or cl.staff_user_id = p_staff_user_id)
      and (p_from_date is null or cl.started_at >= p_from_date)
      and (p_to_date is null or cl.started_at <= p_to_date)
      and (
        p_search is null
        or cl.from_number_e164 like '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'
        or cl.to_number_e164 like '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'
        or cl.from_name ilike '%' || p_search || '%'
        or cl.to_name ilike '%' || p_search || '%'
        or c.company_name ilike '%' || p_search || '%'
        or c.email ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select *, count(*) over () as total_count from q
  )
  select c2.id, c2.rc_session_id, c2.direction, c2.from_number, c2.from_number_e164, c2.from_name,
    c2.to_number, c2.to_number_e164, c2.to_name, c2.staff_user_id, c2.staff_full_name,
    c2.customer_id, c2.customer_company_name, c2.customer_email,
    c2.started_at, c2.duration_sec, c2.result, c2.has_recording, c2.note_count, c2.total_count
  from counted c2
  order by c2.started_at desc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.comms_get_call_detail(p_call_id uuid)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = comms, public
as $$
declare
  v_result jsonb;
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'call', to_jsonb(cl) ||
      jsonb_build_object(
        'staff_full_name', su.full_name,
        'customer_company_name', c.company_name,
        'customer_email', c.email
      ),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cn.id,
        'body', cn.body,
        'staff_user_id', cn.staff_user_id,
        'staff_full_name', su2.full_name,
        'created_at', cn.created_at,
        'updated_at', cn.updated_at
      ) order by cn.created_at desc)
      from comms.call_notes cn
      left join public.staff_users su2 on su2.id = cn.staff_user_id
      where cn.call_log_id = cl.id and cn.deleted_at is null
    ), '[]'::jsonb),
    'recent_sms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sm.id, 'to_number', sm.to_number, 'body', sm.body,
        'status', sm.status, 'sent_at', sm.sent_at, 'template_key', sm.template_key
      ) order by sm.created_at desc)
      from comms.sms_messages sm
      where sm.call_log_id = cl.id
        or (cl.customer_id is not null and sm.customer_id = cl.customer_id)
      limit 10
    ), '[]'::jsonb)
  ) into v_result
  from comms.call_logs cl
  left join public.staff_users su on su.id = cl.staff_user_id
  left join public.customers c on c.id = cl.customer_id
  where cl.id = p_call_id;
  return v_result;
end;
$$;

create or replace function public.comms_add_call_note(
  p_call_id uuid,
  p_staff_user_id uuid,
  p_body text
) returns uuid
  language plpgsql
  security definer
  set search_path = comms, public
as $$
declare
  v_id uuid;
  v_customer uuid;
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select customer_id into v_customer from comms.call_logs where id = p_call_id;
  insert into comms.call_notes (call_log_id, staff_user_id, customer_id, body)
  values (p_call_id, p_staff_user_id, v_customer, p_body)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.comms_link_customer(
  p_call_id uuid,
  p_customer_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  update comms.call_logs
    set customer_id = p_customer_id,
        matched_source = case when p_customer_id is null then null else 'manual' end,
        matched_source_row_id = case when p_customer_id is null then null else p_customer_id end
    where id = p_call_id;
end;
$$;

create or replace function public.comms_list_sms_templates()
  returns table(id uuid, key text, label text, body text, variables text[], generates_upload_token boolean)
  language plpgsql
  stable
  security definer
  set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
    select t.id, t.key, t.label, t.body, t.variables, t.generates_upload_token
      from comms.sms_templates t
      where t.active = true and t.deleted_at is null
      order by t.label;
end;
$$;

-- Permissions
revoke all on function public.comms_upsert_call_log(text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,integer,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.comms_log_sms(uuid,text,text,text,text,jsonb,uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.comms_upsert_call_log(text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,integer,text,text,text,jsonb) to service_role;
grant execute on function public.comms_log_sms(uuid,text,text,text,text,jsonb,uuid,uuid,uuid,text,text,text,text) to service_role;

grant execute on function public.comms_list_call_logs(integer,integer,text,uuid,uuid,text,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.comms_get_call_detail(uuid) to authenticated, service_role;
grant execute on function public.comms_add_call_note(uuid,uuid,text) to authenticated, service_role;
grant execute on function public.comms_link_customer(uuid,uuid) to authenticated, service_role;
grant execute on function public.comms_list_sms_templates() to authenticated, service_role;
