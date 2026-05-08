-- ============================================================================
-- Migration: order_receivables — multi-line billable rows for DIRECT orders
-- Date: 2026-05-08
-- Applied directly to prod via MCP apply_migration; this file is committed
-- so future environments stay in sync.
--
-- Scope: orders.is_direct_order = true only. Quote-converted orders
-- (certified, OCR, website checkout) keep their existing
-- quote_document_groups → quotes.total pricing path. The new
-- recalculate_direct_order_totals function and the trigger early-exit
-- when the order is not direct, so triggers can fire blindly.
--
-- Each receivable row carries its own po_number + client_project_number
-- so a single direct order can be billed against multiple POs (TRSB
-- agency pattern). The guard_invoice_issue_requires_po trigger will be
-- updated in a later PR to read these per-line POs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  calculation_unit text NOT NULL DEFAULT 'flat'
    CHECK (calculation_unit IN ('per_word', 'per_page', 'per_hour', 'per_minute', 'flat')),
  quantity numeric(12,4) NOT NULL DEFAULT 1,
  rate numeric(12,4) NOT NULL DEFAULT 0,
  line_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  surcharge_total numeric(12,2) NOT NULL DEFAULT 0,
  discount_total numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,4) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CAD',
  po_number text,
  client_project_number text,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'invoiced', 'voided')),
  invoiced_via_invoice_id uuid REFERENCES customer_invoices(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_staff_id uuid REFERENCES staff_users(id),
  updated_by_staff_id uuid REFERENCES staff_users(id)
);

CREATE INDEX IF NOT EXISTS order_receivables_order_id_idx
  ON order_receivables (order_id, sort_order);
CREATE INDEX IF NOT EXISTS order_receivables_status_idx
  ON order_receivables (status) WHERE status != 'voided';
CREATE INDEX IF NOT EXISTS order_receivables_po_pending_idx
  ON order_receivables (order_id) WHERE po_number IS NULL AND status != 'voided';
CREATE INDEX IF NOT EXISTS order_receivables_invoice_idx
  ON order_receivables (invoiced_via_invoice_id) WHERE invoiced_via_invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_order_receivables_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS order_receivables_set_updated_at ON order_receivables;
CREATE TRIGGER order_receivables_set_updated_at
  BEFORE UPDATE ON order_receivables
  FOR EACH ROW EXECUTE FUNCTION public.touch_order_receivables_updated_at();

CREATE OR REPLACE FUNCTION public.recalculate_direct_order_totals(p_order_id uuid)
RETURNS void LANGUAGE plpgsql AS $function$
DECLARE
  v_is_direct boolean;
  v_subtotal numeric(12,2) := 0;
  v_surcharge numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_amount_paid numeric(12,2);
BEGIN
  SELECT COALESCE(is_direct_order, false), COALESCE(amount_paid, 0)
    INTO v_is_direct, v_amount_paid
    FROM orders WHERE id = p_order_id;

  IF v_is_direct IS NOT TRUE THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(line_subtotal), 0),
    COALESCE(SUM(surcharge_total), 0),
    COALESCE(SUM(discount_total), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(line_total), 0)
  INTO v_subtotal, v_surcharge, v_discount, v_tax, v_total
  FROM order_receivables
  WHERE order_id = p_order_id AND status <> 'voided';

  UPDATE orders
  SET
    subtotal = v_subtotal,
    surcharge_total = v_surcharge,
    discount_total = v_discount,
    tax_amount = v_tax,
    total_amount = v_total,
    balance_due = GREATEST(v_total - v_amount_paid, 0),
    updated_at = now()
  WHERE id = p_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_recalc_direct_order_on_receivable_change()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NOT NULL THEN
    PERFORM public.recalculate_direct_order_totals(v_order_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS order_receivables_recalc_order ON order_receivables;
CREATE TRIGGER order_receivables_recalc_order
  AFTER INSERT OR UPDATE OR DELETE ON order_receivables
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recalc_direct_order_on_receivable_change();

ALTER TABLE order_receivables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON order_receivables;
CREATE POLICY "Service role full access" ON order_receivables
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Anon read for staff portal" ON order_receivables;
CREATE POLICY "Anon read for staff portal" ON order_receivables
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon insert for staff portal" ON order_receivables;
CREATE POLICY "Anon insert for staff portal" ON order_receivables
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anon update for staff portal" ON order_receivables;
CREATE POLICY "Anon update for staff portal" ON order_receivables
  FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon delete for staff portal" ON order_receivables;
CREATE POLICY "Anon delete for staff portal" ON order_receivables
  FOR DELETE USING (true);

-- Backfill: one receivable per existing direct order, copying totals + PO.
INSERT INTO order_receivables (
  order_id, description, calculation_unit, quantity, rate,
  line_subtotal, surcharge_total, discount_total,
  tax_rate, tax_amount, line_total, currency,
  po_number, client_project_number, sort_order, status
)
SELECT
  o.id,
  COALESCE('Direct order ' || o.order_number, 'Direct order line'),
  'flat', 1,
  COALESCE(o.subtotal, 0),
  COALESCE(o.subtotal, 0),
  COALESCE(o.surcharge_total, 0),
  COALESCE(o.discount_total, 0),
  COALESCE(o.tax_rate, 0),
  COALESCE(o.tax_amount, 0),
  COALESCE(o.total_amount, 0),
  COALESCE(o.currency, 'CAD'),
  NULLIF(trim(o.po_number), ''),
  NULLIF(trim(o.client_project_number), ''),
  0,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM customer_invoices ci
      WHERE ci.order_id = o.id AND ci.status <> 'void'
    ) THEN 'invoiced'
    ELSE 'draft'
  END
FROM orders o
WHERE COALESCE(o.is_direct_order, false) = true
  AND NOT EXISTS (
    SELECT 1 FROM order_receivables r WHERE r.order_id = o.id
  );

COMMENT ON TABLE order_receivables IS
  'Multi-line billable receivables for direct orders only (orders.is_direct_order = true). Each line carries its own PO + client project number. Quote-converted orders use quote_document_groups instead.';
