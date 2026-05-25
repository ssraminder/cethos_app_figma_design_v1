-- ============================================================================
-- Add storage.objects RLS policies for the 'vendor-deliveries' bucket.
--
-- The bucket existed (vendor portal uploads via service-role Netlify
-- functions), but had no SELECT policy for the 'authenticated' role.
-- Admin UI calls supabase.storage.from('vendor-deliveries').createSignedUrl()
-- directly from the browser (handleDownloadFile in OrderWorkflowSection),
-- which runs as the user's authenticated JWT — and with no matching policy,
-- Supabase storage returns 404 not_found on every sign attempt. From the
-- staff's POV: "File download link generation failed" on every delivery
-- download click.
--
-- Mirrors the pattern used by quote-files, customer-files, invoices, etc.:
--   * service_role: ALL (Netlify functions, edge functions, etc.)
--   * staff (is_active_staff()): ALL (admin UI direct storage calls)
-- ============================================================================

CREATE POLICY "vendor_deliveries_service_role_all"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'vendor-deliveries')
  WITH CHECK (bucket_id = 'vendor-deliveries');

CREATE POLICY "vendor_deliveries_staff_all"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'vendor-deliveries' AND is_active_staff())
  WITH CHECK (bucket_id = 'vendor-deliveries' AND is_active_staff());
