-- =============================================================================
-- Customer file library — single source of truth for files attributed to a
-- specific customer, regardless of who uploaded them.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customer_files (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  storage_path         text NOT NULL UNIQUE,
  original_filename    text NOT NULL,
  size_bytes           bigint NOT NULL,
  mime_type            text NOT NULL,
  uploaded_by_type     text NOT NULL CHECK (uploaded_by_type IN ('customer','admin')),
  uploaded_by_staff_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  upload_session_id    uuid,
  scan_status          text NOT NULL DEFAULT 'scan_pending'
                        CHECK (scan_status IN ('scan_pending','scan_clean','scan_infected','scan_error')),
  scan_completed_at    timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_files_customer
  ON public.customer_files (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_files_session
  ON public.customer_files (upload_session_id) WHERE upload_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_files_scan_pending
  ON public.customer_files (id) WHERE scan_status = 'scan_pending';

ALTER TABLE public.customer_files ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.customer_files IS
  'All files attributed to a specific customer — uploaded via the customer portal or by an admin on the customer''s behalf. Service-role-only access; clients go through edge functions.';

-- Storage bucket for customer-attributed files.
-- Path convention:
--   <customerId>/customer/<sessionId>/<file>  (customer self-upload)
--   <customerId>/admin/<sessionId>/<file>     (admin upload for customer)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-files',
  'customer-files',
  false,
  104857600,
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/heic', 'image/heif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service role manages customer-files"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'customer-files')
  WITH CHECK (bucket_id = 'customer-files');

-- 365-day auto-purge cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'customer-files-purge-365d') THEN
    PERFORM cron.unschedule('customer-files-purge-365d');
  END IF;
END $$;

SELECT cron.schedule(
  'customer-files-purge-365d',
  '45 3 * * *',
  $$ SELECT public.purge_storage_bucket('customer-files', 365); $$
);

-- Raise public-submissions bucket to 100 MB to match form cap
UPDATE storage.buckets
   SET file_size_limit = 104857600
 WHERE id = 'public-submissions';
