-- Phase B: rework the other 3 vendor trainings (Confidentiality & Data Protection,
-- GCP for Clinical Linguists, ISO 17100 Process & QA) into interactive content
-- blocks (prose + steps + worked examples + callouts + comparisons). Applied to
-- prod via MCP; committed for parity. Drafts for domain review.

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## The NDA you signed\n\nEvery Cethos linguist signs a non-disclosure agreement before receiving work. Client content is **confidential**, used **only** to perform the assigned job, and **never** disclosed, republished, or reused."},
 {"type":"comparison","title":"What the NDA allows vs forbids","columns":[
   {"label":"Allowed","tone":"good","items":["Use client content to do the assigned job","Ask Cethos PMs questions about the work","Keep files inside the Cethos portal"]},
   {"label":"Forbidden","tone":"bad","items":["Discuss projects publicly or on social media","List client names or content in your CV / portfolio","Reuse or republish content anywhere else"]}
 ]},
 {"type":"callout","variant":"rule","title":"Default to silence","body":"If you're unsure whether you can mention something about a project, assume you can't — and ask Cethos in writing first."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='confidentiality-data-protection') AND order_index=1;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## Secure handling\n\nHow you store and move client content matters as much as the translation itself."},
 {"type":"comparison","title":"Do vs don't","columns":[
   {"label":"Do","tone":"good","items":["Work only on approved, password-protected devices","Keep files in the Cethos portal / agreed channels","Delete local copies when the job closes"]},
   {"label":"Don't","tone":"bad","items":["Paste confidential text into free or public MT / AI tools","Email content to personal accounts","Leave files on shared or unencrypted drives"]}
 ]},
 {"type":"example","title":"See a worked example: the AI shortcut","intro":"A tempting shortcut that is actually a breach.","items":[
   {"label":"The temptation","text":"\"I'll just paste this clinical paragraph into a free AI tool to draft it faster.\"","tone":"muted"},
   {"label":"Why it's a breach","text":"The text — with patient data — is now stored on a third-party server, outside the NDA and GDPR scope.","tone":"info"}
 ]},
 {"type":"callout","variant":"warning","title":"Free AI / MT tools leak data","body":"Pasting confidential text into a free machine-translation or AI tool sends it to a third party — treat it as a disclosure. Never do it on client content."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='confidentiality-data-protection') AND order_index=2;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## Personal & health data\n\nClinical and certified documents often contain **personal data (PII)** and **protected health information (PHI)** — names, dates of birth, diagnoses. Under GDPR (and equivalents) this data is strictly protected."},
 {"type":"steps","title":"Three rules for personal data","steps":[
   {"title":"Minimize","body":"Only access what you need for the job — nothing more."},
   {"title":"Isolate","body":"Never copy personal data into unrelated files, notes, or tools."},
   {"title":"Assume sensitivity","body":"Treat every document as if it contained sensitive personal data."}
 ]},
 {"type":"example","title":"See a worked example: PII or not?","intro":"Which of these is protected personal data?","items":[
   {"label":"Personal data (protected)","text":"\"Maria Gonzalez, DOB 14/03/1971, diagnosed with type 2 diabetes.\"","tone":"info"},
   {"label":"Not personal data","text":"\"The questionnaire has 12 items on a 5-point scale.\"","tone":"muted"}
 ]},
 {"type":"callout","variant":"rule","title":"When in doubt, protect it","body":"If you can't tell whether something is personal data, handle it as if it were."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='confidentiality-data-protection') AND order_index=3;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## If something goes wrong\n\nIf you suspect a data breach, lost device, mis-sent file, or any confidentiality incident, **report it immediately** to vm@cethos.com."},
 {"type":"steps","title":"What to do in an incident","steps":[
   {"title":"Report immediately","body":"Email vm@cethos.com as soon as you suspect something — speed limits harm."},
   {"title":"Don't try to hide it","body":"You will not be penalized for reporting in good faith; concealment is the real risk."},
   {"title":"Preserve what happened","body":"Don't delete files or logs; note what occurred and when."}
 ]},
 {"type":"callout","variant":"info","title":"Reporting is a requirement, not optional","body":"Fast reporting is itself a compliance obligation — and it protects you, the patient, and the client."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='confidentiality-data-protection') AND order_index=4;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## Good Clinical Practice (ICH E6)\n\nGCP is the international ethical and scientific quality standard for trials involving humans. As a linguist on clinical materials you support GCP by producing accurate, traceable, confidential work."},
 {"type":"steps","title":"The four principles that touch your work","steps":[
   {"title":"Data integrity","body":"Your deliverables are trial records — they must be accurate and traceable."},
   {"title":"Confidentiality of subject data","body":"Patient data is protected; handle it under your NDA and the law."},
   {"title":"Documented procedures","body":"Follow the agreed process and keep records of what you did."},
   {"title":"Qualified personnel","body":"Work within your competence; raise queries when you're out of depth."}
 ]},
 {"type":"callout","variant":"info","title":"You don't run the trial — but you can break it","body":"A flawed translation or mishandled data can compromise an entire study's results. Your accuracy matters."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='gcp-clinical-linguists') AND order_index=1;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## ALCOA+ for linguistic deliverables\n\nYour deliverables and records must be **A**ttributable, **L**egible, **C**ontemporaneous, **O**riginal, **A**ccurate — plus Complete, Consistent, Enduring and Available."},
 {"type":"steps","title":"ALCOA+ in practice","steps":[
   {"title":"Deliver the exact agreed scope","body":"Nothing added, nothing omitted."},
   {"title":"Keep version history","body":"Don't overwrite source files; preserve each version."},
   {"title":"Record queries and resolutions","body":"Every question and its answer is part of the record."},
   {"title":"Never fabricate or backdate","body":"Records reflect what actually happened, when it happened."}
 ]},
 {"type":"example","title":"See a worked example: query vs guess","intro":"Source contains an abbreviation you don't recognize — \"pt. c/o SOB\".","items":[
   {"label":"Silent guess (wrong)","text":"Translate it as a full sentence you invented.","tone":"muted"},
   {"label":"Raise a query (right)","text":"\"Please confirm: 'pt. c/o SOB' = 'patient complains of shortness of breath'?\"","note":"Documented, attributable, accurate — the ALCOA+ way.","tone":"info"}
 ]},
 {"type":"callout","variant":"rule","title":"Raise a query, don't guess","body":"If something is ambiguous, raise a query — a silent wrong guess becomes a data-integrity problem downstream."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='gcp-clinical-linguists') AND order_index=2;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## Protecting trial & patient data\n\nClinical materials often contain protected health information (PHI) and commercially sensitive sponsor data. You are bound by your NDA and applicable law (GDPR / HIPAA-equivalent)."},
 {"type":"comparison","title":"Do vs don't","columns":[
   {"label":"Do","tone":"good","items":["Store files only on approved, access-controlled systems","Delete local copies per the retention instructions","Report any suspected breach immediately"]},
   {"label":"Don't","tone":"bad","items":["Share content with unauthorized parties","Use public / free MT tools on confidential text","Keep copies after the job closes"]}
 ]},
 {"type":"callout","variant":"warning","title":"Report breaches to vm@cethos.com immediately","body":"Same rule as the confidentiality training — fast reporting limits harm and is a compliance requirement."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='gcp-clinical-linguists') AND order_index=3;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## Translate → Edit → Proofread\n\nISO 17100 requires that translation is followed by a **revision** (a bilingual check against the source) by a **second** qualified person, then proofreading before release."},
 {"type":"steps","title":"The TEP workflow","steps":[
   {"title":"Translate","body":"The translator produces the target text to the agreed scope, terminology and style."},
   {"title":"Edit (revise)","body":"A different qualified person checks the translation bilingually against the source."},
   {"title":"Proofread","body":"A final check of the target text before release."}
 ]},
 {"type":"callout","variant":"rule","title":"Translator is never the reviser","body":"The translator and reviser are always different people. That separation is the core quality control."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='iso-17100-process-qa') AND order_index=1;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## Why a second pair of eyes\n\nNo one revises their own translation. The reviser checks the work against the source and the brief — independence is an ISO 17100 requirement and a Cethos rule."},
 {"type":"steps","title":"What the reviser checks","steps":[
   {"title":"Accuracy","body":"Faithful to the source meaning."},
   {"title":"Completeness","body":"Nothing omitted or added."},
   {"title":"Terminology","body":"Correct and consistent; matches glossaries and TMs."},
   {"title":"Register & brief","body":"Right tone and target variant; instructions followed."}
 ]},
 {"type":"callout","variant":"rule","title":"Never sign off as both","body":"Never sign off as both translator and reviser on the same job — it's an ISO 17100 violation and a Cethos rule."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='iso-17100-process-qa') AND order_index=2;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## Before you deliver\n\nRun this checklist before every delivery — these are the checks a reviser and the client will apply."},
 {"type":"steps","title":"The pre-delivery checklist","steps":[
   {"title":"Complete","body":"Nothing omitted or added; all segments translated."},
   {"title":"Accurate","body":"Faithful to the source; correct terminology (use provided glossaries / TMs)."},
   {"title":"Consistent","body":"Terminology and style consistent throughout."},
   {"title":"Clean","body":"Spelling, numbers, formatting and tags intact."},
   {"title":"On brief","body":"Correct target variant, register, and instructions followed."}
 ]},
 {"type":"callout","variant":"warning","title":"Tags and numbers break silently","body":"Formatting tags, numbers and dates are the most common silent errors — check them deliberately."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='iso-17100-process-qa') AND order_index=3;

UPDATE cvp_training_lessons SET content_blocks = $json$[
 {"type":"prose","md":"## Feedback is part of quality\n\nClient or reviser feedback may come back on a job. Respond professionally: understand the issue, correct it, and note the root cause so it doesn't recur."},
 {"type":"steps","title":"How to handle feedback","steps":[
   {"title":"Understand the issue","body":"Read the feedback fully before reacting; ask if it's unclear."},
   {"title":"Correct it","body":"Fix the deliverable promptly and thoroughly."},
   {"title":"Find the root cause","body":"Why did it happen — a glossary gap, a rushed pass, a misread brief?"},
   {"title":"Prevent recurrence","body":"Apply the lesson so the same issue doesn't return."}
 ]},
 {"type":"callout","variant":"info","title":"Feedback feeds CAPA","body":"Repeated, documented issues feed Cethos's corrective-action (CAPA) process and your performance record — handling them well protects both."}
]$json$::jsonb WHERE training_id=(SELECT id FROM cvp_trainings WHERE slug='iso-17100-process-qa') AND order_index=4;
