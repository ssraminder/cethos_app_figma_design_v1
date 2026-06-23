-- =====================================================================
-- RLS remediation (2026-06-23) — table 9 of 22: training_quiz_questions
--
-- Legacy staff-LMS table (0 rows, dead — live LMS is cvp_training_*).
-- No client/edge/DB reader. Lock to service_role only.
--
-- Rollback:
--   ALTER TABLE public.training_quiz_questions DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS training_quiz_questions_service_role_all ON public.training_quiz_questions;
-- =====================================================================

BEGIN;
ALTER TABLE public.training_quiz_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS training_quiz_questions_service_role_all ON public.training_quiz_questions;
CREATE POLICY training_quiz_questions_service_role_all
  ON public.training_quiz_questions FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMIT;
