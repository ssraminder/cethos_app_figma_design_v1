-- R22: RPC the edge function calls to log §6.2 separation overrides into
-- qms.assignment_eligibility_events (the qms schema isn't directly writable
-- via the PostgREST `from("qms").*` shape in supabase-js).
CREATE OR REPLACE FUNCTION public.qms_record_separation_override(
  p_vendor_id uuid,
  p_service_id uuid,
  p_source_language_code text,
  p_target_language_code text,
  p_call_site text,
  p_order_id uuid,
  p_workflow_step_id uuid,
  p_conflicting_step_number integer,
  p_conflicting_step_name text,
  p_override_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qms, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO qms.assignment_eligibility_events (
    vendor_id, service_id, source_language_code, target_language_code,
    call_site, order_id, workflow_step_id, eligible, reason,
    required_role, gating_mode, override_reason
  )
  VALUES (
    p_vendor_id, p_service_id, p_source_language_code, p_target_language_code,
    p_call_site, p_order_id, p_workflow_step_id, false,
    format('§6.2 separation overridden — conflicts with step %s (%s)',
           p_conflicting_step_number, COALESCE(p_conflicting_step_name, '?')),
    NULL, 'warn', p_override_reason
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.qms_record_separation_override(uuid, uuid, text, text, text, uuid, uuid, integer, text, text)
  TO authenticated, service_role;
