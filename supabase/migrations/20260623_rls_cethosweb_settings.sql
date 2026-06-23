-- =====================================================================
-- RLS remediation (2026-06-23) — table 15 of 22: cethosweb_settings
--
-- Marketing-site config (3 rows, key/value jsonb): ga4, google_ads, gtm — i.e.
-- GA4 measurement id, GTM container id, Google Ads conversion id/label + enabled
-- flags. These are CLIENT-SIDE public tracking identifiers (embedded in the public
-- marketing site for the browser), not secrets, so public read is correct.
-- No admin/vendor references. Writes via service_role (marketing admin / sync).
-- Public SELECT + service_role ALL. Verified: anon/auth/service all read 3.
--
-- Rollback:
--   ALTER TABLE public.cethosweb_settings DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS cethosweb_settings_public_read ON public.cethosweb_settings;
--   DROP POLICY IF EXISTS cethosweb_settings_service_role_all ON public.cethosweb_settings;
-- =====================================================================

BEGIN;

ALTER TABLE public.cethosweb_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cethosweb_settings_public_read ON public.cethosweb_settings;
CREATE POLICY cethosweb_settings_public_read
  ON public.cethosweb_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS cethosweb_settings_service_role_all ON public.cethosweb_settings;
CREATE POLICY cethosweb_settings_service_role_all
  ON public.cethosweb_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
