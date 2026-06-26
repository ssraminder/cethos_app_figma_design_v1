-- Seed interactive training: TG-LV-002 Forward Translation Best Practices
-- Audience: linguist (Vendor); assignment-driven (applies_to scope=assigned)
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'forward-translation-best-practices',
    'Forward Translation Best Practices',
    'linguist',
    'linguistic-validation',
    'TG-LV-002 · Produce conceptually equivalent forward translations of clinical instruments: avoid the five common errors, respect the blinding protocol, and complete the self-check before submission.',
    true,
    false,
    '{"scope":"assigned"}'::jsonb,
    80
  )
  RETURNING id
),
lessons AS (
  INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, estimated_minutes, content_blocks, body_markdown)
  SELECT t.id, v.oi, v.slug, v.title, v.mins, v.blocks::jsonb, v.md
  FROM t, (VALUES
    (1, 'the-goal-of-forward-translation', 'The Goal of Forward Translation', 8,
$jb$[
  {"type":"prose","md":"## Conceptual equivalence, not word-for-word\n\nThe goal of forward translation is **conceptual and semantic equivalence** — not literal, word-for-word accuracy.\n\nClinical instruments measure patient experience. Your translation must mean the same thing to a native speaker of the **target** language as the original means to a native speaker of the **source** language."},
  {"type":"example","title":"Worked example: \"Do you feel worn out?\"","intro":"The same source item, translated two ways. Notice why the literal version fails.","items":[
    {"label":"Source (English)","text":"\"Do you feel worn out?\"","tone":"info"},
    {"label":"Poor translation (literal)","text":"A word-for-word equivalent that native speakers of the target language would not naturally use to describe fatigue.","note":"Technically accurate, but unnatural — patients would hesitate or misread the register.","tone":"bad"},
    {"label":"Good translation","text":"An expression that is natural and colloquial and conveys fatigue in the same register as the source.","note":"Means the same thing to a target-language patient as the source does to an English-speaking patient.","tone":"good"}
  ]},
  {"type":"callout","variant":"rule","title":"The standard you are held to","body":"A translation is correct when a target-language patient understands it the way a source-language patient understands the original — same concept, same register, same emotional weight. Faithfulness to meaning outranks faithfulness to words."}
]$jb$,
$md$The goal of forward translation is conceptual and semantic equivalence, not word-for-word accuracy. Your translation must mean the same thing to a native target-language patient as the source means to a native source-language patient.$md$),

    (2, 'the-five-common-errors', 'The Five Most Common Errors', 8,
$jb$[
  {"type":"prose","md":"## Five errors to guard against\n\nThese are the five most common forward-translation errors in clinical instruments. Check your draft against every one before you submit."},
  {"type":"steps","title":"The five common errors","steps":[
    {"title":"1. Over-literalism","body":"Translating word-by-word without considering natural phrasing in the target language."},
    {"title":"2. Response scale mismatch","body":"Translating Likert anchors (Never / Rarely / Sometimes / Often / Always) without verifying the translated anchors reflect equal psychological intervals."},
    {"title":"3. Medical register errors","body":"Using clinical jargon when the instrument is written for lay patients — or using colloquialisms in a medical-record context."},
    {"title":"4. Cultural non-equivalence","body":"Translating idioms or culturally specific concepts directly, without adapting them for the target culture."},
    {"title":"5. Omission of items","body":"Missing sub-items, footnotes, or instructions embedded within the instrument."}
  ]},
  {"type":"callout","variant":"warning","title":"Response scales deserve special care","body":"If the translated anchors do not feel evenly spaced, adapt them to reflect equal psychological intervals, document your reasoning in your translator notes, and flag the item for the reconciler."}
]$jb$,
$md$The five most common forward-translation errors: over-literalism, response-scale mismatch, medical-register errors, cultural non-equivalence, and omission of items. Check your draft against each one before submitting.$md$),

    (3, 'blinding-protocol', 'Blinding Protocol', 6,
$jb$[
  {"type":"prose","md":"## Independence is the scientific basis of reconciliation\n\nYou **must not** communicate with the other forward translator (T2) during the forward translation phase. Blinding ensures both translations are genuinely independent, which is what makes the reconciliation step meaningful."},
  {"type":"steps","title":"Blinding rules during forward translation","steps":[
    {"title":"Do not share your draft","body":"Never share your draft with T2 before submission."},
    {"title":"Do not discuss the instrument","body":"Do not discuss the instrument informally before the reconciliation meeting."},
    {"title":"Route questions to your PM","body":"If you are uncertain about any instruction, contact your Project Manager — never the other translator."}
  ]},
  {"type":"callout","variant":"rule","title":"Never coordinate with T2","body":"Any contact with the other forward translator before reconciliation compromises the independence of both translations. When in doubt, ask the Project Manager."}
]$jb$,
$md$You must not communicate with the other forward translator (T2) during the forward-translation phase. Do not share drafts or discuss the instrument; route all questions to your Project Manager. Blinding is what makes reconciliation scientifically valid.$md$),

    (4, 'self-check-before-submission', 'Self-Check Before Submission', 7,
$jb$[
  {"type":"prose","md":"## Run this checklist for every instrument\n\nComplete this self-check for every instrument you submit. It takes a few minutes and catches the errors that most often surface in reconciliation."},
  {"type":"steps","title":"Self-check before submission","steps":[
    {"title":"Nothing left untranslated","body":"All items, sub-items, response scales, and instructions have been translated."},
    {"title":"Read aloud","body":"You have read the translation aloud in the target language to check natural flow."},
    {"title":"Anchors are equal-interval","body":"Response-scale anchors are culturally appropriate and reflect equal psychological intervals."},
    {"title":"No source terminology remains","body":"No source-language terminology has been left untranslated."},
    {"title":"File named correctly","body":"The file is named according to the project naming convention."},
    {"title":"NDA on file","body":"Your NDA is on file before you submit."}
  ]},
  {"type":"example","title":"Check your understanding","intro":"Confirm you have the key ideas from this training.","items":[
    {"label":"Question","text":"What is the primary goal of forward translation in linguistic validation?"},
    {"label":"Answer","text":"Conceptual and semantic equivalence — the translation must mean the same thing to a target-language patient as the source means to a source-language patient. It is NOT word-for-word accuracy, minimum change from the source, or speed of delivery.","tone":"info"},
    {"label":"Question","text":"You notice your response-scale anchors feel uneven in the target language. What should you do?"},
    {"label":"Answer","text":"Adapt the anchors so they reflect equal psychological intervals in the target language, document your reasoning in your translator notes, and flag the item for the reconciler's attention.","tone":"info"}
  ]}
]$jb$,
$md$Complete the self-check for every instrument: all items, sub-items, scales, and instructions translated; read aloud for natural flow; response-scale anchors equal-interval and culturally appropriate; no source terminology left untranslated; file named per project convention; NDA on file.$md$)
  ) AS v(oi, slug, title, mins, blocks, md)
  RETURNING training_id
)
INSERT INTO cvp_training_quiz_questions
  (training_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, display_order, active)
SELECT (SELECT id FROM t),
  'What is the primary goal of forward translation in linguistic validation?',
  'Word-for-word accuracy',
  'Conceptual and semantic equivalence',
  'Minimum change from the source language',
  'Speed of delivery',
  'b',
  'Forward translation aims for conceptual and semantic equivalence: the translation must mean the same thing to a target-language patient as the source means to a source-language patient. Literalness, minimal change, and speed are not the objective.',
  1, true
FROM t;
