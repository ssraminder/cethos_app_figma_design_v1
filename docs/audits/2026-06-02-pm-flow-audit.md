# Cethos PM-flow audit — vendor assignment lifecycle

**Date:** 2026-06-02
**Scope:** End-to-end UI/UX + ISO 17100 audit of the Project Manager-facing vendor assignment flow on `portal.cethos.com/admin`, with cross-template consistency checks.
**Status:** **Checkpoint** — Phase A (read-only inventory) + 4 parallel code-audit subagents + DB inventory complete. Phases B–E (create test orders, run lifecycle scenarios, customer-side checks) pending user go/no-go after reviewing this checkpoint.

---

## 1. Executive summary — top findings ranked by impact

1. **Bobby Rawat appears as both "Vendor" and "Internal (Review)" on the SAME workflow.** On ORD-2026-10254 (Standard TEP), Bobby is rendered as "▶ Vendor Bobby Rawat" on Steps 2 & 3 (Editing, Proofreading) and "▶ Internal (Review) Bobby Rawat" on Step 4 (QA Review). The UI labels the role from the template's `actor_type`, not from the actual assignee. A PM glancing at this thinks three different people worked the order. Root cause: when a template step has `actor_type='external_vendor'` but `allowed_actor_types` includes internal, and an internal staff member fills it via `assigned_staff_id` (with `vendor_id` NULL), the rendering shrug-emits the wrong label.
2. **§6.2 reviser-separate-person rule is not enforced** — and violations are routine. Same Bobby Rawat covers Editing + Proofreading + QA Review + Final Deliverable on ORD-2026-10254. No schema column (`requires_different_vendor_from_step`) exists on `workflow_template_steps`. The Stage 2 ISO 17100 auditor (target Dec 2026) will flag this in sampling.
3. **`qms.*` schema is live since 2026-04-28 but operationally empty.** 0 role_qualifications, 0 competence_evidence, 0 nda_agreements recorded. `gateAssignment()` has fired 1,165 times across direct_assign / offer_vendor / offer_multiple / find_matching_vendors call sites — every single one in `warn` mode, 0 blocks. The four `qms.v_qualified_*` views return 0 rows because nothing's been recorded. An auditor will see we *check* but never *block* or *record evidence*.
4. **`find-matching-vendors` already returns `qms_eligible` / `qms_reason` / `qms_required_role` annotations per vendor row, but the admin VendorFinderModal ignores all four fields entirely.** Zero references in `client/`. Single highest-leverage UI fix: surface those annotations in the existing finder.
5. **There is no "counter-back" UI affordance.** When a vendor counter-offers, the admin can Accept (uses native `confirm()` dialog!) or Reject — but cannot propose a counter-counter. AI-recommendation block actively suggests a counter-back amount, then renders the action as italic "not yet wired to a one-click action — use Accept/Reject above or wait for Phase 2." Documented gap (memory `project_workflow_audit_deferred`); affects every negotiation.
6. **`OrderWorkflowSection.tsx` is 5,995 lines in a single file.** Hosts VendorFinderModal, VendorAssignModal (3-mode), WorkflowPipeline (per-step renderer), UnassignVendorModal, ManagePayableModal trigger, counter-offer card, AI HITL UI, file uploads, template selector. Adding the counter-back UI to this monolith without refactor will compound the audit-trail problem.
7. **Triple-stacked modals for one decision.** VendorFinder (z-50) → VendorAssign (z-60) → "View all rates" (z-70). On laptop screens the inner modal clips. PM's "pick + price + send" is one decision, three UI layers.
8. **Multi-offer ignores per-vendor preferred currency.** `offer_multiple` mode locks currency to CAD (falls back when `vendor?.preferred_rate_currency` is null because no single vendor is "the" vendor). PM sends every offer in CAD whether or not the vendor prefers EUR/USD/etc.
9. **"Customer Draft Review" step exists only on `certified_translation` (1/10 templates).** Per memory `project_workflow_gap.md` this was identified as a workflow gap that should be applied universally. 9/10 templates still skip the customer approval gate before Final Deliverable. ISO §5.5 expects content-owner approval — currently relies on a staffer manually flipping step status.
10. **Two retract-offer paths, native `confirm()` dialogs, two resend-email button blocks — multiple parallel code paths for identical intents.** `handleRetractSingleOffer` vs the bulk `retract_offers` action both wrapped in native `window.confirm()`. Resend-vendor and resend-staff are near-identical button blocks. Candidates for shared components.

