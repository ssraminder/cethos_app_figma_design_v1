# RWS LV Onboarding & Validation — Session Handover (2026-06-25)

> Supersedes `RWS-onboarding-handover.md`. Read this + the memory file
> `feature_client_order_onboarding_welo_rws_2026_06_24.md` + `tmp/rws-po-scope.md` before continuing.

## 0. TL;DR — where we are
RWS Life Sciences COA **linguistic-validation (LV)** work is fully onboarded into the portal (**21 orders**), documented (master SOP + 9 per-step SOPs + a staff onboarding guide), and we are now in the **VALIDATION phase**. A spoon-fed validation script (**VAL-LV-001**) is written + stored for colleague **Fayza** to run and confirm the SOP matches the system. **Immediate next step:** dry-run VAL-LV-001's 16 steps with dummy data (confirm exact labels/results + capture a screenshot per step + fix any gaps), then hand it to Fayza for the pass/fail sign-off loop.

## 1. Context
- RWS is an LV client that subcontracts **individual LV steps** (1 PO = 1 step). Cethos models each as a **single-step workflow + an independent internal QA node**. Audit context: **IQVIA 2026-06-29/30**.
- **Cethos is ISO 17100-ALIGNED, NOT certified** (Stage 2 ~Dec 2026). Never write "certified".
- QA basis: **§5.3.3** bilingual revision for translation/adaptation/back-translation; **§5.3.6** verification for validation/review steps (reconciliation, BT review, harmonization, proofreading, interview, clinician review, finalization).

