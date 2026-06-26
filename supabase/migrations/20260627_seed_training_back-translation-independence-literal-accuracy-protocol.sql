-- Seed interactive training: TG-LV-004 Back Translation: Independence & Literal Accuracy Protocol
-- Audience: linguist (Vendor); assignment-driven (applies_to scope=assigned)
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'back-translation-independence-literal-accuracy-protocol',
    'Back Translation: Independence & Literal Accuracy Protocol',
    'linguist',
    'linguistic-validation',
    'TG-LV-004 · Produce blinded, literal back translations that expose meaning shifts: work only from the reconciled target text, translate what is written rather than what was meant, and never beautify awkward phrasing.',
    true,
    false,
    '{"scope":"assigned"}'::jsonb,
    80
  )
  RETURNING id
),
lessons AS (
  INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, estimated_minutes, content_blocks, body_markdown)
  SELECT t.id, v.oi, v.slug, v.title, v.mins, v.blocks::jsonb, v.body
  FROM t, (VALUES
    (1, 'purpose-of-back-translation', 'The Purpose of Back Translation', 6,
$jb$[
  {"type":"prose","md":"## Back translation exposes meaning shifts\n\nBack translation converts the **reconciled target-language version** back into the source language. Its purpose is **not** to create a polished source-language text — it is to expose any meaning shifts introduced during forward translation or reconciliation.\n\nThink of it as a diagnostic instrument, not a deliverable. The review team compares your back translation against the original source to find where meaning drifted."},
  {"type":"steps","title":"A back translation must be three things","steps":[
    {"title":"Literal","body":"Translate what is written, not what you think was meant."},
    {"title":"Unpolished","body":"Awkward phrasing in the back translation reveals exactly what the target-language text says. Smoothing it hides the signal the review team needs."},
    {"title":"Blinded","body":"You must not have access to the original source text while you work."}
  ]},
  {"type":"callout","variant":"rule","title":"Literal over fluent — always","body":"Your job is to mirror the target-language text faithfully, even when that produces clumsy source-language prose. A fluent back translation that quietly fixes problems defeats the entire purpose of the step."}
]$jb$,
$md$## The Purpose of Back Translation

Back translation converts the reconciled target-language version back into the source language. Its purpose is NOT to produce polished prose — it is to expose any meaning shift introduced during forward translation or reconciliation.

A back translation must be:
- Literal — translate what is written, not what you think was meant.
- Unpolished — awkward phrasing reveals exactly what the target text says.
- Blinded — you must not access the original source text while you work.$md$),

    (2, 'the-blinding-protocol', 'The Blinding Protocol', 6,
$jb$[
  {"type":"prose","md":"## You receive only the reconciled target text\n\nThe back translator receives **only** the reconciled target-language version — never the original source. Before starting, you must confirm your blinding to your Project Manager."},
  {"type":"callout","variant":"rule","title":"Blinding confirmation (state this to your PM before you begin)","body":"\"I confirm I have not been provided with, and have not accessed, the original source text for this instrument.\""},
  {"type":"steps","title":"If blinding is broken","steps":[
    {"title":"Stop and notify your PM immediately","body":"If you accidentally encounter the original source text before completing the back translation, notify your Project Manager at once."},
    {"title":"Let the PM assess reassignment","body":"The PM decides whether your assignment should be reassigned to a translator who is still blinded. Do not try to 'un-see' it and continue quietly."}
  ]},
  {"type":"example","title":"Check your understanding","intro":"Confirm you have the key idea from this lesson.","items":[
    {"label":"Question","text":"While working on a back translation, you realise the original English source file was attached to an earlier email and you have now seen it. What do you do?"},
    {"label":"Answer","text":"Notify your Project Manager immediately. You are no longer blinded, so the PM must decide whether to reassign the back translation to a translator who has not seen the source. Continuing silently would compromise the validity of the back-translation check.","tone":"info"}
  ]}
]$jb$,
$md$## The Blinding Protocol

The back translator receives only the reconciled target-language version — never the original source.

Before starting, confirm to your PM: "I confirm I have not been provided with, and have not accessed, the original source text for this instrument."

If you accidentally encounter the original source text before completing the back translation, notify your PM immediately so they can assess whether the assignment should be reassigned.$md$),

    (3, 'common-back-translation-errors', 'Common Back Translation Errors', 6,
$jb$[
  {"type":"prose","md":"## Three errors that hide the signal\n\nEach of these errors makes the back translation *look* better while destroying its diagnostic value. Guard against all three."},
  {"type":"steps","title":"Common back translation errors","steps":[
    {"title":"Beautifying the language","body":"Smoothing awkward phrasing instead of translating it literally. This obscures exactly the information the review team needs to see."},
    {"title":"Inferring intent","body":"Assuming you know what the original said and translating your assumption rather than the words actually on the page."},
    {"title":"Omitting target-language additions","body":"If the reconciled version added a clarifying phrase, that phrase must appear in your back translation — do not drop it."}
  ]},
  {"type":"comparison","title":"Literal vs. beautified back translation","columns":[
    {"label":"Correct (literal)","tone":"good","items":[
      "Mirrors the target text word-for-word, awkwardness and all",
      "Carries through any clarifying phrase the reconciler added",
      "Translates the words on the page, not your guess at the intent"
    ]},
    {"label":"Wrong (beautified)","tone":"bad","items":[
      "Smooths clumsy phrasing into natural prose",
      "Silently drops or 'tidies' added phrases",
      "Translates what you assume was meant"
    ]}
  ]},
  {"type":"example","title":"Worked scenario: the awkward phrase","intro":"The reconciled target text contains a phrase that reads oddly and you suspect it is a translation error.","items":[
    {"label":"Tempting (wrong)","text":"Fix the phrasing and back-translate the improved version so it reads naturally.","note":"This hides the very error the review team exists to catch.","tone":"bad"},
    {"label":"Correct","text":"Back-translate the text exactly as written, literally, and add a translator note flagging your concern about the phrasing.","note":"The literal back translation surfaces the issue; your note routes it to the people who can decide what to do.","tone":"good"},
    {"label":"Also wrong","text":"Contact the reconciler and ask them to fix it before you proceed.","note":"That would break your blinding and pre-empt the review team's job. Flag it in a note instead.","tone":"bad"}
  ]}
]$jb$,
$md$## Common Back Translation Errors

- Beautifying the language — smoothing awkward phrasing rather than translating it literally. This obscures exactly the information the review team needs.
- Inferring intent — translating your assumption about the original instead of the words on the page.
- Omitting target-language additions — any clarifying phrase the reconciled version added must appear in the back translation.

Awkward-phrase scenario: if the reconciled text reads oddly and you suspect a translation error, back-translate it literally as written and flag your concern in a translator note. Do not fix it, and do not ask the reconciler to fix it for you.$md$),

    (4, 'self-check', 'Self-Check Before Submission', 5,
$jb$[
  {"type":"prose","md":"## Run this checklist before you submit\n\nWork through every item before submitting your back translation."},
  {"type":"steps","title":"Back translation self-check","steps":[
    {"title":"Still blinded","body":"I have not accessed the original source text."},
    {"title":"Literal, not fluent","body":"My translation is literal, not fluent."},
    {"title":"No smoothing","body":"I have not smoothed over any awkward phrasing."},
    {"title":"Anchors covered","body":"All response-scale anchors are back-translated."},
    {"title":"Named and submitted","body":"File named and submitted per the project convention."}
  ]},
  {"type":"example","title":"Check your understanding","intro":"Confirm the core rule of this training.","items":[
    {"label":"Question","text":"The reconciled target-language text uses an awkward phrase that you suspect is a translation error. What do you do?"},
    {"label":"Answer","text":"Back-translate the text as written, literally, and flag your concern in a translator note. Do not fix the phrasing yourself, and do not ask the reconciler to fix it before you proceed — both would defeat the purpose of the back-translation check.","tone":"info"}
  ]}
]$jb$,
$md$## Self-Check Before Submission

- I have not accessed the original source text.
- My translation is literal, not fluent.
- I have not smoothed over any awkward phrasing.
- All response-scale anchors are back-translated.
- File named and submitted per project convention.$md$)
  ) AS v(oi, slug, title, mins, blocks, body)
  RETURNING training_id
)
INSERT INTO cvp_training_quiz_questions
  (training_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, display_order, active)
SELECT (SELECT id FROM t),
  'The reconciled target-language text uses an awkward phrase that you suspect is a translation error. What do you do?',
  'Fix the phrasing and back-translate the improved version',
  'Back-translate the text as written, literally, and flag your concern in a translator note',
  'Contact the reconciler and ask them to fix it before you proceed',
  NULL,
  'b',
  'Back translation must stay literal and blinded. Translate the awkward phrase exactly as written and raise your concern in a translator note. Fixing it yourself hides the meaning shift the review team needs to see; asking the reconciler to fix it pre-empts the review and risks breaking your blinding.',
  1, true
FROM t;
