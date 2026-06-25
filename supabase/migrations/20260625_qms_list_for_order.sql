-- Read complaints + nonconformities (with CAPA summary) linked to an order, so
-- the order page can show a "Quality: Complaints & CAPA" trail. The qms schema
-- is not exposed over PostgREST, so this SECURITY DEFINER wrapper is the read
-- path (called via the quality-read edge function, action: list_for_order).
CREATE OR REPLACE FUNCTION public.qms_list_for_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'qms', 'public'
AS $function$
begin
  return jsonb_build_object(
    'complaints', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.received_at desc), '[]'::jsonb)
      from (
        select id, complaint_number, source, category, severity, status, summary, received_at, nonconformity_id
        from qms.quality_complaints where order_id = p_order_id
      ) c
    ),
    'nonconformities', (
      select coalesce(jsonb_agg(to_jsonb(n) order by n.discovered_at desc), '[]'::jsonb)
      from (
        select nn.id, nn.nc_number, nn.title, nn.source, nn.severity, nn.status, nn.discovered_at,
               (select count(*) from qms.capa_actions ca where ca.nonconformity_id = nn.id) as capa_count,
               (select coalesce(jsonb_agg(jsonb_build_object('capa_number', ca.capa_number, 'status', ca.status) order by ca.capa_number), '[]'::jsonb)
                  from qms.capa_actions ca where ca.nonconformity_id = nn.id) as capas
        from qms.nonconformities nn where nn.order_id = p_order_id
      ) n
    )
  );
end
$function$;

GRANT EXECUTE ON FUNCTION public.qms_list_for_order(uuid) TO anon, authenticated, service_role;
