-- Staging tables for the 2026-06-10 XTRF CSV reconciliation (fresh export).
-- Same shapes as the 2026-05-21 tables. Source of truth for invoice presence,
-- payment status, and CAD-converted totals as of 2026-06-10 13:28 MDT.

CREATE TABLE IF NOT EXISTS public.xtrf_csv_invoices_2026_06_10 (
  invoice_number text PRIMARY KEY,
  client_name text,
  tasks_value text,
  net_total text,
  invoice_status text,
  payment_status text,
  invoice_date_final date,
  unpaid_amount_cad numeric(14,2),
  fully_paid_on date,
  gross_total_cad numeric(14,2),
  tax_amount text,
  net_total_cad numeric(14,2)
);

CREATE TABLE IF NOT EXISTS public.xtrf_csv_vendor_invoices_2026_06_10 (
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
CREATE INDEX IF NOT EXISTS xtrf_csv_vinv_0610_vendor_idx
  ON public.xtrf_csv_vendor_invoices_2026_06_10 (lower(trim(vendor_name)));
