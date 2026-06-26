-- Seed the staff interactive training "CAPA & Complaint Handling" (cvp_trainings
-- audience=staff) with 5 lessons + 5 quiz questions, taught from the real RWS
-- BSFS Tamil-Singapore worked example (CMP-2026-00005 / NC-2026-00007 / CAPA-00007-08).
-- Screenshots (e2e/output/capa-training/) attach via cvp_training_lessons.screenshot_paths
-- once uploaded to the training-assets bucket. Idempotent (ON CONFLICT slug + re-seed).
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, description, category, is_active, audience, quiz_enabled, applies_to, pass_threshold)
  VALUES ('capa-complaint-handling', 'CAPA & Complaint Handling',
    'How Cethos records, investigates and resolves client complaints and nonconformities through the closed-loop CAPA process — taught with a real worked example (the RWS BSFS Tamil–Singapore case). For all staff who handle client quality issues.',
    'quality', true, 'staff', true, '{"scope":"universal"}'::jsonb, 80)
  ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
    audience=EXCLUDED.audience, quiz_enabled=EXCLUDED.quiz_enabled, pass_threshold=EXCLUDED.pass_threshold,
    is_active=true, updated_at=now()
  RETURNING id
),
del_l AS (DELETE FROM cvp_training_lessons WHERE training_id=(SELECT id FROM t) RETURNING 1),
del_q AS (DELETE FROM cvp_training_quiz_questions WHERE training_id=(SELECT id FROM t) RETURNING 1),
ins_l AS (
  INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, body_markdown, screenshot_paths, key_rules, route_reference, estimated_minutes)
  SELECT (SELECT id FROM t), v.oi, v.slug, v.title, v.body, '{}'::text[], v.kr::jsonb, '/admin/quality', v.mins
  FROM (VALUES
    (1,'overview','The CAPA & complaint closed loop',
$md$## Why this matters

When a client raises a quality concern, Cethos must **record it, investigate it, fix it, and prevent it happening again** — and be able to show that trail to an auditor (ISO 17100 §4.6 complaints / §4.7 corrective action, and the IQVIA audit).

The **Quality & performance** hub (`/admin/quality`) is the system of record. **Every change there is audit-logged.**

## The closed loop

1. **Complaint** — log what the client reported (a ticket number `CMP-…` is created).
2. **Nonconformity (NC)** — escalate it to a formal finding (`NC-…`).
3. **Root cause** — find the *underlying* cause (5-whys), not the symptom.
4. **CAPA** — a **Correction** (fix this case) + a **Corrective action** (prevent recurrence), each with an owner and due date.
5. **Closure** — record the outcome; everything stays traceable on the order.

Throughout this training we follow one real case: **RWS, BSFS Tamil–Singapore cognitive debriefing (PO M26-266)** — where the patient list showed patients in **India, not Singapore**, and the project number couldn't be located.$md$,
'[{"rule":"The portal is the system of record — log every client complaint here, not just in email.","reason":"ISO 17100 §4.6 and the IQVIA audit require a traceable, audit-logged complaint to CAPA trail."}]',6),

    (2,'log-complaint','Logging a client complaint',
$md$## Log the complaint

Open **Quality & performance → Log complaint**, then fill in:

- **Summary** — one line (e.g. *"RWS BSFS Tamil–Singapore CD (PO M26-266): patient list shows India not Singapore"*).
- **Detail** — what happened, who reported it, any evidence.
- **Source** (client), **Received via** (email), **Category**, **Severity**.
- **Complainant** — name + email (the RWS PM).
- **Linked order / project** — **always link the order** so the complaint is findable from the project, and the project carries its quality trail.

Click **Log complaint** — a ticket number **`CMP-…`** is generated automatically and the complaint appears in the open list.

> In our worked case this created **CMP-2026-00005**, linked to order **ORD-2026-10365**.

You do **not** decide who is at fault here — that comes later, at resolution.$md$,
'[{"rule":"Always link the complaint to the order/project.","reason":"Traceability — the complaint must be findable from the project and vice-versa, which is exactly what was missing in the RWS case."},{"rule":"Do not mark a linguist at fault when logging.","reason":"Fault is decided at resolution; linking a linguist for context must never pre-judge them."}]',8),

    (3,'escalate-root-cause','Escalate to a nonconformity + root cause',
$md$## Raise the nonconformity

On the complaint row, click **Raise NC**. The nonconformity opens **pre-filled** from the complaint (it carries the order link), and gets its own number **`NC-…`**. The complaint automatically moves to *linked*.

## Find the root cause

On the NC detail, use **Root-cause analysis** (5-whys) and **Save root cause**. Dig past the symptom to the underlying cause.

> In the RWS case the root cause was **record/intake**: the order was saved as `251-L1962A-ABVLV` (RWS said `261-`), **PO M26-266 was never recorded**, and the target was the generic **"Tamil"** with the **Singapore** locale missing — so the project couldn't be located and the India-vs-Singapore mismatch wasn't caught.$md$,
'[{"rule":"Fix the root cause, not the symptom.","reason":"A CAPA only prevents recurrence if it targets the underlying cause (here: intake/recordkeeping, not the interview itself)."}]',8),

    (4,'capa-and-linguist','CAPA actions + linking the linguist fairly',
$md$## Add the CAPA actions

On the NC, **Add action** for each:

- **Correction (immediate fix)** — e.g. confirm the list origin, confirm the patients'' suitability, reply to the client, and correct the order record. *(CAPA-2026-00007 in our case.)*
- **Corrective action (prevent recurrence)** — e.g. add an intake check that recruitment location matches the target locale, and make the PO/project number mandatory at kickoff. *(CAPA-2026-00008.)*

Give each an owner and a due date.

## Linking the linguist — fairly

You can link the assigned linguist to the NC for **traceability**. **This does not touch their performance scorecard.**

The performance event fires **only** if the NC is **closed** *and* you tick **"Attributed to the linguist."** Until a case is resolved and fault is assigned, a linked profile is **never** dinged.$md$,
'[{"rule":"Linking a linguist is traceability, not blame.","reason":"The scorecard event fires only at attributed closure — never on suspicion or mere linkage."},{"rule":"A CAPA needs both a Correction and a Corrective action.","reason":"Correction fixes this instance; the corrective action stops it recurring — together they close the loop."}]',8),

    (5,'correspondence-closure','Correspondence, closure & traceability',
$md$## Log the back-and-forth

Use **Correspondence & updates** on the NC to log the handling thread — *internal notes*, *replies you send the client*, and *their responses*. The **full client emails** live on the linked order''s **Client Communications** (one source of truth — don''t duplicate them here).

## Close it out

When the actions are done and verified, set the NC to **closed** with a closure summary. If — and only if — the linguist''s work was the cause, tick **Attributed to the linguist** at that point.

## It''s all traceable

Open the order and the **"Quality — Complaints & CAPA"** card shows the complaint, the NC and the CAPA actions — so the project carries its own auditable quality trail.$md$,
'[{"rule":"Log every reply to/from the client on the record.","reason":"ISO §4.6 wants evidence that the resolution was communicated to the client."},{"rule":"Full client emails belong on the order Client Communications, not duplicated on the complaint.","reason":"Single source of truth; the complaint thread is the handling summary."}]',7)
  ) AS v(oi, slug, title, body, kr, mins)
  RETURNING 1
)
INSERT INTO cvp_training_quiz_questions (training_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, display_order, active)
SELECT (SELECT id FROM t), q.question, q.a, q.b, q.c, q.d, q.correct, q.expl, q.ord, true
FROM (VALUES
  ('When you log a client complaint, what must you always link it to for traceability?',
   'The linguist','The order / project','A personal email folder','Nothing','b',
   'Linking the complaint to the order makes it findable from the project and gives the project its own quality trail.',1),
  ('Linking a linguist to a complaint or nonconformity…',
   'immediately lowers their performance score','only affects their scorecard if the NC is closed AND attributed to them','automatically emails them a warning','removes them from the order','b',
   'Linking is traceability only. The performance event fires solely at attributed closure — never on suspicion.',2),
  ('What is the difference between a Correction and a Corrective action?',
   'There is none','A Correction fixes this case; a Corrective action prevents recurrence','A Corrective action is just faster','A Correction is automated','b',
   'A CAPA needs both: fix the instance, and stop it happening again.',3),
  ('Where do the full client emails about a complaint belong?',
   'The linked order''s Client Communications','Pasted into the complaint detail','A staff personal inbox','They are not kept','a',
   'The order''s Client Communications is the single source of truth for the emails; the complaint thread is the handling summary.',4),
  ('Why must every client complaint be logged in the portal, not just email?',
   'It is optional','To delete it quickly','For a traceable, audit-logged complaint to CAPA trail (ISO 17100 §4.6 / IQVIA)','To email the client automatically','c',
   'The audit needs the full, immutable complaint to CAPA trail — email alone is not evidence.',5)
) AS q(question, a, b, c, d, correct, expl, ord);
