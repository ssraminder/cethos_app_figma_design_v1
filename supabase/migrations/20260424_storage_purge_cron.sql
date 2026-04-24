-- Reusable storage bucket purge helper + cron for pdf-to-word (120 days).
--
-- Usage for future buckets:
--   SELECT cron.schedule(
--     'my-bucket-purge-Nd',
--     '15 3 * * *',        -- daily at 03:15 UTC (stagger to avoid contention)
--     $$ SELECT public.purge_storage_bucket('my-bucket', 60); $$
--   );
--
-- Notes:
--   - Deleting rows from storage.objects triggers Supabase's storage service
--     to remove the underlying files.
--   - We return the count of rows deleted so it shows up in cron.job_run_details.

CREATE OR REPLACE FUNCTION public.purge_storage_bucket(
  p_bucket_id text,
  p_age_days  integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_age_days IS NULL OR p_age_days <= 0 THEN
    RAISE EXCEPTION 'purge_storage_bucket: p_age_days must be > 0 (got %)', p_age_days;
  END IF;

  DELETE FROM storage.objects
  WHERE bucket_id = p_bucket_id
    AND created_at < NOW() - (p_age_days || ' days')::interval;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RAISE NOTICE 'purge_storage_bucket: bucket=% age_days=% deleted=%',
    p_bucket_id, p_age_days, v_deleted;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_storage_bucket(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_storage_bucket(text, integer) TO postgres, service_role;

-- Schedule daily purge of pdf-to-word bucket at 120-day retention.
-- Runs 03:00 UTC daily. Unschedule before re-scheduling to stay idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('pdf-to-word-purge-120d')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'pdf-to-word-purge-120d'
  );
END $$;

SELECT cron.schedule(
  'pdf-to-word-purge-120d',
  '0 3 * * *',
  $$ SELECT public.purge_storage_bucket('pdf-to-word', 120); $$
);
