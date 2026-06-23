-- =====================================================================
-- RLS remediation (2026-06-23) — table 14 of 22: cethosweb_locales
--
-- Marketing-site public reference data (77 rows). No admin/vendor references;
-- read by the public marketing site (anon). Writes via service_role.
-- Public SELECT + service_role ALL. Verified: anon/auth/service all read 77.
--
-- Rollback:
--   ALTER TABLE public.cethosweb_locales DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS cethosweb_locales_public_read ON public.cethosweb_locales;
--   DROP POLICY IF EXISTS cethosweb_locales_service_role_all ON public.cethosweb_locales;
-- =====================================================================

BEGIN;

ALTER TABLE public.cethosweb_locales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cethosweb_locales_public_read ON public.cethosweb_locales;
CREATE POLICY cethosweb_locales_public_read
  ON public.cethosweb_locales FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS cethosweb_locales_service_role_all ON public.cethosweb_locales;
CREATE POLICY cethosweb_locales_service_role_all
  ON public.cethosweb_locales FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
