-- ============================================================================
-- Migration: Non-Certified Projects — Phase 1 (schema + seed data)
-- Date: April 21, 2026
-- See BLUEPRINT-non-certified-projects.md for full context.
--
-- Changes:
--   1. orders.is_direct_order, orders.invoiced_total (for direct orders + progress invoicing)
--   2. ai_analysis_results.calculation_unit, unit_quantity (generalized line-item billing)
--   3. Seed 5 clinical/pharma services (reconciliation, harmonization, linguistic
--      validation migration + QM, screenshot review)
--   4. Backfill: service_id defaults, unit_quantity from billable_pages, invoiced_total
--   5. Replace create_invoice_from_order with 3-arg version supporting partial /
--      progress invoicing (removes single-invoice-per-order block)
--
-- All statements use IF NOT EXISTS / ON CONFLICT / DO blocks — safe to re-run.
-- ============================================================================


-- ============================================================================
-- 1. Orders: direct-order marker + progress-invoice running total
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='orders' AND column_name='is_direct_order'
  ) THEN
    ALTER TABLE orders ADD COLUMN is_direct_order boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='orders' AND column_name='invoiced_total'
  ) THEN
    ALTER TABLE orders ADD COLUMN invoiced_total decimal(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_is_direct_order
  ON orders(is_direct_order) WHERE is_direct_order = true;


-- ============================================================================
-- 2. ai_analysis_results: generalized line-item billing
--    Existing semantics (per-page) preserved via defaults + backfill.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='ai_analysis_results' AND column_name='calculation_unit'
  ) THEN
    ALTER TABLE ai_analysis_results
      ADD COLUMN calculation_unit varchar(20) NOT NULL DEFAULT 'per_page';
    ALTER TABLE ai_analysis_results
      ADD CONSTRAINT ai_analysis_results_calculation_unit_check
      CHECK (calculation_unit IN ('per_page','per_word','per_hour','per_minute','flat'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='ai_analysis_results' AND column_name='unit_quantity'
  ) THEN
    ALTER TABLE ai_analysis_results
      ADD COLUMN unit_quantity decimal(12,4);
  END IF;
END $$;


-- ============================================================================
-- 3. Seed clinical/pharma services (review_qa category)
--    Confirmed absent: reconciliation, harmonization, linguistic validation
--    migration + QM, screenshot review.
-- ============================================================================
INSERT INTO services (code, name, description, category, default_calculation_units,
                      customer_facing, vendor_facing, is_active, sort_order)
VALUES
  ('reconciliation', 'Reconciliation',
   'Reconciliation of forward and back translations for clinical/pharma content.',
   'review_qa', ARRAY['per_hour']::text[], true, true, true, 275),
  ('harmonization', 'Harmonization',
   'Cross-language harmonization of translated clinical/pharma content.',
   'review_qa', ARRAY['per_hour']::text[], true, true, true, 276),
  ('linguistic_validation_migration', 'Linguistic Validation (Migration)',
   'Migration of linguistic validation assets between language versions or platforms.',
   'review_qa', ARRAY['per_hour']::text[], true, true, true, 277),
  ('linguistic_validation_migration_qm', 'Linguistic Validation (Migration QM)',
   'Quality management layer for linguistic validation migration projects.',
   'review_qa', ARRAY['per_hour']::text[], true, true, true, 278),
  ('screenshot_review', 'Screenshot Review',
   'Review of localized screenshots for clinical/pharma deliverables.',
   'review_qa', ARRAY['per_hour']::text[], true, true, true, 279)
ON CONFLICT (code) DO NOTHING;


-- ============================================================================
-- 4. Backfills
-- ============================================================================

-- 4a. Default NULL service_id on quotes/orders to certified_translation
--     (historical data predates the services table being mandatory)
DO $$
DECLARE
  v_cert_id uuid;
BEGIN
  SELECT id INTO v_cert_id FROM services WHERE code = 'certified_translation';
  IF v_cert_id IS NOT NULL THEN
    UPDATE quotes SET service_id = v_cert_id WHERE service_id IS NULL;
    UPDATE orders SET service_id = v_cert_id WHERE service_id IS NULL;
  END IF;
END $$;

-- 4b. ai_analysis_results.unit_quantity mirrors billable_pages
UPDATE ai_analysis_results
   SET unit_quantity = billable_pages
 WHERE unit_quantity IS NULL;

-- 4c. orders.invoiced_total from existing non-voided invoices
UPDATE orders o
   SET invoiced_total = COALESCE(sub.total, 0)
  FROM (
    SELECT order_id, SUM(total_amount) AS total
      FROM customer_invoices
     WHERE voided_at IS NULL
       AND status NOT IN ('void','cancelled','voided')
     GROUP BY order_id
  ) sub
 WHERE o.id = sub.order_id
   AND o.invoiced_total = 0;


-- ============================================================================
-- 5. Replace create_invoice_from_order with progress-invoice-capable version
--    Signature adds optional p_amount as 3rd arg — 2-arg callers unchanged.
--    Removes the "invoice already exists" block that prevented progress
--    invoicing. Over-invoicing guarded by comparing p_amount to remaining
--    balance (total_amount - invoiced_total).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_invoice_from_order(
  p_order_id     uuid,
  p_trigger_type varchar DEFAULT 'delivery',
  p_amount       decimal(12,2) DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order          RECORD;
  v_customer       RECORD;
  v_branch_id      integer;
  v_invoice_id     uuid;
  v_invoice_number text;
  v_due_date       date;
  v_remaining      decimal(12,2);
  v_amount         decimal(12,2);
  v_is_full        boolean;
BEGIN
  -- Order + invoicing branch
  SELECT
    o.id, o.order_number, o.quote_id, o.customer_id,
    o.subtotal, o.certification_total, o.rush_fee, o.delivery_fee,
    o.tax_rate, o.tax_amount, o.total_amount, o.amount_paid, o.balance_due,
    o.invoicing_branch_id AS order_branch_id,
    COALESCE(o.invoiced_total, 0) AS invoiced_total
  INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Compute remaining balance that can still be invoiced against this order
  v_remaining := v_order.total_amount - v_order.invoiced_total;
  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Order fully invoiced',
      'invoiced_total', v_order.invoiced_total,
      'total_amount', v_order.total_amount
    );
  END IF;

  -- Resolve requested amount; NULL => bill the full remaining balance
  v_amount := COALESCE(p_amount, v_remaining);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice amount must be greater than zero');
  END IF;
  IF v_amount > v_remaining THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Requested amount exceeds remaining balance',
      'requested', v_amount,
      'remaining', v_remaining
    );
  END IF;

  v_is_full := (v_amount = v_remaining);

  -- Customer + branch resolution (order > customer > default 2)
  SELECT id, invoicing_branch_id
    INTO v_customer
    FROM customers
   WHERE id = v_order.customer_id;

  v_branch_id := COALESCE(v_order.order_branch_id, v_customer.invoicing_branch_id, 2);

  v_invoice_number := next_invoice_number(v_branch_id);
  v_due_date       := calculate_invoice_due_date(v_order.customer_id);

  -- For a full/final invoice we preserve the original line-item breakdown
  -- (certification_total, rush_fee, delivery_fee, tax_amount). For partial
  -- invoices the split is ambiguous, so we record the amount on subtotal only
  -- and let tax_amount be prorated in the UI/PDF layer.
  INSERT INTO customer_invoices (
    invoice_number, order_id, customer_id, quote_id,
    subtotal, certification_total, rush_fee, delivery_fee,
    tax_rate, tax_amount, total_amount,
    amount_paid, balance_due,
    status, invoice_date, due_date, trigger_type,
    invoicing_branch_id
  ) VALUES (
    v_invoice_number, p_order_id, v_order.customer_id, v_order.quote_id,
    CASE WHEN v_is_full THEN v_order.subtotal ELSE v_amount END,
    CASE WHEN v_is_full THEN v_order.certification_total ELSE 0 END,
    CASE WHEN v_is_full THEN v_order.rush_fee ELSE 0 END,
    CASE WHEN v_is_full THEN v_order.delivery_fee ELSE 0 END,
    COALESCE(v_order.tax_rate, 0.05),
    CASE WHEN v_is_full THEN v_order.tax_amount ELSE 0 END,
    v_amount,
    CASE WHEN v_is_full THEN v_order.amount_paid ELSE 0 END,
    CASE WHEN v_is_full THEN v_order.balance_due ELSE v_amount END,
    CASE WHEN v_is_full AND v_order.balance_due <= 0 THEN 'paid' ELSE 'issued' END,
    CURRENT_DATE,
    v_due_date,
    p_trigger_type,
    v_branch_id
  )
  RETURNING id INTO v_invoice_id;

  UPDATE orders
     SET invoiced_total = invoiced_total + v_amount
   WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'due_date', v_due_date,
    'amount', v_amount,
    'is_full_invoice', v_is_full,
    'remaining_after', v_remaining - v_amount
  );
END;
$function$;


-- ============================================================================
-- Done.
-- ============================================================================
