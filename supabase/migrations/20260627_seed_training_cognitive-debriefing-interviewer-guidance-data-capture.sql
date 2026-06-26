-- Seed interactive training: TG-LV-005 Cognitive Debriefing: Interviewer Guidance & Data Capture
-- Audience: linguist (Vendor); assignment-driven (applies_to scope=assigned)
-- Both Knowledge Checks are short-answer => rendered as 'Check your understanding' examples; no quiz questions seeded.
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'cognitive-debriefing-interviewer-guidance-data-capture',
    'Cognitive Debriefing: Interviewer Guidance & Data Capture',
    'linguist',
    'linguistic-validation',
    'TG-LV-005 · Run cognitive debriefing interviews that test the translated instrument with target patients: explain the purpose, follow the opening / item-review / closing structure, probe without leading, capture data verbatim, and summarise findings.',
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
    (1, 'what-is-cognitive-debriefing', 'What Is Cognitive Debriefing?', 7,
$jb$[
  {"type":"prose","md":"## Testing the translation with real patients\n\nCognitive debriefing tests the **translated instrument** with a small sample of the **target patient population** to verify that the translation works in the real world."},
  {"type":"steps","title":"What cognitive debriefing verifies","steps":[
    {"title":"Understood as intended","body":"The translation is understood the way the original concept intended."},
    {"title":"Appropriate and natural","body":"The language is appropriate and natural for the target audience."},
    {"title":"No confusion","body":"No items cause confusion or misinterpretation."},
    {"title":"Cultural fit","body":"Cultural adaptations are appropriate for the target population."}
  ]},
  {"type":"callout","variant":"info","title":"Typical sample size","body":"5–10 participants per language, selected to represent the intended patient population (by age, education level, and disease status where applicable)."},
  {"type":"example","title":"Check your understanding","intro":"Confirm the sampling rule.","items":[
    {"label":"Question","text":"How many participants are typically required for cognitive debriefing, and how are they chosen?"},
    {"label":"Answer","text":"Typically 5–10 participants per language, selected to be representative of the intended patient population — for example by age, education level, and disease status where applicable.","tone":"info"}
  ]}
]$jb$,
$md$## What Is Cognitive Debriefing?

Cognitive debriefing tests the translated instrument with a small sample of the target patient population to verify that the translation is understood as intended, the language is natural and appropriate, no items cause confusion, and cultural adaptations are appropriate.

Typical sample size: 5–10 participants per language, selected to represent the intended patient population (age, education level, disease status where applicable).$md$),

    (2, 'interview-structure', 'Interview Structure', 9,
$jb$[
  {"type":"prose","md":"## Three phases: opening, item review, closing\n\nEvery cognitive debriefing interview follows the same three-phase structure. Keep to the approved guide and stay neutral throughout."},
  {"type":"steps","title":"Interview phases","steps":[
    {"title":"Opening (~5 minutes)","body":"Explain the purpose and set the participant at ease: \"We are reviewing a questionnaire that will be used in a medical study. We want to make sure the questions are clear and easy to understand. There are no right or wrong answers — we are testing the questionnaire, not you. Please tell us what each question means to you in your own words.\""},
    {"title":"Item review (~20–40 minutes)","body":"Work through each item one at a time using the standard probes (covered in the next lesson). Record responses verbatim — do not paraphrase or correct the participant."},
    {"title":"Closing (~5 minutes)","body":"Ask for overall impressions, thank the participant, and collect consent documentation."}
  ]},
  {"type":"callout","variant":"rule","title":"You are testing the questionnaire, not the person","body":"Make clear there are no right or wrong answers. Never lead the participant toward a 'correct' interpretation — a leading interviewer contaminates the very data the debrief is meant to produce."}
]$jb$,
$md$## Interview Structure

Opening (~5 min): explain that you are reviewing a questionnaire for a medical study, that there are no right or wrong answers, and that you are testing the questionnaire, not the participant. Ask them to tell you what each question means in their own words.

Item review (~20–40 min): go through each item with the standard probes; record responses verbatim, never paraphrasing or correcting the participant.

Closing (~5 min): ask overall impressions, thank the participant, collect consent documentation.$md$),

    (3, 'probing-and-data-capture', 'Probing Scripts & Data Capture', 9,
$jb$[
  {"type":"prose","md":"## Probe each item, capture each field\n\nFor every item you ask the same set of non-leading questions, then record a fixed set of fields. Consistency across participants is what makes the findings analysable."},
  {"type":"example","title":"Standard probing script (per item)","intro":"Ask these in order for each item. Record answers verbatim.","items":[
    {"label":"Step 1 — Read aloud","text":"Ask the participant to read the item aloud (if literacy permits).","tone":"info"},
    {"label":"Step 2 — Meaning","text":"Ask: \"What does this question mean to you?\"","tone":"info"},
    {"label":"Step 3 — Clarity","text":"Ask: \"Is there anything about this question that is confusing or unclear?\"","tone":"info"},
    {"label":"Step 4 — Alternative wording","text":"Ask: \"Is there a better way to say this in [language]?\"","tone":"info"},
    {"label":"Step 5 — Record verbatim","text":"Record responses verbatim — do not paraphrase or correct the participant.","note":"Verbatim capture preserves the evidence; your interpretation is a separate field.","tone":"good"}
  ]},
  {"type":"steps","title":"Data capture fields (per item)","steps":[
    {"title":"Item number","body":"The item being reviewed."},
    {"title":"Participant ID","body":"Anonymized participant identifier."},
    {"title":"Verbatim interpretation","body":"The participant's own words for what the item means."},
    {"title":"Confusion noted","body":"Yes / No."},
    {"title":"Suggested alternative phrasing","body":"Captured if the participant offers one."},
    {"title":"Coordinator assessment","body":"Comprehension confirmed / Revision recommended."}
  ]},
  {"type":"example","title":"Check your understanding","intro":"A common judgement call during item review.","items":[
    {"label":"Question","text":"A participant suggests a different word for an item but confirms they understood the original meaning. What do you record?"},
    {"label":"Answer","text":"Record both the confirmation of comprehension and the suggested alternative phrasing. You do not decide whether to adopt the change — the reconciliation team will weigh the suggestion against all participants' data.","tone":"info"}
  ]}
]$jb$,
$md$## Probing Scripts & Data Capture

Standard probes per item: (1) ask the participant to read the item aloud if literacy permits; (2) "What does this question mean to you?"; (3) "Is there anything about this question that is confusing or unclear?"; (4) "Is there a better way to say this in [language]?"; (5) record responses verbatim — never paraphrase or correct.

Data-capture fields per item: item number; anonymized participant ID; verbatim interpretation; confusion noted (Yes/No); suggested alternative phrasing (if offered); coordinator assessment (Comprehension confirmed / Revision recommended).

If a participant suggests a different word but confirms they understood the original, record both — the reconciliation team decides whether to adopt the change.$md$),

    (4, 'findings-summary', 'Findings Summary', 6,
$jb$[
  {"type":"prose","md":"## The Cognitive Debriefing Summary Report\n\nAfter completing all interviews, prepare a Cognitive Debriefing Summary Report that turns the raw per-item data into a recommendation."},
  {"type":"steps","title":"What the summary report contains","steps":[
    {"title":"Participant demographics","body":"Age range, education, and disease status (if applicable)."},
    {"title":"Items with confirmed comprehension","body":"Items the participants understood as intended."},
    {"title":"Items requiring revision","body":"Items that caused difficulty, with your recommended revisions."},
    {"title":"Cultural adaptation notes","body":"Any cultural-fit observations worth flagging."},
    {"title":"Recommendation","body":"Your recommendation to proceed or to revise."}
  ]},
  {"type":"callout","variant":"info","title":"You recommend; reconciliation decides","body":"The summary report feeds the reconciliation team and the LV report. Your role is to surface the evidence and a clear recommendation — adoption of changes is decided downstream."}
]$jb$,
$md$## Findings Summary

After all interviews, prepare a Cognitive Debriefing Summary Report including: participant demographics (age range, education, disease status if applicable); items with confirmed comprehension; items requiring revision and the recommended revisions; cultural adaptation notes; and your recommendation to proceed or revise.

The report feeds the reconciliation team and the LV report — you recommend, reconciliation decides.$md$)
  ) AS v(oi, slug, title, mins, blocks, body)
  RETURNING training_id
)
SELECT 1 FROM lessons;