## 2. DONE (all live in prod project `lmzoyezvsjgsxveoakdr`)
- **Setup:** 8 `lv_*` single-step templates; 7 regional target languages (en/pa/ta-SG/hi/mr-IN, ta-IN, ta-MY); all services pre-existed. Migrations **merged in PR #1117**.
- **21 orders** `ORD-2026-10499..10520` (10504 unused) — every May-1-onward RWS PO, built as **un-delivered shells** (in_production/pending/unbilled) via the `build_lv_order` helper, each with a **§4.4 pre-production staff note**, QA assigned to **Bobby Rawat**. GT81161 was cancelled (skipped). Full PO→order map in `tmp/rws-po-scope.md`.
- **SOPs:** `SOP-LV-001` (master) + `SOP-PR-003..011` (per-step) — merged in **PR #1117**. SOP-PR-001/002 pre-existed.
- **Live-verify done:** orders render on portal.cethos.com (`/admin/orders/<id>`); the portal **auto-creates a per-order Dropbox folder** `Cethos/Projects/RWS/<PRJ> — RWS/<ORD> — <lang> — <date>` + a "Re-sync folders" button.
- **TRN-RWS-001** "Onboarding an RWS LV PO (Staff Training)" → built (`docs/training/TRN-RWS-001-*.md`+`.docx`) + **stored in portal Documents** (doc id `2db56076-92aa-4610-85e9-de07061bd029`, category **Training**, audience **staff**, **DRAFT/unpublished**).
- **VAL-LV-001** "RWS LV Onboarding — System Validation Script" (Fayza's tester guide) → built (`docs/training/VAL-LV-001-*.md`+`.docx`) + **stored** (doc id `d8cec73a-45dd-455c-a36f-1190ce6f7203`, category **Validation**, audience **staff**, **DRAFT**).
- **Review-rounds/feedback answered + documented (TRN-RWS-001 §11):** (1) order **Client Communications tab** = an **append-only log**, paste RWS emails (feedback/dev-review/clinician/queries); feeds AI vendor instructions; = §6.1 record; (2) in-order revisions = new version on the workflow step + "+ Add Step"; (3) separately-billed rounds (DEVRF/CLNFBR) = a **new order**.
- **Create-order UI CONFIRMED to support LV onboarding:** `/admin/orders/new` → **Direct order** mode (for RWS, an AR customer) → customer/service/source-target → **Workflow template dropdown lists every LV template** → line items. So Fayza can do it all in the UI. This was the make-or-break unknown; it's resolved.

## 3. WHERE WE'RE LEAVING OFF (active work)
- **Task #17 (dry-run) — IN PROGRESS.** Discovery done (UI supports LV onboarding). The actual **16-step dry-run with dummy data has NOT been run yet.**
- **VAL-LV-001 accuracy:** Steps **1–11** were checked against the live create-order UI + order page. Steps **12–16** (assign vendor / upload deliverable / QA approve / final+complete / log feedback) were written from **expectation, not yet dry-run** — they need confirming + the exact labels refining.
- **Screenshots:** TRN-RWS-001 + VAL-LV-001 carry the procedure + `[SCREENSHOT]` caption slots only. **Embedding real captures is BLOCKED:** Chrome `computer` `save_to_disk` screenshots are NOT readable back as files (saved for chat display only). Need a download-capable capture method, or the user drops images in.

## 4. NEXT STEPS (in order)
1. **Dry-run VAL-LV-001 end-to-end** with the dummy data: PO **ZZTEST0001**, project **ZZ-TEST-LV-001**, customer **RWS**, **Standard Translation**, **English (US)→English (India)**, template **Translation Only**, 500 words @ 0.10, test vendor **ss.raminder@gmail.com**. Confirm each step's exact label/result; **fix gaps (task #18)**; refine VAL-LV-001 steps 12–16; capture a screenshot per step. **Cancel the dummy order at the end** (it's a real order on prod until then; orders are cancellable — but do NOT qualify the test vendor, qualification is irreversible).
2. **Embed screenshots** into TRN-RWS-001 + VAL-LV-001, re-upload as new versions via `manage-portal-documents` **`action=add_version`** (same curl, add `-F document_id=<id>` `-F version=1.1`).
3. **Hand VAL-LV-001 to Fayza** → she ticks PASS/FAIL + Notes per step → return → fix SOP or system → re-test failed rows → **all PASS = SOP-LV-001 + TRN-RWS-001 signed off complete** (task #19 closes the loop).
4. **Publish** TRN-RWS-001 + VAL-LV-001 once reviewed: `manage-portal-documents` JSON `action=update_meta`, `{id, staff_id, is_published:true}`.
5. **Deliverables/completion pass (task #13)** for delivered POs — `aurora@rws.com` "Vendor Delivery" emails name the vendor linguists (e.g. GT97301 pPRF; GT81671 HARM HH88973 = ganeshpur@gmail.com / thedhyan@yahoo.com / mudebailvishu@gmail.com / raminder.shah@wordsmith.in). Replicate the deliverable into the portal Dropbox folder + assign that vendor + QA + complete.

## 5. Machinery / how-to
- **Build an order:** `build_lv_order(template_code, service_id, step1_name, internal_project, client_project, source_lang, target_lang, amount, po, pm_id, instr)` (installed in prod DB; clones the ORD-10499 seed `19128aaf…` then re-points service/langs/template/step-1 + stamps the QA ISO clause). `clone_welo_coa_order(...)` is the lower-level cloner.
- **Build a .docx from markdown:** `python tmp/build_trn_docx.py <src.md> <out.docx> ["Title"]` (python-docx 1.2.0; no pandoc on the box).
- **Store a doc in the portal:** multipart `POST https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/manage-portal-documents` with headers `apikey` + `Authorization: Bearer <anon key>` (get via Supabase MCP `get_publishable_keys`), fields `action=create`, `staff_id=a8b2d97e-4832-41d4-9334-4d6a58558154` (Raminder, active staff), `title`, `doc_code`, `audience=staff`, `category`, `description`, `version=1.0`, `file=@<docx>;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document`. (Function source: `supabase/functions/manage-portal-documents/index.ts`.)

## 6. Key IDs
- **RWS customer (USD, tax-exempt):** `840f6e4d-6152-46ce-9b09-dc3d5e223a0a`. Company `b67fcfd7-0cb9-4b9d-a4a7-3e5b3ebb9227`.
- **Services:** Standard Translation `cad6e69a`, Proofreading `a14029b5`, Harmonization `4bb10465`, Cognitive Debriefing `568599b9`, Reconciliation `134b6e2a`, Back Translation `10cb592e`, Translation Review `7ff4045b`, Quality Management `f2867955`.
- **Languages:** en-US `fe7e0e4c`, en-IN `3d63894c`, pa-IN `b20c4689`, ta-SG `091577c7`, hi-IN `a98694cc`, mr-IN `fa029b7a`, ta-IN `2a595a6f`, ta-MY `08c1eb16`.
- **QA reviewer:** Bobby Rawat `5ec2997c-8826-4847-a350-4b88e206df35`. **Test vendor:** ss.raminder@gmail.com.
- **Projects + PMs + the 21 PO→order rows:** in `tmp/rws-po-scope.md`.
- **Portal docs:** TRN-RWS-001 `2db56076…` (Training), VAL-LV-001 `d8cec73a…` (Validation) — both DRAFT.

## 7. Hard rules
- Never write **"cloned from"** on any record (IQVIA). **ISO 17100-aligned, not certified.** Dummy data = **ZZ-TEST** prefix. No client-confirmation emails on RWS order creation. **Onboarding/qualification is IRREVERSIBLE** (`qms.qualification_audit_log` append-only) — never qualify a test/trial vendor; orders themselves are cancellable. Actor columns FK to `auth.users` (resolve via `public.qms_resolve_actor`).

## 8. NEW WORKSTREAM (opened 2026-06-25) — Interactive staff training
User wants Documents & Manuals to become **interactive, assignable, signed-off training with annotated screenshots + a completion audit log** (download-only docs "not meeting expectations"). **The engine already EXISTS** (so it's *convert + wire*, not build-from-scratch): `training_modules → training_lessons → training_slides` (slides carry `body_text` + **`screenshot_url`**), `staff_training_progress` (staff_id/lesson_id/`completed_at`/quiz_passed/best_score = the completion audit), `training_modules.is_required`+`passing_score`, and an assignment table (`cvp_training_assignments`: training_id/`staff_user_id`/assigned_by/`due_at`/completed_at). Also `document_certifications` (doc-acknowledgement), `iso_competence_quizzes`, `qms_staff_competence`. Staff-training UI = **/admin/trainings** (+ Linguist Trainings / Staff Competence / QMS training-records in the nav).
- **Decisions (user):** *pilot the 2 RWS guides + plan the full rollout now*; **keep BOTH** the interactive module AND the `.docx` (controlled/printable copy).
- **Full plan + prioritised doc list:** `docs/audits/2026-06-iqvia/staff-interactive-training-rollout-plan.md`. Pattern A = step→slide+annotated screenshot (process SOPs); Pattern B = read+acknowledge (policies).
- **3 gap pieces to build (small):** (1) per-staff **assignment** of `training_modules` + an "Assign/Share" button (confirm `cvp_training_assignments` drives modules, else add `training_module_assignments`); (2) **sign-off attestation** on completion; (3) admin **completion-audit view** from `staff_training_progress` (exportable for IQVIA).
- **Pilot:** TRN-RWS-001 → "RWS LV Onboarding" module; VAL-LV-001 → "RWS LV Validation" module (assigned to Fayza). **Capture the slide screenshots DURING Fayza's VAL-LV-001 dry-run** (she's on every screen) — annotate, attach. ⚠️ slides need real image files at `screenshot_url`: the /admin/trainings slide editor likely has a per-slide upload (clean path) — Chrome `save_to_disk` screenshots are NOT readable back by the agent, so don't rely on that for embedding.
- **Sequence:** build the 3 gaps → pilot (convert both guides, screenshots from the dry-run, assign VAL to Fayza, she completes it = first signed-off record) → confirm the audit view → roll out Tier 1 (SOP-LV-001 + SOP-PR-001..011, SOP-VM-001, SOP-OPS-001) then Tier 2 (policies, all-staff annual).
