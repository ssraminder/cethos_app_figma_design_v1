-- Seed interactive training TG-PM-002 — Client Communication Standards for Clinical LV Clients (staff)
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'client-communication-standards-for-clinical-lv-clients',
    'Client Communication Standards for Clinical LV Clients',
    'staff',
    'project-management',
    'TG-PM-002 · Communication standards for clinical and pharmaceutical LV clients — formal records, approved methodology terminology, escalation triggers, and protecting confidential information.',
    true, false, '{"scope":"universal"}'::jsonb, 80
  )
  RETURNING id
),
lessons AS (
  INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, estimated_minutes, content_blocks, body_markdown)
  SELECT t.id, v.oi, v.slug, v.title, v.mins, v.blocks::jsonb, v.bmd
  FROM t, (VALUES
    (1, 'communication-standards', 'Communication Standards', 7, $jb$[
      {"type":"prose","md":"## How we communicate with clinical clients\n\nClinical and pharmaceutical sponsors (e.g. IQVIA) hold us to a regulatory standard of record-keeping. Every project decision must be traceable in writing, and confidential information about our linguists must never leave Cethos."},
      {"type":"comparison","title":"Communicating with clinical LV clients","columns":[
        {"label":"Do","tone":"good","items":[
          "Use formal written communication for all project decisions",
          "Confirm every verbal discussion in writing within 24 hours",
          "Reference instrument versions precisely — name + version number + date",
          "Route all deliverables through a formal stage-gate approval"
        ]},
        {"label":"Don't","tone":"bad","items":[
          "Share linguist names, contact information, or compensation details with clients",
          "Provide partial deliverables without formal stage-gate approval from the client",
          "Rely on a verbal agreement without written confirmation",
          "Refer to an instrument without its exact version and date"
        ]}
      ]},
      {"type":"callout","variant":"rule","title":"Confirm verbal in writing within 24 hours","body":"Any decision discussed on a call is not a record until it is confirmed in writing. Send the written confirmation within 24 hours, every time."},
      {"type":"example","title":"Check your understanding","intro":"Test yourself before moving on.","items":[
        {"label":"Question","text":"A sponsor asks for the name and email of the translator working on their French instrument so they can contact them directly. What do you do?"},
        {"label":"Answer","text":"Do not share the linguist's name, contact information, or compensation details. All client–linguist communication is routed through Cethos. A request for an individual translator's identity is also an escalation trigger to the Director.","tone":"info"}
      ]}
    ]$jb$, $md$## How we communicate with clinical clients

Do: use formal written communication for all project decisions; confirm verbal discussions in writing within 24 hours; reference instrument versions precisely (name + version + date); route deliverables through formal stage-gate approval.

Don't: share linguist names, contact info, or compensation with clients; provide partial deliverables without stage-gate approval; rely on verbal agreements; refer to an instrument without its exact version and date.

**Rule:** Confirm any verbal discussion in writing within 24 hours.

**Check:** A sponsor wants a translator's direct contact — refuse, route through Cethos, and escalate the request to the Director.$md$),
    (2, 'approved-terminology', 'Approved Terminology', 6, $jb$[
      {"type":"prose","md":"## Use the methodology's terms, consistently\n\nClinical clients and regulators expect precise LV terminology. Using the wrong term can imply a different (or weaker) methodology than the one we follow. Use the approved term on the left, never the informal one on the right."},
      {"type":"comparison","title":"Use this — not this","columns":[
        {"label":"Use this","tone":"good","items":[
          "Forward translation",
          "Reconciled version",
          "Back translation",
          "Cognitive debriefing",
          "Linguistic validation report",
          "Reviser"
        ]},
        {"label":"Not this","tone":"bad","items":[
          "First translation / Initial translation",
          "Combined version / Merged translation",
          "Reverse translation",
          "Patient testing / Focus group",
          "Translation report / LV summary",
          "Editor / Proofreader"
        ]}
      ]},
      {"type":"example","title":"Check your understanding","intro":"Test yourself before moving on.","items":[
        {"label":"Question","text":"In a status update you are about to describe the cognitive debriefing stage as a \"focus group.\" Is that acceptable terminology for a clinical client?"},
        {"label":"Answer","text":"No. \"Focus group\" (and \"patient testing\") implies a different methodology. Use the approved term \"cognitive debriefing.\"","tone":"info"}
      ]}
    ]$jb$, $md$## Use the methodology's terms, consistently

Use this — not this:

- Forward translation — not first/initial translation
- Reconciled version — not combined/merged translation
- Back translation — not reverse translation
- Cognitive debriefing — not patient testing / focus group
- Linguistic validation report — not translation report / LV summary
- Reviser — not editor / proofreader

**Check:** Don't call cognitive debriefing a "focus group" — it implies a different methodology.$md$),
    (3, 'escalation-and-confidentiality', 'Escalation Triggers & Confidentiality', 6, $jb$[
      {"type":"prose","md":"## Know when to escalate\n\nSome client requests are not yours to absorb or negotiate. The triggers below go to the **Director immediately** — they touch linguist confidentiality, the integrity of the LV process, or regulatory exposure."},
      {"type":"steps","title":"Escalate to the Director immediately if a client...","steps":[
        {"title":"Requests the identity of individual translators","body":"Linguist identities are confidential. Do not disclose; escalate."},
        {"title":"Asks to skip or modify any LV step","body":"The LV workflow is not negotiable on a per-request basis. Escalate before responding."},
        {"title":"Requests delivery of an unrevised translation","body":"Revision is a mandatory ISO 17100 step. Escalate any request to bypass it."},
        {"title":"Indicates regulatory submission without the full LV process","body":"If the client signals they may submit the instrument to a regulatory body without completing full LV, escalate immediately."},
        {"title":"Expresses dissatisfaction with translation quality in writing","body":"A written quality complaint is an escalation event — route it to the Director."}
      ]},
      {"type":"callout","variant":"rule","title":"Protect confidential information in every message","body":"Never put linguist names, contact details, or compensation into client-facing communications. When in doubt about disclosure, escalate before sending."},
      {"type":"example","title":"Check your understanding","intro":"Test yourself before moving on.","items":[
        {"label":"Question","text":"A client emails asking you to deliver the translation now, before the revision step, to save a day. How do you handle it?"},
        {"label":"Answer","text":"Do not deliver an unrevised translation. A request to skip revision is an escalation trigger — route it to the Director immediately. Revision by a second qualified person is a mandatory ISO 17100 step.","tone":"info"}
      ]}
    ]$jb$, $md$## Know when to escalate

Escalate to the Director immediately if a client: requests the identity of individual translators; asks to skip or modify any LV step; requests delivery of an unrevised translation; indicates the instrument may be submitted to a regulatory body without completing the full LV process; or expresses dissatisfaction with translation quality in writing.

**Confidentiality:** never put linguist names, contact details, or compensation into client-facing messages. When in doubt, escalate before sending.

**Check:** Asked to deliver before revision to save a day? Refuse and escalate — revision is a mandatory ISO 17100 step.$md$)
  ) AS v(oi, slug, title, mins, blocks, bmd)
  RETURNING training_id
)
INSERT INTO cvp_training_quiz_questions
  (training_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, display_order, active)
SELECT (SELECT id FROM t), q.question, q.a, q.b, q.c, q.d, q.correct, q.explanation, q.display_order, true
FROM t, (VALUES
  (
    'A clinical client asks for the name and direct contact details of the translator on their project. Sharing this with the client is acceptable.',
    'True', 'False', NULL, NULL, 'B',
    'Never share linguist names, contact information, or compensation details with clients. A request for an individual translator''s identity is also a trigger to escalate to the Director.',
    1
  ),
  (
    'A client asks Cethos to deliver an unrevised translation to save time. Because revision is a mandatory ISO 17100 step, this request must be escalated to the Director rather than fulfilled.',
    'True', 'False', NULL, NULL, 'A',
    'A request to skip or modify any LV step — including delivering an unrevised translation — is an escalation trigger. Escalate to the Director immediately.',
    2
  ),
  (
    'Which term should you use with a clinical client when referring to testing the translated instrument with a small sample of the target patient population?',
    'Focus group', 'Patient testing', 'Cognitive debriefing', 'User survey', 'C',
    'Use the approved methodology term "cognitive debriefing." "Focus group" and "patient testing" imply a different methodology.',
    3
  ),
  (
    'A project decision was agreed verbally on a call with the client. Within what timeframe must it be confirmed in writing?',
    'Within 24 hours', 'Within 5 business days', 'Only if the client requests it', 'At project close', 'A',
    'Confirm all verbal discussions in writing within 24 hours so every project decision is traceable.',
    4
  )
) AS q(question, a, b, c, d, correct, explanation, display_order);
