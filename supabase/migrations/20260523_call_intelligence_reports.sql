-- ============================================================================
-- Call Intelligence Reports — weekly AI-powered analysis of call transcripts.
--
-- Stores report history in comms.call_intelligence_reports with structured
-- JSON output from Claude analysis. Cron fires weekly (Monday 8am UTC).
-- Manual trigger available from admin UI.
-- ============================================================================

-- ── Report history table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comms.call_intelligence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('cron', 'manual')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  calls_analyzed int NOT NULL DEFAULT 0,
  report_json jsonb,
  report_html text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  emailed_to text[],
  created_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS call_intelligence_reports_period_idx
  ON comms.call_intelligence_reports (period_start DESC);

CREATE INDEX IF NOT EXISTS call_intelligence_reports_status_idx
  ON comms.call_intelligence_reports (status);

-- ── RPCs (public schema, security definer — comms not exposed via PostgREST) ──

-- Create a new report row (returns id)
CREATE OR REPLACE FUNCTION public.comms_create_intelligence_report(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_trigger_type text DEFAULT 'manual',
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO comms.call_intelligence_reports (period_start, period_end, trigger_type, status, created_by)
  VALUES (p_period_start, p_period_end, p_trigger_type, 'running', p_created_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update report with results
CREATE OR REPLACE FUNCTION public.comms_update_intelligence_report(
  p_id uuid,
  p_status text DEFAULT NULL,
  p_calls_analyzed int DEFAULT NULL,
  p_report_json jsonb DEFAULT NULL,
  p_report_html text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_emailed_to text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE comms.call_intelligence_reports
  SET status = COALESCE(p_status, status),
      calls_analyzed = COALESCE(p_calls_analyzed, calls_analyzed),
      report_json = COALESCE(p_report_json, report_json),
      report_html = COALESCE(p_report_html, report_html),
      error = COALESCE(p_error, error),
      emailed_to = COALESCE(p_emailed_to, emailed_to),
      completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE completed_at END
  WHERE id = p_id;
END;
$$;

-- List reports (paginated, newest first)
CREATE OR REPLACE FUNCTION public.comms_list_intelligence_reports(
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    FROM (
      SELECT r.id, r.period_start, r.period_end, r.trigger_type, r.status,
             r.calls_analyzed, r.created_at, r.completed_at, r.error,
             r.emailed_to,
             r.report_json->'executive_summary' as executive_summary,
             r.report_json->'quality_score' as quality_score,
             r.report_json->'sentiment_breakdown' as sentiment_breakdown,
             s.full_name as created_by_name
      FROM comms.call_intelligence_reports r
      LEFT JOIN public.staff_users s ON s.id = r.created_by
      ORDER BY r.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) t
  );
END;
$$;

-- Get single report (full detail including report_json)
CREATE OR REPLACE FUNCTION public.comms_get_intelligence_report(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT row_to_json(t)::jsonb
    FROM (
      SELECT r.*, s.full_name as created_by_name
      FROM comms.call_intelligence_reports r
      LEFT JOIN public.staff_users s ON s.id = r.created_by
      WHERE r.id = p_id
    ) t
  );
END;
$$;

-- Fetch transcribed calls for a date period (for the edge function to analyze)
CREATE OR REPLACE FUNCTION public.comms_get_transcribed_calls_for_period(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    FROM (
      SELECT cl.id,
             cl.direction,
             cl.from_name,
             cl.to_name,
             cl.from_number,
             cl.to_number,
             cl.staff_user_id,
             su.full_name as staff_name,
             cl.customer_id,
             c.company_name as customer_company,
             cl.started_at,
             cl.duration_sec,
             cl.result,
             cl.transcript,
             cl.summary,
             cl.label_id,
             lb.name as label_name,
             lb.color as label_color
      FROM comms.call_logs cl
      LEFT JOIN public.staff_users su ON su.id = cl.staff_user_id
      LEFT JOIN public.customers c ON c.id = cl.customer_id
      LEFT JOIN comms.call_labels lb ON lb.id = cl.label_id
      WHERE cl.started_at >= p_start
        AND cl.started_at < p_end
        AND cl.transcript IS NOT NULL
        AND cl.transcript != '(no speech detected)'
      ORDER BY cl.started_at ASC
    ) t
  );
END;
$$;

-- ── Default settings ─────────────────────────────────────────────────────────

INSERT INTO app_settings (setting_key, setting_value)
VALUES
  ('call_intelligence_enabled', 'true'),
  ('call_intelligence_recipients', '')
ON CONFLICT (setting_key) DO NOTHING;

-- ── Cron schedule — Monday at 8am UTC ────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rc-call-intelligence-weekly') THEN
    PERFORM cron.unschedule('rc-call-intelligence-weekly');
  END IF;
END $$;

SELECT cron.schedule(
  'rc-call-intelligence-weekly',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/rc-call-intelligence-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
