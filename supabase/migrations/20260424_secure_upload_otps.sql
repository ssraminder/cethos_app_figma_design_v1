-- One-time-passcode gate for the public /secure-upload form.
-- Codes are sent via Brevo (email) or Twilio SMS (phone). After the code is
-- verified the row records a verification_token_hash that the upload-start
-- edge function checks before issuing signed upload URLs.

CREATE TABLE IF NOT EXISTS public.secure_upload_otps (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact                   text NOT NULL,
  channel                   text NOT NULL CHECK (channel IN ('email','phone')),
  code_hash                 text NOT NULL,
  attempts                  int  NOT NULL DEFAULT 0,
  expires_at                timestamptz NOT NULL,
  verified_at               timestamptz,
  verification_token_hash   text,
  verification_expires_at   timestamptz,
  ip_address                inet,
  user_agent                text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secure_upload_otps_contact_recent
  ON public.secure_upload_otps (contact, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_secure_upload_otps_verification
  ON public.secure_upload_otps (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

ALTER TABLE public.secure_upload_otps ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.secure_upload_otps IS
  'OTP gate for the public /secure-upload form. Codes expire in 10 min, verification tokens in 30 min.';

CREATE OR REPLACE FUNCTION public.purge_secure_upload_otps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.secure_upload_otps
   WHERE created_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_secure_upload_otps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_secure_upload_otps() TO postgres, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'secure-upload-otps-purge-24h') THEN
    PERFORM cron.unschedule('secure-upload-otps-purge-24h');
  END IF;
END $$;

SELECT cron.schedule(
  'secure-upload-otps-purge-24h',
  '0 4 * * *',
  $$ SELECT public.purge_secure_upload_otps(); $$
);
