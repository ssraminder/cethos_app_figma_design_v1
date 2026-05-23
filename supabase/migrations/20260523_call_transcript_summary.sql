-- Add transcript and summary columns to call_logs
ALTER TABLE comms.call_logs
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS transcript_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summary_at timestamptz;

COMMENT ON COLUMN comms.call_logs.transcript IS 'ElevenLabs speech-to-text transcription of the call recording';
COMMENT ON COLUMN comms.call_logs.summary IS 'Claude Haiku summary of the call transcript';

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
