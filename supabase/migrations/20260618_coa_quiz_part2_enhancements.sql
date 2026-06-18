-- COA quiz enhancements (aligns the quiz with the full translator-competency spec):
--   * Part 2 (cvp_coa_translation_items): difficulty tiers, error-correction items
--     (carry a flawed target-language draft), and new construct types
--     (error_correction, false_friend, locale_convention, naturalness).
--   * Part 1 (iso_competence_quizzes / coa_methodology): +5 general-judgment MCQs.
-- Content seeded to prod during the IQVIA audit-prep session; captured here so the
-- repo mirrors prod. (Inserts are not guarded for re-run; migrations run once.)

ALTER TABLE public.cvp_coa_translation_items ADD COLUMN IF NOT EXISTS difficulty text;
ALTER TABLE public.cvp_coa_translation_items ADD COLUMN IF NOT EXISTS flawed_draft text;
ALTER TABLE public.cvp_coa_translation_items ADD COLUMN IF NOT EXISTS target_language_code text;

ALTER TABLE public.cvp_coa_translation_items DROP CONSTRAINT IF EXISTS cvp_coa_translation_items_construct_check;
ALTER TABLE public.cvp_coa_translation_items ADD CONSTRAINT cvp_coa_translation_items_construct_check
  CHECK (construct = any (array[
    'recall_period','frequency_scale','severity','register','idiom_conceptual','clinical_term',
    'error_correction','false_friend','locale_convention','naturalness'
  ]));

UPDATE public.cvp_coa_translation_items SET difficulty='easy'   WHERE construct IN ('recall_period','frequency_scale','severity') AND difficulty IS NULL;
UPDATE public.cvp_coa_translation_items SET difficulty='medium' WHERE construct IN ('register','clinical_term') AND difficulty IS NULL;
UPDATE public.cvp_coa_translation_items SET difficulty='hard'   WHERE construct='idiom_conceptual' AND difficulty IS NULL;

INSERT INTO public.cvp_coa_translation_items (order_index, source_text, construct, grading_guidance, difficulty) VALUES
(7, 'In the past week, have you been constipated?', 'false_friend',
   'False-friend trap in Romance languages: "constipated" (EN, bowel) must NOT be rendered as the cognate meaning a head cold (ES "constipado", IT "costipato", PT "constipado" = a cold; FR "constipe" is correct). Reward the term meaning difficulty with bowel movements; penalise the cold/cognate reading as a major accuracy error.', 'medium'),
(8, 'Please enter the date your symptoms began (for example, 4 July 2026) and your weight in pounds.', 'locale_convention',
   'Locale conventions: date order/format and number/unit conventions must be natural for the target market. A validated COA keeps the unit but flags conversion to the sponsor rather than silently converting — reward target-appropriate formatting + an awareness note; penalise US format carried over verbatim.', 'medium'),
(9, 'How are you feeling today?', 'naturalness',
   'Naturalness/register: several renderings are grammatical but only a natural, warm, patient-appropriate phrasing scores well; stiff/over-literal or overly clinical phrasings score lower.', 'easy');

INSERT INTO public.cvp_coa_translation_items (order_index, source_text, construct, grading_guidance, difficulty, target_language_code, flawed_draft) VALUES
(10, 'Have you had any difficulty climbing a flight of stairs in the past week?', 'error_correction',
   'Error-correction (ES). The draft contains calques/mistranslations to fix: "escalar" (mountain-climb) for everyday stairs, and "un vuelo de escaleras" (calque of "a flight of stairs"; natural ES = "un tramo de escaleras" / "las escaleras"). Reward a natural, patient-appropriate corrected version preserving the recall period; the submitted (corrected) text is graded against the English source by MQM.', 'medium',
   'es', 'Ha tenido alguna dificultad para escalar un vuelo de escaleras en la semana pasada?');

INSERT INTO public.iso_competence_quizzes (competence_slug, question, options, correct_option, explanation, difficulty, active, target_language_id) VALUES
('coa_methodology', 'While translating a COA item you notice the English source has an apparent factual inconsistency (e.g. the recall period is "7 days" in one item and "1 week" in another). What should you do?', '[{"label":"Silently fix it to match","value":"a"},{"label":"Translate it literally as-is and say nothing","value":"b"},{"label":"Flag/query the sponsor or PM before proceeding — never silently alter validated source","value":"c"},{"label":"Omit the inconsistent item","value":"d"}]'::jsonb, 'c', 'Validated COA source must not be silently changed; discrepancies are queried with the sponsor/PM.', 'medium', true, NULL),
('coa_methodology', 'In a COA instrument, which elements should generally NOT be translated or altered without explicit sponsor instruction?', '[{"label":"The patient instructions","value":"a"},{"label":"The registered instrument name, item numbering, and sponsor/trademark identifiers","value":"b"},{"label":"The response options","value":"c"},{"label":"The question stems","value":"d"}]'::jsonb, 'b', 'Registered instrument names, numbering, and sponsor/trademark identifiers are non-translatables unless the sponsor directs otherwise.', 'medium', true, NULL),
('coa_methodology', 'A COA item asks how far the patient can walk, in "feet". Your target locale uses the metric system. The correct action is:', '[{"label":"Silently convert feet to metres","value":"a"},{"label":"Keep the unit and query the sponsor — unit conversion in a validated COA can change the construct and needs sponsor approval","value":"b"},{"label":"Drop the unit entirely","value":"c"},{"label":"Translate ''feet'' as the body part","value":"d"}]'::jsonb, 'b', 'Never silently convert units in a validated COA; conversion can alter the measured construct and is a sponsor decision.', 'medium', true, NULL),
('coa_methodology', 'A 5-point frequency scale (never...always) is repeated across 12 items of an instrument. Best practice for the response anchors is to:', '[{"label":"Vary the wording across items to avoid repetition","value":"a"},{"label":"Translate the anchors once and apply them identically across all items","value":"b"},{"label":"Let each translator render them differently","value":"c"},{"label":"Use synonyms for variety","value":"d"}]'::jsonb, 'b', 'Response anchors must be rendered consistently across all items so the scale measures uniformly.', 'easy', true, NULL),
('coa_methodology', 'A source sentence is genuinely ambiguous (two valid readings) and the brief gives no guidance. You should:', '[{"label":"Pick one reading and move on","value":"a"},{"label":"Query the sponsor/PM, presenting the two readings","value":"b"},{"label":"Put both readings into the target text","value":"c"},{"label":"Omit the sentence","value":"d"}]'::jsonb, 'b', 'Genuine ambiguity is resolved by querying, not guessing or doubling up.', 'medium', true, NULL);
