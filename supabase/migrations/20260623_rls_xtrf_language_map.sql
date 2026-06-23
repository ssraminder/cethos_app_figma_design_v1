-- =====================================================================
-- RLS remediation (2026-06-23) — table 2 of 22: xtrf_language_map
--
-- Internal XTRF mapping cache (XTRF language id -> ISO code, 314 rows).
-- No admin-client, vendor-portal, DB-function, or view reads it (verified by
-- grep + catalog scan); written only by xtrf-sync edge functions (service_role).
-- With RLS off the anon key returned all 314 rows. Lock to service_role only.
--
-- Rollback:
--   ALTER TABLE public.xtrf_language_map DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS xtrf_language_map_service_role_all ON public.xtrf_language_map;
-- =====================================================================

BEGIN;

ALTER TABLE public.xtrf_language_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xtrf_language_map_service_role_all ON public.xtrf_language_map;
CREATE POLICY xtrf_language_map_service_role_all
  ON public.xtrf_language_map FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
