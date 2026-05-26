-- Add VTT and JSON MIME types to transcription-uploads bucket
-- for new SRT/VTT/JSON output formats in transcription-deliver
UPDATE storage.buckets
SET allowed_mime_types = array_cat(
  allowed_mime_types,
  ARRAY['text/vtt', 'application/json']::text[]
)
WHERE id = 'transcription-uploads'
AND NOT (allowed_mime_types @> ARRAY['text/vtt', 'application/json']::text[]);
