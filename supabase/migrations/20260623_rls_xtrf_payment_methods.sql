-- =====================================================================
-- RLS remediation (2026-06-23) — table 5 of 22: xtrf_payment_methods
--
-- XTRF payment-method lookup (10 rows). Read by the admin staff UI
-- (client/pages/admin/vendor-detail/VendorPaymentsTab.tsx) via the
-- authenticated client => keep authenticated SELECT. Written by xtrf-sync
-- edge functions (service_role). No anon reader exists (admin-only page),
-- so anon is intentionally locked out.
--
-- Rollback:
--   ALTER TABLE public.xtrf_payment_methods DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS xtrf_payment_methods_service_role_all ON public.xtrf_payment_methods;
--   DROP POLICY IF EXISTS xtrf_payment_methods_authenticated_read ON public.xtrf_payment_methods;
-- =====================================================================

BEGIN;

ALTER TABLE public.xtrf_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xtrf_payment_methods_service_role_all ON public.xtrf_payment_methods;
CREATE POLICY xtrf_payment_methods_service_role_all
  ON public.xtrf_payment_methods FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS xtrf_payment_methods_authenticated_read ON public.xtrf_payment_methods;
CREATE POLICY xtrf_payment_methods_authenticated_read
  ON public.xtrf_payment_methods FOR SELECT TO authenticated USING (true);

COMMIT;
