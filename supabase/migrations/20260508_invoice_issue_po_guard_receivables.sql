-- ============================================================================
-- Migration: extend guard_invoice_issue_requires_po to read per-line PO
-- numbers from order_receivables when the linked order is a direct order.
-- Date: 2026-05-08
-- Applied directly to prod via MCP apply_migration; this file is committed
-- so future environments stay in sync.
--
-- Behavior change:
--   * Direct orders (orders.is_direct_order = true) now check
--     order_receivables.po_number per non-voided row instead of
--     orders.po_number. If ANY non-voided receivable lacks a PO, the
--     invoice cannot be issued.
--   * Quote-converted orders keep the existing orders.po_number check
--     unchanged.
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

  -- Direct-order branch: per-line PO on order_receivables
  IF NEW.order_id IS NOT NULL THEN
    SELECT count(*), MAX(o.order_number)
    INTO v_block_count, v_first_order
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.id = NEW.order_id
      AND c.requires_po_mode = 'pending_acceptable'
      AND COALESCE(o.is_direct_order, false) = true
      AND EXISTS (
        SELECT 1 FROM order_receivables r
        WHERE r.order_id = o.id
          AND r.status <> 'voided'
          AND COALESCE(NULLIF(trim(r.po_number), ''), '') = ''
      );
    IF v_block_count > 0 THEN
      RAISE EXCEPTION
        'Cannot issue invoice %: direct order % has receivable line(s) without a PO number. Add the PO on each receivable before issuing.',
        NEW.invoice_number, v_first_order
        USING ERRCODE = 'P0001';
    END IF;

    -- Quote-converted branch: order-level PO
    SELECT count(*), MAX(o.order_number)
    INTO v_block_count, v_first_order
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.id = NEW.order_id
      AND c.requires_po_mode = 'pending_acceptable'
      AND COALESCE(o.is_direct_order, false) = false
      AND COALESCE(NULLIF(trim(o.po_number), ''), '') = '';
    IF v_block_count > 0 THEN
      RAISE EXCEPTION
        'Cannot issue invoice %: order % is on a pending_acceptable customer and has no PO number. Add the PO before issuing.',
        NEW.invoice_number, v_first_order
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- customer_invoice_lines branch (multi-order invoices). Direct-order
  -- lines fall back to per-receivable PO; quote-converted lines keep
  -- the order-level check.
  SELECT count(*), MAX(o.order_number)
  INTO v_block_count, v_first_order
  FROM customer_invoice_lines cil
  JOIN orders o ON o.id = cil.order_id
  JOIN customers c ON c.id = o.customer_id
  WHERE cil.invoice_id = NEW.id
    AND c.requires_po_mode = 'pending_acceptable'
    AND COALESCE(NULLIF(trim(cil.po_number), ''), '') = ''
    AND (
      (
        COALESCE(o.is_direct_order, false) = false
        AND COALESCE(NULLIF(trim(o.po_number), ''), '') = ''
      )
      OR (
        COALESCE(o.is_direct_order, false) = true
        AND EXISTS (
          SELECT 1 FROM order_receivables r
          WHERE r.order_id = o.id
            AND r.status <> 'voided'
            AND COALESCE(NULLIF(trim(r.po_number), ''), '') = ''
        )
      )
    );
  IF v_block_count > 0 THEN
    RAISE EXCEPTION
      'Cannot issue invoice %: % linked order line(s) on pending_acceptable customers lack a PO (e.g. %). Add the PO before issuing.',
      NEW.invoice_number, v_block_count, v_first_order
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
