-- Add source column to distinguish vendor vs admin bug reports
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'vendor',
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff_users(id),
  ADD COLUMN IF NOT EXISTS reporter_name text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.staff_users(id);

-- Add check constraint for source values
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_source_check CHECK (source IN ('vendor', 'admin'));

-- Index for quick lookups by status + source
CREATE INDEX IF NOT EXISTS idx_bug_reports_status_source
  ON public.bug_reports (status, source, created_at DESC);

-- RLS: staff can read/write all bug reports
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read all bug reports" ON public.bug_reports;
CREATE POLICY "Staff can read all bug reports"
  ON public.bug_reports FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff can insert bug reports" ON public.bug_reports;
CREATE POLICY "Staff can insert bug reports"
  ON public.bug_reports FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can update bug reports" ON public.bug_reports;
CREATE POLICY "Staff can update bug reports"
  ON public.bug_reports FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role full access to bug reports" ON public.bug_reports;
CREATE POLICY "Service role full access to bug reports"
  ON public.bug_reports FOR ALL TO service_role
  USING (true) WITH CHECK (true);
