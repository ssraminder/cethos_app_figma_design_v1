-- Raise per-file size limit and drop MIME allowlist on the two upload buckets.
-- Applied to prod 2026-05-27 via mcp__supabase__apply_migration.
--
-- Rationale:
--   * /secure-upload is OTP-gated and every object is virus-scanned post-upload
--   * /dashboard/upload and admin uploads run against authenticated sessions
--   * Customers need to send audio, video, and project archives, not just docs
--
-- Format gating at the bucket level was adding friction without buying
-- security. The 100 MB cap was tight for any video larger than ~1 minute.
update storage.buckets
   set file_size_limit = 524288000,    -- 500 MB
       allowed_mime_types = null       -- accept any MIME
 where id in ('public-submissions','customer-files');
