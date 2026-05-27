-- Server-side audio extraction (PR #792) means we upload RAW video bytes now
-- instead of pre-extracted audio. A 2hr 1080p video can be 1-2 GB. The old
-- 500 MB cap was set when client-side extraction shrank everything to ~30 MB.
--
-- Bump the bucket cap to 5 GB (Supabase default max for single-PUT upload)
-- and add the video MIME types the admin upload modal accepts but the bucket
-- didn't have whitelisted.

UPDATE storage.buckets
SET file_size_limit = 5368709120,            -- 5 GB
    allowed_mime_types = ARRAY[
      -- Audio
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
      'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac',
      'audio/ogg', 'audio/flac', 'audio/webm', 'audio/webm;codecs=opus',
      'audio/opus', 'audio/x-aiff', 'audio/aiff',
      -- Video — the modal accepts these via VIDEO_EXTENSIONS but the bucket
      -- previously only had mp4/mov/webm. Server extraction needs the raw
      -- bytes.
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
      'video/x-msvideo', 'video/avi', 'video/x-ms-wmv', 'video/x-flv',
      'video/3gpp', 'video/3gpp2', 'video/mp2t', 'video/mpeg',
      -- Output deliverables (preserved from earlier seed)
      'text/plain', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/vtt', 'application/json',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      -- Fallback when MIME isn't reliably set by the browser
      'application/octet-stream'
    ]
WHERE id = 'transcription-uploads';
