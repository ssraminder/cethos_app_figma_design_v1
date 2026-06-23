-- =====================================================================
-- RLS remediation (2026-06-23) — table 6 of 22: training_modules
--
-- Legacy staff-LMS table (0 rows, dead — the live LMS is cvp_training_*).
-- No admin-client, vendor-portal, edge-function, DB-function, or view reads it.
-- Lock to service_role only; if the staff LMS is ever revived, add read
-- policies for the intended audience then.
--
-- Rollback:
--   ALTER TABLE public.training_modules DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS training_modules_service_role_all ON public.training_modules;
-- =====================================================================

BEGIN;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS training_modules_service_role_all ON public.training_modules;
CREATE POLICY training_modules_service_role_all
  ON public.training_modules FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMIT;
