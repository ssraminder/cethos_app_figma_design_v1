-- =====================================================================
-- Audit finding H-5: cron edge function authentication.
--
-- A dozen cron-only edge functions (cvp-send-queued-rejections,
-- cvp-process-feedback-auto-send, cvp-tms-migration-send,
-- vendor-doc-request-*, etc.) were unauthenticated. Anyone with the
-- URL could POST and force-flush queued sends — most acutely the
-- 48h rejection intercept window.
--
-- Fix: shared secret between pg_cron (the legitimate caller) and the
-- edge functions. Stored in vault.secrets so DB admins are the only
-- ones who see it; pg_cron reads it on each fire to include in the
-- `x-cron-secret` header; edge functions verify via a service-role
-- RPC.
-- =====================================================================

-- 1. Generate + store the shared secret. Idempotent — re-applying
--    won't rotate the secret.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_shared_secret') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'cron_shared_secret',
      'Audit H-5: shared secret between pg_cron and cvp-*/vendor-* cron edge functions'
    );
  END IF;
END $$;

-- 2. SECURITY DEFINER reader. Edge functions call this via the
--    service_role REST endpoint to retrieve the secret for header
--    comparison. EXECUTE restricted to service_role only.
CREATE OR REPLACE FUNCTION public.get_cron_shared_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
$$;

REVOKE EXECUTE ON FUNCTION public.get_cron_shared_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_shared_secret() TO service_role;

COMMENT ON FUNCTION public.get_cron_shared_secret() IS
  'Audit H-5: returns the cron shared secret from vault. service_role only.';
