-- Data-accuracy fix: non-CAD invoices stored native value with no FX conversion,
-- so portal totals under-reported CAD revenue by ~$330k for 2025 alone.
-- Backfill from XTRF CSV (which has authoritative CAD-converted totals).
--
-- Before:
--   Portal 2025 gross CAD: $1,073,474.62  ← USD/GBP face values treated as CAD
--   CSV    2025 gross CAD: $1,403,643.00
-- After:
--   Portal 2025 gross CAD: $1,403,643.00  (matches CSV exactly)
--
-- Tax was already correct ($11,352.46 both sides) because the affected
-- invoices were all tax-exempt USD/GBP customers.

-- Phase 1: Non-CAD invoices — derive CAD from XTRF CSV, compute implied FX rate
UPDATE public.customer_invoices ci
SET
  subtotal_cad = csv.net_total_cad,
  tax_amount_cad = COALESCE(NULLIF(regexp_replace(COALESCE(csv.tax_amount,''), '[^0-9.\-]', '', 'g'), '')::numeric, 0),
  total_amount_cad = csv.gross_total_cad,
  amount_paid_cad = GREATEST(csv.gross_total_cad - COALESCE(csv.unpaid_amount_cad, 0), 0),
  exchange_rate_to_cad = CASE
    WHEN ci.total_amount > 0 THEN ROUND((csv.gross_total_cad / ci.total_amount)::numeric, 8)
    ELSE 1
  END,
  exchange_rate_date = ci.invoice_date,
  exchange_rate_source = 'xtrf_implied',
  updated_at = now()
FROM xtrf_csv_invoices_2026_05_21 csv
WHERE csv.invoice_number = ci.invoice_number
  AND ci.currency <> 'CAD'
  AND ci.total_amount_cad IS NULL
  AND ci.type = 'invoice';

-- Phase 2: CAD invoices missing _cad columns — mirror native at rate 1
UPDATE public.customer_invoices ci
SET
  subtotal_cad = ci.subtotal,
  tax_amount_cad = ci.tax_amount,
  total_amount_cad = ci.total_amount,
  amount_paid_cad = ci.amount_paid,
  exchange_rate_to_cad = 1,
  exchange_rate_date = ci.invoice_date,
  exchange_rate_source = COALESCE(ci.exchange_rate_source, 'xtrf_implied'),
  updated_at = now()
WHERE ci.currency = 'CAD'
  AND ci.total_amount_cad IS NULL
  AND ci.type = 'invoice';
