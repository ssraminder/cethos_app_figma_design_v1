-- Security-advisor hardening for the versioned test-source functions.
-- Applied to prod 2026-06-26 via MCP; committed here to mirror prod.

-- Lock down the SECURITY DEFINER version helper: only service_role (the
-- manage-test-sources edge fn) should call it, never anon/authenticated via
-- the PostgREST /rest/v1/rpc surface.
revoke all on function public.cvp_test_source_save_version(
  uuid, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated;

-- Pin the trigger function's search_path.
alter function public.cvp_stamp_test_version() set search_path = public;
