-- TG-IS-003 — ISO 27001 Security Awareness (all staff)
-- Seeds cvp_trainings + cvp_training_lessons (content_blocks) + cvp_training_quiz_questions
-- Applied to prod 2026-06-26 (project lmzoyezvsjgsxveoakdr). Idempotent re-run: delete by slug first.
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'iso-27001-security-awareness',
    'ISO 27001 Security Awareness',
    'staff',
    'security',
    'TG-IS-003 · Annual ISO 27001 security awareness for all staff: why information security protects Cethos and its clinical clients, how to spot phishing and social engineering, and the clean-desk, clear-screen, acceptable-use, and password rules everyone must follow.',
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
    (1, 'why-iso-27001-matters', 'Why ISO 27001 matters for Cethos', 7,
     'Cethos handles confidential clinical data and proprietary instruments. ISO 27001 is the framework for protecting it systematically, and clients require evidence of compliance to qualify Cethos as a vendor. A single breach could invalidate a trial, create legal liability, and cost us certification.',
     $jb$[
      {"type":"prose","md":"## Information security is a condition of doing business\n\nCethos handles confidential clinical data, proprietary instruments, and client business information. **ISO 27001** is the framework that lets us protect that information *systematically* rather than ad hoc. Our clients — especially pharmaceutical and clinical research organizations — require evidence of ISO 27001 compliance as a condition of qualifying us as a vendor.\n\nSecurity is not the IT team's job alone. The standard works only if every staff member applies it in daily habits."},
      {"type":"callout","variant":"warning","title":"What one breach can cost","body":"A single data breach or unauthorized disclosure could invalidate a clinical trial, expose Cethos to legal liability, damage client relationships irreparably, and cost us our vendor certification. The downside is existential — not an inconvenience."},
      {"type":"example","title":"Check your understanding","intro":"Test yourself before moving on.","items":[
        {"label":"Question","text":"Why do Cethos clients ask for evidence of ISO 27001 compliance?"},
        {"label":"Answer","text":"Pharmaceutical and clinical research clients require it as a condition of vendor qualification — without demonstrable compliance, Cethos cannot be approved to handle their confidential clinical data.","tone":"info"}
      ]}
    ]$jb$),
    (2, 'phishing-and-social-engineering', 'Phishing and social engineering', 8,
     'Most security incidents start with a phishing email or social-engineering call. Watch for urgency, look-alike sender domains, requests for credentials, and deceptive links. If in doubt, do not click — forward the email to the Director and delete it.',
     $jb$[
      {"type":"prose","md":"## Most incidents start with a person, not a server\n\nThe majority of security incidents at small and mid-sized companies begin with a **phishing email** or a **social-engineering phone call** — an attacker tricking a human into handing over access, rather than breaking a system."},
      {"type":"steps","title":"Signs of a phishing attempt","steps":[
        {"title":"Manufactured urgency","body":"Pressure to act now — e.g. \"Your account will be locked in 24 hours.\" Urgency is designed to stop you thinking."},
        {"title":"Look-alike sender domain","body":"A domain that resembles a real one but is not — e.g. @cethos-support.com instead of @cethos.com."},
        {"title":"Requests for credentials or access","body":"Asks for your login, password, MFA code, or file access. Legitimate IT will not ask for your password."},
        {"title":"Deceptive links","body":"Links that look similar to a real URL but differ by a character or two, or whose displayed text hides a different destination."}
      ]},
      {"type":"comparison","title":"When an email looks suspicious","columns":[
        {"label":"Do","tone":"good","items":["Stop and check the sender's full domain","Hover a link to see the real destination before clicking","Forward the suspicious email to the Director","Delete it after reporting"]},
        {"label":"Don't","tone":"bad","items":["Click the link \"just to see\"","Enter your password on the linked page","Reply with the requested information","Assume urgency means it is genuine"]}
      ]},
      {"type":"callout","variant":"rule","title":"If in doubt, do not click","body":"When an email is at all suspicious, do not click any link or open any attachment. Forward it to the Director and delete it. Reporting a false alarm is always acceptable; clicking a real phish is not."},
      {"type":"example","title":"Check your understanding","intro":"Apply the signs above.","items":[
        {"label":"Question","text":"An email marked URGENT, from @cethos-support.com, says your mailbox will be deleted in 24 hours unless you confirm your password via a link. What do you do?"},
        {"label":"Answer","text":"Treat it as phishing — it shows urgency, a look-alike domain (not @cethos.com), and a credential request. Do not click. Forward it to the Director and delete it.","tone":"info"}
      ]}
    ]$jb$),
    (3, 'clean-desk-clear-screen', 'Clean desk and clear screen', 6,
     'Lock your screen every time you step away (Win+L / Ctrl+Cmd+Q). Never leave printed project materials unattended; shred them before disposal. Do not use public Wi-Fi to access project materials without a VPN.',
     $jb$[
      {"type":"prose","md":"## Protect what is visible and physical\n\nMuch of what we protect electronically can be lost through an unlocked screen, a printout left on a desk, or an open network. The **clean-desk and clear-screen** rules close those gaps."},
      {"type":"steps","title":"The everyday rules","steps":[
        {"title":"Lock your screen when you step away","body":"Every time you leave your device — Windows: Win+L, Mac: Ctrl+Cmd+Q. Make it a reflex, not a decision."},
        {"title":"Never leave project materials out","body":"Do not leave printed project materials on your desk unattended."},
        {"title":"Destroy printed materials securely","body":"Shred or securely destroy any printed project materials before disposal — never bin them intact."},
        {"title":"No project work on open Wi-Fi","body":"Do not use public Wi-Fi to access project materials without a VPN."}
      ]},
      {"type":"example","title":"Check your understanding","intro":"A quick true/false.","items":[
        {"label":"Question","text":"True or False — Stepping away from your desk for two minutes is short enough that locking your screen is optional."},
        {"label":"Answer","text":"False. Lock your screen every time you step away, however briefly — most opportunistic access happens in those short windows.","tone":"info"}
      ]}
    ]$jb$),
    (4, 'password-and-acceptable-use', 'Password policy and acceptable use', 7,
     'Use a unique password of at least 12 characters for every platform, store them in a password manager, never share them, and change one immediately if you suspect compromise. Reuse turns a single breach into many.',
     $jb$[
      {"type":"prose","md":"## Strong, unique, never shared\n\nPasswords are the front door to every system. Cethos' policy keeps that door strong and ensures a compromise in one place cannot cascade to others."},
      {"type":"steps","title":"Password policy","steps":[
        {"title":"At least 12 characters","body":"Minimum 12 characters, mixing upper case, lower case, numbers, and symbols."},
        {"title":"Unique per platform","body":"A different password for every platform — never reuse passwords across systems."},
        {"title":"Use a password manager","body":"Let a password manager generate and store strong, unique passwords so you do not have to remember them."},
        {"title":"Never share","body":"Never share passwords with colleagues — not even temporarily, not even your manager."},
        {"title":"Change on suspicion","body":"Change a password immediately if you suspect it has been compromised."}
      ]},
      {"type":"comparison","title":"Acceptable use, at a glance","columns":[
        {"label":"Do","tone":"good","items":["Use a unique 12+ character password everywhere","Store credentials in a password manager","Change a password the moment you suspect compromise"]},
        {"label":"Don't","tone":"bad","items":["Reuse one password across platforms","Share a password with a colleague","Keep using a password you think may be exposed"]}
      ]},
      {"type":"example","title":"Check your understanding","intro":"One short answer.","items":[
        {"label":"Question","text":"Why does Cethos require a unique password for every platform instead of one strong password reused everywhere?"},
        {"label":"Answer","text":"So that a single compromised password cannot unlock multiple systems — reuse turns one breach into many. A password manager makes unique passwords practical.","tone":"info"}
      ]}
    ]$jb$)
  ) AS v(oi, slug, title, mins, body, blocks)
  RETURNING training_id
)
INSERT INTO cvp_training_quiz_questions (training_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, display_order, active)
SELECT (SELECT id FROM t), q.question, q.a, q.b, q.c, q.d, q.correct, q.explanation, q.ord, true
FROM (VALUES
  (
    'An email marked urgent, from @cethos-support.com, asks you to confirm your password via a link. What is the correct response?',
    'Click the link and enter your password to keep your account active',
    'Reply to the sender asking whether the request is genuine',
    'Do not click; forward the email to the Director and delete it',
    'Forward the email to all staff to warn them, then click the link',
    'C',
    'It shows the classic phishing signs — urgency, a look-alike domain (not @cethos.com), and a credential request. Do not click. Forward it to the Director and delete it.',
    1
  ),
  (
    'True or False — You should lock your screen every time you step away from your device, even for a short break.',
    'True',
    'False',
    NULL,
    NULL,
    'A',
    'True. Lock your screen whenever you step away (Win+L / Ctrl+Cmd+Q). Short, unattended windows are exactly when opportunistic access happens.',
    2
  ),
  (
    'Which of the following meets the Cethos password policy?',
    'A memorable 8-character word reused on every platform',
    'A unique 12+ character password per platform, stored in a password manager',
    'One very strong password shared with your manager as a backup',
    'A short password you change only once a year on schedule',
    'B',
    'The policy requires at least 12 characters, a unique password for every platform, use of a password manager, no sharing, and an immediate change on suspected compromise.',
    3
  ),
  (
    'True or False — Cethos clients require evidence of ISO 27001 compliance as a condition of qualifying Cethos as a vendor.',
    'True',
    'False',
    NULL,
    NULL,
    'A',
    'True. Pharmaceutical and clinical research clients require demonstrable ISO 27001 compliance before approving Cethos to handle their confidential clinical data.',
    4
  )
) AS q(question, a, b, c, d, correct, explanation, ord);
