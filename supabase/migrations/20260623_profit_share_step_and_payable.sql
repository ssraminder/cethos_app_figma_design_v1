-- ============================================================================
-- Migration: profit-share "Share Reconciliation" step + payable (Phase B)
-- Date: 2026-06-23
-- Applied to prod via MCP apply_migration, then committed.
--
-- Adds the building blocks for a no-delivery profit-share step:
--   1. auto_complete_on_accept + profit_share_pct columns on both the template
--      steps and the live order steps.
--   2. A BEFORE-UPDATE trigger that auto-completes such a step the moment its
--      vendor accepts (status 'accepted' -> 'approved'), so there is no file
--      delivery and no vendor-portal change. Using BEFORE (so 'accepted' never
--      persists) also means the vendor-PO-on-accept enqueue does not fire for
--      a profit-share step.
--   3. qms.emit_project_completed skips these steps (a profit share is not a
--      linguistic task to monitor under ISO 17100 §3.1.8).
--   4. compute_order_profit_share(): deterministic profit = receivables (rev)
--      - other active vendor payables (cost); share = profit * pct. Used by
--      manage-vendor-payables to size the share payable (server-side math).
-- ============================================================================

ALTER TABLE public.workflow_template_steps
  ADD COLUMN IF NOT EXISTS auto_complete_on_accept boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profit_share_pct numeric;

ALTER TABLE public.order_workflow_steps
  ADD COLUMN IF NOT EXISTS auto_complete_on_accept boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profit_share_pct numeric;

COMMENT ON COLUMN public.order_workflow_steps.auto_complete_on_accept IS
  'No-delivery step: auto-completes (status->approved) when the vendor accepts. Used by the Share Reconciliation / profit-share step.';
COMMENT ON COLUMN public.order_workflow_steps.profit_share_pct IS
  'Default profit-share percentage for a Share Reconciliation step (e.g. 50). Pre-fills the profit_share payable mode.';

-- ----------------------------------------------------------------------------
-- Auto-complete on accept (BEFORE UPDATE so 'accepted' never persists).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_auto_complete_step_on_accept()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF COALESCE(NEW.auto_complete_on_accept, false)
     AND NEW.status = 'accepted'
     AND OLD.status IS DISTINCT FROM 'accepted'
     AND OLD.status IS DISTINCT FROM 'approved' THEN
    NEW.status      := 'approved';
    NEW.accepted_at := COALESCE(NEW.accepted_at, now());
    NEW.started_at  := COALESCE(NEW.started_at, now());
    NEW.delivered_at:= COALESCE(NEW.delivered_at, now());
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS order_steps_auto_complete_on_accept ON public.order_workflow_steps;
CREATE TRIGGER order_steps_auto_complete_on_accept
BEFORE UPDATE OF status ON public.order_workflow_steps
FOR EACH ROW
EXECUTE FUNCTION public.tg_auto_complete_step_on_accept();

-- ----------------------------------------------------------------------------
-- §3.1.8: don't emit a project_completed competence event for a profit-share
-- (no-deliverable) step.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION qms.emit_project_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare rq uuid;
begin
  if NEW.vendor_id is not null
     and COALESCE(NEW.auto_complete_on_accept, false) = false
     and NEW.status in ('approved','delivered')
     and (OLD.status is distinct from NEW.status)
     and (OLD.status is null or OLD.status not in ('approved','delivered')) then
    select r.id into rq from qms.role_qualifications r
      where r.vendor_id = NEW.vendor_id
      order by (r.role_type_id = 'ac148fbe-2cce-4d7b-9d69-3fc2a01f7ee5') desc
      limit 1;
    if rq is not null then
      insert into qms.performance_events
        (role_qualification_id, vendor_id, event_type, occurred_at, recorded_at, project_reference, description, notes)
      values
        (rq, NEW.vendor_id, 'project_completed', now(), now(),
         (select order_number from public.orders where id = NEW.order_id),
         'Completed workflow step ('||NEW.status||')',
         'Auto-emitted on step completion (§3.1.8 monitoring).');
    end if;
  end if;
  return NEW;
end $function$;

-- ----------------------------------------------------------------------------
-- Deterministic profit-share math. profit = revenue (non-void receivables)
-- - cost (active vendor payables, excluding the share payable itself), in a
-- single currency. share = max(profit,0) * pct. Returns the full breakdown so
-- the UI can show revenue/cost/profit before the payable is created.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_order_profit_share(
  p_order_id           uuid,
  p_share_pct          numeric DEFAULT 50,
  p_exclude_payable_id uuid DEFAULT NULL,
  p_currency           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_cur       text;
  v_revenue   numeric := 0;
  v_cost      numeric := 0;
  v_profit    numeric := 0;
  v_share     numeric := 0;
  v_other_cur int := 0;
BEGIN
  v_cur := upper(COALESCE(p_currency,
                          (SELECT currency FROM orders WHERE id = p_order_id),
                          'CAD'));

  SELECT COALESCE(sum(line_subtotal), 0)
    INTO v_revenue
    FROM order_receivables
   WHERE order_id = p_order_id
     AND status <> 'voided'
     AND upper(currency) = v_cur;

  SELECT COALESCE(sum(subtotal), 0)
    INTO v_cost
    FROM vendor_payables
   WHERE order_id = p_order_id
     AND status <> 'cancelled'
     AND voided_at IS NULL
     AND upper(currency) = v_cur
     AND (p_exclude_payable_id IS NULL OR id <> p_exclude_payable_id);

  -- Flag receivables/payables in OTHER currencies (profit math ignores them).
  SELECT (
    (SELECT count(*) FROM order_receivables
      WHERE order_id = p_order_id AND status <> 'voided' AND upper(currency) <> v_cur)
    + (SELECT count(*) FROM vendor_payables
      WHERE order_id = p_order_id AND status <> 'cancelled' AND voided_at IS NULL
        AND upper(currency) <> v_cur
        AND (p_exclude_payable_id IS NULL OR id <> p_exclude_payable_id))
  ) INTO v_other_cur;

  v_profit := round(v_revenue - v_cost, 2);
  v_share  := round(GREATEST(v_profit, 0) * COALESCE(p_share_pct, 0) / 100.0, 2);

  RETURN jsonb_build_object(
    'currency', v_cur,
    'revenue', round(v_revenue, 2),
    'cost', round(v_cost, 2),
    'profit', v_profit,
    'share_pct', p_share_pct,
    'share_amount', v_share,
    'other_currency_lines', v_other_cur
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.compute_order_profit_share(uuid, numeric, uuid, text) TO service_role;
