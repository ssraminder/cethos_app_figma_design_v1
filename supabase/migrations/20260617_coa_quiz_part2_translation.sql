-- COA quiz Part 2 — short-sentence translation items + MQM grading audit.
--
-- Part 1 (general COA knowledge) lives in iso_competence_quizzes
-- (competence_slug='coa_methodology'). Part 2 asks the applicant to translate a
-- few short English sentences into their native language; the translations are
-- graded reference-free by an AI MQM assessor (cvp-coa-assess-translation).
-- Every grade is captured here for ISO 17100 reproducibility.

create table if not exists public.cvp_coa_translation_items (
  id               uuid primary key default gen_random_uuid(),
  order_index      int  not null default 0,
  source_text      text not null,                 -- the English sentence to translate
  construct        text not null,                 -- what it probes (see CHECK)
  grading_guidance text not null,                 -- per-item conceptual-equivalence expectation for the AI grader
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint cvp_coa_translation_items_construct_check check (construct = any (array[
    'recall_period','frequency_scale','severity','register','idiom_conceptual','clinical_term'
  ]))
);

create table if not exists public.cvp_coa_translation_responses (
  id                   uuid primary key default gen_random_uuid(),
  application_id       uuid references public.cvp_applications(id) on delete set null,
  item_id              uuid not null references public.cvp_coa_translation_items(id),
  target_language_code text not null,
  target_language_name text,
  applicant_translation text not null,
  mqm_annotations      jsonb,        -- [{category,severity,explanation}]
  error_counts         jsonb,        -- {critical,major,minor}
  mqm_score            numeric,      -- 0-100, deterministic from severities
  verdict              text,         -- pass | borderline | fail
  conceptual_equivalence text,       -- preserved | partial | lost
  ai_confidence        numeric,      -- 0-1, AI self-reported
  ai_rationale         text,
  needs_human_review   boolean not null default false,
  model_version        text,
  graded_at            timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists idx_coa_translation_responses_app
  on public.cvp_coa_translation_responses(application_id);
create index if not exists idx_coa_translation_responses_review
  on public.cvp_coa_translation_responses(needs_human_review) where needs_human_review;

-- Seed the initial 6 COA micro-translation sentences. Each probes a distinct
-- COA failure mode; the idiom item is the real conceptual-equivalence test.
insert into public.cvp_coa_translation_items (order_index, source_text, construct, grading_guidance) values
(1, 'During the past 7 days, how often did you feel short of breath?', 'recall_period',
    'Must preserve the recall period ("past 7 days"), the frequency framing ("how often"), and render "short of breath" in natural patient-facing language (not an over-clinical term). Register: patient-appropriate.'),
(2, 'Please rate how severe your pain has been: mild, moderate, or severe.', 'severity',
    'The three severity levels must map to the conventional, ordered severity scale used for patients in the target language, with clear gradation (mild<moderate<severe). Watch for collapsing two levels into one word.'),
(3, 'Before you answer, please read each question carefully.', 'register',
    'Tests patient-facing register and politeness. Must use the register appropriate for addressing a patient in the target language (e.g. formal "usted" in Spanish) consistently.'),
(4, 'In the last two weeks, have you been feeling down or blue?', 'idiom_conceptual',
    'CRITICAL conceptual-equivalence test. "down or blue" is an idiom for low/depressed mood. A literal color/direction translation is a major accuracy error. Must convey low mood naturally for the target culture while keeping patient-appropriate, non-clinical tone.'),
(5, 'Choose one: never, rarely, sometimes, often, or always.', 'frequency_scale',
    'The five frequency options must be rendered as a natural, correctly ordered, mutually distinct frequency scale in the target language. Watch for two options translating to the same word or an out-of-order scale.'),
(6, 'Did you have any trouble emptying your bladder completely?', 'clinical_term',
    'Tests a patient-friendly rendering of a urinary-function item. Must be clinically accurate yet patient-appropriate (not crude, not overly technical) and preserve "completely".');
