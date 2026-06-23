-- Gap 1+2 (phantom-approval cleanup): a combo's status='approved' must mean a real
-- GRADED+passed test. Previously the General-pass CASCADE (cvp-assess-test) and a
-- backfill stamped 'approved' on every declared domain with no test_id/submission/
-- score. So:
--   1. add a distinct 'declared_unverified' status — the cascade now writes THIS
--      (see cvp-assess-test), reserving 'approved' for genuine graded passes;
--   2. relabel the ~1,551 phantom 'approved' combos (no real submission/score) to it.
-- Existing vendor qualifications are JSONB snapshots (cvp_translators.approved_
-- combinations), independent of combo status, so this does not alter any recorded
-- qualification.
ALTER TABLE public.cvp_test_combinations DROP CONSTRAINT cvp_test_combinations_status_check;
ALTER TABLE public.cvp_test_combinations ADD CONSTRAINT cvp_test_combinations_status_check
  CHECK ((status)::text = ANY (ARRAY[
    'pending','no_test_available','test_assigned','test_sent','test_submitted',
    'assessed','approved','rejected','skipped','skip_manual_review','approved_excluded',
    'declared_unverified'
  ]::text[]));

UPDATE public.cvp_test_combinations
SET status = 'declared_unverified', approved_at = NULL, approved_by = NULL, updated_at = now()
WHERE status = 'approved'
  AND (test_submission_id IS NULL OR ai_score IS NULL);
