-- Seed interactive training: TG-IS-002 Secure File Handling & Approved Platform Usage
-- Audience: linguist (Vendor); assignment-driven (applies_to scope=assigned)
-- Source guide has no Knowledge Check section => no quiz questions seeded.
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'secure-file-handling-approved-platform-usage',
    'Secure File Handling & Approved Platform Usage',
    'linguist',
    'security',
    'TG-IS-002 · Handle LV project files securely: use only Cethos-approved platforms, follow the file-naming convention for audit traceability, and version files correctly without overwriting.',
    true,
    false,
    '{"scope":"assigned"}'::jsonb,
    80
  )
  RETURNING id
),
lessons AS (
  INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, estimated_minutes, content_blocks, body_markdown)
  SELECT t.id, v.oi, v.slug, v.title, v.mins, v.blocks::jsonb, v.body
  FROM t, (VALUES
    (1, 'platform-approval-matrix', 'Platform Approval Matrix', 7,
$jb$[
  {"type":"prose","md":"## Approved platforms only\n\nLV project files may only move through **Cethos-approved** channels. Anything else — personal cloud, consumer file-transfer, messaging apps — is **not permitted**, because Cethos cannot guarantee the security or auditability of those platforms."},
  {"type":"comparison","title":"Where LV project files may and may not go","columns":[
    {"label":"Approved","tone":"good","items":[
      "Cethos Project Workspace — the primary platform",
      "Encrypted email issued by the client — only with PM permission",
      "Encrypted USB drive — only when PM-approved"
    ]},
    {"label":"Not permitted","tone":"bad","items":[
      "Personal Google Drive",
      "Personal Dropbox",
      "Personal iCloud",
      "WeTransfer / wetransfer.com",
      "Unencrypted USB drives",
      "WhatsApp / Telegram / SMS — never for file transfer"
    ]}
  ]},
  {"type":"callout","variant":"rule","title":"Never use an unapproved platform","body":"If a platform is not on the approved list, do not use it for LV project files — not even 'just this once' to hit a deadline. When unsure whether a platform is acceptable, stop and ask your Project Manager before moving any file."},
  {"type":"example","title":"Check your understanding","intro":"A common real-world pressure.","items":[
    {"label":"Question","text":"A deadline is tight and the Cethos workspace feels slow, so a colleague suggests you just send the file via WeTransfer. Is that acceptable?"},
    {"label":"Answer","text":"No. WeTransfer and other consumer file-transfer or messaging tools are not permitted for LV project files under any circumstances. Use the Cethos Project Workspace (or client-issued encrypted email with PM permission), and if you are blocked, raise it with your Project Manager rather than reaching for an unapproved platform.","tone":"info"}
  ]}
]$jb$,
$md$## Platform Approval Matrix

Approved for LV files: Cethos Project Workspace (primary); client-issued encrypted email (with PM permission); encrypted USB drive (PM-approved only).

Not permitted: personal Google Drive, personal Dropbox, personal iCloud, WeTransfer, unencrypted USB drives, and WhatsApp / Telegram / SMS (never for file transfer).

If a platform is not on the approved list, do not use it — when unsure, ask your PM first.$md$),

    (2, 'file-naming-conventions', 'File Naming Conventions', 6,
$jb$[
  {"type":"prose","md":"## Name every file for audit traceability\n\nAll LV project files must follow the naming convention given in your project brief. Correct naming supports audit-trail integrity, version control, and quick identification of the right document."},
  {"type":"steps","title":"The naming convention","steps":[
    {"title":"Follow the brief","body":"Always use the exact convention specified in your project brief — it overrides any personal habit."},
    {"title":"Typical format","body":"[ClientCode]-[ProjectCode]-[Language]-[Step]-[Version]-[Date].docx"},
    {"title":"Component by component","body":"ClientCode and ProjectCode identify the engagement; Language is the target; Step is the LV stage (e.g. T1); Version is the running version number; Date is the save date (YYYYMMDD)."}
  ]},
  {"type":"example","title":"Worked example: a correctly named file","intro":"A French forward translation (T1), first version, saved on 10 July 2026.","items":[
    {"label":"Filename","text":"IQVIA-LV2024-FR-T1-v1-20260710.docx","tone":"good"},
    {"label":"How it reads","text":"Client IQVIA · project LV2024 · target language FR · step T1 (forward translation 1) · version v1 · saved 2026-07-10.","note":"Anyone can identify the exact document at a glance, and the audit trail stays intact.","tone":"info"}
  ]},
  {"type":"callout","variant":"info","title":"Why naming is a compliance control","body":"A consistent filename is not cosmetic — it is what lets an auditor trace which version of which step was delivered when. A misnamed file breaks that chain."}
]$jb$,
$md$## File Naming Conventions

All LV project files must follow the naming convention in your project brief. Typical format:

[ClientCode]-[ProjectCode]-[Language]-[Step]-[Version]-[Date].docx

Example: IQVIA-LV2024-FR-T1-v1-20260710.docx (client IQVIA, project LV2024, target FR, step T1, version v1, saved 2026-07-10).

Correct naming supports audit-trail integrity, version control, and quick identification of the right document.$md$),

    (3, 'version-control', 'Version Control', 5,
$jb$[
  {"type":"prose","md":"## Never overwrite a previous version\n\nVersion control protects the audit trail. Every iteration of a file must remain recoverable."},
  {"type":"steps","title":"Version control rules","steps":[
    {"title":"Never overwrite","body":"Never overwrite a previous version of a file."},
    {"title":"Save as a new version","body":"Always save as a new version with the updated version number in the filename."},
    {"title":"Mark FINAL clearly","body":"When you are ready to submit, clearly mark the file as FINAL in the filename."},
    {"title":"Notify your PM","body":"Tell your Project Manager once the FINAL version is ready."}
  ]},
  {"type":"comparison","title":"Versioning done right vs wrong","columns":[
    {"label":"Correct","tone":"good","items":[
      "Save each iteration as a new version (v1, v2, v3 …)",
      "Keep every prior version recoverable",
      "Mark the submission FINAL and notify the PM"
    ]},
    {"label":"Wrong","tone":"bad","items":[
      "Overwrite the previous file with the new one",
      "Reuse the same filename for different versions",
      "Submit without flagging which file is FINAL"
    ]}
  ]},
  {"type":"callout","variant":"rule","title":"Always version up, never overwrite","body":"Overwriting destroys the history an auditor relies on. Save a new version every time and reserve FINAL for the submitted file."}
]$jb$,
$md$## Version Control

Never overwrite a previous version. Always save as a new version with the updated version number. When ready to submit, clearly mark the file as FINAL in the filename and notify your PM.

Overwriting destroys the version history the audit trail depends on.$md$)
  ) AS v(oi, slug, title, mins, blocks, body)
  RETURNING training_id
)
SELECT 1 FROM lessons;
