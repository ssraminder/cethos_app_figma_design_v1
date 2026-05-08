-- ============================================================================
-- Migration: customer_invoices BEFORE-issue trigger that blocks issuing when
-- a linked order belongs to a pending_acceptable customer with no PO.
-- Date: 2026-05-08
-- Applied directly to prod via MCP apply_migration; this file is committed
-- so future environments stay in sync.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_invoice_issue_requires_po()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
DECLARE
  v_block_count int := 0;
  v_first_order text;
BEGIN
  IF NEW.status NOT IN ('issued', 'sent', 'paid', 'overdue') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NULLIF(trim(NEW.po_number), ''), '') <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.order_id IS NOT NULL THEN
    SELECT count(*), MAX(o.order_number)
    INTO v_block_count, v_first_order
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.id = NEW.order_id
      AND c.requires_po_mode = 'pending_acceptable'
      AND COALESCE(NULLIF(trim(o.po_number), ''), '') = '';
    IF v_block_count > 0 THEN
      RAISE EXCEPTION
        'Cannot issue invoice %: order % is on a pending_acceptable customer and has no PO number. Add the PO before issuing.',
        NEW.invoice_number, v_first_order
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT count(*), MAX(o.order_number)
  INTO v_block_count, v_first_order
  FROM customer_invoice_lines cil
  JOIN orders o ON o.id = cil.order_id
  JOIN customers c ON c.id = o.customer_id
  WHERE cil.invoice_id = NEW.id
    AND c.requires_po_mode = 'pending_acceptable'
    AND COALESCE(NULLIF(trim(o.po_number), ''), '') = ''
    AND COALESCE(NULLIF(trim(cil.po_number), ''), '') = '';
  IF v_block_count > 0 THEN
    RAISE EXCEPTION
      'Cannot issue invoice %: % linked order(s) belong to a pending_acceptable customer with no PO number (e.g. %). Add the PO before issuing.',
      NEW.invoice_number, v_block_count, v_first_order
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customer_invoices_guard_po_on_issue ON customer_invoices;
CREATE TRIGGER customer_invoices_guard_po_on_issue
  BEFORE INSERT OR UPDATE ON customer_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_invoice_issue_requires_po();
