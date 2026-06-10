-- 2026-06-10 XTRF reconciliation against fresh export (2026-06-10 13:28 MDT).
-- Applied to prod via MCP on 2026-06-10. Staging data was bulk-loaded from the
-- two CSV exports (client: 8,574 rows → 1,099-row reconciliation subset;
-- vendor: 5,925 rows, minimal columns internal_number + net/gross CAD).
--
-- Findings this fixes:
--   1. XTRF renamed client 77 "Linguistic Validation - Transperfect Translations
--      Ltd." → "Transperfect Translations Ltd." BEFORE the May 21 export. The
--      2026-05-22 full-history import aliased that name to xtrf_customer_id 9
--      (Transperfect Inc.) as presumed spelling drift — misattributing 38
--      invoices ($55,195.41 CAD) to the wrong customer.
--   2. xtrf_vendor_invoice_cache.netto_cad/gross_cad were wrong on 873 rows
--      (mostly stored as literal 1, plus other failed conversions) — vendor
--      costs under-reported by ~50% every month. e.g. Usman Khan Jan-Apr 2026:
--      cache said $230K CAD, actual $503K CAD.
--   3. 77 invoices issued after the May 21 snapshot (or missed) were absent;
--      29 invoices paid since then still showed unpaid; 12 balances drifted.
--
-- Unnumbered drafts ("Number not assigned") are excluded by design — they have
-- no stable key until XTRF issues them.

-- A. Reassign the 38 misattributed invoices (May-import alias error)
UPDATE customer_invoices ci
SET customer_id = '6a2d2f64-06d0-4748-8e1a-a9394183c059',
    updated_at = now(),
    notes = COALESCE(ci.notes,'') || ' | 2026-06-10: reassigned from Transperfect Inc. to Transperfect Translations Ltd. (xtrf 77) — May import alias mismatch'
FROM xtrf_csv_invoices_2026_05_21 s
WHERE s.invoice_number = ci.invoice_number
  AND s.client_name = 'Transperfect Translations Ltd.'
  AND ci.customer_id = '360e53cd-7187-4fcf-a26f-edebf4c1b1ba';

-- B. Rename customer to match XTRF (was "Linguistic Validation - ..." prefix)
UPDATE customers
SET company_name = 'Transperfect Translations Ltd.',
    full_name = 'Transperfect Translations Ltd.',
    updated_at = now()
WHERE id = '6a2d2f64-06d0-4748-8e1a-a9394183c059';

