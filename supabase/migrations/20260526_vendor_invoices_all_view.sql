-- Unified view of all vendor invoices from both XTRF (legacy TMS) and CVP (portal).
-- Used by the admin VendorInvoices page to show all invoices in one table.

CREATE OR REPLACE VIEW vendor_invoices_all AS

-- XTRF invoices (existing TMS)
SELECT
  id::text                   AS uid,
  final_number,
  internal_number,
  draft_number,
  provider_id,
  vendor_name,
  customer_name,
  currency_id,
  total_gross,
  total_netto,
  netto_cad,
  gross_cad,
  tax_cad,
  status,
  payment_status,
  draft_date,
  final_date,
  payment_due_date,
  invoice_uploaded_date,
  last_payment_date,
  notes_from_provider,
  payments,
  project_numbers,
  branch,
  synced_at,
  'xtrf'::text               AS source,
  NULL::text                 AS cvp_status,
  NULL::text                 AS cvp_id,
  NULL::text                 AS currency_code
FROM xtrf_vendor_invoice_cache

UNION ALL

-- CVP portal invoices
SELECT
  p.id::text                 AS uid,
  p.vendor_invoice_number    AS final_number,
  p.invoice_number           AS internal_number,
  NULL::text                 AS draft_number,
  NULL::integer              AS provider_id,
  v.full_name                AS vendor_name,
  c.full_name                AS customer_name,
  CASE p.currency
    WHEN 'EUR' THEN 1
    WHEN 'GBP' THEN 3
    WHEN 'CAD' THEN 30
    WHEN 'USD' THEN 67
    ELSE NULL
  END::integer               AS currency_id,
  p.total_amount             AS total_gross,
  p.amount                   AS total_netto,
  p.amount                   AS netto_cad,
  p.total_amount             AS gross_cad,
  p.tax_amount               AS tax_cad,
  CASE p.status
    WHEN 'draft'     THEN 'NOT_READY'
    WHEN 'submitted' THEN 'CONFIRMED'
    WHEN 'approved'  THEN 'CONFIRMED'
    WHEN 'paid'      THEN 'CONFIRMED'
    WHEN 'cancelled' THEN 'CANCELLED'
    ELSE p.status
  END                        AS status,
  CASE p.status
    WHEN 'paid' THEN 'FULLY_PAID'
    ELSE 'NOT_PAID'
  END                        AS payment_status,
  p.invoice_date             AS draft_date,
  CASE WHEN p.status IN ('submitted','approved','paid')
       THEN p.invoice_date ELSE NULL END AS final_date,
  p.due_date                 AS payment_due_date,
  CASE WHEN p.submitted_at IS NOT NULL
       THEN p.submitted_at::date ELSE NULL END AS invoice_uploaded_date,
  CASE WHEN p.paid_at IS NOT NULL
       THEN p.paid_at::date ELSE NULL END AS last_payment_date,
  p.notes                    AS notes_from_provider,
  CASE WHEN p.paid_at IS NOT NULL
    THEN jsonb_build_array(jsonb_build_object(
           'amount',            p.total_amount,
           'payment_date',      p.paid_at::date,
           'payment_method_id', p.payment_method,
           'notes',             p.payment_reference))
    ELSE '[]'::jsonb
  END                        AS payments,
  CASE WHEN o.order_number IS NOT NULL
       THEN ARRAY[o.order_number] ELSE NULL END AS project_numbers,
  CASE o.invoicing_branch_id
    WHEN 1 THEN 'Cethos Solutions Inc.'
    WHEN 2 THEN '12537494 Canada Inc.'
    ELSE NULL
  END                        AS branch,
  p.updated_at               AS synced_at,
  'cvp'::text                AS source,
  p.status                   AS cvp_status,
  p.id::text                 AS cvp_id,
  p.currency                 AS currency_code
FROM cvp_payments p
LEFT JOIN vendors v ON v.id = p.vendor_id
LEFT JOIN order_workflow_steps s ON s.id = p.step_id
LEFT JOIN orders o ON o.id = s.order_id
LEFT JOIN customers c ON c.id = o.customer_id;
