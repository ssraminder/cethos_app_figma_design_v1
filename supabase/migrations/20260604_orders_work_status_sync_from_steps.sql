-- 2026-06-04: keep orders.work_status in lockstep with the underlying
-- order_workflow_steps state machine.
--
-- Before this migration, work_status was seeded to 'pending' at order
-- creation and only ever moved by (a) cancel-order edge function or (b)
-- the staff Work Status dropdown. Step lifecycle (offer/assign/accept/
-- deliver/approve) never touched the parent order, so orders with all
-- steps approved sat at 'pending' indefinitely — including the user-
-- reported ORD-2026-10304 (step 1 delivered, order.work_status still
-- 'pending').
--
-- Strategy: trigger on order_workflow_steps recomputes the order's
-- work_status from its non-cancelled siblings every time a step status
-- changes. The trigger respects manual staff holds: if work_status is
-- 'on_hold' or 'cancelled', the trigger no-ops (those are intentional
-- overrides; cancellation in particular is a terminal state).

CREATE OR REPLACE FUNCTION public.recompute_order_work_status(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current text;
  v_total int;
  v_approved int;
  v_active int;
  v_new text;
BEGIN
  SELECT work_status INTO v_current FROM orders WHERE id = p_order_id;
  IF v_current IS NULL THEN
    RETURN;
  END IF;

  -- Staff intent we never auto-clobber.
  IF v_current IN ('on_hold','cancelled') THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status != 'cancelled'),
    COUNT(*) FILTER (WHERE status = 'approved'),
    COUNT(*) FILTER (WHERE status IN ('offered','assigned','accepted','in_progress','delivered','revision_requested'))
  INTO v_total, v_approved, v_active
  FROM order_workflow_steps
  WHERE order_id = p_order_id;

  IF v_total = 0 THEN
    v_new := 'pending';
  ELSIF v_approved = v_total THEN
    v_new := 'completed';
  ELSIF v_active > 0 THEN
    v_new := 'in_progress';
  ELSE
    v_new := 'pending';
  END IF;

  IF v_new IS DISTINCT FROM v_current THEN
    UPDATE orders
       SET work_status = v_new,
           updated_at = now()
     WHERE id = p_order_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_order_steps_sync_work_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_order_work_status(OLD.order_id);
  ELSE
    PERFORM recompute_order_work_status(NEW.order_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS order_steps_sync_work_status ON order_workflow_steps;

CREATE TRIGGER order_steps_sync_work_status
AFTER INSERT OR UPDATE OF status OR DELETE
ON order_workflow_steps
FOR EACH ROW
EXECUTE FUNCTION tg_order_steps_sync_work_status();

-- Backfill every order that has steps. The function self-skips on_hold /
-- cancelled rows so this is safe even if a staff hold was set manually.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT order_id FROM order_workflow_steps LOOP
    PERFORM recompute_order_work_status(r.order_id);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.recompute_order_work_status(uuid) IS
  'Derives orders.work_status from the order''s non-cancelled order_workflow_steps. all-approved => completed; any active step => in_progress; else pending. Skips orders whose current work_status is on_hold or cancelled.';

COMMENT ON FUNCTION public.tg_order_steps_sync_work_status() IS
  'Trigger handler — fires recompute_order_work_status on INSERT / UPDATE OF status / DELETE of order_workflow_steps.';