-- C. Insert invoices present in the fresh export but missing from the portal
--    (77 rows). Same shape as 20260522_xtrf_full_ar_import_all_history.sql but
--    with the corrected alias: 'Transperfect Translations Ltd.' → xtrf 77.
WITH csv_inv AS (
  SELECT i.invoice_number, i.client_name, i.invoice_date_final,
         COALESCE(i.gross_total_cad, 0) AS gross_cad,
         COALESCE(i.net_total_cad, 0) AS net_cad,
         COALESCE(i.gross_total_cad, 0) - COALESCE(i.net_total_cad, 0) AS tax_cad,
         CASE WHEN i.payment_status = 'Fully Paid' THEN 0 ELSE COALESCE(i.unpaid_amount_cad, 0) END AS unpaid_cad,
         i.payment_status, i.fully_paid_on
  FROM xtrf_csv_invoices_2026_06_10 i
  LEFT JOIN customer_invoices ci ON ci.invoice_number = i.invoice_number
  WHERE ci.id IS NULL
    AND i.invoice_status <> 'CANCELLED'
    AND i.invoice_date_final IS NOT NULL
),
matched AS (
  SELECT DISTINCT ON (csv_inv.invoice_number) csv_inv.*, c.id AS customer_id, c.invoicing_branch_id
  FROM csv_inv
  LEFT JOIN LATERAL (
    SELECT id, invoicing_branch_id
    FROM customers c
    WHERE (csv_inv.client_name = 'Transperfect Translations Ltd.' AND c.xtrf_customer_id = 77)
       OR (csv_inv.client_name = 'operations@zabtranslation.com' AND c.xtrf_customer_id = 8)
       OR LOWER(TRIM(COALESCE(c.company_name, c.full_name))) = LOWER(TRIM(csv_inv.client_name))
    ORDER BY (c.xtrf_customer_id IS NOT NULL) DESC, c.created_at ASC
    LIMIT 1
  ) c ON true
)
INSERT INTO customer_invoices (
  invoice_number, customer_id, subtotal, tax_rate, tax_amount, total_amount,
  amount_paid, balance_due, status, invoice_date, due_date, paid_at,
  currency, exchange_rate_to_cad, exchange_rate_date, exchange_rate_source,
  subtotal_cad, tax_amount_cad, total_amount_cad, amount_paid_cad,
  invoicing_branch_id, type, created_at, updated_at, notes
)
SELECT
  m.invoice_number, m.customer_id, m.net_cad,
  CASE WHEN m.net_cad > 0 THEN ROUND((m.tax_cad / m.net_cad)::numeric, 4) ELSE 0 END,
  m.tax_cad, m.gross_cad,
  GREATEST(m.gross_cad - m.unpaid_cad, 0), GREATEST(m.unpaid_cad, 0),
  CASE WHEN m.unpaid_cad <= 0 OR m.payment_status = 'Fully Paid' THEN 'paid' ELSE 'issued' END,
  m.invoice_date_final, m.invoice_date_final + INTERVAL '30 days',
  CASE WHEN m.unpaid_cad <= 0 OR m.payment_status = 'Fully Paid'
       THEN COALESCE(m.fully_paid_on::timestamptz, m.invoice_date_final::timestamptz) ELSE NULL END,
  'CAD', 1, m.invoice_date_final, 'xtrf_implied',
  m.net_cad, m.tax_cad, m.gross_cad, GREATEST(m.gross_cad - m.unpaid_cad, 0),
  COALESCE(m.invoicing_branch_id, 2), 'invoice',
  m.invoice_date_final::timestamptz, now(),
  'Imported from XTRF CSV 2026-06-10 (reconciliation)'
FROM matched m
WHERE m.customer_id IS NOT NULL;

-- D1. Mark invoices paid that XTRF shows fully paid (29 rows)
UPDATE customer_invoices ci
SET status = 'paid', balance_due = 0, amount_paid = ci.total_amount,
    amount_paid_cad = COALESCE(ci.total_amount_cad, ci.amount_paid_cad),
    paid_at = COALESCE(s.fully_paid_on::timestamptz, now()), updated_at = now()
FROM xtrf_csv_invoices_2026_06_10 s
WHERE s.invoice_number = ci.invoice_number
  AND (ci.xtrf_invoice_id IS NOT NULL OR ci.notes ILIKE '%XTRF%')
  AND s.payment_status = 'Fully Paid'
  AND ci.status NOT IN ('paid', 'void');

-- D2. Sync drifted balances on still-open invoices (12 rows)
UPDATE customer_invoices ci
SET balance_due = s.unpaid_amount_cad,
    amount_paid = GREATEST(ci.total_amount - s.unpaid_amount_cad, 0),
    status = CASE WHEN ci.status = 'paid' THEN 'issued' ELSE ci.status END,
    paid_at = CASE WHEN ci.status = 'paid' THEN NULL ELSE ci.paid_at END,
    updated_at = now()
FROM xtrf_csv_invoices_2026_06_10 s
WHERE s.invoice_number = ci.invoice_number
  AND (ci.xtrf_invoice_id IS NOT NULL OR ci.notes ILIKE '%XTRF%')
  AND s.payment_status IN ('Unpaid', 'Partially Paid', 'Irrecoverable')
  AND ci.status <> 'void'
  AND ci.balance_due IS DISTINCT FROM s.unpaid_amount_cad;

-- E. Fix vendor cache CAD values from the export's authoritative conversions
--    (873 rows; the sync had stored netto_cad = 1 or unconverted values)
UPDATE xtrf_vendor_invoice_cache c
SET netto_cad = s.net_total_cad, gross_cad = s.gross_total_cad, synced_at = now()
FROM xtrf_csv_vendor_invoices_2026_06_10 s
WHERE s.internal_number = c.internal_number
  AND (c.netto_cad IS DISTINCT FROM s.net_total_cad OR c.gross_cad IS DISTINCT FROM s.gross_total_cad);
