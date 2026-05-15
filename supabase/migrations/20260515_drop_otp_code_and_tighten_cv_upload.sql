-- =====================================================================
-- Cleanup migration for two open audit findings:
--
--   M-6: drop the legacy `otp_code` column from vendor_otp. H-4
--        migration replaced plaintext OTP with hash+salt; the column
--        was left NULLable for one release for in-flight backward
--        compat. By now those rows have all expired (OTP TTL = 10min)
--        and every active row uses otp_hash. The Deno + Netlify verify
--        functions are already redeployed without the otp_code
--        reference.
--
--   L-1: tighten the anon-INSERT policy on the cvp-applicant-cvs
--        bucket. Original policy let anon INSERT into any path; this
--        version requires the first path segment to be a UUID, which
--        matches the {crypto.randomUUID()}/{filename} scheme the
--        frontend (apps/recruitment Apply.tsx) uses. Without this,
--        an attacker could pollute the bucket with arbitrarily-named
--        files.
-- =====================================================================

-- M-6: drop the legacy column. Idempotent.
ALTER TABLE public.vendor_otp DROP COLUMN IF EXISTS otp_code;

-- L-1: replace the over-permissive anon-INSERT policy.
DROP POLICY IF EXISTS "cvp_applicant_cvs_anon_insert" ON storage.objects;
CREATE POLICY "cvp_applicant_cvs_anon_insert" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'cvp-applicant-cvs'
    AND (storage.foldername(name))[1] ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
