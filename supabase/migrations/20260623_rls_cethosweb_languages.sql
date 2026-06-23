-- =====================================================================
-- RLS remediation (2026-06-23) — table 13 of 22: cethosweb_languages
--
-- Marketing-site public reference data (75 rows). No admin/vendor references;
-- read by the public marketing site (anon). Writes via service_role.
-- Public SELECT + service_role ALL. Verified: anon/auth/service all read 75.
--
-- Rollback:
--   ALTER TABLE public.cethosweb_languages DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS cethosweb_languages_public_read ON public.cethosweb_languages;
--   DROP POLICY IF EXISTS cethosweb_languages_service_role_all ON public.cethosweb_languages;
-- =====================================================================

BEGIN;

ALTER TABLE public.cethosweb_languages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cethosweb_languages_public_read ON public.cethosweb_languages;
CREATE POLICY cethosweb_languages_public_read
  ON public.cethosweb_languages FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS cethosweb_languages_service_role_all ON public.cethosweb_languages;
CREATE POLICY cethosweb_languages_service_role_all
  ON public.cethosweb_languages FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
