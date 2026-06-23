-- IT-security (IQVIA / ISO): enable Row-Level Security on 17 public tables that
-- were created without it (flagged by server/scripts/lint-migrations-rls.ts).
--
-- Verified via grep across the admin client AND the vendor portal: only
-- transcription_versions and cvp_coa_translation_responses are read directly by a
-- (staff) client; the other 15 are reached only by edge functions (service role,
-- which bypasses RLS). Enabling RLS with a service_role-only policy on those 15
-- LOCKS OUT direct authenticated/anon access — a net security gain.
--
-- Statements are written literally (not a DO/format loop) so the migration RLS
-- linter, which regex-matches `ALTER TABLE public.<name> ENABLE ROW LEVEL
-- SECURITY`, recognises each table. Idempotent (already applied via MCP).

-- ============================================================================
-- 15 service-role-only tables (no direct client reads)
-- ============================================================================
ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_payments_service_role_all ON public.vendor_payments;
CREATE POLICY vendor_payments_service_role_all ON public.vendor_payments FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.vendor_payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_payment_allocations_service_role_all ON public.vendor_payment_allocations;
CREATE POLICY vendor_payment_allocations_service_role_all ON public.vendor_payment_allocations FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.xtrf_csv_invoices_2026_05_21 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xtrf_csv_invoices_2026_05_21_service_role_all ON public.xtrf_csv_invoices_2026_05_21;
CREATE POLICY xtrf_csv_invoices_2026_05_21_service_role_all ON public.xtrf_csv_invoices_2026_05_21 FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.xtrf_csv_receivables_2026_05_21 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xtrf_csv_receivables_2026_05_21_service_role_all ON public.xtrf_csv_receivables_2026_05_21;
CREATE POLICY xtrf_csv_receivables_2026_05_21_service_role_all ON public.xtrf_csv_receivables_2026_05_21 FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.xtrf_csv_clients_2026_05_21 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xtrf_csv_clients_2026_05_21_service_role_all ON public.xtrf_csv_clients_2026_05_21;
CREATE POLICY xtrf_csv_clients_2026_05_21_service_role_all ON public.xtrf_csv_clients_2026_05_21 FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.xtrf_csv_vendors_2026_05_21 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xtrf_csv_vendors_2026_05_21_service_role_all ON public.xtrf_csv_vendors_2026_05_21;
CREATE POLICY xtrf_csv_vendors_2026_05_21_service_role_all ON public.xtrf_csv_vendors_2026_05_21 FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.xtrf_csv_vendor_invoices_2026_05_21 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xtrf_csv_vendor_invoices_2026_05_21_service_role_all ON public.xtrf_csv_vendor_invoices_2026_05_21;
CREATE POLICY xtrf_csv_vendor_invoices_2026_05_21_service_role_all ON public.xtrf_csv_vendor_invoices_2026_05_21 FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.xtrf_csv_payables_2026_05_21 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xtrf_csv_payables_2026_05_21_service_role_all ON public.xtrf_csv_payables_2026_05_21;
CREATE POLICY xtrf_csv_payables_2026_05_21_service_role_all ON public.xtrf_csv_payables_2026_05_21 FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.cvp_coa_translation_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cvp_coa_translation_items_service_role_all ON public.cvp_coa_translation_items;
CREATE POLICY cvp_coa_translation_items_service_role_all ON public.cvp_coa_translation_items FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.legacy_supplier_invoice_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legacy_supplier_invoice_summary_service_role_all ON public.legacy_supplier_invoice_summary;
CREATE POLICY legacy_supplier_invoice_summary_service_role_all ON public.legacy_supplier_invoice_summary FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.cvp_frontdesk_escalations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cvp_frontdesk_escalations_service_role_all ON public.cvp_frontdesk_escalations;
CREATE POLICY cvp_frontdesk_escalations_service_role_all ON public.cvp_frontdesk_escalations FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.cvp_kb_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cvp_kb_entries_service_role_all ON public.cvp_kb_entries;
CREATE POLICY cvp_kb_entries_service_role_all ON public.cvp_kb_entries FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.vendor_purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_purchase_orders_service_role_all ON public.vendor_purchase_orders;
CREATE POLICY vendor_purchase_orders_service_role_all ON public.vendor_purchase_orders FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.vendor_po_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_po_queue_service_role_all ON public.vendor_po_queue;
CREATE POLICY vendor_po_queue_service_role_all ON public.vendor_po_queue FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.vendor_po_email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_po_email_log_service_role_all ON public.vendor_po_email_log;
CREATE POLICY vendor_po_email_log_service_role_all ON public.vendor_po_email_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2 tables read by the admin (staff) client — add an is_active_staff() policy
-- so the admin portal keeps working (verified live e2e).
-- ============================================================================
ALTER TABLE public.transcription_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transcription_versions_service_role_all ON public.transcription_versions;
CREATE POLICY transcription_versions_service_role_all ON public.transcription_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS transcription_versions_staff_all ON public.transcription_versions;
CREATE POLICY transcription_versions_staff_all ON public.transcription_versions FOR ALL TO authenticated USING (is_active_staff()) WITH CHECK (is_active_staff());

ALTER TABLE public.cvp_coa_translation_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cvp_coa_translation_responses_service_role_all ON public.cvp_coa_translation_responses;
CREATE POLICY cvp_coa_translation_responses_service_role_all ON public.cvp_coa_translation_responses FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS cvp_coa_translation_responses_staff_read ON public.cvp_coa_translation_responses;
CREATE POLICY cvp_coa_translation_responses_staff_read ON public.cvp_coa_translation_responses FOR SELECT TO authenticated USING (is_active_staff());
