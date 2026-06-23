-- =====================================================================
-- RLS remediation (2026-06-23) — table 10 of 22: services
--
-- Public service catalogue (50 rows). Read paths:
--   * anon  — public recruitment site (D:\cethos-vendor apps/recruitment useServices.ts)
--   * authenticated — admin (VendorFinderModal, CustomerRatesTab, AdminVendorDetail,
--     ServicesSettings, WorkflowTemplatesSettings, AccountsReceivable)
--   * service_role — many edge functions (admin-create-order, get-order-workflow,
--     notify-*, vendor-* …)
-- Write path: admin staff via client/pages/admin/settings/ServicesSettings.tsx
--   (.insert / .update on the authenticated client).
--
-- Policy = the Group A reference-table pattern: public SELECT (anon+authenticated) +
-- staff_manage (is_active_staff) for writes + service_role ALL. Verified: anon/auth/
-- service all read 50; staff INSERT passes RLS; anon INSERT blocked (401 / 42501).
--
-- Rollback:
--   ALTER TABLE public.services DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS services_public_read ON public.services;
--   DROP POLICY IF EXISTS services_staff_manage ON public.services;
--   DROP POLICY IF EXISTS services_service_role_all ON public.services;
-- =====================================================================

BEGIN;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_public_read ON public.services;
CREATE POLICY services_public_read
  ON public.services FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS services_staff_manage ON public.services;
CREATE POLICY services_staff_manage
  ON public.services FOR ALL TO authenticated USING (is_active_staff()) WITH CHECK (is_active_staff());

DROP POLICY IF EXISTS services_service_role_all ON public.services;
CREATE POLICY services_service_role_all
  ON public.services FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
