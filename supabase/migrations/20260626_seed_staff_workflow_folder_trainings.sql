-- Seed three interactive STAFF trainings (cvp_trainings audience=staff, content-only,
-- no graded quiz) from the work shipped 2026-06-26:
--   1. rws-lv-po-onboarding        (from TRN-RWS-001)
--   2. post-delivery-revision-rounds (from SOP-028)
--   3. team-dropbox-folder-system  (the per-workflow team-Dropbox structure)
-- Each lesson carries rich content_blocks (prose | steps | example | callout |
-- comparison); body_markdown is the renderer fallback. Idempotent (ON CONFLICT slug
-- re-seeds lessons). Applied to prod via MCP, committed for parity.

-- ============================================================================
-- 1. RWS LV PO Onboarding
-- ============================================================================
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, description, category, is_active, audience, quiz_enabled, applies_to, pass_threshold)
  VALUES ('rws-lv-po-onboarding', 'RWS LV PO Onboarding',
    'How to onboard a single RWS Life Sciences linguistic-validation purchase order into the portal — correctly and repeatably — so the record is ISO 17100-defensible. For LV operations and project-management staff.',
    'operations', true, 'staff', false, '{"scope":"universal"}'::jsonb, 80)
  ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
    category=EXCLUDED.category, audience=EXCLUDED.audience, quiz_enabled=EXCLUDED.quiz_enabled,
    applies_to=EXCLUDED.applies_to, pass_threshold=EXCLUDED.pass_threshold, is_active=true, updated_at=now()
  RETURNING id
),
del AS (DELETE FROM cvp_training_lessons WHERE training_id=(SELECT id FROM t) RETURNING 1)
INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, body_markdown, content_blocks, route_reference, estimated_minutes)
SELECT (SELECT id FROM t), v.oi, v.slug, v.title, v.body, v.cb::jsonb, '/admin/orders', v.mins
FROM (VALUES
  (1, 'model', 'The RWS onboarding model',
$md$RWS manages the full validation cycle and buys individual steps from us. One RWS PO = one Cethos order = one LV step + one independent internal QA. We never chain steps and never email RWS an order confirmation — they already sent the PO.$md$,
$json$[
 {"type":"prose","md":"## RWS buys individual steps\n\nRWS Life Sciences runs the full linguistic-validation cycle in-house and purchases **individual steps** from Cethos by purchase order. Your job is to turn each PO into a clean, auditable order."},
 {"type":"callout","variant":"rule","title":"One rule to remember","body":"1 RWS PO = 1 Cethos order = one LV step + one independent internal QA. Never chain steps, and never send RWS a customer order-confirmation email — they already sent the PO."},
 {"type":"steps","title":"The end-to-end flow","steps":[
   {"title":"Read the PO","body":"Capture the six key fields from the PO body."},
   {"title":"Map the task code","body":"The task code drives the service + workflow template."},
   {"title":"Create the order","body":"An un-delivered shell on the RWS customer."},
   {"title":"Pre-production record","body":"A staff note capturing the client-TSP agreement (ISO 17100 4.4)."},
   {"title":"Assign + produce + QA","body":"Qualified vendor produces; an independent reviewer runs QA."},
   {"title":"Deliver + complete","body":"Release the final, complete the order; files land in the team Dropbox."}
 ]}
]$json$, 6),

  (2, 'read-po', 'Read the PO — six fields + the task-code map',
$md$Every RWS PO has a header block and a one-line rate table. Capture the PO number, the assigning PM, the date, the scope, the project number, and the line item (instrument, task code, language pair, amount). The task code maps to the service + workflow template.$md$,
$json$[
 {"type":"prose","md":"## Capture six fields\n\nEvery RWS PO has a header block and a one-line-item rate table. Pull these six fields before you create anything."},
 {"type":"steps","title":"The six fields","steps":[
   {"title":"Purchase Order #","body":"The order's PO number."},
   {"title":"Assigned By","body":"The client PM — create or select this person under the RWS company."},
   {"title":"Date","body":"The PO date."},
   {"title":"Scope","body":"The study / protocol — record it in the pre-production note."},
   {"title":"Project Number","body":"e.g. 251-E4006A-EILV — the client project number (internal project)."},
   {"title":"Line item","body":"Instrument + task code + language pair + Total Authorized in USD — the service, workflow, languages, and amount."}
 ]},
 {"type":"example","title":"The task code drives the workflow","intro":"The code left of the dash in the grey row selects the service + template.","items":[
   {"label":"TRLV - Translation (LV)","text":"Standard Translation -> translation_only (5.3.3 revision)","tone":"info"},
   {"label":"BTLV - Back Translation","text":"Back Translation -> lv_back_translation (5.3.3 revision)","tone":"info"},
   {"label":"pPRF / ePRF - Proofreading","text":"Proofreading -> lv_proofreading (5.3.6 verification)","tone":"info"},
   {"label":"HARM - Harmonize","text":"Harmonization -> lv_harmonization (5.3.6 verification)","tone":"info"},
   {"label":"IIP - Interview","text":"Cognitive Debriefing -> lv_interview (5.3.6 verification)","tone":"info"}
 ]},
 {"type":"callout","variant":"info","title":"Ignore the LV-type suffix","body":"The suffix on the project code (EILV, NVLV, ABVLV, EUQLV, ZELV...) is an RWS internal code, not a workflow. Do not use it to pick the template."}
]$json$, 8),

  (3, 'create-order', 'Create the order (un-delivered shell)',
$md$Create the order against the RWS USD, tax-exempt customer. Set the service and the LV workflow template (step -> QA Review -> Final Deliverable), the language pair, PO number, client project number, amount, and client PM. Status In Production, work status Pending. Do not send a customer confirmation email and do not mark delivered.$md$,
$json$[
 {"type":"prose","md":"## Build the shell\n\nCreate the order against the **RWS Life Sciences (USD, tax-exempt, net-30)** customer. It starts as an un-delivered shell — no deliverable yet."},
 {"type":"steps","title":"Order settings","steps":[
   {"title":"Customer","body":"RWS Life Sciences (USD, tax-exempt). Do NOT send a customer order-confirmation email."},
   {"title":"Service + workflow template","body":"Per the task-code map. The LV template gives three nodes: step -> QA Review -> Final Deliverable."},
   {"title":"Languages","body":"The PO's pair (e.g. English (US) -> Marathi (India)). If a variant is missing, ask the system admin to add it."},
   {"title":"PO# / Project# / Amount / Client PM","body":"PO number, client project number, Total Authorized, and Assigned By as the client PM."},
   {"title":"Status","body":"In Production, work status Pending — an un-delivered shell."}
 ]},
 {"type":"callout","variant":"rule","title":"Two things you never do here","body":"Never send RWS a customer order-confirmation email, and never mark the order delivered before QA approves the released version."}
]$json$, 8),

  (4, 'assign-qa', 'Assign the qualified vendor + independent QA',
$md$On the production step, use Find Vendor and assign a linguist who is ISO-qualified for that language pair and role. The QA Review node is performed by an independent second person (default Bobby Rawat) — a different person than the producer. Translation/adaptation/back-translation get a 5.3.3 bilingual revision; review steps get 5.3.6 verification.$md$,
$json$[
 {"type":"prose","md":"## Qualified production, independent QA\n\nWork starts when you assign the production step. The QA node that follows is a separate, independent check — the heart of the ISO record."},
 {"type":"steps","title":"How the work runs","steps":[
   {"title":"Find Vendor on step 1","body":"Assign a linguist ISO-qualified for that exact language pair and role. The eligibility gate enforces this."},
   {"title":"Vendor produces","body":"The linguist completes the step and uploads the deliverable."},
   {"title":"Independent QA (step 2)","body":"A different person (default Bobby Rawat) reviews it — never the producer."},
   {"title":"Right QA basis","body":"Translation / adaptation / back-translation -> a 5.3.3 bilingual revision. All review/validation steps -> 5.3.6 verification & release."}
 ]},
 {"type":"callout","variant":"rule","title":"Two hard rules","body":"Never assign an unqualified linguist (do not override the gate), and the QA reviewer must be a different person than the producer."}
]$json$, 7),

  (5, 'deliver-folders', 'Deliver + the team-Dropbox folder',
$md$On QA approval, upload the released version to the Final Deliverable node, deliver to the client, and complete the order. Files auto-organise in the Cethos team Dropbox into a per-workflow, per-step, versioned structure. Records are retained at least 5 years (ISO 17100 6.2).$md$,
$json$[
 {"type":"prose","md":"## Deliver, then the record files itself\n\nOn QA approval, release the version to **Final Deliverable**, deliver to RWS, and complete the order. The portal organises the files in the **Cethos team Dropbox** automatically."},
 {"type":"steps","title":"The order's folder","steps":[
   {"title":"00_Admin","body":"PROJECT-RECORD.md (the audit record) + the order's invoice/PO PDFs."},
   {"title":"01_Source/v1 + 02_Reference/v1","body":"The source files RWS sent + instructions/reference/working files."},
   {"title":"NN_Step/v1","body":"The LV step's deliverable (e.g. 10_Translation, 10_Proofreading)."},
   {"title":"20_QA-Review/v1 + 30_Final-Deliverable/v1","body":"The QA-approved copy and the released copy."}
 ]},
 {"type":"callout","variant":"info","title":"Learn the folders properly","body":"Use Sync and Open in Dropbox on the order. Records are retained at least 5 years (ISO 17100 6.2). See the Team-Dropbox Folder System training for the full structure and versioning."}
]$json$, 6),

  (6, 'review-rounds', 'Review rounds & post-delivery changes',
$md$RWS feedback often arrives after delivery. Handle every one as a controlled revision round, never a silent re-send. If the order is not yet invoiced, bill the round on the same order (revise to v2). If it is already invoiced, create a new order under the same project. Full process: the Post-Delivery Revision Rounds training (SOP-028).$md$,
$json$[
 {"type":"prose","md":"## After delivery is not the end\n\nDeveloper and clinician feedback often arrive **after** we deliver. Every one is a controlled revision round — log it, re-verify it, retain both versions."},
 {"type":"comparison","title":"Where the round goes","columns":[
   {"label":"Order NOT yet invoiced","tone":"good","items":["Revise on the SAME order","Vendor delivers v2; re-run QA","Add payable + supplementary invoice if chargeable"]},
   {"label":"Order ALREADY invoiced / Paid","tone":"bad","items":["The order is financially closed","Create a NEW order under the SAME project (PRJ-...)","Own PO / payable / receivable / invoice"]}
 ]},
 {"type":"callout","variant":"rule","title":"Never silently re-send","body":"Always log the client's return in Client Communications first (back-dated, with their markup). That is the ISO 6.1 record and it populates the 05_Client-Review folder. Full process: SOP-028."}
]$json$, 6)
) AS v(oi, slug, title, body, cb, mins);

