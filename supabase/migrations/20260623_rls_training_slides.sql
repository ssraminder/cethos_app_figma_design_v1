-- =====================================================================
-- RLS remediation (2026-06-23) — table 8 of 22: training_slides
--
-- Legacy staff-LMS table (0 rows, dead — live LMS is cvp_training_*).
-- No client/edge/DB reader. Lock to service_role only.
--
-- Rollback:
--   ALTER TABLE public.training_slides DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS training_slides_service_role_all ON public.training_slides;
-- =====================================================================

BEGIN;
ALTER TABLE public.training_slides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS training_slides_service_role_all ON public.training_slides;
CREATE POLICY training_slides_service_role_all
  ON public.training_slides FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMIT;
