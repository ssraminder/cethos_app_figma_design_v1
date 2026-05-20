-- ============================================================================
-- CRUD RPCs for comms.sms_templates so staff can manage presets from the UI.
-- All staff-gated via comms.is_staff().
-- ============================================================================

-- Lists EVERY template (active + inactive, but not soft-deleted).
-- Distinct from comms_list_sms_templates() which only returns active ones for
-- the composer dropdown.
create or replace function public.comms_list_all_sms_templates()
  returns table(
    id uuid,
    key text,
    label text,
    body text,
    variables text[],
    generates_upload_token boolean,
    active boolean,
    created_at timestamptz,
    updated_at timestamptz
  )
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
    select t.id, t.key, t.label, t.body, t.variables, t.generates_upload_token,
           t.active, t.created_at, t.updated_at
      from comms.sms_templates t
      where t.deleted_at is null
      order by t.active desc, t.label;
end;
$$;

create or replace function public.comms_create_sms_template(
  p_key text,
  p_label text,
  p_body text,
  p_variables text[],
  p_generates_upload_token boolean,
  p_active boolean
) returns uuid
  language plpgsql
  security definer
  set search_path = comms, public
as $$
declare
  v_id uuid;
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'key_required' using errcode = '23502';
  end if;
  if p_label is null or length(trim(p_label)) = 0 then
    raise exception 'label_required' using errcode = '23502';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'body_required' using errcode = '23502';
  end if;
  insert into comms.sms_templates (key, label, body, variables, generates_upload_token, active)
  values (
    lower(trim(p_key)),
    trim(p_label),
    p_body,
    coalesce(p_variables, '{}'::text[]),
    coalesce(p_generates_upload_token, false),
    coalesce(p_active, true)
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.comms_update_sms_template(
  p_id uuid,
  p_label text,
  p_body text,
  p_variables text[],
  p_generates_upload_token boolean,
  p_active boolean
) returns void
  language plpgsql
  security definer
  set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  update comms.sms_templates
    set label = coalesce(trim(p_label), label),
        body = coalesce(p_body, body),
        variables = coalesce(p_variables, variables),
        generates_upload_token = coalesce(p_generates_upload_token, generates_upload_token),
        active = coalesce(p_active, active)
    where id = p_id and deleted_at is null;
  if not found then
    raise exception 'template_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.comms_soft_delete_sms_template(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = comms, public
as $$
begin
  if not (comms.is_staff() or auth.role() = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  update comms.sms_templates
    set deleted_at = now(), active = false
    where id = p_id and deleted_at is null;
end;
$$;

grant execute on function public.comms_list_all_sms_templates() to authenticated, service_role;
grant execute on function public.comms_create_sms_template(text,text,text,text[],boolean,boolean) to authenticated, service_role;
grant execute on function public.comms_update_sms_template(uuid,text,text,text[],boolean,boolean) to authenticated, service_role;
grant execute on function public.comms_soft_delete_sms_template(uuid) to authenticated, service_role;
