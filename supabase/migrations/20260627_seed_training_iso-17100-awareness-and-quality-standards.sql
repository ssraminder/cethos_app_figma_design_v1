-- Seed interactive training TG-QM-001 — ISO 17100 Awareness & Quality Standards (all staff)
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'iso-17100-awareness-and-quality-standards',
    'ISO 17100 Awareness & Quality Standards',
    'staff',
    'quality',
    'TG-QM-001 · What ISO 17100 requires of a translation service provider, the mandatory process steps that can never be skipped, how the Cethos QMS is structured, and where to find current SOPs and templates.',
    true, false, '{"scope":"universal"}'::jsonb, 80
  )
  RETURNING id
),
lessons AS (
  INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, estimated_minutes, body_markdown, content_blocks)
  SELECT t.id, v.oi, v.slug, v.title, v.mins, v.body_md, v.blocks::jsonb
  FROM t, (VALUES
    (1, 'what-iso-17100-requires', 'What ISO 17100 Requires', 9,
      'ISO 17100 is the international standard for translation service quality. It sets requirements across four areas: personnel competence, a mandatory process (translation then a second-person revision), a documented quality management system, and contractor competence records on file for everyone used on a project.',
      $jb$[
      {"type":"prose","md":"## The standard for translation service quality\n\n**ISO 17100** is the international standard that defines what a translation service provider must do to deliver quality. It is the framework regulators and clinical clients expect us to meet. It sets requirements in four areas: **personnel, process, quality management, and competence records.**"},
      {"type":"steps","title":"What the standard requires","steps":[
        {"title":"Personnel","body":"Translators, revisers, and reviewers must meet defined competency criteria. Native-language proficiency in the target language is mandatory for translators. The reviser must be a different person from the translator."},
        {"title":"Process","body":"A minimum workflow of: 1) Translation, 2) Revision — a mandatory second-person review, the most frequently cited audit finding when missing, 3) Review if the client specifies it, 4) Final verification."},
        {"title":"Quality management","body":"A documented QMS must be maintained, with procedures for managing nonconformances, customer feedback, and continual improvement."},
        {"title":"Contractor competence records","body":"CVs and qualifications must be on file for every translator and reviser used on a project. This is a documentary requirement — qualification cannot be assumed."}
      ]},
      {"type":"callout","variant":"rule","title":"Revision is a different person — never self-revision","body":"Under ISO 17100 the reviser must be a second qualified person, distinct from the translator. A translator revising their own work does not satisfy the requirement."}
    ]$jb$),
    (2, 'the-non-negotiables', 'The Non-Negotiables', 7,
      'Three steps can never be skipped or waived under ISO 17100, no matter the client pressure, timeline, or budget: revision by a second qualified person before any deliverable goes out, competence records on file for every translator and reviser, and a documented process — if it is not written down, it did not happen.',
      $jb$[
      {"type":"prose","md":"## Three things that can never be waived\n\nThese steps **cannot be skipped or waived** under ISO 17100 — regardless of client pressure, timeline, or budget. They are the hard floor of every project."},
      {"type":"comparison","title":"Always vs never","columns":[
        {"tone":"good","label":"Always","items":[
          "Revision by a second qualified person before any deliverable is sent to a client",
          "Competence records (CV + qualifications) on file for every translator and reviser used",
          "A documented process — if it isn''t written down, it didn''t happen"
        ]},
        {"tone":"bad","label":"Never","items":[
          "Let a translator revise their own work to satisfy the revision step",
          "Use a linguist with no competence record on file",
          "Rely on undocumented work — unrecorded steps cannot be proven at audit"
        ]}
      ]},
      {"type":"callout","variant":"rule","title":"If it isn''t written down, it didn''t happen","body":"Audit evidence is documentary. A step you performed but did not record is, for audit purposes, a step that did not occur. Document as you go."}
    ]$jb$),
    (3, 'our-qms-at-cethos', 'Our QMS at Cethos', 8,
      'The Cethos QMS is made up of the Training Guide library, the SOP library, document templates, the Master Document Register, the Nonconformance Log, the Risk Register, and the annual Internal Audit Reports. Everything is version-controlled — always use the current version and check the Master Document Register if unsure.',
      $jb$[
      {"type":"prose","md":"## How the Cethos QMS fits together\n\nOur Quality Management System is the set of controlled documents that make our compliance provable. Know what the parts are and where to find the current version of each."},
      {"type":"steps","title":"The Cethos QMS consists of","steps":[
        {"title":"Training Guide library (TG series)","body":"This library of role-based training guides, including this one."},
        {"title":"SOP library","body":"The SOP-LV, SOP-QM, SOP-IS, and SOP-PM series of standard operating procedures."},
        {"title":"Document templates","body":"Stored in the approved QMS folder."},
        {"title":"Master Document Register (QMS-REG-001)","body":"The index of every controlled document and its current version."},
        {"title":"Nonconformance Log (QMS-NC-LOG)","body":"Where quality nonconformances are recorded and tracked."},
        {"title":"Risk Register (QMS-RISK-LV-001)","body":"Where project and process risks are logged."},
        {"title":"Annual Internal Audit Reports","body":"The record of internal audits and their findings."}
      ]},
      {"type":"callout","variant":"info","title":"Always use the current version","body":"All QMS documents are version-controlled. If you are unsure whether you have the latest version, check the Master Document Register before you rely on a document."},
      {"type":"example","title":"Check your understanding","intro":"Test yourself before finishing.","items":[
        {"label":"Question","text":"Under ISO 17100, can a translator revise their own work to satisfy the revision requirement?"},
        {"label":"Answer","text":"No. Revision must be performed by a second, qualified person. Self-revision does not satisfy the ISO 17100 requirement.","tone":"info"}
      ]}
    ]$jb$)
  ) AS v(oi, slug, title, mins, body_md, blocks)
  RETURNING training_id
)
-- TG-QM-001 has a single short-answer Knowledge Check (self-revision); per the mapping
-- rules short-answer checks are not seeded as quiz questions, so none are inserted.
SELECT 1 FROM lessons;
