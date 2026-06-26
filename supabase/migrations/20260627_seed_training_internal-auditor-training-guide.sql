-- Seed interactive training TG-QM-003 — Internal Auditor Training Guide (staff / designated internal auditor)
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'internal-auditor-training-guide',
    'Internal Auditor Training Guide',
    'staff',
    'audit',
    'TG-QM-003 · Plan and run an ISO 17100 / ISO 27001 internal audit, work the Cethos audit checklists, classify findings as Major NC, Minor NC, or Observation, and write the audit report and track corrective actions to closure.',
    true, false, '{"scope":"universal"}'::jsonb, 80
  )
  RETURNING id
),
lessons AS (
  INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, estimated_minutes, body_markdown, content_blocks)
  SELECT t.id, v.oi, v.slug, v.title, v.mins, v.body_md, v.blocks::jsonb
  FROM t, (VALUES
    (1, 'audit-planning', 'Audit Planning', 8,
      'Before the audit, define the scope, the audit criteria (standard requirements plus internal SOPs), and the schedule — notifying auditees at least 5 business days in advance — and pull the Master Document Register, last NC Log, and last audit report for document review. The internal auditor must never audit their own work or their own projects.',
      $jb$[
      {"type":"prose","md":"## Set up the audit before you start\n\nA defensible internal audit is planned, not improvised. Before you walk into the first interview, four things must be fixed and a hard independence rule must be satisfied."},
      {"type":"steps","title":"Prepare before the audit","steps":[
        {"title":"Define the audit scope","body":"Which processes, departments, or projects will be audited?"},
        {"title":"Define the audit criteria","body":"Which standard requirements (ISO 17100 / ISO 27001) and which internal SOPs apply?"},
        {"title":"Set and communicate the schedule","body":"Notify auditees at least 5 business days in advance."},
        {"title":"Do the document review","body":"Pull the Master Document Register, the last NC Log, and the last audit report."}
      ]},
      {"type":"callout","variant":"rule","title":"Auditor independence","body":"The internal auditor must not audit their own work or their own projects. Independence is what makes the finding credible — if you owned the work, you cannot audit it."},
      {"type":"example","title":"Check your understanding","intro":"Test yourself before moving on.","items":[
        {"label":"Question","text":"You are the designated internal auditor, and one of the projects in scope is a project you personally managed. Can you audit it?"},
        {"label":"Answer","text":"No. The internal auditor must not audit their own work or their own projects. That project must be assigned to a different, independent auditor.","tone":"info"}
      ]}
    ]$jb$),
    (2, 'iso-17100-checklist-personnel-process', 'ISO 17100 Checklist — Personnel & Process', 10,
      'For each LV project sampled, check the personnel and process evidence. Personnel: translator and reviser CVs on file meeting qualification criteria, the reviser confirmed as a different person from the translator, and NDAs executed and dated before materials were shared. Process: evidence of independent T1 and T2 forward translations, a completed Reconciliation Log with rationale, a back translation with confirmation of blinding, the comparison matrix, the cognitive debriefing report if in scope, a revision record before delivery, QA sign-off, and the LV Report delivered to the client.',
      $jb$[
      {"type":"prose","md":"## Sampling a project for ISO 17100\n\nFor each LV project you sample, verify the **personnel** and **process** evidence is on file. Treat every box below as a question: where is the evidence, and is it dated correctly?"},
      {"type":"steps","title":"Personnel checks","steps":[
        {"title":"Translator CVs on file","body":"Present and meeting the qualification criteria."},
        {"title":"Reviser is a different person","body":"Confirmed as a different person from the translator."},
        {"title":"Reviser CV on file","body":"Competence record present for the reviser too."},
        {"title":"NDA executed before materials shared","body":"Executed and dated before any materials were sent."}
      ]},
      {"type":"steps","title":"Process checks","steps":[
        {"title":"Independent T1 and T2","body":"Evidence of two independent forward translations."},
        {"title":"Completed Reconciliation Log","body":"With documented rationale for decisions."},
        {"title":"Back translation with blinding confirmed","body":"In file, with confirmation the back translator was blinded to the source."},
        {"title":"Back translation comparison matrix","body":"Completed source-vs-back-translation matrix."},
        {"title":"Cognitive debriefing report","body":"In file, if cognitive debriefing was in scope."},
        {"title":"Revision record before delivery","body":"Evidence of second-person revision performed before the deliverable went out."},
        {"title":"QA sign-off","body":"On file."},
        {"title":"LV Report delivered","body":"The client-deliverable LV Report was delivered to the client."}
      ]},
      {"type":"callout","variant":"warning","title":"The revision record is the high-risk check","body":"A missing second-person revision record is the single most frequently cited ISO 17100 finding. If you cannot see evidence the revision happened before delivery, it is a finding — not a benefit of the doubt."}
    ]$jb$),
    (3, 'iso-17100-checklist-qms', 'ISO 17100 Checklist — QMS', 6,
      'Beyond the project file, check the QMS itself: all documents are on their current version per the Master Document Register, the NC Log has been reviewed and every nonconformance has a CAPA with a closure date, and training records are on file for all active linguists and PMs.',
      $jb$[
      {"type":"prose","md":"## Auditing the QMS itself\n\nProject sampling is only part of the audit. The QMS as a system must also hold up: current versions, closed-out nonconformances, and training records."},
      {"type":"steps","title":"QMS checks","steps":[
        {"title":"Documents on current version","body":"Every document in use is the current version — check against the Master Document Register."},
        {"title":"NC Log reviewed","body":"All nonconformances have CAPAs with closure dates."},
        {"title":"Training records on file","body":"On file for all active linguists and PMs."}
      ]},
      {"type":"callout","variant":"info","title":"Open CAPAs without closure dates are a finding","body":"A nonconformance that has been logged but has no CAPA, or a CAPA with no closure date, is itself an audit finding — the loop is not closed."}
    ]$jb$),
    (4, 'iso-27001-checklist', 'ISO 27001 Checklist', 7,
      'The ISO 27001 information-security checks: the Statement of Applicability is current and approved, the information asset register is updated, contractor security onboarding records are on file, access revocation records exist for departed contractors, the incident log has been reviewed, the secure file-transfer policy is being followed with no unapproved platforms, and security awareness training records are on file for all staff and contractors.',
      $jb$[
      {"type":"prose","md":"## The information-security side of the audit\n\nCethos is audited against ISO 27001 as well. Work this checklist for the security management system and its records."},
      {"type":"steps","title":"ISO 27001 checks","steps":[
        {"title":"Statement of Applicability (SoA)","body":"Current and approved."},
        {"title":"Information asset register","body":"Updated."},
        {"title":"Contractor security onboarding records","body":"On file."},
        {"title":"Access revocation records","body":"Present for departed contractors."},
        {"title":"Incident log","body":"Reviewed."},
        {"title":"Secure file transfer policy followed","body":"No unapproved platforms in use."},
        {"title":"Security awareness training records","body":"On file for all staff and contractors."}
      ]},
      {"type":"callout","variant":"warning","title":"Access revocation is easy to miss","body":"Departed contractors who still have access — or no recorded revocation — are a common and high-risk ISO 27001 finding. Verify revocation actually happened, not just that offboarding was intended."}
    ]$jb$),
    (5, 'finding-classification', 'Finding Classification', 9,
      'Classify every finding as one of three levels. A Major Nonconformance is a systematic failure to meet a standard requirement that puts certification at risk — CAPA required within 30 days plus a re-audit of the affected area. A Minor Nonconformance is an isolated failure to meet a requirement — CAPA required within 60 days. An Observation is not yet a nonconformance but a risk of future failure — a recommendation for improvement with no formal CAPA required.',
      $jb$[
      {"type":"prose","md":"## Three levels — and the action each one triggers\n\nEvery finding is classified, and the classification drives the required corrective-action response and timeline. Getting the level right is the core auditor judgement call."},
      {"type":"steps","title":"The three finding classifications","steps":[
        {"title":"Major Nonconformance","body":"A systematic failure to meet a standard requirement that puts certification at risk. Required action: CAPA within 30 days, plus a re-audit of the affected area."},
        {"title":"Minor Nonconformance","body":"An isolated failure to meet a requirement. Required action: CAPA within 60 days."},
        {"title":"Observation","body":"Not yet a nonconformance, but a risk of future failure. Required action: a recommendation for improvement; no formal CAPA required."}
      ]},
      {"type":"comparison","title":"Major vs Minor nonconformance","columns":[
        {"tone":"bad","label":"Major NC","items":[
          "Systematic failure to meet a requirement",
          "Puts certification at risk",
          "CAPA required within 30 days",
          "Re-audit of the affected area"
        ]},
        {"tone":"good","label":"Minor NC","items":[
          "Isolated, one-off failure to meet a requirement",
          "Does not by itself threaten certification",
          "CAPA required within 60 days",
          "No automatic re-audit"
        ]}
      ]},
      {"type":"example","title":"Check your understanding","intro":"Test yourself before moving on.","items":[
        {"label":"Question","text":"You find that revision was skipped on one project, but the process is sound everywhere else. How do you classify it, and what action is required?"},
        {"label":"Answer","text":"An isolated failure to meet a requirement is a Minor Nonconformance, which requires a CAPA within 60 days. If the same failure recurred across many projects it would instead be a Major Nonconformance (systematic, certification at risk) requiring a CAPA within 30 days and a re-audit.","tone":"info"}
      ]},
      {"type":"example","title":"Check your understanding","intro":"One more.","items":[
        {"label":"Question","text":"You spot a practice that is compliant today but is likely to cause a failure soon. Is that a nonconformance?"},
        {"label":"Answer","text":"No — it is an Observation. It is not yet a nonconformance; you record a recommendation for improvement, and no formal CAPA is required.","tone":"info"}
      ]}
    ]$jb$),
    (6, 'audit-report-and-closure', 'Audit Report & Closure', 7,
      'The audit report must include the scope and criteria, audit dates and auditee names, documents reviewed and projects sampled, a findings table (finding ID, classification, description, reference clause), strengths observed, an overall audit conclusion, and the auditor signature and date. Distribute it to the Director, the QMS Owner, and the auditees, and file it in the QMS archive.',
      $jb$[
      {"type":"prose","md":"## Writing it up and closing the loop\n\nThe audit only counts once it is written up, distributed, and filed. The report is the controlled record of what was audited and what was found."},
      {"type":"steps","title":"Audit report structure","steps":[
        {"title":"Audit scope and criteria","body":"What was audited and against which requirements/SOPs."},
        {"title":"Audit dates and auditee names","body":"When the audit ran and who took part."},
        {"title":"Documents reviewed and projects sampled","body":"The evidence base for the audit."},
        {"title":"Findings table","body":"Finding ID, classification, description, and reference clause for each finding."},
        {"title":"Strengths observed","body":"What is working well, not only what failed."},
        {"title":"Overall audit conclusion","body":"The auditor''s summary judgement."},
        {"title":"Auditor signature and date","body":"Signed and dated by the auditor."}
      ]},
      {"type":"callout","variant":"rule","title":"Distribute and file","body":"Distribute the report to the Director, the QMS Owner, and the auditees. File it in the QMS archive. An audit that is not distributed and archived is not complete."}
    ]$jb$)
  ) AS v(oi, slug, title, mins, body_md, blocks)
  RETURNING training_id
)
INSERT INTO cvp_training_quiz_questions (training_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, display_order, active)
SELECT (SELECT id FROM t), q.question, q.a, q.b, q.c, q.d, q.correct, q.explanation, q.ord, true
FROM (VALUES
  ('Can the designated internal auditor audit a project they personally managed?',
   'Yes, if no one else is available', 'No — they must not audit their own work or projects', 'Yes, if the Director approves', 'Only for ISO 27001 items',
   'b', 'Auditor independence is mandatory: the internal auditor must not audit their own work or their own projects. The work must be assigned to a different, independent auditor.', 1),
  ('A systematic failure to meet a standard requirement that puts certification at risk is classified as…',
   'an Observation', 'a Minor Nonconformance', 'a Major Nonconformance', 'a strength',
   'c', 'A Major Nonconformance is a systematic failure that puts certification at risk. It requires a CAPA within 30 days plus a re-audit of the affected area.', 2),
  ('What is the required CAPA timeframe for a Minor Nonconformance?',
   'Within 7 days', 'Within 30 days', 'Within 60 days', 'No CAPA is required',
   'c', 'A Minor Nonconformance is an isolated failure to meet a requirement and requires a CAPA within 60 days. (A Major NC requires a CAPA within 30 days.)', 3),
  ('True or False — An Observation requires a formal CAPA.',
   'True', 'False', NULL, NULL,
   'b', 'False. An Observation is not yet a nonconformance — it is a risk of future failure. It gets a recommendation for improvement and does not require a formal CAPA.', 4),
  ('During audit planning, how far in advance must auditees be notified of the audit?',
   'At least 1 business day', 'At least 5 business days', 'At least 30 calendar days', 'No advance notice is required',
   'b', 'The audit schedule must notify auditees at least 5 business days in advance.', 5)
) AS q(question, a, b, c, d, correct, explanation, ord);