-- ============================================================================
-- 2. Post-Delivery Revision Rounds
-- ============================================================================
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, description, category, is_active, audience, quiz_enabled, applies_to, pass_threshold)
  VALUES ('post-delivery-revision-rounds', 'Post-Delivery Revision Rounds',
    'How to handle a client review or change request that arrives after an order is delivered — as a controlled revision round, with the right billing path. From SOP-028. For project-management and operations staff.',
    'operations', true, 'staff', false, '{"scope":"universal"}'::jsonb, 80)
  ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
    category=EXCLUDED.category, audience=EXCLUDED.audience, quiz_enabled=EXCLUDED.quiz_enabled,
    applies_to=EXCLUDED.applies_to, pass_threshold=EXCLUDED.pass_threshold, is_active=true, updated_at=now()
  RETURNING id
),
del AS (DELETE FROM cvp_training_lessons WHERE training_id=(SELECT id FROM t) RETURNING 1)
INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, body_markdown, content_blocks, route_reference, estimated_minutes)
SELECT (SELECT id FROM t), v.oi, v.slug, v.title, v.body, v.cb::jsonb, '/admin/orders', v.mins
FROM (VALUES
  (1, 'principle', 'The principle',
$md$A delivered job the client returns with review and changes is run as a controlled revision round — not a quiet re-send. The client's feedback is an ISO 6.1 record, the revised work is re-verified, and both the QA-passed original (v1) and the QA-passed revision (v2) are retained.$md$,
$json$[
 {"type":"prose","md":"## A change is a round, not a re-send\n\nDays or weeks after delivery, the client comes back with a review and changes. Run it as a **controlled revision round** so the pipeline, the billing, and the folders stay auditable."},
 {"type":"callout","variant":"rule","title":"The principle","body":"A post-delivery change is a new revision round on the order. The client's feedback is a 6.1 record, the revised work is re-verified (5.3.6), and the new version of every affected artifact is retained alongside the original. What passed QA the first time AND what passed it after the review must both be provable."}
]$json$, 4),

  (2, 'run-the-round', 'Run the round',
$md$First log the client's return in Client Communications — append-only, back-dated, with their markup attached. Then re-open the affected step (Request revision); the vendor delivers a new version (v2); re-run QA against the feedback; re-issue the deliverable; confirm and close the round.$md$,
$json$[
 {"type":"prose","md":"## Six steps, in order\n\nThe sequence matters — logging the feedback first is what creates the record and populates the folder."},
 {"type":"steps","title":"Running a revision round","steps":[
   {"title":"Log the client's return (do this first)","body":"Client Communications -> Add client email. Back-date it to their send time, attach their markup. This is the ISO 6.1 record."},
   {"title":"Re-open the affected step","body":"Use Request revision (with a reason). The step flips from approved back to revision_requested; the workflow returns to in progress. Re-open only the steps that actually need redoing."},
   {"title":"Vendor revises -> new version","body":"The corrected file is a NEW version (v2, v3...). It does not overwrite v1."},
   {"title":"Re-run internal QA","body":"QA reviews the revised version against the feedback and records the sign-off. A substantive change gets a 5.3.3 reviser check."},
   {"title":"Re-issue the deliverable","body":"Mark the new delivery final and Send to client again. The re-send is logged."},
   {"title":"Confirm + close","body":"Confirm receipt; log any further feedback as the next round. Route complaints to CAPA."}
 ]},
 {"type":"callout","variant":"info","title":"Add a step only when needed","body":"Upload the revision as a new version on the existing step. Use + Add Step only when the round genuinely needs an extra review pass."}
]$json$, 8),

  (3, 'billing', 'Billing — the invoice-status rule',
$md$Where the money goes depends on whether the original order is already invoiced. Not yet invoiced: bill the round on the same order (vendor payable + a supplementary customer invoice via reference_invoice_id, if chargeable). Already invoiced or Paid: the order is financially closed — create a new order under the same project, with its own PO, payable, receivable and invoice.$md$,
$json$[
 {"type":"prose","md":"## The invoice status decides everything\n\nA revision round can carry its own money in both directions. **Whether it goes on the same order or a new one turns on one thing: is the original already invoiced?**"},
 {"type":"comparison","title":"Same order vs new order","columns":[
   {"label":"NOT yet invoiced -> same order","tone":"good","items":["Add the round's vendor payable (Send PO)","If chargeable, add a receivable + a supplementary customer invoice (reference_invoice_id)","Revised work stays as v2 in the same folder","An order supports multiple payables/receivables/invoices"]},
   {"label":"ALREADY invoiced / Paid -> new order","tone":"bad","items":["The invoiced order is financially closed — do not add charges","Create a NEW order under the SAME project (PRJ-...)","Own PO / payable / receivable / invoice","Its own order folder under the same PRJ folder"]}
 ]},
 {"type":"example","title":"Worked example","intro":"An RWS order was delivered and invoiced; RWS returns with a developer-feedback round.","items":[
   {"label":"Wrong","text":"Add a new payable to the closed, invoiced order.","note":"The order is financially closed — you cannot cleanly add charges.","tone":"muted"},
   {"label":"Right","text":"Create a new order under the same PRJ (RWS issues a separate PO, e.g. DEVRF), onboard it normally.","note":"The project keeps all its rounds together; billing stays clean.","tone":"info"}
 ]},
 {"type":"callout","variant":"rule","title":"Confirm before paid work","body":"In-scope corrections we own are not charged. Client changes beyond the PO scope are quoted and the vendor paid accordingly. Confirm chargeability AND the vendor rate before starting paid revision work."}
]$json$, 8),

  (4, 'folders-records', 'Folders & records',
$md$The round is fully represented in the order folder. Client feedback becomes 05_Client-Review/round-N (feedback.md + markup). The revised artifact auto-versions to the step's v2 (v1 is never overwritten). An auditor sees the original (v1), the feedback (round-N), and the revised, re-QA'd, re-delivered version (v2) — the complete chain. All records are retained at least 5 years.$md$,
$json$[
 {"type":"prose","md":"## The folder is the audit trail\n\nLog the feedback in the portal and the folders take care of themselves — no manual filing."},
 {"type":"steps","title":"What the round leaves behind","steps":[
   {"title":"05_Client-Review/round-N/","body":"feedback.md (subject, date, body) + the client's markup files — generated from the Client Communications entry."},
   {"title":"Step v2 / v3","body":"The revised deliverable; appears automatically when the vendor delivers a new version and you Sync the order."},
   {"title":"QA re-sign-off","body":"Reviewer + timestamp captured in PROJECT-RECORD.md."}
 ]},
 {"type":"comparison","title":"Do vs don't","columns":[
   {"label":"Do","tone":"good","items":["Log every round as a client communication","Re-QA every client-driven change before it ships","Keep v1 and v2 both"]},
   {"label":"Don't","tone":"bad","items":["Re-send a corrected file with no logged round","Overwrite v1","Put genuinely new work on an invoiced order"]}
 ]}
]$json$, 6)
) AS v(oi, slug, title, body, cb, mins);

