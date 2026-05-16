-- ============================================================================
-- tr-review-jobs storage bucket — private, MIME allowlist, 100 MB cap.
-- Path scheme: {job_id}/{role}/{file_id}-{slug}.{ext}
-- Roles: source / target / reference / client_email / output / open_question_image
-- Staff full RW via authenticated session; signed URLs minted by edge function.
-- Mirrors project-assets and qms-evidence patterns.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tr-review-jobs',
  'tr-review-jobs',
  false,
  104857600,  -- 100 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/plain',
    'text/csv',
    'text/markdown',
    'message/rfc822',                                -- .eml
    'application/vnd.ms-outlook',                    -- .msg
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/tiff',
    'application/zip'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: staff full read/write to this bucket.
create policy "tr-review-jobs: staff read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tr-review-jobs' and tr.is_staff()
  );

create policy "tr-review-jobs: staff insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tr-review-jobs' and tr.is_staff()
  );

create policy "tr-review-jobs: staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'tr-review-jobs' and tr.is_staff())
  with check (bucket_id = 'tr-review-jobs' and tr.is_staff());

create policy "tr-review-jobs: staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tr-review-jobs' and tr.is_staff());
