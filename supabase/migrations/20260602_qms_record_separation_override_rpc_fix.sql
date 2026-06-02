-- Followup fix for the R22 override RPC:
-- 1. Drop the old function (initial signature had source/target_language_code
--    columns that don't exist in qms.assignment_eligibility_events — actual
--    columns are *_id; the helper now ignores those args).
-- 2. Switch the return type from uuid to bigint (assignment_eligibility_events.id
--    is bigserial, not uuid).
DROP FUNCTION IF EXISTS public.qms_record_separation_override(uuid, uuid, text, text, text, uuid, uuid, integer, text, text);

CREATE OR REPLACE FUNCTION public.qms_record_separation_override(
  p_vendor_id uuid,
  p_service_id uuid,
  p_source_language_code text,    -- ignored; signature retained for compat
  p_target_language_code text,    -- ignored
  p_call_site text,
  p_order_id uuid,
  p_workflow_step_id uuid,
  p_conflicting_step_number integer,
  p_conflicting_step_name text,
  p_override_reason text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qms, public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO qms.assignment_eligibility_events (
    vendor_id, service_id, call_site, order_id, workflow_step_id,
    eligible, reason, required_role, gating_mode, override_reason
  )
  VALUES (
    p_vendor_id, p_service_id, p_call_site, p_order_id, p_workflow_step_id,
    false,
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
