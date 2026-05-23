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
