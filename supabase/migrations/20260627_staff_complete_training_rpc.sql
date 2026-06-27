-- Staff training completion was broken: completion is stamped on a pre-existing
-- cvp_training_assignments row, but RLS ("Admins can create assignments") + the
-- UI (the Complete button only renders when an assignment exists) meant a staff
-- member who opened a training they were never *assigned* could not record
-- completion. Most staff trainings have 0 assignments, so almost nothing recorded.
--
-- This SECURITY DEFINER RPC lets any active staff member self-complete: it
-- resolves the staff from auth.uid(), upserts their assignment, stamps
-- completed_at, and acknowledges every lesson. Idempotent (keeps the original
-- completed_at on re-run).
CREATE OR REPLACE FUNCTION public.cvp_staff_complete_training(p_training_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_staff uuid;
  v_assignment uuid;
  v_now timestamptz := now();
BEGIN
  SELECT id INTO v_staff FROM staff_users WHERE auth_user_id = auth.uid() AND is_active = true;
  IF v_staff IS NULL THEN RAISE EXCEPTION 'not_active_staff'; END IF;

  INSERT INTO cvp_training_assignments (training_id, staff_user_id, assigned_by, started_at, completed_at)
  VALUES (p_training_id, v_staff, v_staff, v_now, v_now)
  ON CONFLICT (training_id, staff_user_id) DO UPDATE
    SET completed_at = COALESCE(cvp_training_assignments.completed_at, v_now),
        started_at   = COALESCE(cvp_training_assignments.started_at, v_now)
  RETURNING id INTO v_assignment;

  INSERT INTO cvp_training_lesson_progress (assignment_id, lesson_id, viewed_at, acknowledged_at)
  SELECT v_assignment, l.id, v_now, v_now
  FROM cvp_training_lessons l WHERE l.training_id = p_training_id
  ON CONFLICT (assignment_id, lesson_id) DO UPDATE
    SET acknowledged_at = COALESCE(cvp_training_lesson_progress.acknowledged_at, v_now);

  RETURN v_assignment;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.cvp_staff_complete_training(uuid) TO authenticated;
