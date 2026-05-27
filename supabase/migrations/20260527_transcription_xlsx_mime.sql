-- Allow xlsx uploads to transcription-uploads bucket for export/import round-trip.
UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types || ARRAY[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]::text[]
WHERE id = 'transcription-uploads'
  AND NOT 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = ANY(allowed_mime_types);
