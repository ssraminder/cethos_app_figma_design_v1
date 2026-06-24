-- Welocalize 2nd batch — Stage C: 6 PO-grouped customer invoices FROM the draft receivables.
-- Driven off draft order_receivables (idempotent: re-running finds nothing once invoiced).
-- Clean line descriptions come from trg_enrich_invoice_line_description (BEFORE INSERT) by passing
-- description = NULL  ->  trigger builds "Order {ORD#} | {Service} | {Source} > {Target} | PO: {PO}".
-- USD, tax 0 (zero-rated export). One AR ledger row per order. Header order_id = order for single-order
-- POs, NULL for multi-order POs (matches batch 1; an invoice spanning N orders has no single owner).
-- Result: CT-2026-001015..001020 ($48,250 USD). PDFs rendered via generate-invoice-pdf afterwards.
DO $$
DECLARE
  v_staff uuid := 'a8b2d97e-4832-41d4-9334-4d6a58558154';  -- raminder@cethos.com
  v_customer uuid := 'fcb79ac3-aba6-41b8-9bda-568c1cf5a0ec';
  v_branch int := 2;                 -- 12537494 Canada Inc.
  v_invdate date := DATE '2026-06-23';
  v_due date := DATE '2026-08-07';   -- net_45
  v_snapshot jsonb := jsonb_build_object(
    'city',null,'email','info@welocalize.com','currency','USD','province',null,'tax_number',null,
    'postal_code',null,'company_name','Welocalize, Inc.','generated_at',to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'address_line1',null,'customer_name','Welocalize, Inc.',
    'branch_legal_name','12537494 Canada Inc.','branch_tax_number','796773141RT0001');
  po record; ordr record;
  v_inv uuid; v_invnum text; v_sort int; v_made int := 0; v_lines int := 0;
BEGIN
  FOR po IN
    SELECT o.po_number,
           sum(r.line_total) AS total, count(*) AS n,
           CASE WHEN count(*)=1 THEN (array_agg(o.id))[1] ELSE NULL END AS header_order,
           CASE WHEN count(DISTINCT o.client_project_number)=1 THEN min(o.client_project_number) ELSE NULL END AS proj
    FROM order_receivables r JOIN orders o ON o.id=r.order_id
    WHERE r.status='draft' AND o.customer_id=v_customer
      AND o.po_number IN ('PO-1414502','PO-1417055','PO-1418133','PO-1418158','PO-1420602','PO-1421561')
    GROUP BY o.po_number ORDER BY o.po_number
  LOOP
    v_invnum := next_invoice_number(v_branch);
    INSERT INTO customer_invoices(invoice_number, order_id, customer_id, subtotal, certification_total,
        rush_fee, delivery_fee, tax_rate, tax_amount, total_amount, amount_paid, balance_due, status,
        invoice_date, due_date, trigger_type, invoicing_branch_id, currency, po_number, client_project_number,
        type, billing_snapshot)
      VALUES (v_invnum, po.header_order, v_customer, po.total, 0, 0, 0, 0, 0, po.total, 0, po.total, 'issued',
        v_invdate, v_due, 'receivables', v_branch, 'USD', po.po_number, po.proj, 'invoice', v_snapshot)
      RETURNING id INTO v_inv;
    v_sort := 0;
    FOR ordr IN
      SELECT o.id, r.line_total AS amt, o.po_number, o.client_project_number
      FROM order_receivables r JOIN orders o ON o.id=r.order_id
      WHERE r.status='draft' AND o.customer_id=v_customer AND o.po_number=po.po_number
      ORDER BY o.order_number
    LOOP
      INSERT INTO customer_invoice_lines(invoice_id, line_type, order_id, description, subtotal, line_total,
          po_number, client_project_number, sort_order)
        VALUES (v_inv, 'order', ordr.id, NULL, ordr.amt, ordr.amt, ordr.po_number, ordr.client_project_number, v_sort);
      UPDATE order_receivables SET status='invoiced', invoiced_via_invoice_id=v_inv,
          updated_at=now(), updated_by_staff_id=v_staff
        WHERE order_id=ordr.id AND status='draft';
      UPDATE orders SET invoice_status='invoiced', invoiced_total=COALESCE(invoiced_total,0)+ordr.amt, updated_at=now()
        WHERE id=ordr.id;
      INSERT INTO accounts_receivable(order_id, customer_id, original_amount, amount_paid, currency,
          payment_terms, invoice_date, due_date, status, created_by_staff_id, notes)
        VALUES (ordr.id, v_customer, ordr.amt, 0, 'USD', 'net_45', v_invdate, v_due, 'unpaid',
          v_staff, 'Auto-opened from receivables invoice ' || v_invnum);
      v_sort := v_sort + 1; v_lines := v_lines + 1;
    END LOOP;
    v_made := v_made + 1;
  END LOOP;
  RAISE NOTICE 'Welocalize batch 2 Stage C: % invoices, % lines', v_made, v_lines;
END $$;
