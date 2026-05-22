-- Create all 1,385 missing customers from xtrf_csv_clients_2026_05_21.
-- These are the historical (mostly pre-2024) clients that had no open AP
-- and were skipped by the earlier "open invoices only" filter. Needed for
-- a complete portal AR + accurate GST collection numbers across all time.
--
-- Strategy:
--   - email = xtrf-<xtrf_id>@imported.cethos.com (placeholder; staff updates later)
--   - billing_country defaults to CSV country, fallback 'Canada'
--   - is_tax_exempt auto-true if country looks non-Canadian
--   - invoicing_branch_id from xtrf_customer_cache.branch_id when present, else 2
--   - customer_type 'individual' default (no category data in CSV)

INSERT INTO public.customers (
  email,
  full_name,
  company_name,
  xtrf_customer_id,
  customer_type,
  billing_country,
  preferred_currency,
  currency,
  invoicing_branch_id,
  is_tax_exempt,
  payment_terms,
  is_ar_customer,
  created_at,
  updated_at
)
SELECT
  'xtrf-' || cc.xtrf_id_num || '@imported.cethos.com' AS email,
  cc.name AS full_name,
  cc.name AS company_name,
  cc.xtrf_id_num AS xtrf_customer_id,
  'individual' AS customer_type,
  COALESCE(NULLIF(TRIM(cc.country), ''), 'Canada') AS billing_country,
  'CAD' AS preferred_currency,
  'CAD' AS currency,
  COALESCE(xcc.branch_id, 2) AS invoicing_branch_id,
  CASE
    WHEN cc.country IS NOT NULL
      AND TRIM(cc.country) <> ''
      AND cc.country NOT ILIKE '%canad%'
      AND cc.country <> 'CA'
    THEN true
    ELSE false
  END AS is_tax_exempt,
  'net_30' AS payment_terms,
  false AS is_ar_customer,
  COALESCE(cc.first_contact_date::timestamptz, now()) AS created_at,
  now() AS updated_at
FROM xtrf_csv_clients_2026_05_21 cc
LEFT JOIN xtrf_customer_cache xcc ON xcc.id = cc.xtrf_id_num
LEFT JOIN public.customers existing ON existing.xtrf_customer_id = cc.xtrf_id_num
WHERE existing.id IS NULL;