---

## 2. Workflow templates inventory + cross-template consistency matrix

10 active templates (all created 2026-03-24 by an unrecorded one-shot DB script; no seed migration on disk):

| Code | Steps | 30-day uses | Customer step | "QA Review" name | Notable |
|---|---|---|---|---|---|
| `certified_translation` | 4 | **25** | **YES — Step 2 "Customer Draft Review"** | "PM Review & Certification" (internal_work) | The only template with mid-workflow customer actor |
| `translation_only` | 3 | **19** | no | "QA Review" (internal_review) | Minimal path |
| `translation_review` | 4 | 6 | no | "QA Review" | Translation + Review by separate vendors |
| `standard_tep` | 5 | 5 | no | "QA Review" | Three sequential vendor steps — §6.2 hotspot |
| `harmonization_review` | 3 | 0 | no | "Quality Management" (internal_review) | 1 historical use, otherwise dead |
| `medical_back_translation` | 6 | **0** | no | "Reconciliation" (internal_review) | **NEVER used in production**; longest workflow |
| `mtpe_review` | 4 | **0** | no | "QA Review" | **Never used in production** |
| `software_localization` | 6 | **0** | no | "QA Review" | **Never used in production**; DTP + LQA steps |
| `subtitling` | 5 | **0** | no | "QA Review" | **Never used in production**; first step Transcription |
| `transcription_translation` | 5 | **0** | no | "QA Review" | **Never used in production** |

**Half the catalog is unused.** Five templates (Medical/Back Translation, MTPE+Review, Software Localization, Subtitling, Transcription+Translation) have **zero** production orders since seeding 8+ weeks ago. Either dead options polluting the picker, or genuinely-needed services that nobody knows are configured.

**Cross-template observations:**

- **Final Deliverable step is universal** — all 10 templates end with `actor_type='internal_work'`, `manual`, `requires_file_upload=true`. Good consistency.
- **"QA Review" step is not universal.** 7/10 templates use it (internal_review, `assignment_mode='auto'`). The 3 exceptions use different names for the same architectural slot:
  - `certified_translation` → "PM Review & Certification" (`internal_work`, not `internal_review`)
  - `medical_back_translation` → "Reconciliation" (`internal_review`)
  - `harmonization_review` → "Quality Management" (`internal_review`, service-tagged)
