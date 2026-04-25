-- Let authenticated staff users SELECT objects in the upload buckets so the
-- admin portal can call createSignedUrl(...) directly from the browser. The
-- buckets remain private (no public policy); only staff users can read.

CREATE POLICY "Staff can read public-submissions objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('public-submissions','public-submissions-quarantine')
    AND public.is_staff_user()
  );

CREATE POLICY "Staff can read customer-files objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'customer-files'
    AND public.is_staff_user()
  );

CREATE POLICY "Staff can write customer-files objects"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'customer-files'
    AND public.is_staff_user()
  );

CREATE POLICY "Staff can update customer-files objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'customer-files'
    AND public.is_staff_user()
  );

CREATE POLICY "Staff can delete customer-files objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'customer-files'
    AND public.is_staff_user()
  );
