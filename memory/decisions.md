# Decisions

Architectural, product, and business decisions made in this project — with rationale, so future sessions don't relitigate settled questions.

## Format
Append new entries at the top (newest first). For each:

```
### YYYY-MM-DD — Short decision title
- **Decision:** what was chosen
- **Rationale:** why
- **Alternatives considered:** what was rejected and why
- **Status:** active | superseded by [date] | reverted
- **Affects:** which parts of the codebase or product this touches
```

If a decision is later reversed or refined, mark the old one **superseded** rather than deleting — the history matters.

## Decisions

### 2026-05-14 — Security audit v2 lockdown (anon-EXECUTE on SECURITY DEFINER mutators + RLS on leaky tables)
- **Decision:** Sixth lockdown migration of the day. The emergency / v2 / v3 / v4 / v5 passes had closed the obvious customer-data leaks; the audit v2 re-run found two more tiers that none of them touched:
  1. **SECURITY DEFINER mutator functions still anon-callable** — `purge_storage_bucket`, `apply_customer_credit`, `create_invoice_from_order` (both overloads), `delete_document_group`, `refresh_daily_exchange_rate`, `recalculate_order_totals`, plus 21 other mutators. All revocable in one migration because each one is reached from the admin UI via authenticated session — revoking anon EXECUTE doesn't break admin.
  2. **RLS disabled + anon-readable** on `step_deliveries` (vendor work-product file paths + delivery notes), `branches` (full business addresses + BN15 tax numbers), `branch_payment_methods` (banking-detail schema, currently empty), `email_templates`, `staff` (had explicit `Anon can read staff for login` policy — dropped), `ai_audit_settings`, `conversion_fire_log` (advisor flagged session_id PII), `workflow_templates`, `workflow_template_steps`.
