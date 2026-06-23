-- =====================================================================
-- RLS remediation (2026-06-23) — table 3 of 22: xtrf_branches
--
-- Internal XTRF cache (5 rows). No admin-client, vendor-portal, DB-function,
-- or view reads it; written only by xtrf-sync edge functions (service_role).
-- With RLS off the anon key returned all 5 rows. Lock to service_role only.
--
-- Rollback:
--   ALTER TABLE public.xtrf_branches DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS xtrf_branches_service_role_all ON public.xtrf_branches;
-- =====================================================================

BEGIN;

ALTER TABLE public.xtrf_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xtrf_branches_service_role_all ON public.xtrf_branches;
CREATE POLICY xtrf_branches_service_role_all
  ON public.xtrf_branches FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