-- ============================================================================
-- 3. Team-Dropbox Folder System
-- ============================================================================
WITH t AS (
  INSERT INTO cvp_trainings (slug, title, description, category, is_active, audience, quiz_enabled, applies_to, pass_threshold)
  VALUES ('team-dropbox-folder-system', 'Team-Dropbox Folder System',
    'How the portal organises every order in the Cethos team Dropbox: the per-workflow, per-step, versioned folder structure, the 05_Client-Review rounds, and the naming rules. For all operations and project-management staff.',
    'operations', true, 'staff', false, '{"scope":"universal"}'::jsonb, 80)
  ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
    category=EXCLUDED.category, audience=EXCLUDED.audience, quiz_enabled=EXCLUDED.quiz_enabled,
    applies_to=EXCLUDED.applies_to, pass_threshold=EXCLUDED.pass_threshold, is_active=true, updated_at=now()
  RETURNING id
),
del AS (DELETE FROM cvp_training_lessons WHERE training_id=(SELECT id FROM t) RETURNING 1)
INSERT INTO cvp_training_lessons (training_id, order_index, slug, title, body_markdown, content_blocks, route_reference, estimated_minutes)
SELECT (SELECT id FROM t), v.oi, v.slug, v.title, v.body, v.cb::jsonb, '/admin/orders', v.mins
FROM (VALUES
  (1, 'why-where', 'Why & where',
$md$The Cethos team Dropbox holds an ISO-defensible record for every order, organised by workflow. The portal creates and fills the folders automatically — you do not hand-make them. The path is Cethos Team Folder / 01_Clients / {Client} / {PRJ - project code} / {ORD - Service - pair - date}.$md$,
$json$[
 {"type":"prose","md":"## One auditable home per order\n\nEvery order's files live in the **Cethos team Dropbox**, organised so an auditor can open any order and see the complete record. The portal builds and fills the structure automatically."},
 {"type":"example","title":"The path to an order","intro":"Folders nest client -> project -> order.","items":[
   {"label":"Client","text":"01_Clients/RWS/","tone":"muted"},
   {"label":"Project","text":"PRJ-2026-00031 - 261-A2229A-EILV/","tone":"muted"},
   {"label":"Order","text":"ORD-2026-10227 - Proofreading - en-US-pa - 2026-05-23/","tone":"info"}
 ]},
 {"type":"callout","variant":"rule","title":"Don't hand-make folders","body":"Use Sync and Open in Dropbox on the order. The portal creates and names everything; manual folders break the audit trail and the sync log."}
]$json$, 5),

  (2, 'anatomy', 'The folder anatomy',
$md$The order folder has a workflow-neutral shell (00_Admin, 01_Source, 02_Reference) captured at intake, then per-step production folders that come from the workflow (NN_Step, numbered in tens), then 20_QA-Review and 30_Final-Deliverable.$md$,
$json$[
 {"type":"prose","md":"## Shell first, then the workflow\n\nThe first folders (00-02) are the same for every order because source and reference are captured at intake, before a workflow is chosen. The numbered step folders come from the workflow itself."},
 {"type":"steps","title":"Inside an order folder","steps":[
   {"title":"00_Admin","body":"PROJECT-RECORD.md (the audit record) + the order's invoice and PO PDFs."},
   {"title":"01_Source/v1","body":"The source files the client sent."},
   {"title":"02_Reference/v1","body":"Instructions, reference, glossary, style guide, working files."},
   {"title":"NN_Step/v1","body":"One numbered folder per workflow step (10_Translation, 20_QA-Review, 30_Final-Deliverable, ...) — step number x 10."},
   {"title":"05_Client-Review/round-N","body":"Appears only when the client returns feedback after delivery."}
 ]},
 {"type":"callout","variant":"info","title":"Source is workflow-neutral","body":"Not every workflow translates (debriefing, transcription, review), so the source folder is the generic 01_Source — the workflow-specific folders only appear after it."}
]$json$, 6),

  (3, 'versioning', 'Versioning & client review',
$md$Every folder is versioned (v1, v2, v3). A revision round re-versions the affected step to v2; v1 is never overwritten. Client feedback after delivery becomes 05_Client-Review/round-N. The result is a complete chain: original (v1) -> feedback (round-N) -> revised, re-QA'd version (v2).$md$,
$json$[
 {"type":"prose","md":"## Every folder is versioned\n\nNothing is overwritten. A revision delivers a **new version** (v2, v3...) beside the original. v1 always stays."},
 {"type":"example","title":"A revision round in the folders","intro":"The client reviews a delivered translation and asks for changes.","items":[
   {"label":"10_Translation/v1","text":"The originally delivered, QA-passed translation.","tone":"muted"},
   {"label":"05_Client-Review/round-1/","text":"feedback.md + the client's markup (from Client Communications).","tone":"info"},
   {"label":"10_Translation/v2","text":"The revised translation, re-QA'd and re-delivered.","tone":"info"}
 ]},
 {"type":"callout","variant":"rule","title":"v1 is never overwritten","body":"The chain v1 -> round-N feedback -> v2 IS the audit trail. Keeping both the original and the revision is what makes a post-delivery change defensible."}
]$json$, 6),

  (4, 'naming-dos-donts', 'Naming & dos / don''ts',
$md$Folder names lead with the stable ID (ORD-...), use ASCII separators (no slashes or special characters), ISO-639 language codes, and ISO-8601 dates. Let the portal create and rename folders; never hand-make or delete versions, and avoid renaming after delivery.$md$,
$json$[
 {"type":"prose","md":"## Stable, ASCII, ISO\n\nThe naming rules keep folders sortable, link-stable, and auditor-readable. The portal applies them for you — your job is to not break them."},
 {"type":"comparison","title":"Do vs don't","columns":[
   {"label":"Do","tone":"good","items":["Let the portal create folders (Sync / Open in Dropbox)","Lead with the stable ID (ORD-...)","Use ISO language codes + ISO-8601 dates","Keep every version"]},
   {"label":"Don't","tone":"bad","items":["Hand-make or rename folders","Rename after delivery","Delete superseded versions","Use slashes or special characters in names"]}
 ]},
 {"type":"callout","variant":"info","title":"Renames use move, not copy","body":"When a rename is unavoidable, the portal moves the folder (preserving file links) and updates the sync log so the audit trail stays accurate."}
]$json$, 5)
) AS v(oi, slug, title, body, cb, mins);
