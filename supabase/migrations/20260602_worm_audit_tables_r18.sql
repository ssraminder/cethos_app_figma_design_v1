-- R18: WORM (write-once read-many) constraints on audit-trail tables.
-- ISO 17100 §7.1 retention requires that the records auditors sample from
-- can't be silently destroyed. BEFORE DELETE trigger denies DELETE unless
-- the session is service_role (edge functions + admin migrations stay
-- functional). Authenticated app users + anon hit the deny path.
--
-- Applied to notification_log, order_workflow_steps, and
-- qms.assignment_eligibility_events — the three tables the Stage 2
-- auditor will sample first per the audit doc.

CREATE OR REPLACE FUNCTION public.enforce_worm_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (current_setting('request.jwt.claim.role', true) IN ('service_role')) OR
     (session_user IN ('postgres', 'supabase_admin')) THEN
    RAISE NOTICE 'WORM bypass on % by % (allowed)',
      TG_TABLE_NAME, COALESCE(session_user, '?');
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'WORM: DELETE on %.% is blocked for ISO 17100 §7.1 retention. Soft-delete or void via the application instead.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS worm_no_delete ON public.notification_log;
CREATE TRIGGER worm_no_delete
  BEFORE DELETE ON public.notification_log
  FOR EACH ROW EXECUTE FUNCTION public.enforce_worm_no_delete();

DROP TRIGGER IF EXISTS worm_no_delete ON public.order_workflow_steps;
CREATE TRIGGER worm_no_delete
  BEFORE DELETE ON public.order_workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.enforce_worm_no_delete();

DROP TRIGGER IF EXISTS worm_no_delete ON qms.assignment_eligibility_events;
CREATE TRIGGER worm_no_delete
  BEFORE DELETE ON qms.assignment_eligibility_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_worm_no_delete();

COMMENT ON FUNCTION public.enforce_worm_no_delete IS
  'R18 — WORM enforcement. Blocks DELETE on protected audit tables for
   non-service-role sessions. service_role bypasses; attempt-logging via
   NOTICE / EXCEPTION pair so auditors can spot bypass attempts.';
