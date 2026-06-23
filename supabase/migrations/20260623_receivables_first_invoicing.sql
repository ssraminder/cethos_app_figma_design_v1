-- ============================================================================
-- Migration: receivables-first invoicing (create_invoice_from_receivables)
-- Date: 2026-06-23
-- Applied to prod via MCP apply_migration, then committed so the repo matches.
--
-- Context / the bypass this closes:
--   Customer invoices were created straight from orders.* totals
--   (create_invoice_from_order RPC + the source-less generate-customer-invoice
--   edge fn), never reading order_receivables, never writing
--   customer_invoice_lines, and never opening an accounts_receivable row.
--   Result: 8,666 invoices vs 28 invoice-lines / 48 receivables / 16 AR rows.
--
--   This adds the receivables-first path. Given an order's *draft*
--   order_receivables it atomically:
--     1. creates a customer_invoices header from the receivable lines,
--     2. writes one customer_invoice_lines row per receivable,
--     3. opens an accounts_receivable ledger row for the order (if none yet),
--     4. flips the receivables to status='invoiced' + invoiced_via_invoice_id,
--     5. bumps orders.invoiced_total.
--
--   The legacy create_invoice_from_order path is intentionally left untouched
--   (backward compatible): only orders that actually have draft receivables
--   flow through here, so the other ~242 invoiced orders are unaffected.
--   PDF rendering stays the branded generate-invoice-pdf (reads
--   customer_invoice_lines), invoked separately by the edge function.
-- ============================================================================

-- Allow trigger_type='receivables' so the source path is auditable on the row.
ALTER TABLE public.customer_invoices DROP CONSTRAINT customer_invoices_trigger_type_check;
ALTER TABLE public.customer_invoices ADD CONSTRAINT customer_invoices_trigger_type_check
  CHECK ((trigger_type)::text = ANY (ARRAY['order','delivery','manual','receivables']::text[]));

-- Allow accounts_receivable.status='voided' so revert_receivables_invoice can
-- void the auto-opened AR row when its invoice is voided.
ALTER TABLE public.accounts_receivable DROP CONSTRAINT accounts_receivable_status_check;
ALTER TABLE public.accounts_receivable ADD CONSTRAINT accounts_receivable_status_check
  CHECK ((status)::text = ANY (ARRAY['unpaid','partial','paid','overdue','written_off','disputed','voided']::text[]));

