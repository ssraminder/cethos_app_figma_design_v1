-- 2026-06-22 — Seed the COA Linguistic Validation test pool.
--
-- COA previously had NO test in cvp_test_library (quiz-only), so a COA-domain
-- translator who picked the "test" route at the chooser got nothing consistent.
-- This seeds 4 COA instrument types x 3 difficulties = 12 tests, EN -> wildcard
-- target (target_language_id NULL) + domain='coa_linguistic_validation' +
-- service_type='domain_test', mirroring the life_sciences pool so cvp-send-tests
-- delivers them to every target via wildcard-fallback rotation. Reference-free AI
-- grading; COA-tuned rubric (conceptual equivalence + patient readability weighted
-- above dense terminology). Seeded [AI-DRAFT] for staff review in the test library.
--
-- Applied to prod via MCP apply_migration (seed_coa_linguistic_validation_tests).
-- Idempotent: guarded by title so re-applying is a no-op.
WITH c AS (
  SELECT
    'fde091d2-db5f-4e41-a490-7e15efc419e1'::uuid AS en,
    '{"accuracy":0.35,"terminology":0.15,"fluency":0.20,"style":0.10,"locale":0.15,"design":0.05,"non_translation":0.00}'::text AS rubric,
    ARRAY['accuracy','fluency','terminology','style','locale_conventions','design','non_translation']::text[] AS mqm
),
instr AS (
  SELECT
    $i$This is a patient-reported outcome (PRO) instrument for Clinical Outcome Assessment (COA) linguistic validation. Produce a forward translation suitable for cognitive debriefing with patients. Prioritise conceptual equivalence over literal wording — preserve the construct each item measures. Keep the response options consistent across all items and at a patient-appropriate reading level. Preserve the recall period, item numbering and the question/response structure. Adapt idioms for the target culture; add or omit nothing.$i$ AS pro,
    $i$This is a cognitive-debriefing interview guide for COA linguistic validation. Translate the interviewer's probes so they stay open-ended, neutral and non-leading in the target language, using natural spoken register. Preserve the intent of each probe; never turn an open question into a closed one. Keep references to instrument items consistent with the questionnaire being debriefed; add or omit nothing.$i$ AS cd,
    $i$This is a clinician-reported outcome (ClinRO) rating scale for COA linguistic validation. Translate for a trained clinician administering the scale. Preserve the precise clinical anchors, severity gradations, numbering and scoring instructions exactly. Use standard target-country clinical terminology; do not simplify or merge the anchors.$i$ AS clinro,
    $i$This is an observer-reported outcome (ObsRO) instrument completed by a caregiver. Produce a forward translation at a lay-caregiver reading level. Keep the focus on observable behaviours (not interpretations), preserve the recall period and the frequency/intensity response options, and keep them consistent across items. Adapt examples for the target culture; add or omit nothing.$i$ AS obsro
)
INSERT INTO cvp_test_library
  (source_language_id, target_language_id, domain, service_type, difficulty, title, source_text, instructions, reference_translation, ai_assessment_rubric, mqm_dimensions_enabled, is_active)
SELECT c.en, NULL, 'coa_linguistic_validation', 'domain_test', v.difficulty, v.title, v.source_text,
  CASE v.itype WHEN 'pro' THEN instr.pro WHEN 'cd' THEN instr.cd WHEN 'clinro' THEN instr.clinro WHEN 'obsro' THEN instr.obsro END,
  NULL, c.rubric, c.mqm, true
