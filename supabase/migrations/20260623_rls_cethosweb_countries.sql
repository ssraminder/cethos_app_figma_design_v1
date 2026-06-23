-- =====================================================================
-- RLS remediation (2026-06-23) — table 12 of 22: cethosweb_countries
--
-- Marketing-site (cethos.com) public reference data (91 rows). No admin/vendor
-- repo references; read by the public marketing site via the anon key. Writes
-- via service_role (marketing sync / admin). Public SELECT + service_role ALL.
-- Verified: anon/auth/service all read 91.
--
-- Rollback:
--   ALTER TABLE public.cethosweb_countries DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS cethosweb_countries_public_read ON public.cethosweb_countries;
--   DROP POLICY IF EXISTS cethosweb_countries_service_role_all ON public.cethosweb_countries;
-- =====================================================================

BEGIN;

ALTER TABLE public.cethosweb_countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cethosweb_countries_public_read ON public.cethosweb_countries;
CREATE POLICY cethosweb_countries_public_read
  ON public.cethosweb_countries FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS cethosweb_countries_service_role_all ON public.cethosweb_countries;
CREATE POLICY cethosweb_countries_service_role_all
  ON public.cethosweb_countries FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
