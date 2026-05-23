-- Add transcript and summary columns to call_logs
ALTER TABLE comms.call_logs
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS transcript_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summary_at timestamptz;

COMMENT ON COLUMN comms.call_logs.transcript IS 'ElevenLabs speech-to-text transcription of the call recording';
COMMENT ON COLUMN comms.call_logs.summary IS 'Claude Haiku 4.5 summary of the call transcript';

-- RPC: get call recording info for edge function
CREATE OR REPLACE FUNCTION public.comms_get_call_recording_info(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'id', cl.id,
      'recording_id', cl.recording_id,
      'recording_url', cl.recording_url,
      'has_recording', cl.has_recording,
      'transcript', cl.transcript,
      'transcript_at', cl.transcript_at,
      'summary', cl.summary,
      'summary_at', cl.summary_at
    )
    FROM comms.call_logs cl
    WHERE cl.id = p_call_id
  );
END;
$$;

-- RPC: save transcript
CREATE OR REPLACE FUNCTION public.comms_save_call_transcript(p_call_id uuid, p_transcript text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE comms.call_logs
  SET transcript = p_transcript,
      transcript_at = now()
  WHERE id = p_call_id;
END;
$$;

-- RPC: save summary
CREATE OR REPLACE FUNCTION public.comms_save_call_summary(p_call_id uuid, p_summary text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE comms.call_logs
  SET summary = p_summary,
      summary_at = now()
  WHERE id = p_call_id;
END;
$$;

-- RPC: get pending recordings for auto-transcription
CREATE OR REPLACE FUNCTION public.comms_get_pending_transcriptions(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    FROM (
      SELECT cl.id, cl.recording_id, cl.has_recording,
             cl.transcript IS NOT NULL as has_transcript,
             cl.summary IS NOT NULL as has_summary
      FROM comms.call_logs cl
      WHERE cl.has_recording = true
        AND cl.recording_id IS NOT NULL
        AND cl.transcript IS NULL
      ORDER BY cl.started_at DESC
      LIMIT p_limit
    ) t
  );
END;
$$;

-- RPC: transcription stats for settings dashboard
CREATE OR REPLACE FUNCTION public.comms_get_transcription_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'total_recordings', COUNT(*) FILTER (WHERE has_recording = true AND recording_id IS NOT NULL),
      'transcribed', COUNT(*) FILTER (WHERE has_recording = true AND transcript IS NOT NULL),
      'summarized', COUNT(*) FILTER (WHERE has_recording = true AND summary IS NOT NULL),
      'pending', COUNT(*) FILTER (WHERE has_recording = true AND recording_id IS NOT NULL AND transcript IS NULL)
    )
    FROM comms.call_logs
  );
END;
$$;

-- Default settings for call transcription
INSERT INTO app_settings (setting_key, setting_value)
VALUES
  ('call_transcription_mode', 'manual'),
  ('call_auto_summarize', 'true')
ON CONFLICT (setting_key) DO NOTHING;

-- ── Call labels ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comms.call_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#6B7280',
  transcription_mode text NOT NULL DEFAULT 'manual'
    CHECK (transcription_mode IN ('auto', 'manual', 'skip')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE comms.call_logs
  ADD COLUMN IF NOT EXISTS label_id uuid REFERENCES comms.call_labels(id) ON DELETE SET NULL;

INSERT INTO comms.call_labels (name, color, transcription_mode, sort_order) VALUES
  ('Sales',           '#2563EB', 'auto',   1),
  ('Support',         '#16A34A', 'auto',   2),
  ('Follow-up',       '#9333EA', 'manual', 3),
  ('General Inquiry', '#F59E0B', 'auto',   4),
  ('Internal',        '#6B7280', 'skip',   5)
ON CONFLICT (name) DO NOTHING;

-- List all labels with call counts
CREATE OR REPLACE FUNCTION public.comms_list_call_labels()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_order, t.name), '[]'::jsonb)
    FROM (
      SELECT l.id, l.name, l.color, l.transcription_mode, l.sort_order, l.created_at,
             COUNT(cl.id) as call_count
      FROM comms.call_labels l
      LEFT JOIN comms.call_logs cl ON cl.label_id = l.id
      GROUP BY l.id
    ) t
  );
END;
$$;

-- Upsert label
CREATE OR REPLACE FUNCTION public.comms_upsert_call_label(
  p_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_color text DEFAULT '#6B7280',
  p_transcription_mode text DEFAULT 'manual',
  p_sort_order int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE comms.call_labels
    SET name = COALESCE(p_name, name), color = p_color,
        transcription_mode = p_transcription_mode, sort_order = p_sort_order
    WHERE id = p_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO comms.call_labels (name, color, transcription_mode, sort_order)
    VALUES (p_name, p_color, p_transcription_mode, p_sort_order)
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- Delete label
CREATE OR REPLACE FUNCTION public.comms_delete_call_label(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE comms.call_logs SET label_id = NULL WHERE label_id = p_id;
  DELETE FROM comms.call_labels WHERE id = p_id;
END;
$$;

-- Set label on a call
CREATE OR REPLACE FUNCTION public.comms_set_call_label(p_call_id uuid, p_label_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE comms.call_logs SET label_id = p_label_id WHERE id = p_call_id;
END;
$$;

-- Get auto-eligible pending recordings (for cron/sync trigger)
CREATE OR REPLACE FUNCTION public.comms_get_auto_pending(
  p_auto_label_ids uuid[],
  p_include_unlabeled boolean DEFAULT false,
  p_limit int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    FROM (
      SELECT cl.id, cl.recording_id, cl.label_id,
             lb.name as label_name,
             cl.transcript IS NOT NULL as has_transcript,
             cl.summary IS NOT NULL as has_summary
      FROM comms.call_logs cl
      LEFT JOIN comms.call_labels lb ON lb.id = cl.label_id
      WHERE cl.has_recording = true
        AND cl.recording_id IS NOT NULL
        AND cl.transcript IS NULL
        AND (
          (cl.label_id = ANY(p_auto_label_ids))
          OR (p_include_unlabeled AND cl.label_id IS NULL)
        )
      ORDER BY cl.started_at DESC
      LIMIT p_limit
    ) t
  );
END;
$$;
