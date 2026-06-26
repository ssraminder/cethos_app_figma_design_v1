-- Lightweight, append-only correspondence/updates log for complaints & NCs.
-- Records the handling thread (internal notes, replies we sent the client, client
-- responses). The actual client emails live on the linked order's Client
-- Communications; this is the tracker thread, not a helpdesk.
CREATE TABLE IF NOT EXISTS qms.quality_updates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_kind text NOT NULL CHECK (parent_kind IN ('complaint','nonconformity')),
  parent_id   uuid NOT NULL,
  entry_type  text NOT NULL DEFAULT 'internal_note'
              CHECK (entry_type IN ('internal_note','reply_to_client','client_response')),
  body        text NOT NULL,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quality_updates_parent_idx
  ON qms.quality_updates(parent_kind, parent_id, created_at);

-- Append a correspondence/update entry.
CREATE OR REPLACE FUNCTION public.qms_add_update(p_kind text, p_id uuid, p_entry_type text, p_body text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'qms','public'
AS $function$
declare v_id uuid;
begin
  if coalesce(btrim(p_body),'') = '' then raise exception 'qms_add_update: body required'; end if;
  insert into qms.quality_updates(parent_kind, parent_id, entry_type, body, created_by)
  values (p_kind, p_id, coalesce(p_entry_type,'internal_note'), p_body, p_actor)
  returning id into v_id;
  return (select to_jsonb(u) from qms.quality_updates u where u.id=v_id);
end $function$;

-- List the correspondence/updates thread for a complaint or NC (chronological).
CREATE OR REPLACE FUNCTION public.qms_list_updates(p_kind text, p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'qms','public'
AS $function$
begin
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) from (
    select u.id, u.parent_kind, u.entry_type, u.body, u.created_at,
           s.full_name as created_by_name
    from qms.quality_updates u
    left join public.staff_users s on s.id = u.created_by
    where u.parent_kind = p_kind and u.parent_id = p_id
  ) x);
end $function$;

GRANT EXECUTE ON FUNCTION public.qms_add_update(text,uuid,text,text,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qms_list_updates(text,uuid) TO anon, authenticated, service_role;
