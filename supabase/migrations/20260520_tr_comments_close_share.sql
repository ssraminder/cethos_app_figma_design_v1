-- ============================================================================
-- TR comments + share-tokens + close fields for review_jobs.
--
-- Three additions:
--   1. tr.job_comments  — staff <-> translator discussion thread on a job
--   2. tr.job_share_tokens — tokenized links for translator to view/respond
--      without a Supabase auth session (auth gated by token lookup only)
--   3. review_jobs.closed_at/closed_by/close_reason — populated by tr-close-job
--      when staff move the job to complete or cancelled
--
-- RLS: tr.is_staff() everywhere. Anon is never a direct caller; the public
-- share page hits edge functions which use service_role and the token-id
-- guard.
-- ============================================================================

-- ── 1. comments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tr.job_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES tr.review_jobs(id) ON DELETE CASCADE,
  author_type   text NOT NULL CHECK (author_type IN ('staff','vendor','system')),
  author_id     uuid,
  author_name   text NOT NULL,
  author_email  text,
  body          text NOT NULL,
  kind          text NOT NULL DEFAULT 'comment'
                  CHECK (kind IN ('comment','status_note','file_replacement','close_note')),
  files_jsonb   jsonb NOT NULL DEFAULT '[]'::jsonb,
  via_token_id  uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_comments_job_id_created_idx ON tr.job_comments(job_id, created_at);

ALTER TABLE tr.job_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tr_job_comments_staff_select ON tr.job_comments FOR SELECT TO authenticated USING (tr.is_staff());
CREATE POLICY tr_job_comments_staff_insert ON tr.job_comments FOR INSERT TO authenticated WITH CHECK (tr.is_staff());
CREATE POLICY tr_job_comments_service_all ON tr.job_comments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. share tokens ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tr.job_share_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES tr.review_jobs(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  recipient_email text NOT NULL,
  recipient_name  text,
  recipient_kind  text NOT NULL DEFAULT 'vendor'
                    CHECK (recipient_kind IN ('vendor','customer','other')),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  last_used_at    timestamptz,
  use_count       integer NOT NULL DEFAULT 0,
  revoked_at      timestamptz,
  revoked_by      uuid,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_share_tokens_job_id_idx ON tr.job_share_tokens(job_id);
CREATE INDEX IF NOT EXISTS job_share_tokens_token_idx ON tr.job_share_tokens(token);

ALTER TABLE tr.job_share_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY tr_job_share_tokens_staff_select ON tr.job_share_tokens FOR SELECT TO authenticated USING (tr.is_staff());
CREATE POLICY tr_job_share_tokens_staff_insert ON tr.job_share_tokens FOR INSERT TO authenticated WITH CHECK (tr.is_staff());
CREATE POLICY tr_job_share_tokens_staff_update ON tr.job_share_tokens FOR UPDATE TO authenticated USING (tr.is_staff());
CREATE POLICY tr_job_share_tokens_service_all ON tr.job_share_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. close fields on review_jobs ─────────────────────────────────────────
ALTER TABLE tr.review_jobs
  ADD COLUMN IF NOT EXISTS closed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by     uuid,
  ADD COLUMN IF NOT EXISTS close_reason  text,
  ADD COLUMN IF NOT EXISTS close_outcome text CHECK (close_outcome IN ('complete','cancelled'));

GRANT SELECT, INSERT, UPDATE, DELETE ON tr.job_comments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tr.job_share_tokens TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
