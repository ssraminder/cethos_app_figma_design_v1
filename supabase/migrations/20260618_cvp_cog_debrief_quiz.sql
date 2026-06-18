-- Phase B: cognitive-debriefing quiz instrument.
-- Cognitive-debriefing (COA) consultants don't translate, so their assessment is
-- a knowledge-only quiz (coa_methodology bank) with NO translation language pair
-- and NO test_combinations. Add an is_cog_debrief flag and allow a null target
-- language for these submissions. Applied to prod via MCP 2026-06-18.
ALTER TABLE public.cvp_quiz_submissions
  ADD COLUMN IF NOT EXISTS is_cog_debrief boolean NOT NULL DEFAULT false;

ALTER TABLE public.cvp_quiz_submissions
  ALTER COLUMN target_language_id DROP NOT NULL;
