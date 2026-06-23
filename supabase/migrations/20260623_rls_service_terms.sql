-- =====================================================================
-- RLS remediation (2026-06-23) — table 16 of 22: service_terms
--
-- Vendor-facing service Terms & Conditions (2 rows). Despite being "vendor read",
-- it is read SERVER-SIDE only: the vendor portal fetches and records acceptance via
-- the edge function vendor-accept-terms (D:\cethos-vendor, uses SUPABASE_SERVICE_ROLE_KEY).
-- No admin/vendor frontend reads it directly (anon/authenticated), and no DB
-- function/view references it. Lock to service_role only.
--
-- (Verified by grep across admin client + vendor portal + edge functions, and a DB
-- catalog scan; dry-run: anon 0 / authenticated 0 / service_role 2.)
--
-- Rollback:
--   ALTER TABLE public.service_terms DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS service_terms_service_role_all ON public.service_terms;
-- =====================================================================

BEGIN;

ALTER TABLE public.service_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_terms_service_role_all ON public.service_terms;
CREATE POLICY service_terms_service_role_all
  ON public.service_terms FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