- **Strategy:** Revoke EXECUTE only from anon (not authenticated). RLS-helper functions (`cvp_is_active_staff`, `get_staff_id`, `current_customer_id`, etc.) intentionally stay anon-callable since RLS expressions invoke them in anon context. For tables, enable RLS + add `FOR SELECT TO authenticated USING (true)` + `FOR ALL TO service_role` (and for `conversion_fire_log`, service_role only since it's analytics-write).
- **Result:** anon-EXECUTE SECURITY DEFINER count dropped 40 → 13 (the remaining 13 are legitimate RLS helpers). Live-probed every locked-down table — anon now gets `[]` on every previously-leaky table. Live-probed every revoked function — PostgREST returns 404 (functions hidden when EXECUTE is denied) or 401 `42501 permission denied`. RLS-helper control (`cvp_is_active_staff`) still returns 200 for anon, confirming the RLS infrastructure was not broken.
- **Audit reports:** `Documents/cvp-audit-report-2026-05-14.md` (v1 — initial scope, mostly cvp-*) and `Documents/cvp-audit-report-2026-05-14-v2.md` (v2 — full `public` sweep that surfaced the 3 Critical / 12 High findings this migration closes). The Documents/ dir is gitignored; reports are local-only.
- **Open follow-ups (need code, not SQL):** H-2 staff body-trust on cvp-* edge functions, H-3 `cvp-get-cv-url` `verify_jwt=false`, H-4 OTP non-constant-time + plaintext + no lockout, H-5 cron endpoints unauthenticated, H-12 31 `security_definer_view` ERRORs, M-1 hardcoded anon-JWT fallbacks in 4 vendor-portal files, M-4 Netlify security headers, M-5 Sentry `beforeSend` PII scrub. 20 reference-data tables (currencies/languages/document_types/etc.) still RLS-off — safe in practice (existing anon SELECT policies make their behavior intentional) but worth a follow-up migration so the posture is explicit.
- **Migration:** `supabase/migrations/20260514_security_audit_v2_lockdown.sql` — applied to `lmzoyezvsjgsxveoakdr` 2026-05-14.
- **Status:** active.
- **Affects:** 27 SECURITY DEFINER functions (anon EXECUTE revoked), 9 tables (RLS enabled + new policies). No edge function or frontend changes.

### 2026-05-14 — Vendor email lookups: lowercase at the DB layer (DB trigger, not per-caller normalization)
- **Decision:** `vendors.email` and `vendors.additional_emails` are stored lowercase, enforced by a `BEFORE INSERT OR UPDATE` trigger (`vendors_normalize_email_trg` → `public.vendors_normalize_email()`). All email-based lookups (`vendor-auth-otp-send`, vendor-portal login, future code paths) can rely on `.eq("email", lower(input))` matching without a per-row `ILIKE` or `LOWER(email)` index.
- **Trigger incident:** Hammad Amin (`hammadamin97@gmail.com`) reported "No vendor account found for this email" on `vendor.cethos.com/login`. The row existed as `Hammadamin97@gmail.com` with capital H; the login lookup lowercased the typed email and used `.eq("email", normalized)` so no match. Sweep showed 13 of 1469 active vendors had mixed-case emails — silently locked out from OTP login. None collided when lowercased.
- **Why DB trigger, not per-caller normalization:** writes to `vendors.email` happen from at least 5 code paths — admin UI, edge functions, XTRF sync, applicant import (`import-applicant-vendors`), vendor-portal profile update. Normalizing at each call site invites drift; a single trigger covers every path including any future writer.
- **Vendor-portal frontend bug (separate, not fixed here):** the login page renders `"No vendor account found for this email"` instead of the anti-enumeration message the edge function returns (`"If a vendor exists, a code has been sent"`). That's an email-enumeration leak in `D:\cethos-vendor` and needs a separate PR there. Flagged but not blocking.
- **Migration:** `supabase/migrations/20260514_normalize_vendor_emails_lowercase.sql` — applied to `lmzoyezvsjgsxveoakdr` 2026-05-14.
- **Status:** active. Hammad's lookup verified post-migration.
- **Affects:** `vendors` table data (13 rows backfilled) + new trigger; no edge function or frontend changes in this repo.

### 2026-05-13 — Pricing-recalc safety after Stripe capture (ORD-2026-10201 incident)
- **Decision:** Quotes/orders are now **locked from automatic price recompute the moment any linked order has `amount_paid > 0`**. The lock lives at two layers — DB (`recalculate_quote_totals` and `recalculate_quote_from_groups` short-circuit via new `quote_is_post_payment_locked(quote_id)`) AND edge function (`update-quote-from-analysis` returns 409 if any linked order has `amount_paid > 0`). Once a customer has paid, the financial state is treated as authoritative; admin can still override numbers explicitly via direct UPDATE but recalc functions will never silently mutate.
- **Trigger incident:** QT26-10450 / ORD-2026-10201. Customer paid $167.48 via Stripe (pi_3TWlo0C6rvIcYTbw20L7jHYA). Staff/AI re-ran OCR analysis ~50s before the Stripe charge captured, lowering computed subtotal from $165 → $119.90. Then `recalculate_document_group` (which read soft-deleted `ai_analysis_results` because it lacked `deleted_at IS NULL`) overwrote quote/order totals to $88 / $92.40. Admin UI displayed $92.40 while Stripe had captured $167.48 — customer effectively overpaid by $75.08 from the system's perspective. Order was manually restored to $167.48 (subtotal $165, discount $5.50, tax $7.98) and tagged `manual_total_restored` in `quote_activity_log`.
- **Three companion bug fixes (same migration + edge fn):**
  - `recalculate_document_group` subqueries now filter `deleted_at IS NULL` on `ai_analysis_results` so stale soft-deleted rows can never re-enter group recalc.
  - `update-quote-from-analysis` resolves `quote_file_id` via `ocr_batch_files.quote_file_id` (filename fallback). Previously stored NULL with comment "Leave null to avoid FK violation" — but the FK target was reachable through the batch row. The severed link was the upstream cause of the group-vs-analysis drift.
  - `update-quote-from-analysis` now calls `recalculate_document_group(id)` for every group on the quote, then `recalculate_quote_from_groups(quote_id)`, at the end of the request. Groups stop being a stale parallel source of truth.
- **Migration:** `supabase/migrations/20260513_pricing_recalc_safety.sql` — applied to `lmzoyezvsjgsxveoakdr`.
- **Edge function deploy:** `update-quote-from-analysis` redeployed to `lmzoyezvsjgsxveoakdr` with `--no-verify-jwt`.
- **Architectural note (not fixed here):** `ai_analysis_results` and `quote_document_groups` remain two parallel pricing tables. The OCR & Analysis modal "Pricing" tab reads analysis; AdminQuoteDetail prefers groups when present. This PR keeps them synchronized on every analysis update but does not collapse them. A future refactor could pick a single source of truth; the current design is intentional because staff can re-group analysis files into different billing groups (with own cert, complexity, label).
- **Status:** active. Both halves shipped 2026-05-13.
- **Affects:** `recalculate_document_group`, `recalculate_quote_totals`, `recalculate_quote_from_groups`, new `quote_is_post_payment_locked` function, `update-quote-from-analysis` edge function. No frontend changes — admin UI now displays the restored $167.48 because the underlying row is correct.

### 2026-05-13 — Vendor ISO 17100 evidence collection: doc-request flow (Phase 1)
- **Decision:** Build a vendor-side mirror of the recruitment "Request Documents" pattern so admin can collect missing ISO 17100 evidence from already-onboarded vendors. Phase 1 ships the admin trigger + email send; Phase 2 adds a vendor-portal landing page that drives the existing upload + profile edit functions; Phase 3 auto-creates draft requests (status='draft', not auto-sent) when an ISO assessment lands `insufficient_evidence`.
- **Schema:** `vendor_document_requests` (id, vendor_id, request_token, request_token_expires_at, staff_id, staff_message, subject, body_html, `requested_items` jsonb, `source_assessment_id`, status [draft|sent|partial|completed|expired|superseded], completed_at). AFTER INSERT trigger `supersede_prior_vendor_document_requests` flips older open requests to `superseded` so there's only ever one active per vendor. Each item is `{slug, label, kind:'file'|'profile_field', profile_column?, completed_at}` — vendor portal flips completed_at as each item is satisfied.
- **Edge function:** `vendor-request-documents` — validates items, inserts the request row, sends Brevo email with tokenized link `${VENDOR_PORTAL_URL}/iso-evidence/{token}`, logs to `notification_log` (event_type `vendor_document_request`). 14-day default expiry, 1-60 clamp. `dry_run:true` returns preview without insert/send.
- **Shared module:** `client/lib/iso17100.ts` carries ISO_REQUEST_ITEMS (12 file types from recruitment list, slugs deduped from previously-colliding `experience_evidence` into `_2y`/`_5y`, plus 3 `profile_field` items for native_languages / years_experience / specializations). Plus `suggestRequestSlugsFromAssessment(result)` which scans the assessment evidence jsonb for `null` / `[]` markers and returns matching slugs — used for smart pre-select.
- **UI:** `VendorDocumentRequestSection` on the Documents tab between `IsoAssessmentSection` and `VendorReferencesSection`. Modal mirrors RecruitmentDetail's Request Documents modal — checkboxes grouped by ISO 17100 route (a/b/c) + verification/specialization/business/ongoing/profile groups, editable subject + body, smart pre-select from latest assessment when `overall_verdict='insufficient_evidence'`. Surfaces a purple banner pointing admin to the button when an insufficient-evidence assessment exists without an open request.
- **Open questions resolved 2026-05-13:**
  - Token = deep-link + require existing vendor login (not auto-login). Safer for PII; OTP login is already one-click.
  - Expiry: 14 days (same as references).
  - One active per vendor; supersede on new send (DB trigger).
  - NDA explicitly excluded from this list — gated separately on vendor portal (vendor cannot open profile until current NDA signed; that gate is sibling work).
  - Auto-trigger: don't auto-send. Phase 3 auto-creates `status='draft'` with smart-pre-selected items; admin sees banner, one-click to send. Human-in-the-loop on outbound email.
- **Status:** Phase 1 code committed, migration applied to `lmzoyezvsjgsxveoakdr`, edge function deploy pending explicit user authorization. Phase 2 (vendor portal `/iso-evidence/:token` page in `D:\cethos-vendor`) + Phase 3 (auto-draft + auto-rerun assessment) not started.
- **Affects:** new `vendor_document_requests` table; new `vendor-request-documents` edge function; new `client/lib/iso17100.ts`, `client/pages/admin/vendor-detail/VendorDocumentRequestSection.tsx`; modified `VendorDocumentsTab.tsx`. Future vendor repo: `/iso-evidence/:token` route + `vendor-resolve-doc-request` edge function.

### 2026-05-11 — Vendor negotiation agent: HITL → Auto graduated rollout
- **Decision:** Build a vendor counter-offer negotiator that ships HITL-first, then graduates to autonomous via an admin toggle. Aggressive counter-back tactic (30% anchor, not midpoint). All services enabled from day 1 — no per-service rollout list. Hard bounds enforced server-side: never above ceiling (20% of client rate), never below anti-lowball floor (12%). Claude can recommend an action and write reasoning but cannot break the bounds.
- **Schema:** `negotiation_settings` (singleton row — mode hitl/mixed/auto, confidence threshold, max uplift %, max deadline ext hours, paused kill switch, notify email, optional `auto_only_for_services` array — empty means all). `vendor_negotiation_decisions` (full audit + future training data — context snapshot, AI output, staff response, outcome columns ready for Phase 3 self-learning).
- **Edge functions:** `vendor-negotiate-counter` (loads offer + counter + pool stats + vendor history + COL + experience + test score, calls Claude Opus 4.7 with structured prompt, hard bounds enforced server-side, auto-executes accept/reject via `admin-respond-counter-offer` when mode allows; falls back to deterministic if Claude unavailable). `negotiation-hitl-reminder` (hourly pg_cron sweep, rolls undecided HITL recs >1h into a digest email, 8h re-remind window). Vendor repo `vendor-counter-offer` now wakes the negotiator asynchronously after `counter_status='proposed'`.
- **UI:** `/admin/settings/negotiation-automation` with mode radio, confidence slider, max uplift slider, pause kill switch, activity counters. AI recommendation card inside the existing counter-proposal panel in OrderWorkflowSection.
- **Phase plan:** Phase 1 (HITL) and Phase 2 (Auto toggle + cron + auto-trigger) shipped 2026-05-11. Phase 3 = outcome tracker + calibration dashboard + auto-threshold tuning. Phase 4 = fully automated rollout once calibration crosses 97% per service.
- **Counter-back one-click:** intentionally deferred — needs a dedicated admin-counter-back endpoint that doesn't exist yet. Counter actions stay HITL even when mode=auto.
- **Status:** active. PRs #571 (Phase 1), #572 (Phase 2), cethosvendorportal#71 (vendor counter trigger). All migrations applied, all edge functions deployed.
- **Affects:** `negotiation_settings`, `vendor_negotiation_decisions`, `vendor-negotiate-counter`, `negotiation-hitl-reminder`, `vendor-counter-offer` (vendor repo), `OrderWorkflowSection.tsx`, new `NegotiationAutomationSettings.tsx`.

### 2026-05-11 — AI vendor rate suggester: 20% ceiling, hybrid deterministic + Claude
- **Decision:** When suggesting a rate for a new vendor, anchor at 20% of the client per-page price (median of `ai_analysis_results.base_rate` for the source lang; CAD $65 fallback when <5 samples). Multiply by: test-score bucket (0.70–0.95) × country COL bucket (0.85–1.10 from World Bank-style 4 tiers) × experience tier (0.95–1.10 from 0-2y / 3-5y / 6-9y / 10y+). Clamp to ceiling. Hard anti-lowball floor: never below 12% of client rate regardless of score/country/experience — "don't insult with a lowball" is an explicit rule. Claude Haiku 4.5 writes the reasoning paragraph but never picks the number (keeps ISO 17100 audit clean). Falls back to template if Claude unavailable.
- **20% (not 30%):** explicit staff direction — leaves room to negotiate up from the AI anchor.
- **Schema:** `vendor_rate_suggestions` table — full audit (inputs, modifiers, ai_reasoning, ai_reasoning_source claude/template, prompt_version). Every historical suggestion is reproducible.
- **Surfaces:** `VendorRatesTab` "Suggest rate" button (single-lane add), per-test-combination "Suggest rate" inline button on `RecruitmentDetail`.
- **Per-word lanes deferred:** current per-word data on this project is direct-order target-mode noise, not real per-word client pricing. Phase 2+ when real data accumulates.
- **Status:** active. PRs #567 (Phase 1, 30% ceiling), #570 (Phase 2, COL+experience+Claude), 20% adjustment merged with #567. Edge function `cvp-suggest-vendor-rate` deployed.
- **Affects:** `vendor_rate_suggestions`, `cvp-suggest-vendor-rate`, `VendorRatesTab.tsx`, `RecruitmentDetail.tsx`.

### 2026-05-11 — Target-based pricing = DEFERRED (no payable until settled), not flat-price
- **Decision:** "Target" pricing mode on vendor offers means the task is created WITHOUT a financial commitment — no `vendor_payables` row is inserted, indicative total is optional. NOT a flat-amount price. This is the escape hatch for "I'm assigning the vendor now, will settle the rate later" instead of seeding a dummy rate as staff were doing before.
- **Rationale:** Initial v1 of the target toggle treated it as a flat-amount price (just enter the total). User clarified after testing: "the idea of target based is that we are able to create an order without payables and receivables." Reframed.
- **UI:** Admin offer modal toggle renamed "Target (no payable)" with helper text. Indicative total field is optional — leave blank to defer entirely. `canSubmit` no longer requires a target total. Workflow card renders "Target · Pricing TBD" when no total, "Target · $X (indicative)" when an indicative amount was entered.
- **Finance tab "Target amount"** was actually a flat-price receivable concept (receivables are added manually with known numbers) — to avoid name collision, renamed to **"Flat amount" / Flat badge** there.
- **`update-workflow-step`:** skips the `vendor_payables` insert when `pricing_mode='target'` for both direct_assign and offer_vendor. Vendor portal handles null total in target mode with "Pricing TBD".
- **Status:** active. PRs #563 (Phase 1, flat-amount semantics), #564 (semantic fix to deferred), #569 (recruitment inline rate suggest + Request Documents).
- **Affects:** `pricing_mode` columns on `order_receivables`, `vendor_step_offers`, `order_workflow_steps`. `update-workflow-step`, `vendor-get-jobs`, `vendor-get-job-detail`, `get-order-workflow`, `OrderWorkflowSection.tsx`, `OrderFinanceTab.tsx`, vendor portal `JobBoard` + `JobDetailModal` + `JobActionModals` + `NegotiateModal`.

### 2026-05-11 — Edge-function deployment convention: --no-verify-jwt, self-validate
- **Decision:** Standard pattern across both admin (`cethos_app_figma_design_v1`) and vendor (`cethos-vendor`) repos: deploy edge functions with `--no-verify-jwt`. Each function validates its own session/auth internally where needed. Vendor portal uses a custom session token (not Supabase auth) — gateway JWT verification can't validate it. Applicant flows (cvp-submit-*) need to be reachable without any auth at all. Staff functions use `supabase.functions.invoke` which attaches the staff Supabase JWT, but the function still receives it as a header — it doesn't depend on gateway verification.
- **Trigger:** Discovered 35 cvp-* + 13 vendor-* functions had source committed but were never deployed (404 in console). One batch deploy via `supabase functions deploy <name> --no-verify-jwt`. User explicitly authorized: "B deploy them in batch".
- **Audit note:** Previously two functions (`generate-order-instructions`, `cvp-get-cv-url`) were also undeployed and 404'd quietly. Lesson: don't assume a function exists just because the source is in the repo.
- **Hand-rolled fetch pitfall:** `callEdgeFunction` in `RecruitmentDetail.tsx` was using raw `fetch` with no Authorization/apikey headers — Supabase gateway 401'd functions with `verify_jwt=true`. Fixed by switching to `supabase.functions.invoke` (PR #565). Pattern: prefer `supabase.functions.invoke` over hand-rolled fetch unless you have a specific reason.
- **Status:** active convention.
- **Affects:** every edge function deployment in this project.

### 2026-05-11 — ISO 17100 readiness: a recurring constraint
- **Decision:** Every AI-driven decision (rate suggestions, negotiation, document analysis) must produce an audit trail that an ISO 17100 auditor can verify. Implications across features:
  - Store the exact inputs the AI saw (context snapshot)
  - Store the AI's output (action + reasoning + confidence)
  - Store the deterministic policy parameters (multipliers, thresholds, prompt_version)
  - Never let Claude pick a number that bypasses hard-coded bounds — Claude writes reasoning, deterministic code picks the rate
- **Document workflow plan:** `Request Documents` button shipped on RecruitmentDetail (PR #569). 9 ISO 17100 doc types as checkboxes (degree / professional cert / experience evidence / 2 references / language proficiency / specialization / business reg / insurance / NDA). Email body auto-syncs with selected types. Sends via Brevo raw email + `cvp_outbound_messages` audit. Full upload UI + AI doc analysis + ISO readiness scorecard still pending.
- **Vendor docs upload:** planned but not built. Schema would be `vendor_documents` (file + type + AI analysis + verification status) on a private `vendor-iso-documents` bucket.
- **Status:** ongoing constraint. Reference back to this on any feature touching vendor competence evidence.
- **Affects:** all AI-driven features. Specifically `vendor_rate_suggestions`, `vendor_negotiation_decisions` audit columns.

### 2026-05-11 — Show internal project number on orders list
- **Decision:** Orders list (`AdminOrdersList`) shows the PRJ-YYYY-NNNNN under the ORD-XXXX whenever the order is linked to an internal project. Implemented via embed of `internal_projects(project_number)` through existing `internal_project_id` FK. No new schema.
- **Status:** active. PR #566.
- **Affects:** `AdminOrdersList.tsx` only.

### 2026-05-11 — Custom file label + per-file picker in direct-order create
- **Decision:** File uploads in direct-order create get a per-file category dropdown (Source Document / Files to Work Upon / Reference File / Glossary / Style Guide / Custom). "Custom" reveals a free-text label input stored on `quote_files.custom_label`. Source-list badge prefers `custom_label` over the standard category name when both exist.
- **New file category:** `work_files` ("Files to Work Upon") for working files the vendor edits directly (bilingual files, in-progress translations) — distinct from "Source Document".
- **Status:** active. PRs #562 (work_files), #563 (custom + direct-order picker).
- **Affects:** `file_categories` table, `quote_files.custom_label`, `upload-staff-quote-file` (accepts `custom_label`), `AdminCreateOrder.tsx`, `AdminOrderDetail.tsx`.

### 2026-05-08 — Direct-order PO moves from order-level to per-receivable-line
- **Decision:** For `is_direct_order = true` orders, the PO number (and client project number per line) lives on `order_receivables.po_number`, not on `orders.po_number`. Quote-converted orders (certified/OCR/website checkout) are unchanged — they keep using `orders.po_number`.
- **Rationale:** Agency clients (TRSB pattern) bill a single direct order against multiple POs sent at different times after delivery. The order-level single PO field can't model that. The new model is also a cleaner billing primitive: receivable lines map 1:1 to invoice lines.
- **DB shape:** new `order_receivables` table (`20260508_order_receivables_table.sql`) with status `draft | invoiced | voided`. AFTER trigger `trigger_recalc_direct_order_on_receivable_change` recomputes `orders.{subtotal,tax_amount,total_amount,balance_due}` whenever a receivable changes. `recalculate_direct_order_totals(p_order_id)` is the recalc function (renamed from a collision with the existing quote-derived `recalculate_order_totals`).
- **Invoice gating:** `guard_invoice_issue_requires_po` updated (`20260508_invoice_issue_po_guard_receivables.sql`). For direct orders, blocks invoice issue if any non-voided receivable lacks a PO. For quote-converted orders, keeps the existing `orders.po_number` check.
- **UI:** AdminOrderDetail's Finance tab shows the editable receivables list when `is_direct_order && orderId`, falling back to the legacy read-only `ReceivableBreakdown` for quote-converted orders. The order-level "PO & Project Reference" card lost its PO column (project picker is now a typeahead over `internal_projects` with inline create). AdminCreateOrder's direct-order mode no longer has a PO input — replaced with a hint pointing to the finance tab.
- **PRs:** #540 (schema + recalc + backfill), #541 (editable list), #542 (guard + project picker + Brevo modal), #545 (drop top-level PO from create flow).
- **Status:** active. `orders.po_number` column kept for one quiet release; PR #5 will drop it once at least one direct order has run end-to-end on the new model.
- **Affects:** `order_receivables` table, `OrderFinanceTab.EditableReceivablesBreakdown`, `AdminOrderDetail` Project Reference card, `AdminCreateOrder` direct-order branch, `guard_invoice_issue_requires_po` trigger.

### 2026-05-08 — Brevo email log modal as the standard diagnostic
- **Decision:** Whenever a notification feature ships, an admin-side "Email log" link must be reachable from the relevant entity (vendor, customer, etc.) so staff can verify Brevo actually sent the email. Don't trust "I sent it" without checking the log.
- **Rationale:** Discovered that `update-workflow-step` had no email-sending code at all on `direct_assign` / `offer_vendor` / `offer_multiple` — vendors were never notified, and we had no way to see this from the admin UI. Brevo events confirmed zero outbound mail to the impacted vendor in 90 days.
- **Plumbing:** new edge function `get-brevo-email-events` (jwt off) wraps `/v3/smtp/statistics/events` + `/v3/smtp/emails`. New `BrevoEmailLogsModal` consumes it. Wired into `OrderWorkflowSection` as a small "Email log" button next to each step's vendor row.
- **Status:** active. Pattern: when adding a new notification trigger, also surface the related entity's Brevo log in the admin UI.
- **Affects:** `supabase/functions/get-brevo-email-events`, `client/components/admin/BrevoEmailLogsModal.tsx`, any future notification feature.

### 2026-05-05 — Cethos CAT integration parked (not a today task)
- **Decision:** Don't squeeze a Cethos CAT integration into the same session as Phases 1–5. Treat it as its own initiative.
- **What it is:** `D:\cethos\TM-Cethos` (`cethos-cat` v0.1.0) is a full XTM/Trados-class CAT editor — segment-level translation, TM/termbase leverage, QA profiles, translator/reviewer/PM/admin roles. Has its own Supabase project `idzwtssftpxrsprzjael` (separate from the portal's `lmzoyezvsjgsxveoakdr`) and its own `clients`/`jobs`/`segments` data model.
- **Existing integration plumbing:**
  - `POST /api/jobs/ingest` — Bearer-API-key (`scope=tms_ingest`). Body accepts source file (b64 or URL), source/target lang, `external_ref`, `client_external_ref`, `assigned_to_email`, `qa_profile_id`, `tm_ids`, `termbase_ids`, deadline.
  - `/sso?token=...&job=...` — vendor portal → CAT handoff via signed JWT.
- **Why not today:** Real design decisions required — identity mapping (portal `customers`/`companies` ↔ CAT `clients`), TM scoping (per project / client / lang pair), when to push (order create / vendor accept), round-trip (segment harvest back to `step_deliveries`), API key + env wiring, SSO from vendor job detail. Easily 1–2 weeks done well.
- **Smallest plausible slice (when picked up):** "Open in Cethos CAT" link on `AdminProjectDetail` using `client_project_number` as the `client_external_ref` bridge. Half-day if CAT has a matching landing route, longer if that route needs to be added on the CAT side.
- **Status:** parked — revisit as a dedicated initiative, not as an ad-hoc add-on.
- **Affects:** future `AdminProjectDetail.tsx`, future portal env (`CAT_API_KEY`, `NEXT_PUBLIC_CAT_URL`), future edge function for job push, future vendor portal SSO link.

### 2026-05-05 — Project asset uploads: glossary + style guide (Phase 5)
- **Decision:** Staff can upload a glossary file and a style guide file per project on `AdminProjectDetail`. Files surface to vendors as Reference Materials on the job detail, tagged with source so vendors can spot which is the project glossary vs project style guide.
- **Storage:** new private `project-assets` bucket. Path scheme `{project_id}/glossary/{filename}` and `{project_id}/style-guide/{filename}`. 50 MB cap, allowed MIME types: PDF, Word, Excel, ODT, ODS, TXT, CSV, MD.
- **Access:** authenticated staff get full CRUD via portal; vendors never touch the bucket directly — they receive 1-hour signed URLs minted by `vendor-get-job-detail` (service role).
- **Re-upload behavior:** uploading a different filename deletes the old object first (avoids orphaned files). Same filename uses upsert.
- **Implementation:** migration `20260505_project_assets_bucket.sql` (applied), `AdminProjectDetail.tsx` Assets section with upload/replace/remove + signed-URL download, `vendor-get-job-detail` v30 prepends signed URLs to `reference_files` with `source: "project_glossary"` / `"project_style_guide"`, vendor `JobDetailModal` shows the source label as a small green badge above each row.
- **Status:** active.
- **Pending:** none for the basic asset flow. Translation memory at the project level stays a future workstream.
- **Affects:** `internal_projects.{glossary,style_guide}_storage_path` (already in schema), new `project-assets` storage bucket, `AdminProjectDetail.tsx`, `vendor-get-job-detail` edge function, vendor `JobDetailModal`.

### 2026-05-05 — Vendor stickiness in assignment (Phase 4)
- **Decision:** When staff use the vendor finder for a step on an order linked to an internal project, vendors who delivered prior tasks on that same project receive a `prior_project_tasks` count + match-score boost (+30 per prior task, capped at 100). UI shows a teal "↪ N prior tasks on this project" badge.
- **Rationale:** Closes the original recurring-client consistency goal at the assignment step itself — staff naturally see the prior contributor first when sending a new task. Vendor notes (Phase 2c) help the vendor stay consistent; stickiness helps avoid even needing to switch in the first place.
- **Statuses counted as "prior task":** `delivered`, `under_review`, `approved`, `completed` on `order_workflow_steps` for orders sharing the same `internal_project_id`. Pending / offered / declined steps don't count — only actual work.
- **Cap rationale:** +100 max keeps a super-prolific vendor from monopolizing every offer regardless of fit; rating, language, and availability still matter.
- **Status:** active — `find-matching-vendors` v30 deployed to `lmzoyezvsjgsxveoakdr`. UI changes in `OrderWorkflowSection.tsx`.
- **Affects:** `find-matching-vendors` edge function, `OrderWorkflowSection.tsx` (`VendorFinderModal` props + main component fetch).

### 2026-05-05 — Inline editing of project name + vendor notes (Phase 2c)
- **Decision:** Add inline edit on `AdminProjectDetail` for two fields: `name` (staff-only internal name) and `vendor_notes` (visible to vendors on their job-detail "Project" banner).
- **Rationale:** Phase 3 wired the vendor display to read `vendor_notes`, but staff had no UI to populate it — only direct DB edits. This closes the loop so the feature actually carries notes in production.
- **Pattern:** Click "Edit" → input/textarea + Save/Cancel. Saves via direct `supabase.from("internal_projects").update(...)` (RLS already allows authenticated update).
- **Out of scope:** Glossary / style guide file uploads (`glossary_storage_path`, `style_guide_storage_path`). Storage bucket + signed-URL plumbing not built yet; revisit when the need shows up.
- **Status:** active.
- **Affects:** `AdminProjectDetail.tsx` only.

### 2026-05-05 — Project navigation: list, detail, banner, sidebar (Phase 2b)
- **Decision:** Add `/admin/projects` (list) and `/admin/projects/:id` (detail with read-only Tasks list of all linked quotes + orders), a "Projects" sidebar link, and a banner on the order detail page linking back to the project.
- **Rationale:** Phase 1 was accumulating projects in production, but staff had no way to navigate them. The detail view is the answer to "find all tasks in a particular project."
- **Project list query:** plain `internal_projects` SELECT with customer/company joins; client-side text filter. Limit 200, server-side ordered by `updated_at`. Sufficient for now; revisit when project count outgrows it.
- **Banner approach:** separate fetch in AdminOrderDetail (one query for project_number, one count query for sibling tasks). Avoids modifying the existing massive `*` SELECT in `fetchOrderDetails`.
- **Tasks list:** merges quotes + orders into one chronological list. An order created from a quote shares the same `internal_project_id`, so both rows appear; staff can drill into either.
- **Status:** active — committed but not yet exercised in production. Verify by visiting `/admin/projects/{first-real-project-id}` once a few orders accumulate.
- **Affects:** new `AdminProjectsList.tsx`, new `AdminProjectDetail.tsx`, `App.tsx` routing, `AdminLayout.tsx` nav, `AdminOrderDetail.tsx` (interface + banner). No schema or edge-function changes.

### 2026-05-05 — Project picker typeahead in AdminCreateOrder (Phase 2a)
- **Decision:** Replace the plain `client_project_number` text input with a typeahead that searches existing `internal_projects` for the picked customer's company (or customer if no company). Matches against `project_number` (PRJ-YYYY-NNNNN), `client_project_number`, and `name`.
- **Rationale:** Once Phase 1 started auto-stamping projects in production, staff needed visibility into existing projects to avoid creating dupes via inconsistent typing of `client_project_number`.
- **Linking strategy:** Picker pre-fills `clientProjectNumber` from the picked project's `client_project_number`; backend `find_or_create_internal_project` RPC then matches the same project on submit. No edge-function changes needed.
- **Filter:** Picker only surfaces projects with `client_project_number IS NOT NULL`. Anonymous projects (auto-created from one-off orders with no client label) are not pickable here — picking them and pre-filling from `project_number` would create a NEW project with PRJ-... as its label rather than re-link. They'll be reachable from the project detail page (next phase).
- **Status:** active — committed but not yet exercised in production. Verify by creating a direct order and confirming the typeahead surfaces existing projects.
- **Affects:** `client/pages/admin/AdminCreateOrder.tsx` only. No schema or edge-function changes.

### 2026-05-05 — Internal project numbers (PRJ-YYYY-NNNNN) for vendor-facing grouping
- **Decision:** Cethos-generated internal project numbers group related quotes/orders. Used in all vendor-facing communication instead of the client-supplied `client_project_number`.
- **Rationale:** Business clients submit recurring tasks under the same project at different dates; vendors need continuity context (prior tasks, glossary, style guide) to stay consistent. The raw `client_project_number` may carry client identifiers and shouldn't reach vendors.
- **Format:** `PRJ-YYYY-NNNNN` — matches existing `QT-YYYY-NNNNN` and `INV-YYYY-NNNNNN` conventions.
- **Scope:** Project keyed by `company_id` when present (multiple buyer contacts at the same company collapse into one project); falls back to `customer_id` for retail/certified one-offs.
- **Lifecycle:** `find_or_create_internal_project()` RPC: same `(company_id, client_project_number)` → link to existing; new combo → fresh PRJ number. Every quote and every order has exactly one project.
- **Alternatives considered:** Auto-find-or-create by free-text `client_project_number` only (rejected: typos cause silent dupes); raw `client_project_number` shown to vendors (rejected: anonymization risk); no project entity, group by query (rejected: nowhere to centralize glossary/style guide/vendor notes).
- **Status:** active — Phase 1 (schema + 4 order-creation edge functions) deployed to project `lmzoyezvsjgsxveoakdr` 2026-05-05.
- **Affects:** `internal_projects` table; edge functions admin-create-order, create-fast-quote, create-fast-quote-kiosk, crm-create-order. Pending: order form picker UI in `AdminCreateOrder.tsx`, project detail page, vendor portal display.

### 2026-05-05 — Customer-name anonymization to vendors: not required
- **Decision:** Do not pursue scrubbing customer name from vendor-facing surfaces. Vendors may continue to see customer first name / company name on job detail, file paths, and message threads as they do today.
- **Rationale:** Confirmed by Raminder 2026-05-05 after Phase 3 shipped. The PRJ-YYYY-NNNNN abstraction is the only client-identifier change wanted; deeper anonymization is not a goal.
- **Status:** active — supersedes the earlier "deferred / parked" entry from this same date. Don't relitigate.
- **Affects:** nothing — explicit non-action.

### 2026-05-11 — Pricing convention normalization: subtotal = translation only
- **Decision:** Across `quotes`, `orders`, `customer_invoices`, and per-row `ai_analysis_results` / `quote_document_groups`, `subtotal` and per-row `line_total` mean **translation cost only**. Certification is always carried in a separate `certification_total` / `certification_price` field. The pre-tax line is `subtotal + certification_total + rush_fee + delivery_fee + surcharge_total - discount_total`. Percentage rush and percentage adjustments compute their base from `subtotal + certification_total` (option B — the "goods and services" line, before any fees).
- **Rationale:** Before this change, `recalculate_quote_totals` (analysis path) stored `subtotal = translation + cert` while `recalculate_quote_from_groups` (groups path) stored `subtotal = translation only`. Every downstream consumer hard-coded one assumption — `loadOrderFinancials`, `OrderFinanceTab`, `OrderFinanceSection`, `AdminQuoteDetail`, the invoice PDF generator — so the Order Finance "Receivable Breakdown" added certification a second time and showed Pre-tax `$179` on a `$145.95` order. Option B was chosen because it is the only convention where `pre_tax = SUM(addends)` holds with one formula in every consumer.
- **Migration:** `supabase/migrations/20260511_normalize_subtotal_convention.sql` replaces 4 PL/pgSQL functions (`recalculate_document_totals`, `recalculate_document_group`, `recalculate_quote_totals`, `recalculate_quote_from_groups`). No backfill — historical rows transition to the new convention the next time their parent quote gets recalculated. `quotes.total` / `orders.total_amount` are correct under both conventions, so bottom-line dollars never change.
- **Frontend strategy for old rows:** every display computes `pre_tax = total − tax_amount` rather than summing components. Correct under both pre- and post-migration semantics, so old records render right immediately without needing a backfill.
- **Reference:** [docs/pricing-convention.md](docs/pricing-convention.md) — formulas, worked example, code patterns.
- **Status:** code merged on this branch; migration drafted but NOT yet applied to prod (`lmzoyezvsjgsxveoakdr`) — pending explicit apply call.
- **Affects:** `recalculate_*` SQL functions; `generate-invoice-pdf` label rename; client display in `AdminQuoteDetail.tsx`, `OrderFinanceTab.tsx`, `OrderFinanceSection.tsx`, `EditOrderModal.tsx`, `FastQuoteCreate.tsx`, `KioskStaffForm.tsx`, `Step4ReviewCheckout.tsx`. `get-order-workflow/loadOrderFinancials` needed no formula change — its `pre_tax = subtotal + cert + …` is correct under the new convention.

### 2026-05-11 — Vendor offer notification: audit-log every send to notification_log
- **Decision:** The shared `_shared/notify-vendor-assignment.ts` helper now writes a row to `notification_log` (event_type `vendor_offer` or `vendor_assignment`) for every Brevo send — both success (with Brevo `messageId` in metadata) and failure (with the API error). Linked to `offer_id` so the audit trail joins back to `vendor_step_offers`.
- **Rationale:** During the ORD-2026-10193 investigation we could not confirm from DB alone whether the 12 offer emails actually reached Brevo. The helper was fire-and-forget with only console logs. The customer/admin email paths already use `notification_log` — this aligns vendor emails with the same pattern.
- **Caller change:** `update-workflow-step` `offer_vendor` and `offer_multiple` cases now capture the inserted `vendor_step_offers.id` and pass it through as the new `offer_id` arg.
- **Status:** code merged on this branch; not yet deployed to prod.
- **Affects:** `supabase/functions/_shared/notify-vendor-assignment.ts`, `supabase/functions/update-workflow-step/index.ts`.

### 2026-05-11 — Vendor-portal "Offered" tab status-filter bug (vendor repo)
- **Decision:** `vendor-get-jobs?tab=offered` in the vendor portal repo (`D:\cethos-vendor`) was filtering `vendor_step_offers.status = 'sent'`. The admin's `update-workflow-step` writes `status = 'pending'`. Production has zero rows with `status='sent'`. Fixed by changing the vendor filter to `'pending'` (both the tab query and the counts query).
- **Rationale:** Pure data-contract mismatch — vendors literally cannot see any of their offers in the in-app portal. Discovered while investigating why Randy Van Mingeroet's "Jobs > Offered" tab showed "No job offers at the moment" despite having a pending offer for ORD-2026-10193.
- **Status:** committed in `D:\cethos-vendor` on the same date; not yet deployed.
- **Affects:** `D:\cethos-vendor\supabase\functions\vendor-get-jobs\index.ts` only.
