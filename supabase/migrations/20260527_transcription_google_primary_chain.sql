-- Phase 1: re-prioritize STT fallback chain because Deepgram Nova-3 only covers
-- ~36 languages and misses Cethos's heavy workload (Punjabi, Persian, Pashto,
-- Dari, Urdu, Bengali, Tamil, Kurdish, etc.). Google STT v2 / Chirp 2 has the
-- widest catalog (100+) so it becomes the new default primary; Deepgram only
-- appears in chains for languages it officially supports.

UPDATE app_settings
SET setting_value = '{"en":["deepgram","elevenlabs","google"],"fr":["deepgram","elevenlabs","google"],"es":["deepgram","elevenlabs","google"],"de":["deepgram","elevenlabs","google"],"it":["deepgram","elevenlabs","google"],"pt":["deepgram","elevenlabs","google"],"nl":["deepgram","elevenlabs","google"],"pl":["deepgram","elevenlabs","google"],"cs":["deepgram","elevenlabs","google"],"da":["deepgram","elevenlabs","google"],"sv":["deepgram","elevenlabs","google"],"no":["deepgram","elevenlabs","google"],"fi":["elevenlabs","google"],"ru":["deepgram","elevenlabs","google"],"uk":["deepgram","elevenlabs","google"],"el":["deepgram","elevenlabs","google"],"bg":["deepgram","elevenlabs","google"],"hi":["elevenlabs","deepgram","google"],"ar":["elevenlabs","deepgram","google"],"pa":["google","elevenlabs"],"ur":["google","elevenlabs"],"fa":["google","elevenlabs"],"ps":["google","elevenlabs"],"prs":["google","elevenlabs"],"bn":["google","elevenlabs"],"ta":["google","elevenlabs"],"te":["google","elevenlabs"],"ml":["google","elevenlabs"],"kn":["google","elevenlabs"],"mr":["google","elevenlabs"],"ne":["google","elevenlabs"],"gu":["google","elevenlabs"],"si":["google","elevenlabs"],"ku":["google","elevenlabs"],"ckb":["google","elevenlabs"],"kmr":["google","elevenlabs"],"am":["google","elevenlabs"],"ti":["google","elevenlabs"],"so":["google","elevenlabs"],"sw":["google","elevenlabs"],"he":["google","elevenlabs"],"zh":["google","elevenlabs","deepgram"],"ja":["deepgram","elevenlabs","google"],"ko":["deepgram","elevenlabs","google"],"th":["deepgram","elevenlabs","google"],"vi":["deepgram","elevenlabs","google"],"id":["deepgram","elevenlabs","google"],"tl":["deepgram","google","elevenlabs"],"ms":["deepgram","google","elevenlabs"],"km":["google","elevenlabs"],"lo":["google","elevenlabs"],"my":["google","elevenlabs"],"ka":["google","elevenlabs"],"hy":["google","elevenlabs"],"default":["google","elevenlabs"]}',
    description = 'Per-language STT provider fallback chain. Google STT v2 is the default primary (widest catalog: Punjabi, Persian, Pashto, Dari, etc.). Deepgram only appears in chains for languages it supports per Deepgram Nova-3 docs. ElevenLabs is the universal backup. transcription-process walks this chain on each file.'
WHERE setting_key = 'transcription_fallback_chain_by_language';

UPDATE app_settings
SET setting_value = 'google'
WHERE setting_key = 'transcription_primary_provider'
  AND setting_value IN ('openai', 'deepgram', 'assemblyai');