FROM c, instr, (VALUES
  ('beginner','[AI-DRAFT] coa_linguistic_validation v1 — PRO questionnaire (beginner)', $s$DAILY PAIN DIARY

Please answer these questions about your pain today. Choose one answer for each question.

1. How bad was your pain at its worst today?
   ☐ No pain   ☐ Mild   ☐ Moderate   ☐ Severe   ☐ Worst possible

2. How often did pain stop you from doing your daily activities today?
   ☐ Never   ☐ Once or twice   ☐ Several times   ☐ Most of the day   ☐ All day

3. Did pain make it hard to fall asleep last night?
   ☐ Not at all   ☐ A little   ☐ Quite a bit   ☐ Very much

4. How well did your pain medicine work today?
   ☐ Very well   ☐ Well   ☐ A little   ☐ Not at all   ☐ I took no medicine

Thank you. Please fill in this diary at the same time every evening.$s$, 'pro'),
  ('intermediate','[AI-DRAFT] coa_linguistic_validation v1 — PRO questionnaire (intermediate)', $s$WEEKLY RESPIRATORY SYMPTOM AND IMPACT QUESTIONNAIRE

These questions ask about your breathing over the past 7 days. There are no right or wrong answers. Please choose the one answer that best describes how you have been feeling.

Over the past 7 days...

1. How often did you feel short of breath while resting?
   ☐ Never   ☐ Rarely   ☐ Sometimes   ☐ Often   ☐ Always

2. How much did coughing disturb your sleep at night?
   ☐ Not at all   ☐ A little   ☐ A moderate amount   ☐ A lot   ☐ A very great deal

3. Because of your breathing, how much difficulty did you have climbing one flight of stairs?
   ☐ No difficulty   ☐ A little difficulty   ☐ Some difficulty   ☐ Much difficulty   ☐ I could not do it

4. How often did your chest feel tight or heavy?
   ☐ None of the time   ☐ A little of the time   ☐ Some of the time   ☐ Most of the time   ☐ All of the time

5. Overall, how would you rate your breathing this week?
   ☐ Excellent   ☐ Very good   ☐ Good   ☐ Fair   ☐ Poor

Thank you for completing this questionnaire. Your answers will help your healthcare team understand how you are feeling.$s$, 'pro'),
  ('advanced','[AI-DRAFT] coa_linguistic_validation v1 — PRO questionnaire (advanced)', $s$HEALTH-RELATED QUALITY OF LIFE QUESTIONNAIRE — ADULT FORM

The following questions ask how your health has affected your daily life during the past 4 weeks. Please answer every question by marking the single response that best applies. If a question does not apply to you, mark "Not applicable".

PHYSICAL FUNCTIONING
1. During the past 4 weeks, how much difficulty did you have with vigorous activities, such as running, lifting heavy objects, or strenuous sport?
   ☐ None ☐ A little ☐ A moderate amount ☐ A lot ☐ Unable to do
2. How much difficulty did you have walking more than one kilometre?
   ☐ None ☐ A little ☐ A moderate amount ☐ A lot ☐ Unable to do

EMOTIONAL WELL-BEING
3. During the past 4 weeks, how often have you felt downhearted or low?
   ☐ None of the time ☐ A little of the time ☐ Some of the time ☐ Most of the time ☐ All of the time
4. How often did worry about your health interfere with your concentration?
   ☐ None of the time ☐ A little of the time ☐ Some of the time ☐ Most of the time ☐ All of the time

SOCIAL ROLE
5. To what extent have your health problems limited your usual social activities with family or friends?
   ☐ Not at all ☐ Slightly ☐ Moderately ☐ Quite a bit ☐ Extremely
6. If you are employed: how often did your health reduce the amount of work you accomplished? (If you are not employed, mark "Not applicable".)
   ☐ Never ☐ Rarely ☐ Sometimes ☐ Often ☐ Always ☐ Not applicable

Please review your answers and make sure you have marked one response per question.$s$, 'pro'),
  ('beginner','[AI-DRAFT] coa_linguistic_validation v2 — Cognitive-debriefing guide (beginner)', $s$COGNITIVE DEBRIEFING — INTERVIEWER GUIDE (BASIC PROBES)

Read each question from the questionnaire aloud to the participant, then use the probes below. Do not lead the participant towards any particular answer.

After reading an item:
- "Can you tell me, in your own words, what this question is asking?"
- "Was anything about this question hard to understand?"

About the answer choices:
- "How did you choose your answer?"
- "Were the answer choices clear and easy to tell apart?"

General:
- "Is there any word here you would say differently?"

Thank the participant after each item.$s$, 'cd'),
  ('intermediate','[AI-DRAFT] coa_linguistic_validation v2 — Cognitive-debriefing guide (intermediate)', $s$COGNITIVE DEBRIEFING INTERVIEW GUIDE

Purpose: to confirm that each translated item is understood as intended. Administer one item at a time. Keep your probes open and neutral; never suggest the "correct" interpretation.

For each item, ask:
1. Comprehension: "In your own words, what is this question asking you about?"
2. Paraphrase: "How would you say this question to a friend?"
3. Recall period: "When you answered, what period of time were you thinking about?"
4. Response options: "Tell me the difference between these two answers. Was it easy to choose between them?"
5. Acceptability: "Was there anything in this question that felt awkward, unclear, or uncomfortable to read?"

If the participant hesitates, wait in silence rather than offering an interpretation. Note any word the participant stumbles over or replaces with their own term. At the end ask: "Looking back, is there any question you would word differently?"$s$, 'cd'),
  ('advanced','[AI-DRAFT] coa_linguistic_validation v2 — Cognitive-debriefing guide (advanced)', $s$COGNITIVE DEBRIEFING INTERVIEW GUIDE — FULL PROTOCOL

This guide accompanies the linguistic validation of a patient-reported outcome measure assessing mood. The interviewer must remain neutral, non-leading, and attentive to distress. Begin only after consent and after confirming the participant is comfortable continuing.

Introduction (read verbatim): "There are no right or wrong answers. I am testing the questionnaire, not you. We can pause at any time."

For each item, probe in this order:
1. Spontaneous comprehension: "Without reading it again, what do you think this question is asking?"
2. Construct check: "What feeling or experience do you think this question is trying to measure?"
3. Term elicitation: "Is there a word here you would not normally use? What word would you use instead?"
4. Response mapping: "Show me where your experience would fall among these answer options, and explain why."
5. Temporal anchor: "You were asked about the past two weeks — was that period clear?"

Sensitive items: confirm the participant is willing to continue, use the exact validated wording, and do not paraphrase the clinical concept. If the participant discloses risk, stop probing and follow the site safety procedure. Record verbatim any alternative wording the participant proposes, and flag items where comprehension diverged from the intended construct.$s$, 'cd'),
  ('beginner','[AI-DRAFT] coa_linguistic_validation v3 — ClinRO rating scale (beginner)', $s$CLINICIAN SEVERITY RATING — SKIN INVOLVEMENT

To be completed by the examining clinician. Rate the patient's current skin involvement using the single best description.

0 — Clear: no inflammatory lesions.
1 — Mild: faint redness, a few scattered lesions.
2 — Moderate: clear redness and raised lesions over several areas.
3 — Severe: intense redness, widespread raised or scaling lesions.

Record the score in the box. If the patient falls between two grades, select the higher grade and note the affected body areas.$s$, 'clinro'),
  ('intermediate','[AI-DRAFT] coa_linguistic_validation v3 — ClinRO rating scale (intermediate)', $s$CLINICIAN-REPORTED OUTCOME — DISEASE ACTIVITY ASSESSMENT

Complete each item based on your examination today. Use the anchors exactly as written.

1. Joint tenderness (on pressure):
   0 = none; 1 = mild, patient reports discomfort; 2 = moderate, patient winces; 3 = severe, patient withdraws the joint.
2. Joint swelling (palpable):
   0 = none; 1 = detectable; 2 = clear swelling with loss of bony contours; 3 = marked swelling with effusion.
3. Global disease activity (your overall judgement):
   Mark a vertical line on the scale from "No activity" (left) to "Maximum activity" (right).
4. Functional impairment observed during the visit:
   0 = none; 1 = slight; 2 = patient needs assistance with some movements; 3 = patient unable to perform movements unaided.

Sum items 1, 2, and 4 for the activity subtotal. Do not score a joint that has been surgically replaced; mark "NA" and record the joint.$s$, 'clinro'),
  ('advanced','[AI-DRAFT] coa_linguistic_validation v3 — ClinRO rating scale (advanced)', $s$CLINICIAN-ADMINISTERED SEVERITY SCALE — NEUROLOGICAL EXAMINATION

This scale is administered by a trained neurologist. Score each domain on direct examination. Where two anchors could apply, score the one that reflects the patient's typical performance, not their best single attempt.

I. SPEECH
0 = Normal.
1 = Mild loss of expression or slurring; fully intelligible.
2 = Moderately impaired; occasionally must be asked to repeat.
3 = Markedly impaired; frequently unintelligible.
4 = Unintelligible most of the time.

II. POSTURAL STABILITY (response to a sudden pull on the shoulders while standing)
0 = Normal recovery.
1 = Retropulsion but recovers unaided.
2 = Absence of postural response; would fall if not caught by the examiner.
3 = Very unstable; tends to lose balance spontaneously.
4 = Unable to stand without assistance.

III. RIGIDITY (judged on passive movement of major joints, patient relaxed)
Score 0–4 for the neck and for the right and left limbs separately; record each.

SCORING RULES
- If a domain cannot be assessed (e.g., contracture, amputation), enter "UR" (unratable) — do not impute a score.
- The total is the sum of rated domains; report the number of domains rated alongside the total.
- Re-examine any domain where the patient's effort appeared limited by fatigue rather than by the underlying condition.$s$, 'clinro'),
  ('beginner','[AI-DRAFT] coa_linguistic_validation v4 — ObsRO caregiver diary (beginner)', $s$CAREGIVER DAILY DIARY

Please answer these questions about the person you care for, thinking about today only. Mark one answer for each.

1. How many times did they cough today?
   ☐ None   ☐ 1–3 times   ☐ 4–6 times   ☐ More than 6 times
2. Did they have a fever today?
   ☐ No   ☐ Yes
3. How well did they eat today compared with a normal day?
   ☐ As usual   ☐ A little less   ☐ Much less   ☐ Refused to eat
4. How was their mood for most of the day?
   ☐ Happy and calm   ☐ Fussy at times   ☐ Upset for long periods

Please complete the diary each evening before bed.$s$, 'obsro'),
  ('intermediate','[AI-DRAFT] coa_linguistic_validation v4 — ObsRO caregiver diary (intermediate)', $s$OBSERVER-REPORTED OUTCOME — CAREGIVER QUESTIONNAIRE

These questions ask what you have seen the child do over the past 24 hours. Please answer based on what you observed, not on what you think the child felt. Choose one answer for each item.

1. How often did the child rub or scratch their skin?
   ☐ Not at all   ☐ A few times   ☐ Many times   ☐ Almost constantly
2. How much did itching seem to disturb the child's sleep?
   ☐ Not at all   ☐ A little   ☐ Quite a bit   ☐ A great deal
3. During play, how often did the child stop an activity because of discomfort?
   ☐ Never   ☐ Once   ☐ Several times   ☐ The child could not play
4. How easy was it to settle the child when they became upset?
   ☐ Very easy   ☐ Fairly easy   ☐ Difficult   ☐ Very difficult

If someone else cared for the child for part of the day, please ask them before answering.$s$, 'obsro'),
  ('advanced','[AI-DRAFT] coa_linguistic_validation v4 — ObsRO caregiver diary (advanced)', $s$OBSERVER-REPORTED OUTCOME — DAILY BEHAVIOUR AND DISTRESS RECORD

To be completed by a caregiver who has spent at least six waking hours with the person today. Rate only behaviours you directly observed. For each behaviour, record both how often it occurred and how intense it was.

A. AGITATION (restlessness, pacing, repetitive movements)
   Frequency: 0 = not at all; 1 = once or twice; 2 = several episodes; 3 = almost continuously.
   Intensity: 0 = none; 1 = mild, settled on its own; 2 = moderate, needed reassurance; 3 = severe, needed help to keep them safe.
B. RESISTANCE TO CARE (pushing away, refusing help with washing, dressing, or eating)
   Frequency: 0–3 as above.
   Intensity: 0 = none; 1 = brief reluctance; 2 = active refusal of one task; 3 = refusal of most care.
C. WITHDRAWAL (turning away, no response when spoken to)
   Frequency: 0–3 as above.

GUIDANCE
- Record what you saw, not why you think it happened.
- If a behaviour did not occur, enter 0 for both frequency and intensity; do not leave blanks.
- If two caregivers were present, agree a single rating together.
- Note in the margin any new behaviour not listed above, with the time it occurred.$s$, 'obsro')
) AS v(difficulty, title, source_text, itype)
WHERE NOT EXISTS (SELECT 1 FROM cvp_test_library x WHERE x.title = v.title);
