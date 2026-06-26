-- Allow authenticated staff to upload training assets (screenshots) to the
-- public-read training-assets bucket. Read stays public; write now requires a
-- valid Supabase auth session (staff).
DROP POLICY IF EXISTS "training_assets_authenticated_insert" ON storage.objects;
CREATE POLICY "training_assets_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'training-assets');

DROP POLICY IF EXISTS "training_assets_authenticated_update" ON storage.objects;
CREATE POLICY "training_assets_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'training-assets')
  WITH CHECK (bucket_id = 'training-assets');
