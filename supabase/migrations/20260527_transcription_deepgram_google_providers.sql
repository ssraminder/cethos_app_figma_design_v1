-- Phase 1 PR #1: Add Deepgram Nova-3 and Google STT v2 as transcription providers.
--   * Extend the provider CHECK constraint on transcription_jobs to allow the new values.
--   * Insert app_settings row for the per-language fallback chain (JSON), so admins can
--     override the hard-coded defaults in transcription-process/index.ts without a deploy.

ALTER TABLE transcription_jobs
  DROP CONSTRAINT IF EXISTS transcription_jobs_provider_check;

ALTER TABLE transcription_jobs
  ADD CONSTRAINT transcription_jobs_provider_check
  CHECK (provider IN ('assemblyai','openai','elevenlabs','deepgram','google'));

INSERT INTO app_settings (setting_key, setting_value, setting_type, description) VALUES
  (
    'transcription_fallback_chain_by_language',
    '{"en":["deepgram","elevenlabs"],"fr":["deepgram","elevenlabs"],"es":["deepgram","elevenlabs"],"de":["deepgram","elevenlabs"],"it":["deepgram","elevenlabs"],"pt":["deepgram","elevenlabs"],"nl":["deepgram","elevenlabs"],"ru":["deepgram","elevenlabs"],"uk":["deepgram","elevenlabs"],"el":["deepgram","elevenlabs"],"pa":["elevenlabs","google"],"hi":["elevenlabs","google"],"ur":["elevenlabs","google"],"bn":["elevenlabs","google"],"ta":["elevenlabs","google"],"te":["elevenlabs","google"],"ar":["elevenlabs","google"],"fa":["elevenlabs","google"],"he":["elevenlabs","deepgram"],"zh":["elevenlabs","deepgram"],"ja":["elevenlabs","deepgram"],"ko":["elevenlabs","deepgram"],"ps":["google","elevenlabs"],"km":["google","elevenlabs"],"tl":["google","elevenlabs"],"default":["deepgram","elevenlabs"]}',
    'json',
    'Per-language STT provider fallback chain. Keys are ISO-639-1 language codes; "default" is used when language is auto-detect or unmapped. Each value is an array of providers tried in order. transcription-process walks this chain on each file.'
  )
ON CONFLICT (setting_key) DO NOTHING;
