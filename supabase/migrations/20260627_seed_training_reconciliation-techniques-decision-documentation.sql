-- Seed interactive training: TG-LV-003 Reconciliation Techniques & Decision Documentation
-- Audience: linguist (Vendor); assignment-driven (applies_to scope=assigned)
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, audience, category, description, is_active, quiz_enabled, applies_to, pass_threshold)
  VALUES (
    'reconciliation-techniques-decision-documentation',
    'Reconciliation Techniques & Decision Documentation',
    'linguist',
    'linguistic-validation',
    'TG-LV-003 · Reconcile two independent forward translations into a single harmonized version: classify differences by type and severity, document every decision in the Reconciliation Log, and escalate when required.',
    true,
    false,
    '{"scope":"assigned"}'::jsonb,
    80
  )
  RETURNING id
),
lessons AS (
  INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, estimated_minutes, content_blocks, body_markdown)
  SELECT t.id, v.oi, v.slug, v.title, v.mins, v.blocks::jsonb, v.md
  FROM t, (VALUES
    (1, 'what-is-reconciliation', 'What Is Reconciliation?', 7,
$jb$[
  {"type":"prose","md":"## Producing the Reconciled Version\n\nReconciliation is the process of reviewing both independent forward translations (T1 and T2) and producing a single, harmonized version — the **Reconciled Version** — that represents the best linguistic and conceptual rendering of the source instrument.\n\nYou do not simply choose between T1 and T2. You may adopt T1, adopt T2, or create a **third option** that draws on both — always prioritizing conceptual accuracy for the target patient population."},
  {"type":"callout","variant":"info","title":"Your job is the best rendering, not a vote","body":"Reconciliation is not picking a winner between two translators. It is constructing the version that most faithfully conveys the source concept to the target patient — even if that means writing something neither T1 nor T2 produced."}
]$jb$,
$md$Reconciliation reviews both independent forward translations (T1 and T2) and produces a single harmonized Reconciled Version that best renders the source instrument. The reconciler may adopt T1, adopt T2, or create a third option drawing on both, always prioritizing conceptual accuracy for the target patient population.$md$),

    (2, 'difference-classification-system', 'Difference Classification System', 9,
$jb$[
  {"type":"prose","md":"## Classify every difference\n\nWhen T1 and T2 differ, classify the difference by **type** and assign a **severity**. The classification drives how you document and whether you escalate."},
  {"type":"steps","title":"Difference types","steps":[
    {"title":"Terminological","body":"Different word choices with similar meaning. Example: \"fatigued\" vs \"tired\"."},
    {"title":"Stylistic","body":"Different register or formality. Example: formal vs colloquial phrasing."},
    {"title":"Structural","body":"Different sentence structure. Example: active vs passive voice."},
    {"title":"Conceptual","body":"Different underlying meaning. Example: one translation omits a negation."},
    {"title":"Cultural","body":"Different cultural adaptation. Example: different idiom choices."}
  ]},
  {"type":"comparison","title":"Severity levels","columns":[
    {"label":"Critical","tone":"bad","items":["Changes the meaning or intent of an item","MUST be resolved AND escalated to the PM"]},
    {"label":"Major","tone":"bad","items":["Likely to cause patient confusion","Requires documented rationale"]},
    {"label":"Minor","tone":"good","items":["Stylistic only","Document the preference and move on"]}
  ]},
  {"type":"callout","variant":"rule","title":"Critical differences always escalate","body":"A Critical-level difference changes the meaning or intent of an item. It must be documented, resolved, and escalated to the Project Manager — never resolved silently."}
]$jb$,
$md$Classify each T1/T2 difference by type — terminological, stylistic, structural, conceptual, or cultural — and by severity. Critical differences change meaning or intent and must be resolved and escalated to the PM; Major differences risk patient confusion and need documented rationale; Minor differences are stylistic only.$md$),

    (3, 'using-the-reconciliation-log', 'Using the Reconciliation Log Template', 8,
$jb$[
  {"type":"prose","md":"## Document every decision — even when T1 and T2 agree\n\nEvery decision must be recorded in the Reconciliation Log, **even if T1 and T2 are identical**. The log becomes part of the regulatory audit trail and must be retained with the project file."},
  {"type":"steps","title":"Reconciliation Log fields","steps":[
    {"title":"Item number and source text","body":"Identify the item and quote the source text it corresponds to."},
    {"title":"T1 translation","body":"Record the first forward translation verbatim."},
    {"title":"T2 translation","body":"Record the second forward translation verbatim."},
    {"title":"Classification of difference","body":"Type and severity (if any difference exists)."},
    {"title":"Reconciled version","body":"The final harmonized rendering you selected or wrote."},
    {"title":"Rationale for decision","body":"Why this rendering was chosen — the audit-critical field."},
    {"title":"Reconciler initials and date","body":"Sign and date every entry."}
  ]},
  {"type":"callout","variant":"rule","title":"Undocumented decisions are audit failures","body":"Record a log entry for every item, including items where T1 and T2 are identical or where you simply adopt T1. An audit cannot reconstruct a decision that was never written down — if it isn't documented, it didn't happen."},
  {"type":"example","title":"Check your understanding","intro":"A common reconciliation shortcut — and why it fails an audit.","items":[
    {"label":"Question","text":"A reconciler receives T1 and T2 and finds T1 is clearly better for 90% of items. Can they simply adopt T1 as the Reconciled Version without documenting those items?"},
    {"label":"Answer","text":"No. Every item — including those where T1 is adopted unchanged — must be documented in the Reconciliation Log with a rationale. Undocumented decisions create audit failures.","tone":"info"}
  ]}
]$jb$,
$md$Record every decision in the Reconciliation Log, even when T1 and T2 are identical. Each entry captures the item number and source text, T1, T2, the difference classification, the reconciled version, the rationale, and reconciler initials and date. The log is part of the regulatory audit trail; undocumented decisions are audit failures.$md$),

    (4, 'escalation-criteria', 'Escalation Criteria', 6,
$jb$[
  {"type":"prose","md":"## When to escalate to your Project Manager\n\nSome situations exceed what reconciliation alone can resolve. Escalate to your PM in any of the cases below rather than guessing."},
  {"type":"steps","title":"Escalate to your Project Manager if","steps":[
    {"title":"A Critical difference cannot be resolved","body":"T1 and T2 differ in meaning and you cannot determine the correct rendering."},
    {"title":"A conceptual question needs subject-matter expertise","body":"For example, the clinical meaning of a symptom is unclear."},
    {"title":"The source text is ambiguous","body":"The instrument structure is ambiguous in the source language itself."},
    {"title":"You suspect a systematic translator error","body":"One translator's approach appears to contain a recurring, systematic problem."}
  ]},
  {"type":"example","title":"Check your understanding","intro":"Make sure you can define the highest-severity difference.","items":[
    {"label":"Question","text":"What is a Critical-level difference?"},
    {"label":"Answer","text":"A difference that changes the meaning or intent of an item. Critical differences must be documented, resolved, and escalated to the PM.","tone":"info"}
  ]}
]$jb$,
$md$Escalate to your Project Manager when a Critical difference cannot be resolved between T1 and T2, when a conceptual question requires subject-matter expertise, when the source text itself is ambiguous, or when you suspect a systematic error in one translator's approach.$md$)
  ) AS v(oi, slug, title, mins, blocks, md)
  RETURNING training_id
)
INSERT INTO cvp_training_quiz_questions
  (training_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, display_order, active)
SELECT (SELECT id FROM t),
  'True or False: If T1 is clearly the better translation for an item, the reconciler may adopt it as the Reconciled Version without recording a Reconciliation Log entry for that item.',
  'True',
  'False',
  NULL,
  NULL,
  'b',
  'False. Every item must be documented in the Reconciliation Log with a rationale, including items where T1 is adopted unchanged. Undocumented decisions create audit failures.',
  1, true
FROM t;
