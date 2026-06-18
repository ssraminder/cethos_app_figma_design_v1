-- COA quiz routing: flag a quiz submission as the COA 2-part quiz.
-- When true, cvp-get-quiz appends the coa_methodology MCQ set + returns the
-- Part-2 sentence-translation items; cvp-submit-quiz grades the submitted
-- translations (reference-free MQM) and blocks auto-approval if any fail.
ALTER TABLE public.cvp_quiz_submissions ADD COLUMN IF NOT EXISTS is_coa boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.cvp_quiz_submissions.is_coa IS 'When true, the quiz also includes the COA methodology MCQ set + Part-2 sentence-translation items (graded reference-free by cvp-coa-assess-translation).';
