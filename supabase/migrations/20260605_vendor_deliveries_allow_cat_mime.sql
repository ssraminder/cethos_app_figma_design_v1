-- ============================================================================
-- vendor-deliveries: allow CAT-tool / XML delivery formats (e.g. .sdlxliff)
-- ----------------------------------------------------------------------------
-- Vendors deliver translation work as CAT-tool bilingual files — most commonly
-- Trados .sdlxliff, plus .mqxliff / .xliff / .tmx, etc. These extensions have
-- no OS-registered MIME type, so browsers upload them as `application/octet-stream`
-- (or empty / application/xml). The bucket previously allowed `application/x-xliff+xml`
-- only, so direct-to-storage uploads from the vendor portal were rejected with a
-- 400 (mime type not supported) before the file was ever stored.
--
-- Fix: extend `vendor-deliveries.allowed_mime_types` with the catch-all
-- octet-stream plus the XML/xliff family. Bucket stays private; access is gated
-- by storage RLS (see 20260525_vendor_deliveries_storage_rls_policies.sql) and a
-- 100 MB file_size_limit.
--
-- Applied to prod (lmzoyezvsjgsxveoakdr) via MCP before commit, per repo convention.
-- Idempotent: assigns the full desired array, so re-running is a no-op.
-- ============================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/html',
  'application/rtf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/zip',
  'application/x-xliff+xml',
  'application/xliff+xml',
  'application/xml',
  'text/xml',
  'application/octet-stream'
]
WHERE id = 'vendor-deliveries';