CREATE OR REPLACE FUNCTION public.create_invoice_from_receivables(
  p_order_id     uuid,
  p_staff_id     uuid DEFAULT NULL,
  p_invoice_date date DEFAULT CURRENT_DATE
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
  v_currency       text;
  v_n_currencies   int;
  v_subtotal       numeric := 0;
  v_tax            numeric := 0;
  v_total          numeric := 0;
  v_tax_rate       numeric := 0;
  v_po             text;
  v_cpn            text;
  v_count          int;
  v_inv_status     text;
  v_ar_status      text;
BEGIN
  -- Order
  SELECT o.id, o.order_number, o.quote_id, o.customer_id,
         o.invoicing_branch_id AS order_branch_id,
         o.po_number AS order_po, o.client_project_number AS order_cpn,
         COALESCE(o.invoiced_total, 0) AS invoiced_total
    INTO v_order
    FROM orders o
   WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Only DRAFT receivables are billable. Lock them first so a concurrent
  -- issue can't double-invoice the same lines (FOR UPDATE can't be combined
  -- with aggregates, so lock and count separately).
  PERFORM 1 FROM order_receivables
   WHERE order_id = p_order_id AND status = 'draft'
   FOR UPDATE;

  SELECT count(*), count(DISTINCT upper(currency))
    INTO v_count, v_n_currencies
    FROM order_receivables
   WHERE order_id = p_order_id AND status = 'draft';

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'No draft receivables to invoice on this order',
      'code', 'NO_DRAFT_RECEIVABLES');
  END IF;

  IF v_n_currencies > 1 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Draft receivables span multiple currencies; split before invoicing',
      'code', 'MIXED_CURRENCY');
  END IF;

  SELECT upper(max(currency)),
         COALESCE(sum(line_subtotal), 0),
         COALESCE(sum(tax_amount), 0),
         COALESCE(sum(line_total), 0),
         max(NULLIF(trim(po_number), '')),
         max(NULLIF(trim(client_project_number), ''))
    INTO v_currency, v_subtotal, v_tax, v_total, v_po, v_cpn
    FROM order_receivables
   WHERE order_id = p_order_id AND status = 'draft';

  v_currency := COALESCE(v_currency, 'CAD');
  v_po  := COALESCE(v_po,  NULLIF(trim(v_order.order_po), ''));
  v_cpn := COALESCE(v_cpn, NULLIF(trim(v_order.order_cpn), ''));
  v_tax_rate := CASE WHEN v_subtotal > 0 THEN round(v_tax / v_subtotal, 4) ELSE 0 END;
  v_inv_status := CASE WHEN v_total <= 0 THEN 'paid' ELSE 'issued' END;
  v_ar_status  := CASE WHEN v_total <= 0 THEN 'paid' ELSE 'unpaid' END;

  -- Customer + invoicing branch (order > customer > default 2)
  SELECT id, invoicing_branch_id, payment_terms
    INTO v_customer
    FROM customers
   WHERE id = v_order.customer_id;

  v_branch_id := COALESCE(v_order.order_branch_id, v_customer.invoicing_branch_id, 2);

  v_invoice_number := next_invoice_number(v_branch_id);
  v_due_date       := calculate_invoice_due_date(v_order.customer_id);

  -- 1. Invoice header
  INSERT INTO customer_invoices (
    invoice_number, order_id, customer_id, quote_id,
    subtotal, certification_total, rush_fee, delivery_fee,
    tax_rate, tax_amount, total_amount, amount_paid, balance_due,
    status, invoice_date, due_date, trigger_type,
    invoicing_branch_id, currency, po_number, client_project_number
  ) VALUES (
    v_invoice_number, p_order_id, v_order.customer_id, v_order.quote_id,
    v_subtotal, 0, 0, 0,
    v_tax_rate, v_tax, v_total, 0, v_total,
    v_inv_status, p_invoice_date, v_due_date, 'receivables',
    v_branch_id, v_currency, v_po, v_cpn
  )
  RETURNING id INTO v_invoice_id;

  -- 2. One invoice line per receivable
  INSERT INTO customer_invoice_lines (
    invoice_id, line_type, order_id, description,
    subtotal, line_total, po_number, client_project_number, sort_order
  )
  SELECT v_invoice_id, 'order', p_order_id, r.description,
         r.line_subtotal, r.line_total,
         COALESCE(NULLIF(trim(r.po_number), ''), v_po),
         COALESCE(NULLIF(trim(r.client_project_number), ''), v_cpn),
         r.sort_order
    FROM order_receivables r
   WHERE r.order_id = p_order_id AND r.status = 'draft';

  -- 3. AR ledger row (per-order; only if one isn't already open)
  IF NOT EXISTS (SELECT 1 FROM accounts_receivable WHERE order_id = p_order_id) THEN
    -- balance_due is a GENERATED column (original_amount - amount_paid); omit it.
    INSERT INTO accounts_receivable (
      order_id, customer_id, original_amount, amount_paid,
      currency, payment_terms, invoice_date, due_date, status,
      created_by_staff_id, notes
    ) VALUES (
      p_order_id, v_order.customer_id, v_total, 0,
      v_currency, COALESCE(v_customer.payment_terms, 'net_30'),
      p_invoice_date, v_due_date, v_ar_status,
      p_staff_id, 'Auto-opened from receivables invoice ' || v_invoice_number
    );
  END IF;

  -- 4. Mark receivables invoiced + link to the invoice
  UPDATE order_receivables
     SET status = 'invoiced',
         invoiced_via_invoice_id = v_invoice_id,
         updated_at = now(),
         updated_by_staff_id = p_staff_id
   WHERE order_id = p_order_id AND status = 'draft';

  -- 5. Bump invoiced_total
  UPDATE orders
     SET invoiced_total = COALESCE(invoiced_total, 0) + v_total
   WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'currency', v_currency,
    'subtotal', v_subtotal,
    'tax_amount', v_tax,
    'total_amount', v_total,
    'due_date', v_due_date,
    'lines', v_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_invoice_from_receivables(uuid, uuid, date) TO service_role;

-- ----------------------------------------------------------------------------
-- Companion: revert a receivables-sourced invoice (used by void-customer-invoice).
-- Puts the receivables back to 'draft', voids the AR ledger row, and rolls
-- invoiced_total back. Safe to call for any invoice; no-ops cleanly when the
-- invoice has no linked receivables.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_receivables_invoice(
  p_invoice_id uuid,
  p_staff_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order_id uuid;
  v_total    numeric;
  v_reverted int;
BEGIN
  SELECT order_id, total_amount INTO v_order_id, v_total
    FROM customer_invoices WHERE id = p_invoice_id;
  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found or has no order');
  END IF;

  UPDATE order_receivables
     SET status = 'draft',
         invoiced_via_invoice_id = NULL,
         updated_at = now(),
         updated_by_staff_id = p_staff_id
   WHERE invoiced_via_invoice_id = p_invoice_id;
  GET DIAGNOSTICS v_reverted = ROW_COUNT;

  IF v_reverted = 0 THEN
    RETURN jsonb_build_object('success', true, 'reverted', 0,
      'note', 'Invoice was not sourced from receivables; nothing to revert');
  END IF;

  -- Void the AR row if it is still fully open (untouched by payments)
  UPDATE accounts_receivable
     SET status = 'voided', updated_at = now()
   WHERE order_id = v_order_id
     AND COALESCE(amount_paid, 0) = 0
     AND status <> 'voided';

  -- Recompute invoiced_total from the surviving (non-void) invoices rather than
  -- decrementing, so it stays correct no matter what else touches it (the
  -- source-less void path may also adjust it) — idempotent.
  UPDATE orders o
     SET invoiced_total = COALESCE((
           SELECT sum(ci.total_amount) FROM customer_invoices ci
            WHERE ci.order_id = o.id
              AND ci.status <> 'void'
              AND ci.voided_at IS NULL), 0)
   WHERE o.id = v_order_id;

  RETURN jsonb_build_object('success', true, 'reverted', v_reverted, 'order_id', v_order_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.revert_receivables_invoice(uuid, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- Trigger: when ANY invoice is voided (status -> 'void' or voided_at set),
-- auto-revert its receivables. Path-agnostic (covers the source-less
-- generate-customer-invoice void action too). No-ops for invoices that were
-- not sourced from receivables.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_revert_receivables_on_void()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF (NEW.status = 'void' AND COALESCE(OLD.status, '') <> 'void')
     OR (NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL) THEN
    PERFORM public.revert_receivables_invoice(NEW.id, NEW.voided_by_staff_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customer_invoices_revert_receivables_on_void ON public.customer_invoices;
CREATE TRIGGER customer_invoices_revert_receivables_on_void
AFTER UPDATE ON public.customer_invoices
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status OR NEW.voided_at IS DISTINCT FROM OLD.voided_at)
EXECUTE FUNCTION public.trg_revert_receivables_on_void();

-- ----------------------------------------------------------------------------
-- Preserve receivable-provided line descriptions on the invoice.
-- The enrichment trigger used to always overwrite NEW.description with the
-- order's service name, which clobbered the per-receivable label (e.g.
-- "Cognitive Debriefing"). Now the caller's description wins as the work
-- segment; legacy lines with no description still fall back to the service.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enrich_invoice_line_description()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_number text;
  v_service text;
  v_src text;
  v_tgt text;
  v_work text;
BEGIN
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.order_number, sv.name, sl.name, tl.name
    INTO v_order_number, v_service, v_src, v_tgt
  FROM public.orders o
  LEFT JOIN public.quotes q  ON q.id  = o.quote_id
  LEFT JOIN public.languages sl ON sl.id = q.source_language_id
  LEFT JOIN public.languages tl ON tl.id = q.target_language_id
  LEFT JOIN public.services  sv ON sv.id = o.service_id
  WHERE o.id = NEW.order_id;

  v_work := COALESCE(NULLIF(trim(NEW.description), ''), v_service);

  IF v_order_number IS NOT NULL AND v_src IS NOT NULL AND v_tgt IS NOT NULL THEN
    NEW.description :=
      'Order ' || v_order_number
      || COALESCE(' | ' || v_work, '')
      || ' | ' || v_src || ' > ' || v_tgt
      || COALESCE(' | PO: ' || NULLIF(NEW.po_number, ''), '');
  END IF;

  RETURN NEW;
END;
$function$;
