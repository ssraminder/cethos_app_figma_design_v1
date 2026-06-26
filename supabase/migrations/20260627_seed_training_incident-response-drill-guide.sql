-- TG-IS-004 — Incident Response Drill Guide (Operations / PM; audience=staff)
-- Seeds cvp_trainings + cvp_training_lessons (content_blocks) + cvp_training_quiz_questions
-- Applied to prod 2026-06-26 (project lmzoyezvsjgsxveoakdr). Idempotent re-run: delete by slug first.
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'incident-response-drill-guide',
    'Incident Response Drill Guide',
    'staff',
    'security',
    'TG-IS-004 · Annual incident-response drill for Operations and PM staff: classify a security incident by severity (P1–P4), work a realistic drill scenario, follow the correct notification chain, and document the event for ISO 27001 compliance.',
    true,
    false,
    '{"scope":"universal"}'::jsonb,
    80
  )
  RETURNING id
),
lessons AS (
  INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, estimated_minutes, content_blocks, body_markdown)
  SELECT t.id, v.oi, v.slug, v.title, v.mins, v.blocks::jsonb, v.body
  FROM t, (VALUES
    (1, 'incident-classification', 'Classifying an incident (P1–P4)', 8,
     'Classify every security incident by severity. P1 Critical = confirmed breach / client data exposed (2h internal, 24h client). P2 High = suspected breach, containment in progress (4h internal). P3 Medium = policy violation, no confirmed exposure (24h to log, CAPA within 5 days). P4 Low = near miss, no actual violation (log within 48h).',
     $jb$[
      {"type":"prose","md":"## Severity drives the clock\n\nThe first decision in any incident is **how severe it is** — because severity sets how fast you must notify and act. Cethos uses four levels, P1 (most urgent) through P4. When unsure between two levels, classify *up*: it is safer to over-respond than to under-respond."},
      {"type":"steps","title":"The four severity levels","steps":[
        {"title":"P1 — Critical","body":"Confirmed data breach; client data exposed. Examples: a file sent to the wrong party, a device with unencrypted data lost. Response: internal notification within 2 hours; client notification within 24 hours."},
        {"title":"P2 — High","body":"Suspected breach; containment in progress. Examples: a suspicious login, a phishing click where credentials were actually entered. Response: internal notification within 4 hours."},
        {"title":"P3 — Medium","body":"Security policy violation with no confirmed exposure. Examples: an unapproved platform used, a weak password discovered. Response: log within 24 hours; CAPA within 5 days."},
        {"title":"P4 — Low","body":"Near miss; no actual violation. Examples: a policy question, a suspicious email that was not clicked. Response: log within 48 hours."}
      ]},
      {"type":"callout","variant":"rule","title":"When in doubt, escalate up","body":"If an incident sits between two severity levels, treat it as the more severe one until you have evidence to downgrade. A confirmed exposure of client data is always P1."},
      {"type":"example","title":"Check your understanding","intro":"Classify this incident.","items":[
        {"label":"Question","text":"A linguist clicked a phishing link and entered their portal credentials on the fake page. No data access has been confirmed yet. What severity is this?"},
        {"label":"Answer","text":"P2 — High. Credentials were actually entered, so a breach is suspected and containment (password reset, session revocation) is in progress, but exposure is not yet confirmed. Internal notification within 4 hours.","tone":"info"}
      ]}
    ]$jb$),
    (2, 'drill-scenario', 'The drill scenario', 9,
     'Drill scenario: the file-sharing platform alerts that a project folder holding a back translation was accessed from an unexpected geography at 2:00 AM, when no linguist should have been working. Work through five questions: severity and why, who to notify and when, immediate containment, what and where to document, and whether client notification is required.',
     $jb$[
      {"type":"prose","md":"## Work the scenario as if it were real\n\nDrills build the muscle memory you need when a real incident hits. Read the scenario, then work through each question before discussing it with the team.\n\n**Scenario:** A Project Manager receives an automated alert from the file-sharing platform that a project folder containing a back translation was accessed by an IP address in an unexpected geography at 2:00 AM. No linguist should have been working at that time."},
      {"type":"steps","title":"The five drill questions","steps":[
        {"title":"1. What severity, and why?","body":"Decide P1–P4 and state your reasoning based on what is confirmed vs. suspected."},
        {"title":"2. Who do you notify first, and within what timeframe?","body":"Identify the first person in the notification chain and the deadline that severity imposes."},
        {"title":"3. What immediate containment actions do you take?","body":"E.g. revoke access to the folder, force-reset affected credentials, preserve the platform's access logs."},
        {"title":"4. What do you document, and in which system?","body":"Capture the facts and record them in the correct register."},
        {"title":"5. Does this require client notification? If so, what do you tell them?","body":"Decide whether the contract / severity triggers client notice, and what factual information to share."}
      ]},
      {"type":"example","title":"Check your understanding","intro":"A worked answer to drill question 1.","items":[
        {"label":"Question","text":"In the 2:00 AM unexpected-access scenario, what severity do you assign before the investigation is complete, and why?"},
        {"label":"Answer","text":"Treat it as a suspected breach with containment in progress — at minimum P2, and escalate to P1 the moment unauthorized access to client data is confirmed. Unexpected access to a folder holding client back-translation is exactly the kind of event you classify up, not down, until proven benign.","tone":"info"}
      ]},
      {"type":"callout","variant":"info","title":"Always debrief","body":"After the drill, discuss findings with the Director and update the Incident Response SOP wherever the exercise exposed a gap. The point of a drill is to improve the procedure, not just to pass it."}
    ]$jb$),
    (3, 'notification-chain', 'The notification chain', 6,
     'Notification chain, in order: discovering team member → Project Manager (immediately); PM → Director (within 2 hours for P1/P2); Director → Client (within 24 hours for P1, or per contract); Director → Legal counsel (for P1); then log in the ISO 27001 Incident Register. Never skip a link or go straight to the client.',
     $jb$[
      {"type":"prose","md":"## Follow the chain in order\n\nIncidents are escalated through a fixed chain so that the right people are informed at the right time and nothing is missed. Do not jump links — in particular, **client and legal contact always flows through the Director**, never directly from a team member."},
      {"type":"steps","title":"Escalation order","steps":[
        {"title":"Discovering team member → Project Manager","body":"Immediately, the moment you discover or suspect an incident."},
        {"title":"Project Manager → Director","body":"Within 2 hours for P1 / P2 incidents."},
        {"title":"Director → Client","body":"Within 24 hours for P1, or per the contract terms for that client."},
        {"title":"Director → Legal counsel","body":"For P1 incidents."},
        {"title":"Log in the ISO 27001 Incident Register","body":"Record the incident so it becomes part of the auditable trail and feeds CAPA."}
      ]},
      {"type":"comparison","title":"Notification do and don't","columns":[
        {"label":"Do","tone":"good","items":["Tell your PM the instant you suspect an incident","Let the Director own client and legal contact","Meet the timeframe your severity sets","Log it in the ISO 27001 Incident Register"]},
        {"label":"Don't","tone":"bad","items":["Contact the client directly yourself","Wait to be \"sure\" before telling your PM","Skip the Director and improvise","Handle it alone and document nothing"]}
      ]},
      {"type":"example","title":"Check your understanding","intro":"A quick true/false.","items":[
        {"label":"Question","text":"True or False — If you discover a P1 incident, you should notify the client directly and immediately to save time."},
        {"label":"Answer","text":"False. Client notification flows through the Director (within 24 hours for P1, or per contract). You notify your PM immediately; the PM notifies the Director; the Director notifies the client and legal.","tone":"info"}
      ]}
    ]$jb$),
    (4, 'document-and-improve', 'Documenting the incident and improving', 7,
     'Document every incident for ISO 27001: log it in the Incident Register with the facts, severity, timeline, containment actions, and notifications made. Real-world example: a file emailed to the wrong linguist on a Friday afternoon, not yet confirmed received, is P1 — notify PM and Director, attempt recall, request and confirm deletion in writing, log it, and assess client notification.',
     $jb$[
      {"type":"prose","md":"## If it isn't logged, it didn't happen\n\nDocumentation is what turns an incident into evidence of a controlled response — exactly what an ISO 27001 auditor looks for. Record the facts without blame: what happened, when, the severity, the containment actions taken, who was notified and when, and the final resolution."},
      {"type":"steps","title":"What to capture in the Incident Register","steps":[
        {"title":"What and when","body":"A factual description of the event and the times it was discovered, contained, and resolved."},
        {"title":"Severity and rationale","body":"The P-level assigned and why, including any escalation or downgrade."},
        {"title":"Containment and corrective actions","body":"What you did to contain it, and the CAPA opened to prevent recurrence."},
        {"title":"Notifications made","body":"Who was notified (PM, Director, client, legal) and at what time, against the required deadlines."}
      ]},
      {"type":"example","title":"Worked example: wrong-recipient email","intro":"A project file was accidentally emailed to the wrong linguist at 4:00 PM on a Friday. The other linguist has not yet confirmed receipt.","items":[
        {"label":"Severity","text":"P1 — client data was sent to an unintended party.","note":"Confirmed exposure of client material, even internally to another linguist, is a breach.","tone":"info"},
        {"label":"First action","text":"Immediately notify your PM and the Director.","note":"Do not try to handle it alone.","tone":"info"},
        {"label":"Containment","text":"Attempt to recall the email if the platform supports it; request the recipient delete it and confirm deletion in writing.","note":"Capture the written confirmation as evidence.","tone":"info"},
        {"label":"Record & assess","text":"Log the incident in the ISO 27001 Incident Register and assess whether client notification is required.","note":"P1 client notification is within 24 hours or per contract.","tone":"info"}
      ]},
      {"type":"callout","variant":"rule","title":"Report immediately — never alone","body":"Report a suspected or confirmed incident to your PM and Director straight away. Do not attempt to handle, hide, or quietly fix an incident on your own."},
      {"type":"example","title":"Check your understanding","intro":"One short answer.","items":[
        {"label":"Question","text":"Why must every incident — even one fully resolved within the hour — be logged in the ISO 27001 Incident Register?"},
        {"label":"Answer","text":"Because the log is the auditable evidence that the incident was classified, contained, escalated, and closed correctly, and it feeds CAPA and trend analysis. Under ISO 27001, an unlogged incident effectively didn't happen.","tone":"info"}
      ]}
    ]$jb$)
  ) AS v(oi, slug, title, mins, body, blocks)
  RETURNING training_id
)
INSERT INTO cvp_training_quiz_questions (training_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, display_order, active)
SELECT (SELECT id FROM t), q.question, q.a, q.b, q.c, q.d, q.correct, q.explanation, q.ord, true
FROM (VALUES
  (
    'A device containing unencrypted client data is lost. What severity level applies?',
    'P1 — Critical',
    'P2 — High',
    'P3 — Medium',
    'P4 — Low',
    'A',
    'A lost device with unencrypted client data is a confirmed exposure of client data — P1 Critical. Internal notification within 2 hours and client notification within 24 hours.',
    1
  ),
  (
    'In the Cethos notification chain, who notifies the client about a P1 incident?',
    'The team member who discovered the incident',
    'The Project Manager, directly',
    'The Director (within 24 hours for P1, or per contract)',
    'Whoever is fastest, to save time',
    'C',
    'Client contact always flows through the Director — within 24 hours for P1 or per contract terms. The discoverer tells the PM immediately; the PM tells the Director; the Director tells the client and legal.',
    2
  ),
  (
    'True or False — If an incident sits between two severity levels and you are unsure, you should classify it as the more severe level until evidence lets you downgrade.',
    'True',
    'False',
    NULL,
    NULL,
    'A',
    'True. Escalate up when in doubt — over-responding is safer than under-responding, and a confirmed exposure of client data is always P1.',
    3
  ),
  (
    'A project file is accidentally emailed to the wrong linguist and they have not yet confirmed receipt. What is your first action?',
    'Wait to see whether they notice before doing anything',
    'Quietly send a corrected email and move on',
    'Immediately notify your PM and Director, then attempt recall and request written deletion',
    'Ask the recipient to keep it confidential and take no further steps',
    'C',
    'This is P1. Notify your PM and Director immediately, attempt to recall the email, request the recipient delete it and confirm in writing, log the incident, and assess whether client notification is required. Never handle it alone.',
    4
  ),
  (
    'True or False — A security incident that is fully resolved within an hour does not need to be logged in the ISO 27001 Incident Register.',
    'True',
    'False',
    NULL,
    NULL,
    'B',
    'False. Every incident must be logged regardless of how quickly it is resolved — the register is the auditable evidence of a controlled response and feeds CAPA. If it isn''t logged, it didn''t happen.',
    5
  )
) AS q(question, a, b, c, d, correct, explanation, ord);
