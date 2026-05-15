-- 20260515_iso_quiz_target_language
--
-- Adds target_language_id to iso_competence_quizzes so the same competence
-- pool can be authored per target language. Existing 40 rows stay NULL
-- (cross-language baseline). Non-NULL rows scope the question to a
-- specific target language — needed for linguistic_textual_competence,
-- cultural_competence, and target-language-specific domain_competence.
--
-- Companion to docs/qms/02-test-or-quiz-routing.md.
-- Applied to lmzoyezvsjgsxveoakdr 2026-05-15.

ALTER TABLE iso_competence_quizzes
  ADD COLUMN IF NOT EXISTS target_language_id uuid REFERENCES languages(id) ON DELETE RESTRICT;

COMMENT ON COLUMN iso_competence_quizzes.target_language_id IS
  'Target language this quiz tests competence in. NULL = cross-language baseline (e.g. research/technical competence questions that are language-agnostic). Non-NULL = competence quiz authored against a specific target language (linguistic_textual_competence, cultural_competence, and target-language-specific domain_competence).';

CREATE INDEX IF NOT EXISTS idx_iso_quizzes_target_competence_active
  ON iso_competence_quizzes (target_language_id, competence_slug, domain, active)
  WHERE active = true;
