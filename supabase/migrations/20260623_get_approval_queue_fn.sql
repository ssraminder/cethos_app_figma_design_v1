-- Fix: the recruitment-approval-queue edge fn (service_role) could not read
-- cvp_approval_queue because the view chains into cvp_application_iso_evidence
-- (security_invoker = true) -> qms.competence_evidence, which service_role
-- cannot SELECT. Rather than broaden service_role's grants on the locked-down
-- qms schema, expose the read through a SECURITY DEFINER function that runs as
-- the owner (postgres) and is EXECUTE-able only by service_role.
ALTER VIEW public.cvp_approval_queue SET (security_invoker = false);

CREATE OR REPLACE FUNCTION public.get_approval_queue()
RETURNS SETOF public.cvp_approval_queue
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, qms, extensions
AS $$
  SELECT * FROM public.cvp_approval_queue WHERE bucket IN ('ready','need_info');
$$;

REVOKE ALL ON FUNCTION public.get_approval_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_approval_queue() TO service_role;
