-- Vendor-side staging tables for the 2026-05-21 XTRF CSV reconciliation.

CREATE TABLE IF NOT EXISTS public.xtrf_csv_vendors_2026_05_21 (
  xtrf_id_str text PRIMARY KEY,
  xtrf_id_num integer GENERATED ALWAYS AS (NULLIF(regexp_replace(xtrf_id_str, '\D', '', 'g'), '')::int) STORED,
  legal_name text,
  name text,
  status text,
  availability text,
  language_combinations text,
  country text,
  city text,
  email text,
  phone text
);
CREATE INDEX IF NOT EXISTS xtrf_csv_vendors_id_num_idx
  ON public.xtrf_csv_vendors_2026_05_21 (xtrf_id_num);
CREATE INDEX IF NOT EXISTS xtrf_csv_vendors_name_lower_idx
  ON public.xtrf_csv_vendors_2026_05_21 (lower(trim(legal_name)));

CREATE TABLE IF NOT EXISTS public.xtrf_csv_vendor_invoices_2026_05_21 (
  internal_number text PRIMARY KEY,
  invoice_no text,
  invoice_date_final date,
  vendor_name text,
  jobs_value text,
  gross_total text,
  invoice_status text,
  payment_status text,
  payment_due_date date,
  tax_amount text,
  branch_name text,
  net_total_cad numeric(14,2),
  gross_total_cad numeric(14,2)
);
CREATE INDEX IF NOT EXISTS xtrf_csv_vinv_status_idx
  ON public.xtrf_csv_vendor_invoices_2026_05_21 (payment_status);
CREATE INDEX IF NOT EXISTS xtrf_csv_vinv_vendor_idx
  ON public.xtrf_csv_vendor_invoices_2026_05_21 (lower(trim(vendor_name)));

CREATE TABLE IF NOT EXISTS public.xtrf_csv_payables_2026_05_21 (
  id bigserial PRIMARY KEY,
  vendor_name text,
  invoice_number text,
  amount text,
  paid_amount text,
  due_date date,
  payment_plan text
);
CREATE INDEX IF NOT EXISTS xtrf_csv_payables_invnum_idx
  ON public.xtrf_csv_payables_2026_05_21 (invoice_number);
CREATE INDEX IF NOT EXISTS xtrf_csv_payables_vendor_idx
  ON public.xtrf_csv_payables_2026_05_21 (lower(trim(vendor_name)));
