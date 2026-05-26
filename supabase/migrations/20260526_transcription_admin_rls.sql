-- Allow authenticated staff to manage transcription jobs from admin panel
-- and upload/read files from transcription-uploads bucket

-- Staff can insert transcription jobs (admin test upload)
CREATE POLICY "staff insert jobs"
ON transcription_jobs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Staff can update transcription jobs (reprocess, status changes)
CREATE POLICY "staff update jobs"
ON transcription_jobs
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Staff can upload to transcription-uploads bucket
CREATE POLICY "transcription_uploads_auth_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'transcription-uploads');

-- Staff can read from transcription-uploads bucket (for job detail page)
CREATE POLICY "transcription_uploads_auth_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'transcription-uploads');
