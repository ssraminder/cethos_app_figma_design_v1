-- 2026-06-04: keep the per-step vendor cost cache on order_workflow_steps
-- in lockstep with vendor_payables.
--
-- order_workflow_steps carries cache fields (vendor_rate, vendor_rate_unit,
-- vendor_currency, vendor_total) that the admin and vendor portals BOTH read
-- when rendering the per-step "Total: CAD $X.XX" line. When staff re-cut a
-- payable via Manage Payable (units corrected, rate adjusted, etc.) the new
-- payable row gets the right number but the cache on the step row is never
-- updated. Reported on ORD-2026-10237 (Osama Elalwany: step cache $0.06 vs
-- approved payable $10.07), ORD-2026-10241 (Alina Chiteala: $0.05 vs
-- $17.45), ORD-2026-10255 (Istvan Lanyi: NULL vs $4.52) and ORD-2026-10195
-- (CCJK: NULL vs $0.01).
--
-- Fix: trigger on vendor_payables AFTER INSERT/UPDATE/DELETE recomputes
-- the cache fields on the parent order_workflow_steps row from the latest
-- non-cancelled non-voided payable for that step.

CREATE OR REPLACE FUNCTION public.sync_step_vendor_cost_from_payables(p_step_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_rate numeric;
  v_rate_unit text;
  v_currency text;
  v_total numeric;
  v_vendor_id uuid;
BEGIN
  IF p_step_id IS NULL THEN
    RETURN;
  END IF;

  SELECT rate, rate_unit, currency, total, vendor_id
    INTO v_rate, v_rate_unit, v_currency, v_total, v_vendor_id
  FROM vendor_payables
  WHERE workflow_step_id = p_step_id
    AND status NOT IN ('cancelled')
    AND voided_at IS NULL
  ORDER BY
    -- prefer approved/paid/invoiced (live PO) over pending
    CASE status
      WHEN 'paid' THEN 1
      WHEN 'invoiced' THEN 2
      WHEN 'approved' THEN 3
      WHEN 'pending' THEN 4
      ELSE 5
    END,
    created_at DESC
  LIMIT 1;

  IF v_total IS NULL THEN
    -- No live payable left — clear the cache so stale numbers don't linger.
    UPDATE order_workflow_steps
       SET vendor_rate = NULL,
           vendor_rate_unit = NULL,
           vendor_total = NULL
     WHERE id = p_step_id;
    RETURN;
  END IF;

  UPDATE order_workflow_steps
     SET vendor_rate = v_rate,
         vendor_rate_unit = v_rate_unit,
         vendor_currency = COALESCE(v_currency, vendor_currency),
         vendor_total = v_total
   WHERE id = p_step_id
     AND (vendor_rate IS DISTINCT FROM v_rate
       OR vendor_rate_unit IS DISTINCT FROM v_rate_unit
       OR vendor_currency IS DISTINCT FROM COALESCE(v_currency, vendor_currency)
       OR vendor_total IS DISTINCT FROM v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_payables_sync_step_cost()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM sync_step_vendor_cost_from_payables(OLD.workflow_step_id);
  ELSE
    PERFORM sync_step_vendor_cost_from_payables(NEW.workflow_step_id);
    -- Cover the rare case where Manage Payable reassigns the step_id.
    IF TG_OP = 'UPDATE' AND OLD.workflow_step_id IS DISTINCT FROM NEW.workflow_step_id THEN
      PERFORM sync_step_vendor_cost_from_payables(OLD.workflow_step_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS payables_sync_step_cost ON vendor_payables;

CREATE TRIGGER payables_sync_step_cost
AFTER INSERT OR UPDATE OR DELETE
ON vendor_payables
FOR EACH ROW
EXECUTE FUNCTION tg_payables_sync_step_cost();

-- Backfill every step that currently has at least one payable.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT workflow_step_id FROM vendor_payables WHERE workflow_step_id IS NOT NULL LOOP
    PERFORM sync_step_vendor_cost_from_payables(r.workflow_step_id);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.sync_step_vendor_cost_from_payables(uuid) IS
  'Recomputes order_workflow_steps cache (vendor_rate/unit/currency/total) from the latest non-cancelled non-voided vendor_payables row for the step. Preference: paid > invoiced > approved > pending, then most-recent.';

COMMENT ON FUNCTION public.tg_payables_sync_step_cost() IS
  'Trigger handler — fires sync_step_vendor_cost_from_payables on INSERT/UPDATE/DELETE of vendor_payables. Handles step_id reassignment by syncing both old and new.';
