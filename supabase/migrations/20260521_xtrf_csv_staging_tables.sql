-- Staging tables for the 2026-05-21 XTRF CSV reconciliation.
-- Source of truth for payment_status / fully_paid_on / receivable amounts that
-- the XTRF v1 API endpoints under-report. See docs/xtrf-import.md.

CREATE TABLE IF NOT EXISTS public.xtrf_csv_invoices_2026_05_21 (
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

CREATE TABLE IF NOT EXISTS public.xtrf_csv_receivables_2026_05_21 (
  id bigserial PRIMARY KEY,
  client_name text,
  invoice_number text,
  amount text,
  paid_amount text,
  due_date date,
  payment_plan text
);
CREATE INDEX IF NOT EXISTS xtrf_csv_recv_invnum_idx
  ON public.xtrf_csv_receivables_2026_05_21 (invoice_number);

CREATE TABLE IF NOT EXISTS public.xtrf_csv_clients_2026_05_21 (
  xtrf_id_str text PRIMARY KEY,
  xtrf_id_num integer GENERATED ALWAYS AS (NULLIF(regexp_replace(xtrf_id_str, '\D', '', 'g'), '')::int) STORED,
  name text NOT NULL,
  status text,
  country text,
  first_contact_date date,
  categories text
);
CREATE INDEX IF NOT EXISTS xtrf_csv_clients_xtrf_id_num_idx
  ON public.xtrf_csv_clients_2026_05_21 (xtrf_id_num);
CREATE INDEX IF NOT EXISTS xtrf_csv_clients_name_lower_idx
  ON public.xtrf_csv_clients_2026_05_21 (lower(trim(name)));
