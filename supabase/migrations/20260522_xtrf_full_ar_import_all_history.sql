-- Materialize all remaining XTRF CSV invoices into customer_invoices.
-- Drops the prior 2024+ date filter and prior open-AP customer filter.
-- After this runs the portal AR view spans all-time XTRF history,
-- giving accurate GST collection totals across every quarter.
--
-- Customer resolution priority:
--   1. Alias overrides for spelling drift (Transperfect Ltd. → Inc.,
--      operations@zabtranslation.com → Zab)
--   2. Exact name match (LOWER+TRIM) against company_name or full_name,
--      preferring customers with an xtrf_customer_id set, then earliest
--   3. Skip if still unresolved (orphan stubs created in prior migration)
--
-- Amount mapping (CSV is CAD-only):
--   subtotal      = net_total_cad
--   tax_amount    = parsed tax_amount text
--   total_amount  = gross_total_cad
--   amount_paid   = gross_total_cad - unpaid_amount_cad
--   balance_due   = unpaid_amount_cad
--   currency      = 'CAD' (historical foreign-currency detail lost — CSV is CAD-only)
--   exchange_rate_to_cad = 1
--   status enum is {draft,issued,sent,paid,overdue,void} — partials use 'issued'.
--
-- Branch comes from the resolved customer's invoicing_branch_id (fallback 2).

WITH csv_inv AS (
  SELECT
    i.invoice_number,
    i.client_name,
    i.invoice_date_final,
    COALESCE(i.gross_total_cad, 0) AS gross_cad,
    COALESCE(i.net_total_cad, 0) AS net_cad,
    NULLIF(regexp_replace(COALESCE(i.tax_amount,''), '[^0-9.\-]', '', 'g'), '')::numeric AS tax_cad,
    COALESCE(i.unpaid_amount_cad, 0) AS unpaid_cad,
    i.payment_status,
    i.fully_paid_on
  FROM xtrf_csv_invoices_2026_05_21 i
  LEFT JOIN customer_invoices ci ON ci.invoice_number = i.invoice_number
  WHERE i.invoice_number IS NOT NULL
    AND i.invoice_number <> 'Number not assigned'
    AND i.invoice_status <> 'CANCELLED'
    AND ci.id IS NULL
    AND i.invoice_date_final IS NOT NULL
),
matched AS (
  SELECT DISTINCT ON (csv_inv.invoice_number)
    csv_inv.*,
    c.id AS customer_id,
    c.invoicing_branch_id
  FROM csv_inv
  LEFT JOIN LATERAL (
    SELECT id, invoicing_branch_id, xtrf_customer_id
    FROM customers c
    WHERE
      (csv_inv.client_name = 'Transperfect Translations Ltd.' AND c.xtrf_customer_id = 9)
      OR (csv_inv.client_name = 'operations@zabtranslation.com' AND c.xtrf_customer_id = 8)
      OR LOWER(TRIM(COALESCE(c.company_name, c.full_name))) = LOWER(TRIM(csv_inv.client_name))
    ORDER BY
      (c.xtrf_customer_id IS NOT NULL) DESC,
      c.created_at ASC
    LIMIT 1
  ) c ON true
)
INSERT INTO public.customer_invoices (
  invoice_number,
  customer_id,
  subtotal,
  tax_rate,
  tax_amount,
  total_amount,
  amount_paid,
  balance_due,
  status,
  invoice_date,
  due_date,
  paid_at,
  currency,
  exchange_rate_to_cad,
  exchange_rate_date,
  exchange_rate_source,
  subtotal_cad,
  tax_amount_cad,
  total_amount_cad,
  amount_paid_cad,
  invoicing_branch_id,
  type,
  created_at,
  updated_at,
  notes
)
SELECT
  m.invoice_number,
  m.customer_id,
  m.net_cad AS subtotal,
  CASE WHEN m.net_cad > 0 THEN ROUND((COALESCE(m.tax_cad, 0) / m.net_cad)::numeric, 4) ELSE 0 END AS tax_rate,
  COALESCE(m.tax_cad, 0) AS tax_amount,
  m.gross_cad AS total_amount,
  GREATEST(m.gross_cad - m.unpaid_cad, 0) AS amount_paid,
  GREATEST(m.unpaid_cad, 0) AS balance_due,
  CASE
    WHEN m.unpaid_cad <= 0 OR m.payment_status = 'Paid' THEN 'paid'
    ELSE 'issued'
  END AS status,
  m.invoice_date_final AS invoice_date,
  m.invoice_date_final + INTERVAL '30 days' AS due_date,
  CASE
    WHEN m.unpaid_cad <= 0 OR m.payment_status = 'Paid'
      THEN COALESCE(m.fully_paid_on::timestamptz, m.invoice_date_final::timestamptz)
    ELSE NULL
  END AS paid_at,
  'CAD' AS currency,
  1 AS exchange_rate_to_cad,
  m.invoice_date_final AS exchange_rate_date,
  'xtrf_implied' AS exchange_rate_source,
  m.net_cad AS subtotal_cad,
  COALESCE(m.tax_cad, 0) AS tax_amount_cad,
  m.gross_cad AS total_amount_cad,
  GREATEST(m.gross_cad - m.unpaid_cad, 0) AS amount_paid_cad,
  COALESCE(m.invoicing_branch_id, 2) AS invoicing_branch_id,
  'invoice' AS type,
  m.invoice_date_final::timestamptz AS created_at,
  now() AS updated_at,
  'Imported from XTRF CSV 2026-05-22 (full history backfill)' AS notes
FROM matched m
WHERE m.customer_id IS NOT NULL;
