-- Read-only public view over qms.assignment_eligibility_events for the
-- qms-auto-qualify edge function (PostgREST does not expose the qms schema).
-- Service-role only: anon/authenticated grants revoked.
CREATE VIEW public.qms_assignment_eligibility_events_v AS
  SELECT id, vendor_id, performed_at, eligible, reason, required_role, call_site
  FROM qms.assignment_eligibility_events;

REVOKE ALL ON public.qms_assignment_eligibility_events_v FROM anon, authenticated;
