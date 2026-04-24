-- ============================================================================
-- Public Submissions — secure client-facing upload from marketing site.
-- Backs the /secure-upload form on main_web.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.public_submissions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name               text NOT NULL,
  email                   text NOT NULL,
  phone                   text NOT NULL,
  order_or_quote_id       text,
  message                 text,
  file_paths              jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_from          text,
  ip_address              inet,
  user_agent              text,
  scan_status             text NOT NULL DEFAULT 'scan_pending'
                           CHECK (scan_status IN ('scan_pending','scan_clean','scan_infected','scan_error')),
  scan_completed_at       timestamptz,
  reviewed_by             uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  reviewed_at             timestamptz,
  converted_to_quote_id   uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_submissions_created_at
  ON public.public_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_submissions_email
  ON public.public_submissions (email);
CREATE INDEX IF NOT EXISTS idx_public_submissions_scan_status
  ON public.public_submissions (scan_status);
CREATE INDEX IF NOT EXISTS idx_public_submissions_reviewed
  ON public.public_submissions (reviewed_at) WHERE reviewed_at IS NULL;

-- RLS on — service role only. Clients always go through API routes.
ALTER TABLE public.public_submissions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.public_submissions IS
  'Submissions from the public /secure-upload form on the marketing site. Read/write only by service role.';

-- ============================================================================
-- Storage buckets
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-submissions',
  'public-submissions',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/heic', 'image/heif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-submissions-quarantine',
  'public-submissions-quarantine',
  false,
  52428800,
  NULL
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service role manages public-submissions"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id IN ('public-submissions','public-submissions-quarantine'))
  WITH CHECK (bucket_id IN ('public-submissions','public-submissions-quarantine'));

-- ============================================================================
-- 180-day auto-purge cron for both buckets
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'public-submissions-purge-180d') THEN
    PERFORM cron.unschedule('public-submissions-purge-180d');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'public-submissions-quarantine-purge-180d') THEN
    PERFORM cron.unschedule('public-submissions-quarantine-purge-180d');
  END IF;
END $$;

SELECT cron.schedule(
  'public-submissions-purge-180d',
  '15 3 * * *',
  $$ SELECT public.purge_storage_bucket('public-submissions', 180); $$
);

SELECT cron.schedule(
  'public-submissions-quarantine-purge-180d',
  '30 3 * * *',
  $$ SELECT public.purge_storage_bucket('public-submissions-quarantine', 180); $$
);
