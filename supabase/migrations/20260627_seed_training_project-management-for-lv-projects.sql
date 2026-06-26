-- Seed interactive training TG-PM-001 — Project Management for LV Projects (staff)
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'project-management-for-lv-projects',
    'Project Management for LV Projects',
    'staff',
    'project-management',
    'TG-PM-001 · Build LV project timelines on the 11-step methodology, run the LV Risk Register, manage linguist availability and blinding, and keep every project audit-ready.',
    true, false, '{"scope":"universal"}'::jsonb, 80
  )
  RETURNING id
),
lessons AS (
  INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, estimated_minutes, content_blocks, body_markdown)
  SELECT t.id, v.oi, v.slug, v.title, v.mins, v.blocks::jsonb, v.bmd
  FROM t, (VALUES
    (1, 'lv-project-setup-checklist', 'LV Project Setup Checklist', 8, $jb$[
      {"type":"prose","md":"## Before any LV project starts\n\nLinguistic validation is a regulated, multi-linguist workflow. A project that starts before scope, NDAs, and resourcing are locked down will fail audit later. Work the setup checklist to completion before the first translator opens a file."},
      {"type":"steps","title":"Project setup checklist","steps":[
        {"title":"Confirm client scope in writing","body":"Instrument name, version, source language, and all target languages — captured in writing, not verbally."},
        {"title":"Execute the client NDA","body":"The Non-Disclosure Agreement with the client must be signed before materials change hands."},
        {"title":"Assess the translator pool","body":"Check availability and qualifications for every required language pair before you commit a timeline."},
        {"title":"Execute and file all linguist NDAs","body":"Every linguist on the project signs; the signed NDA is filed before they receive anything."},
        {"title":"Create the project folder","body":"In the approved document management system — this is where the audit trail will live."},
        {"title":"Distribute the project brief","body":"Send the brief and confirm receipt from each translator."},
        {"title":"Set the timeline","body":"Milestone dates for each of the 11 LV steps."}
      ]},
      {"type":"callout","variant":"rule","title":"NDA before materials — always","body":"No linguist receives project materials until their NDA is executed and filed. The file-sharing platform should block access until the NDA is confirmed."}
    ]$jb$, $md$## Before any LV project starts

Work the setup checklist to completion before the first translator opens a file.

1. Confirm client scope in writing (instrument name, version, source language, all target languages).
2. Execute the client NDA before materials change hands.
3. Assess the translator pool for availability and qualifications in every required language pair.
4. Execute and file all linguist NDAs before they receive anything.
5. Create the project folder in the approved document management system.
6. Distribute the project brief and confirm receipt.
7. Set the timeline with milestone dates for each of the 11 LV steps.

**Rule:** No linguist receives materials until their NDA is executed and filed.$md$),
    (2, 'timeline-construction', 'Timeline Construction', 7, $jb$[
      {"type":"prose","md":"## Sizing an LV project\n\nA typical single-language LV project runs **4–8 weeks**, depending on instrument length and how quickly cognitive debriefing participants can be scheduled. Build the timeline from the milestones below and remember that recruitment can overlap earlier phases."},
      {"type":"steps","title":"Milestones and typical durations","steps":[
        {"title":"Translator briefing and NDA execution","body":"2–3 days"},
        {"title":"Forward translation (T1 and T2, in parallel)","body":"5–10 business days"},
        {"title":"Reconciliation","body":"3–5 business days"},
        {"title":"Back translation","body":"3–5 business days"},
        {"title":"Back translation review","body":"2–3 business days"},
        {"title":"Cognitive debriefing recruitment","body":"5–10 business days — often overlaps the phases above"},
        {"title":"Cognitive debriefing interviews","body":"5–7 business days"},
        {"title":"Finalization and QA","body":"3–5 business days"},
        {"title":"LV Report compilation","body":"3–5 business days"}
      ]},
      {"type":"callout","variant":"info","title":"Overlap recruitment to protect the schedule","body":"Cognitive debriefing recruitment is the most common cause of slippage. Start it during the back translation phase so participants are ready when interviews begin."}
    ]$jb$, $md$## Sizing an LV project

A typical single-language LV project runs 4–8 weeks. Milestones and typical durations:

- Translator briefing and NDA execution: 2–3 days
- Forward translation (T1 and T2, parallel): 5–10 business days
- Reconciliation: 3–5 business days
- Back translation: 3–5 business days
- Back translation review: 2–3 business days
- Cognitive debriefing recruitment: 5–10 business days (often overlaps)
- Cognitive debriefing interviews: 5–7 business days
- Finalization and QA: 3–5 business days
- LV Report compilation: 3–5 business days

Start CD recruitment during back translation to protect the schedule.$md$),
    (3, 'risk-management-for-lv-projects', 'Risk Management for LV Projects', 8, $jb$[
      {"type":"prose","md":"## Log and track every risk\n\nUse the **LV Risk Register (QMS-RISK-LV-001)** to log and track risks across the project. The risks below are specific to LV work — each has a likelihood, an impact, and a defined mitigation you should put in place up front."},
      {"type":"steps","title":"Common LV-specific risks and mitigations","steps":[
        {"title":"Translator unavailability mid-project (Medium likelihood / High impact)","body":"Pre-qualify backup translators before the project starts."},
        {"title":"Cognitive debriefing recruitment delays (High / Medium)","body":"Begin recruitment during the back translation phase."},
        {"title":"Client changes instrument version mid-project (Low / Critical)","body":"Require a written change order; assess the impact on completed work before proceeding."},
        {"title":"Back translator accidentally accesses the source (Low / High)","body":"Use separate file delivery and confirm blinding in writing."},
        {"title":"Linguist NDA not executed before materials sent (Low / Critical)","body":"The file-sharing platform must block access until the NDA is confirmed."}
      ]},
      {"type":"callout","variant":"warning","title":"Critical-impact risks need controls before kickoff","body":"A mid-project version change or a missing NDA can invalidate completed work or breach confidentiality. Put the mitigation in place at setup, not after the risk materialises."}
    ]$jb$, $md$## Log and track every risk

Use the LV Risk Register (QMS-RISK-LV-001). Common LV-specific risks and mitigations:

- Translator unavailability mid-project (Medium/High): pre-qualify backup translators before start.
- CD recruitment delays (High/Medium): begin recruitment during back translation.
- Client changes instrument version mid-project (Low/Critical): require a written change order; assess impact.
- Back translator accesses the source (Low/High): separate file delivery; confirm blinding in writing.
- Linguist NDA not executed before materials sent (Low/Critical): platform blocks access until NDA confirmed.$md$),
    (4, 'document-filing-requirements', 'Document Filing Requirements', 9, $jb$[
      {"type":"prose","md":"## The audit-ready project file\n\nAt project close, the project folder must contain the complete record below. If it isn't filed, the work cannot be proven — and unproven work is an audit finding."},
      {"type":"steps","title":"Required in the project folder at close","steps":[
        {"title":"Signed client NDA","body":"Executed before any materials were shared."},
        {"title":"Signed linguist NDAs","body":"For every linguist on the project."},
        {"title":"Linguist CVs","body":"On file in the master database and linked to the project."},
        {"title":"Project brief","body":"With distribution confirmation from translators."},
        {"title":"T1 and T2 translations","body":"Final versions of both independent forward translations."},
        {"title":"Completed Reconciliation Log + reconciled version","body":"Every decision documented with rationale."},
        {"title":"Back translation + comparison matrix","body":"Back translation plus the source-vs-back-translation discrepancy matrix."},
        {"title":"Cognitive debriefing records","body":"Consent forms, data capture forms, and the summary report."},
        {"title":"Final translated instrument","body":"All versions, with revision history."},
        {"title":"QA sign-off record","body":"Evidence of the quality sign-off."},
        {"title":"Linguistic Validation Report","body":"The client-deliverable LV report."},
        {"title":"Project closure sign-off","body":"Formal close of the project."}
      ]},
      {"type":"callout","variant":"rule","title":"Retention: minimum 15 years","body":"Retain the full project file for a minimum of 15 years, or per the client/sponsor contract, whichever is longer."}
    ]$jb$, $md$## The audit-ready project file

At close the project folder must contain: signed client NDA; signed linguist NDAs (all); linguist CVs (in master DB, linked); project brief + distribution confirmation; T1 and T2 (final); completed Reconciliation Log + reconciled version; back translation + comparison matrix; CD consent forms, data capture forms, and summary report; final instrument (all versions with revision history); QA sign-off; Linguistic Validation Report; project closure sign-off.

**Retention: minimum 15 years**, or per client/sponsor contract, whichever is longer.$md$),
    (5, 'handling-mid-project-change', 'Handling a Mid-Project Change', 5, $jb$[
      {"type":"prose","md":"## When the client changes the instrument\n\nA change to the source instrument after work has begun is never absorbed silently. It is a controlled change-order event with a defined procedure, because affected LV steps may have to be repeated."},
      {"type":"steps","title":"Procedure for a mid-project change request","steps":[
        {"title":"Issue a written Change Order","body":"Send a Change Order request to the client for approval. Do not proceed until it is signed."},
        {"title":"Assess affected steps","body":"Determine which completed LV steps the change touches."},
        {"title":"Repeat affected steps","body":"Any LV step affected by the change must be redone — not patched."},
        {"title":"Document the change and its impact","body":"Record the change and its effect on completed work in the project file."}
      ]},
      {"type":"example","title":"Check your understanding","intro":"Test yourself before moving on.","items":[
        {"label":"Question","text":"A client requests an urgent change to the source instrument after back translation is already complete. What is the correct procedure?"},
        {"label":"Answer","text":"Issue a written Change Order request to the client for approval; do not proceed until it is signed. Assess which completed LV steps are affected — affected steps must be repeated. Document the change and its impact in the project file.","tone":"info"}
      ]}
    ]$jb$, $md$## When the client changes the instrument

A mid-project change is a controlled change-order event:

1. Issue a written Change Order to the client; do not proceed until signed.
2. Assess which completed LV steps are affected.
3. Repeat any affected step — do not patch.
4. Document the change and its impact in the project file.

**Check:** Urgent change after back translation? Written Change Order (signed first), assess + repeat affected steps, document.$md$)
  ) AS v(oi, slug, title, mins, blocks, bmd)
  RETURNING training_id
)
-- TG-PM-001 has a single short-answer Knowledge Check (change-order procedure); no
-- multiple-choice / true-false questions exist to seed into cvp_training_quiz_questions.
SELECT 1 FROM lessons;