- **No "Cognitive Debriefing" template.** User asked specifically about this service. Closest analog: `medical_back_translation` Steps 3-4 (Clinician Review + Post Clinician Review). If cognitive debriefing for PRO instruments is a service Cethos offers, it needs its own template — currently nothing in production fits.
- **`Customer Draft Review` gap** is 9/10 templates wide — see Finding #9.
- **Schema drift:** `20260525_final_deliverable_step.sql` backfilled Final Deliverable steps without populating `default_actor_type` or `allowed_actor_types` columns. Minor; would matter if a template-editing UI tries to clone the step.
- **No CAT-analysis step at template level.** CAT pricing is handled at the per-step `vendor_payables` layer only (per memory `feature_cat_payables_2026_05_25`). Receivable-side CAT not built (Phase 2 deferred — overlaps with Change Batch #2.5 Phase B).

---

## 3. PM-facing UI audit — `client/components/admin/OrderWorkflowSection.tsx`

### 3.1 Single-file monolith

5,995 lines. Hosts:

| Component | Lines | Role |
|---|---|---|
| `SearchableSelect` | 303-369 | Generic combobox |
| `VendorFinderModal` | 389-976 | PM's "pick a vendor" modal |
| `VendorAssignModal` | 1020-~2000 | Terms+deadline+negotiation modal (3 modes: assign / offer / offer_multiple) |
| `TemplateSelector` | 2064-~2155 | "No workflow assigned" stub |
| `WorkflowPipeline` | 2334-~5170 | Per-step inline UI |
| `UnassignVendorModal` | 5179-5430 | Release flow with `payable_action: cancel|adjust|keep` |
| `OrderWorkflowSection` main | 5434-5995 | State + edge-function plumbing |

`ManagePayableModal.tsx` (707 lines) lives separately.

### 3.2 VendorFinderModal — what's on the row, what's missing

**Shown per vendor** (lines 875–945): star rating + numeric, name + email, "↪ N prior task(s) on this project" pill (anchored by `internalProjectId` — well done), language pairs, `rate_for_service`, Available/Busy chip, total job count, native-language pills, active job count, numeric `match_score`.

**Filters available:** Source/Target lang, Service category, Native languages (multi-select), Country, Min rating, Max rate, Availability, free-text name/email, Sort by match score / rating / rate / projects.

**Missing — high impact for a PM doing the job well:**

- **No ISO 17100 competency, certification, NDA, or CV status.** The data exists (`qms.role_qualifications`, `cv_documents`, `nda_agreements`, `cvp_applications.test_score`) but isn't surfaced.
- **No `qms_eligible` indicator.** Edge function returns it per row; UI throws it away.
- **No last-N-jobs performance metric** (QM score, on-time rate, revision rate).
- **No COL bucket** despite the 12% anti-lowball floor being a documented Cethos pricing decision.
- **No cost-suggestion column** — the "what should we pay?" calculation only fires INSIDE `VendorAssignModal` after pick. PM compares vendors with no cost frame.
- **No current-load metric** beyond raw `active_jobs` count. No capacity %, no "currently in revision," no "missed-deadline-last-30-days" flag.
- **No vendor-preferred-currency hint at row level** — only appears in the assign modal after row click.
- **Search is page-1 only** (`limit: 30`). Pool >30 → silently truncated. Footer surfaces total count, no pagination.
- **No side-by-side comparison.** PM cannot pin two vendors to compare.

### 3.3 VendorAssignModal — three modes, one shape, several traps

**Modes:** `assign` / `offer` / `offer_multiple`, all driven by one prop.

**What the PM sets:** Pricing mode toggle (Rate × Units vs Target-no-payable), Rate + Unit + Currency, auto-looked-up suggested rate, "View all rates" modal-in-modal, Units → auto Total, Margin traffic light, Offer expiry, Deadline (datetime-local, auto-prefilled to `clientDeadline - 1 day`), Instructions textarea (auto-loaded from `order_ai_instructions`), Negotiation block (allow / max_rate / max_total / latest_deadline / auto_accept_within_limits).

**Traps observed/inferred:**

- **Triple-stacked modals** (z-50/60/70).
- **Pricing mode toggle is destructive** — switching wipes the per-unit fields with no warning.
- **"Target (no payable)" mode disappears from the step row afterwards** — only a tiny purple "Target" badge. PMs forget to settle the payable.
- **Currency mismatch is soft-warn only** — amber "Vendor prefers X" appears, submission still goes through.
- **`auto_accept_within_limits` defaults to `true`** — the more-automated default, but UI doesn't shout it.
- **No vendor profile context** (CV, NDA, ISO competency) shown anywhere in the assign modal.
- **Rate lookup re-runs every time the modal opens** — no caching.
- **Multi-vendor offer locks every vendor to the same rate** — `vendor_rate?` exists on prop type but per-vendor override not wired. Currency falls back to CAD.

### 3.4 Counter-offer negotiation UI

**Inline yellow card** under the offer pill, NOT a modal. Shows rate diff (strikethrough), total diff, deadline diff, vendor note, timestamp.

**Actions today:** Accept Counter (green button, native `confirm()` dialog!), Reject Counter (opens textarea for reason → "Confirm Reject"), AI-recommendation panel returning action/confidence/concerns + per-action apply buttons.

**Critical gap:** **No counter-back affordance.** Italic text reads "Counter-back not yet wired to a one-click action — use Accept/Reject above or wait for Phase 2 counter-respond." The AI confidently recommends a counter rate; the PM has no UI to send it.

**Code comment on line 3193-3194:** "vendor-counter-offer writes `counter_status='proposed'`; DB convention is 'proposed', not 'pending'." Hints at historical schema drift around the counter status enum.

### 3.5 Bulk offer flow (`offer_multiple`)

VendorFinder checkboxes → "Offer to Selected (N)" footer button → VendorAssignModal opens with N vendor pills (not removable, must Cancel back to finder). PM sets common terms once. Server fans out via `update-workflow-step.action='offer_multiple'`.

**Already-shipped batch behavior** (from PR #832 today): single summary email to `pm@cethoscorp.com`, per-vendor emails without pm@ on CC. Mirror writes into step + offer rows (from PR #833 today). Both verified live.

**Remaining bumps:** per-vendor rate override missing, currency locked to CAD, no "if A accepts first, B auto-declines" preview, vendor pills not removable in the assign modal.

### 3.6 Recruitment flow disconnected from project sourcing

`pages/admin/RecruitmentList.tsx`, `RecruitmentDetail.tsx` (6,304 lines) are the **applicant onboarding pipeline** (CV review, test/quiz, references, decision). Zero references to `order_id` / `project_id` / "assign to project." A PM stuck with no matching vendor for an obscure language pair has no in-app route to put up a job ad or invite a known freelancer. Disconnect.

### 3.7 Negotiation settings — global only

`pages/admin/settings/NegotiationAutomationSettings.tsx`. Stored in `negotiation_settings.id=1`. Settings: `mode` (hitl/mixed/auto), `auto_confidence_threshold`, `auto_max_uplift_pct`, `auto_max_deadline_extension_hours`, `auto_only_for_services`, `notify_staff_email` (single string), `require_unanimous_confidence`, `paused`.

**Gaps:** no per-customer override (TRSB and a notarized customer get the same policy), no per-PM override, no "what would AI have done last week?" preview, `notify_staff_email` is a single email (clashes with the new pm@ CC convention which expects multi-recipient).

---

## 4. Live observations from existing in-flight orders

### 4.1 ORD-2026-10275 (`certified_translation`, Hindi → English)

Workflow as rendered to admin (Chrome MCP capture):

| Step | Status | Actor label rendered | Action buttons |
|---|---|---|---|
| 1 Translation | 📦 Delivered | **▶ Vendor Bobby Rawat** | Email log, Resend email, Approve, Request Revision, Begin QM, Promote to customer draft, Unassign |
| 2 Customer Draft Review | ✅ Approved | ▶ Customer Bobby Rawat | (no admin actions visible — customer already approved) |
| 3 PM Review & Certification | 📦 Delivered | ▶ Internal (Work) Bobby Rawat | Approve, Request Revision, Resend email, Unassign |
| 4 Final Deliverable | 📦 Delivered | ▶ Internal (Work) Not assigned | Upload Final Version, Send to Client, Approve, Request Revision, Begin QM |

**Issue:** Bobby Rawat is the **customer** but appears as the "Vendor" on Step 1. Confirmed — Step 1's `actor_type='external_vendor'` was filled by an internal user named Bobby Rawat, but the customer is also named Bobby Rawat. **The UI shows the same name in two different role labels** which is itself confusing; the deeper problem is **the role label is computed from template actor_type, not from the actual assignee's type**.

### 4.2 ORD-2026-10279 (`translation_only`, English → Hindi)

| Step | Status | Actor label rendered | Action buttons |
|---|---|---|---|
| 1 Translation | Assigned | ▶ Vendor Abhash Pathak ($10/per_hour · CAD $30.00) | Email log, Resend email, Adjust, Manage Payable (30.00 CAD), Unassign, Delivered by email |
| 2 QA Review | ⏳ Pending | ▶ Internal (Review) Not assigned | **Staff dropdown — contains "Raminder Shah" TWICE and "Raminder Test"** |
| 3 Final Deliverable | ⏳ Pending | ▶ Internal (Work) Not assigned | Same staff dropdown (duplicate Raminder), Upload Final Version, Send to Client |

**Issues:**

- **Staff dropdown contains "Raminder Shah" twice.** Likely two `staff_users` rows for the same person. Bug, regardless of the workflow audit context.
- **"Raminder Test" listed as a staff member** — test fixture left in prod.
- **Step 1 is overdue 30 days** with no urgency badge beyond red date text. No "this is critical" surfacing.
- **Margin shown twice on the page** (top of workflow section AND bottom Financials). Redundant.

### 4.3 ORD-2026-10254 (`standard_tep`, English → Hindi) — §6.2 violation

| Step | DB `actor_type` | DB `vendor_id` | DB `assigned_staff_id` | UI rendered label |
|---|---|---|---|---|
| 1 Translation | external_vendor | Abhinav Dang | — | ▶ Vendor Abhinav Dang |
| 2 Editing | **external_vendor** | NULL | Bobby Rawat | **▶ Vendor Bobby Rawat** |
| 3 Proofreading | **external_vendor** | NULL | Bobby Rawat | **▶ Vendor Bobby Rawat** |
| 4 QA Review | internal_review | NULL | Bobby Rawat | ▶ Internal (Review) Bobby Rawat |
| 5 Final Deliverable | internal_work | NULL | Bobby Rawat | (delivered by Bobby Rawat) |

**Issues:**

- Steps 2 & 3 say "Vendor" but Bobby is internal staff — **same UI rendering bug as 4.1**. Confirms it's a systemic label-from-template-not-from-assignee bug across templates.
- **Bobby Rawat covers Steps 2, 3, 4, AND 5 of a 5-step workflow.** §6.2 of ISO 17100: "Revision shall be performed by a person other than the translator." Cethos passes muster (Abhinav did Step 1, Bobby did Step 2 Editing) — but the Proofreading (Step 3) by Bobby and the QA Review (Step 4) by Bobby chain back to Bobby supervising his own Editing. Stage 2 auditor will read this as a competence/separation gap.

### 4.4 Admin Orders list — columns + filters

Live columns visible to staff (default): Order Details · Customer · Status · Total · Vendor Cost · Delivery · Actions. **No** Language Pair, **no** Vendor, **no** Assignment status — confirms the Change Batch #2.2 gap.

Live filters: Order Status / Work Status / From/To Date / XTRF Status / PO Status / Rush / Service type / Company / XTRF Invoice Status (multi-select) / XTRF Payment Status (multi-select). **No** Vendor, Language pair, or Assignment status filter.

---

## 5. ISO 17100 compliance gaps

### 5.1 What's working

- **`order_workflow_steps`** captures `vendor_id`, `assigned_at`, `assigned_by`, `pricing_mode`, `vendor_rate`, `vendor_total` — satisfies §5.4 (project preparation: language/domain/deadline).
- **`notification_log`** writes a row per `notifyVendorAssignment`, plus the new `vendor_offer_batch_summary` rows from today's PR #832 — satisfies §7.1 communication trail.
- **`qms.qualification_audit_log`** is hash-chained, tamper-resistant — would satisfy retention audit IF rows existed.
- **`qms.v_audit_log_recent`** view ready for auditor query.
- **Final verification** is captured via `final_delivery_id` on `order_workflow_steps` + `send-final-deliverable` edge function (§6.3 covered).

### 5.2 What's missing

| Clause | Gap | Schema fix | UI fix |
|---|---|---|---|
| §4.1.3 Competence | 0 rows in `qms.role_qualifications` | Backfill from `cvp_applications`/test scores via `v_retroactive_qualification_candidates` view | Surface qualification basis in vendor finder |
| §5.3 Pre-prod assignment | `gateAssignment()` runs but mode=warn, 0 blocks (1,165 events) | Flip `qms.config.assignment_gating_mode` to `block` **after** backfilling qualifications | Show qms_eligible chip on vendor rows |
| §6.1.2 Translator selection | No record of "why this vendor" per assignment | Add `competence_basis_cited_id uuid REFERENCES qms.role_qualifications(id)` to `order_workflow_steps` (nullable now, NOT NULL post-Stage 2) | Add "Cite qualification" mandatory dropdown in VendorAssignModal |
| §6.2 Reviser separation | No enforcement; production violations exist | Add `requires_different_vendor_from_step int[]` column to `workflow_template_steps`; enforce in `update-workflow-step` | Block assign / show error when violation attempted |
| §7.1 Records retention | `notification_log` and `order_workflow_steps` rows are deletable | RLS soft-delete-only + WORM constraints | n/a |

### 5.3 Concrete next steps in priority order

1. **Surface QMS annotations in VendorFinderModal** — `find-matching-vendors` already returns `qms_eligible`/`qms_reason`/`qms_required_role` per row. Zero UI work needed in the edge fn. Single highest-leverage fix.
2. **Add `Customer Draft Review` step to TEP, Translation+Review, MTPE+Review, Medical** — universalize the gate from Finding #9.
3. **Backfill `qms.role_qualifications`** via the existing `v_retroactive_qualification_candidates` view. Then flip gating to `block`.
4. **Add `requires_different_vendor_from_step` enforcement** for TEP + Medical + Translation+Review (the multi-vendor templates). Schema + server-side check before the existing `gateAssignment`.
5. **Add `competence_basis_cited_id` to `order_workflow_steps`** — required nullable column with a mandatory UI prompt in VendorAssignModal.

---

## 6. Customer-facing visibility (Audit D)

### 6.1 What the customer sees today

`client/pages/customer/CustomerOrderDetail.tsx` (1,047 lines) renders a hardcoded 5-stage timeline:
`paid → in_production → draft_review → delivered → completed`
Driven entirely by `orders.status`, not by `order_workflow_steps`. Customer never sees:
- Current step name
- Step count or current step number
- Vendor identity (per the 2026-05-05 anonymization decision — by design)

### 6.2 Cross-template UI consistency for the customer

**Consistent by erasure:** every template (3-step Translation Only, 6-step Medical, 4-step Certified) collapses to the same 5 customer-facing buckets. Cross-template consistency = good. Per-template fidelity = poor (a 6-step Medical order at Step 5 looks identical to one at Step 2).

### 6.3 Hardcoded "Translation" copy

- `CustomerOrderDetail.tsx:642` "Translation Details" — wrong header for Transcription+Translation or Cognitive Debriefing orders
- `CustomerOrderDetail.tsx:840` "Certified Translation" — wrong file-category label for non-certified services
- Drive these labels from `quote.service_type` or a per-template display config

### 6.4 Customer transactional emails

`notify-step-lifecycle.ts` defines 8 events, only 1 fires to the customer (`workflowCompleted` at line 591-623). Cross-template consistent (one email at end regardless of step count).

**Issue:** the CTA URL on that single customer email points to `${ADMIN_PORTAL_URL}/orders/${ctx.order.id}` — admin host, will hit auth wall. Should be the customer route or a passwordless magic link.

### 6.5 Dashboard

`get-customer-dashboard.unreadMessages` is hardcoded `0`. The badge on `CustomerDashboard.tsx` never lights up. Bug regardless of audit context.

---

## 7. Dead controls / redundancy / cleanup candidates

- **Two retract paths** for the same offer (single-pill ✕ vs "Retract All (N)" bulk). Both use native `confirm()`. Shareable component.
- **Two resend-email button blocks** (vendor at line 3047, staff at line 3076). Near-identical markup. Shareable `ResendEmailButton`.
- **`payable_action: 'keep'`** in UnassignVendorModal (line 5367) — exists but appears unused. Likely dead default.
- **`internalProjectId` prop** drives only the "↪ N prior tasks on this project" pill — could also power a filter "Only vendors who've worked this project before."
- **Auto-load of approved AI instructions** re-runs every modal-open, no caching.
- **Margin shown twice** on each order page (top + bottom).
- **"Raminder Shah" listed twice** in staff dropdowns (database dup).
- **"Raminder Test" listed in production staff dropdown.**
- **5/10 workflow templates never used** since 2026-03-24 seeding — clutters template-selector for new orders.

---

## 8. Phase B–E status (deferred pending user go/no-go)

Phase A established enough findings to triage substantive UX work. Phases B–E would add:

- **Phase B** — 5 fresh test orders to exercise template-specific paths (Medical Back, Transcription+Translation never used in prod, so the only way to validate them is to create them).
- **Phase C** — 12 lifecycle scenarios × 5 templates = ~60 live test interactions. Real Brevo emails fire to test inboxes + `pm@cethoscorp.com`. Would validate counter-back gap, currency-mismatch behavior, ISO §6.2 violation path, CAT mode failures end-to-end.
- **Phase D** — cross-template UI consistency (much already covered above via DB + code inspection).
- **Phase E** — ISO touchpoint walk against the fresh test orders.

User decision needed: proceed with B–E as-planned, narrow scope (e.g. 2 templates instead of 5), or stop here and triage Phase A findings into PRs.

---

## 9. Recommendations — phased fix backlog

### Quick wins (1 PR each, low risk)

- **R1.** Render step actor label from the actual assignee (`vendor_id` vs `assigned_staff_id` vs `customer`), not from template `actor_type`. Single file: `OrderWorkflowSection.tsx WorkflowPipeline`. Fixes Finding #1 across all templates.
- **R2.** Surface `qms_eligible` / `qms_reason` / `qms_required_role` in VendorFinderModal rows. Edge fn already returns them. Fixes ISO §5.3 surfacing.
- **R3.** Dedupe staff dropdown (`Raminder Shah` x2). Quick DB cleanup + UI dedup.
- **R4.** Remove "Raminder Test" from prod staff dropdown (or fence it behind `is_test` flag).
- **R5.** Replace native `confirm()` with styled modal for Accept Counter / Retract Offer.
- **R6.** Fix `notifyCustomerWorkflowCompleted` CTA URL to customer host.
- **R7.** Set `unreadMessages` properly in `get-customer-dashboard`.

### Structural (multi-PR)

- **R8.** Add `Customer Draft Review` step to TEP / Translation+Review / MTPE+Review / Medical templates. Schema (insert via migration into `workflow_template_steps`) + universal customer-step rendering.
- **R9.** Build the missing **counter-back UI** affordance — server endpoint + UI button. Resolves the biggest negotiation gap.
- **R10.** Drive customer-facing copy ("Translation Details", "Certified Translation") from `quote.service_type` rather than hardcoded literals. Fixes cognitive-debriefing-style services.
- **R11.** Split `OrderWorkflowSection.tsx` (5,995 lines) into `components/admin/workflow/{VendorFinderModal,VendorAssignModal,WorkflowPipeline,UnassignVendorModal,CounterOfferCard}.tsx` before adding the counter-back action.
- **R12.** Audit the 5 unused workflow templates — confirm whether to retire them or evangelize them.
- **R13.** Add per-vendor rate override to `offer_multiple`. Currency from each vendor's `preferred_rate_currency`.

### ISO 17100 readiness for Dec 2026 Stage 2 audit

- **R14.** Backfill `qms.role_qualifications` from `v_retroactive_qualification_candidates` + `cvp_applications` test scores. Mass UI-driven pass with PM signoff.
- **R15.** Add `requires_different_vendor_from_step int[]` column to `workflow_template_steps`. Server-side enforcement in `update-workflow-step` (direct_assign / offer_vendor / offer_multiple) before the existing `gateAssignment` call. Block §6.2 violations going forward.
- **R16.** Add `competence_basis_cited_id` to `order_workflow_steps`. Mandatory dropdown in VendorAssignModal "Cite qualification."
- **R17.** Flip `qms.config.assignment_gating_mode = 'block'` AFTER R14 (otherwise we block every assignment).
- **R18.** Soft-delete-only + WORM constraints on `notification_log` and `order_workflow_steps`.

### Connect recruitment to project sourcing

- **R19.** From a workflow step with no matching vendor, route to RecruitmentDetail seeded with the language pair + service + deadline. Closes the "no-match → dead end" PM trap.

---

## 10. Memory + audit trail

- This document committed at `docs/audits/2026-06-02-pm-flow-audit.md`.
- Memory entry: `decision_pm_audit_2026_06_02.md` linking to this doc, capturing the top-10 findings.
- Pre-existing test orders surveyed: ORD-2026-10275 (certified), ORD-2026-10279 (translation_only), ORD-2026-10254 (TEP), ORD-2026-10242 (TRSB, used earlier in session). No state mutated.
