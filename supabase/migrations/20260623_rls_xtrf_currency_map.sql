-- =====================================================================
-- RLS remediation (2026-06-23) — table 4 of 22: xtrf_currency_map
--
-- XTRF currency-id -> ISO-code map (6 rows). Read by the admin staff UI
-- (client/pages/admin/vendor-detail/VendorInvoicesTab.tsx,
--  client/pages/admin/vendor-detail/VendorPaymentsTab.tsx) via the
-- authenticated client => keep authenticated SELECT. Written by xtrf-sync
-- edge functions (service_role). No anon (logged-out / public) reader exists
-- — these are admin-only pages — so anon is intentionally locked out.
--
-- Rollback:
--   ALTER TABLE public.xtrf_currency_map DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS xtrf_currency_map_service_role_all ON public.xtrf_currency_map;
--   DROP POLICY IF EXISTS xtrf_currency_map_authenticated_read ON public.xtrf_currency_map;
-- =====================================================================

BEGIN;

ALTER TABLE public.xtrf_currency_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xtrf_currency_map_service_role_all ON public.xtrf_currency_map;
CREATE POLICY xtrf_currency_map_service_role_all
  ON public.xtrf_currency_map FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS xtrf_currency_map_authenticated_read ON public.xtrf_currency_map;
CREATE POLICY xtrf_currency_map_authenticated_read
  ON public.xtrf_currency_map FOR SELECT TO authenticated USING (true);

COMMIT;
