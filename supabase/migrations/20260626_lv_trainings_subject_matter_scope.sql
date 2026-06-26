-- The 4 LV-step trainings were assignment-only (applies_to scope='assigned').
-- Per user: they apply to COA + clinical vendors with no role restriction, so
-- categorize them as clinical subject-matter trainings like COA Linguistic
-- Validation / GCP. This makes cvp_linguist_trainings_for_vendor surface them to
-- clinically-qualified vendors automatically, in addition to explicit assignments.
-- (They stay out of the general auto-advance sequence: sequence_order remains NULL.)
UPDATE public.cvp_trainings
SET applies_to = jsonb_build_object(
      'scope', 'subject_matter',
      'subject_matters', jsonb_build_array('Life Sciences / Medical','Pharmaceutical','Medical Devices')
    ),
    updated_at = now()
WHERE id IN (
  'e7eae379-c58c-47cb-ac05-61bba6ad0702',  -- Forward Translation Best Practices
  'ff17f418-1090-4f9e-a5be-7fc0619e9a25',  -- Back Translation: Independence & Literal Accuracy Protocol
  '0039513c-d268-4209-b3ad-d61c50c696d7',  -- Reconciliation Techniques & Decision Documentation
  '4a5f67de-83bb-4ff4-af70-4d9335464e03'   -- Cognitive Debriefing: Interviewer Guidance & Data Capture
);
