-- Add a COA methodology competence to the applicant ISO competence quiz bank.
-- Lets us route COA-track applicants through a knowledge check on linguistic
-- validation (ISPOR / Wild et al. process, conceptual equivalence, forward/
-- back translation, reconciliation, cognitive debriefing, confidentiality) —
-- satisfying VM-001 §5.7's "knowledge check". Language-agnostic, like the
-- existing research_competence / technical_competence sets.
ALTER TABLE public.iso_competence_quizzes
  DROP CONSTRAINT iso_competence_quizzes_competence_slug_check;
ALTER TABLE public.iso_competence_quizzes
  ADD CONSTRAINT iso_competence_quizzes_competence_slug_check
  CHECK (competence_slug = ANY (ARRAY[
    'linguistic_textual_competence'::text,
    'research_competence'::text,
    'cultural_competence'::text,
    'technical_competence'::text,
    'domain_competence'::text,
    'coa_methodology'::text
  ]));
