-- Rework COA Linguistic Validation (vendor training) into interactive content
-- blocks: prose + visual step pipelines + expandable worked examples + key-rule
-- callouts + do/don't comparisons. Applied to prod via MCP; committed for parity.
-- Phase A of the vendor-training rework (graded knowledge-check step = Phase A2).

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## Clinical Outcome Assessments (COAs)\n\nA **COA** measures how a patient feels or functions in a clinical trial. There are four types — and every translated COA must measure the **same concept** as the original, or the trial's data can't be pooled across countries."},
 {"type":"steps","title":"The four COA types","steps":[
   {"title":"PRO — patient-reported","body":"The patient reports directly (e.g. a symptom diary or quality-of-life questionnaire)."},
   {"title":"ClinRO — clinician-reported","body":"A trained clinician rates the patient after assessment."},
   {"title":"ObsRO — observer-reported","body":"A non-clinician observer (e.g. a parent or caregiver) reports what they observe."},
   {"title":"PerfO — performance outcome","body":"Scored from a standardized task the patient performs (e.g. a timed walk test)."}
 ]},
 {"type":"prose","md":"## Why validation, not just translation\n\n**Linguistic validation (LV)** is the rigorous, documented process that produces conceptually equivalent, culturally appropriate COA translations. Regulators (FDA, EMA) and sponsors expect a defined methodology with an auditable trail."},
 {"type":"comparison","title":"LV vs ordinary translation","columns":[
   {"label":"Ordinary translation","tone":"bad","items":["One translator, one pass","Optimizes for fluent wording","No patient testing","No audit trail"]},
   {"label":"Linguistic validation","tone":"good","items":["Multiple linguists + reconciliation","Optimizes for concept equivalence","Tested with real patients","Fully documented LV report"]}
 ]},
 {"type":"callout","variant":"rule","title":"Why it matters","body":"If a translated item measures even a slightly different concept, patient responses aren't comparable across countries — and the endpoint data can't be pooled. Concept equivalence is the whole job."}
]$json$::jsonb
WHERE training_id = (SELECT id FROM cvp_trainings WHERE slug='coa-linguistic-validation') AND order_index = 1;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"Linguistic validation is a **defined, auditable pipeline** — not ordinary translation. Each step has an owner, an input, and an output that feeds the next. Open any step to see what you actually do."},
 {"type":"steps","title":"The 7-step pipeline","steps":[
   {"title":"Preparation","body":"Concept elaboration — pin down each item's intended meaning before any translation begins."},
   {"title":"Forward translation","body":"Two independent forward translations by native target-language linguists, working separately."},
   {"title":"Reconciliation","body":"A third linguist merges the two forwards into one agreed version, documenting each choice."},
   {"title":"Back translation","body":"Translate the reconciled version back to source — blind to the original — to surface drift."},
   {"title":"Back-translation review","body":"Compare against the source and resolve every discrepancy, each with a written rationale."},
   {"title":"Cognitive debriefing","body":"Test with target patients; structured probing confirms they understand each item as intended."},
   {"title":"Finalization & proofreading","body":"Lock the version and assemble the LV report — the audit trail sponsors and regulators review."}
 ]},
 {"type":"example","title":"See a worked example: reconciliation","intro":"Two linguists translate the same item independently; a third reconciles.","items":[
   {"label":"Source item (English)","text":"\"I feel downhearted.\""},
   {"label":"Forward 1","text":"\"Me siento desanimado.\"","tone":"muted"},
   {"label":"Forward 2","text":"\"Me siento abatido.\"","tone":"muted"},
   {"label":"Reconciled choice","text":"\"Me siento desanimado.\"","note":"Matches the source register; \"abatido\" implies a heavier despondency than \"downhearted\".","tone":"info"}
 ]},
 {"type":"callout","variant":"rule","title":"Key rule","body":"Never skip back translation to save time. It is the blind check that proves your reconciliation preserved the source concept — auditors look for it."}
]$json$::jsonb
WHERE training_id = (SELECT id FROM cvp_trainings WHERE slug='coa-linguistic-validation') AND order_index = 2;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## Cognitive debriefing\n\nThe translated COA is tested with a small panel of **target patients** to confirm items are understood as intended. The debriefer uses structured probing — comprehension, clarity, alternative wording — **not** leading questions."},
 {"type":"steps","title":"How a debriefing interview runs","steps":[
   {"title":"Recruit representative patients","body":"Match the trial population; record demographics for the report."},
   {"title":"Probe each item","body":"Ask the patient to explain the item in their own words; capture verbatim feedback."},
   {"title":"Summarize comprehension issues","body":"Note where wording was misread or ambiguous, with examples."},
   {"title":"Propose changes with rationale","body":"Recommend wording fixes; every change flows back into finalization."}
 ]},
 {"type":"example","title":"See a worked example: probing","intro":"Item: \"Over the past 7 days, how often did you feel washed out?\"","items":[
   {"label":"Leading question (wrong)","text":"\"This means tired, right?\"","note":"Suggests the answer and biases the patient.","tone":"muted"},
   {"label":"Structured probe (right)","text":"\"What does 'washed out' mean to you, in your own words?\"","note":"Reveals whether the idiom survived translation — some patients read it literally.","tone":"info"}
 ]},
 {"type":"callout","variant":"info","title":"This is the difference","body":"Cognitive debriefing is the step that distinguishes LV from translation: documented evidence that real patients understand the instrument."}
]$json$::jsonb
WHERE training_id = (SELECT id FROM cvp_trainings WHERE slug='coa-linguistic-validation') AND order_index = 3;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## The LV report is the audit trail\n\nEverything is documented: translator credentials, each version, reconciliation notes, the back-translation comparison, cognitive-debriefing results, and the rationale for every change. Sponsors and auditors (FDA, IQVIA) review this report."},
 {"type":"callout","variant":"rule","title":"ALCOA+","body":"Records must be Attributable, Legible, Contemporaneous, Original, Accurate — plus Complete, Consistent, Enduring and Available."},
 {"type":"comparison","title":"Documentation: do vs don't","columns":[
   {"label":"Do","tone":"good","items":["Keep your working notes and every version","Record decisions as you make them","Flag uncertainties for review","Attribute each change to a person and date"]},
   {"label":"Don't","tone":"bad","items":["Backdate or 'tidy up' records later","Delete superseded versions","Guess when you're unsure","Leave changes unexplained"]}
 ]},
 {"type":"example","title":"See a worked example: a change-log entry","intro":"One row from the LV report's change log.","items":[
   {"label":"Item","text":"Q4 — \"feeling on edge\""},
   {"label":"Change","text":"\"nervioso/a\" → \"con los nervios de punta\"","tone":"muted"},
   {"label":"Rationale + attribution","text":"Cognitive debriefing: 3 of 5 patients read \"nervioso\" as clinical anxiety. Changed to the colloquial idiom. — M. Ruiz, 12 Jun 2026","note":"Attributable, contemporaneous, accurate — textbook ALCOA+.","tone":"info"}
 ]}
]$json$::jsonb
WHERE training_id = (SELECT id FROM cvp_trainings WHERE slug='coa-linguistic-validation') AND order_index = 4;
