-- =====================================================================
-- RLS remediation (2026-06-23) — table 7 of 22: training_lessons
--
-- Legacy staff-LMS table (0 rows, dead — live LMS is cvp_training_*).
-- No client/edge/DB reader. Lock to service_role only.
--
-- Rollback:
--   ALTER TABLE public.training_lessons DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS training_lessons_service_role_all ON public.training_lessons;
-- =====================================================================

BEGIN;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS training_lessons_service_role_all ON public.training_lessons;
CREATE POLICY training_lessons_service_role_all
  ON public.training_lessons FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMIT;
