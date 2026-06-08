# Cethos PM Workflow — Comprehensive Training Guide

**Audience:** Cethos Project Managers, Operations staff, and new admin hires
**Surfaces covered:** [portal.cethos.com](https://portal.cethos.com) (admin) and [vendor.cethos.com](https://vendor.cethos.com) (vendor)
**Authored:** 2026-06-08 — every screenshot in this doc was captured against the **real production portal** during a single end-to-end walkthrough on order **ORD-2026-354733**
**Source of truth:** the Cethos Design System (admin portal repo `D:\cethos\portal\cethos_app_figma_design_v1`)

> **Screenshot index:** every `![label](screenshots/NN-name.png)` reference in this doc maps to a captured screenshot ID listed in [screenshots/INDEX.md](screenshots/INDEX.md). When converting this guide into the training PPT, source each image by its ID from the original capture session.

---

## Table of contents

- [0. Concepts & vocabulary](#0-concepts--vocabulary)
- [1. Order detail page](#1-order-detail-page)
- [2. The Workflow pipeline](#2-the-workflow-pipeline)
- [3. Splitting a step across multiple assignees (new feature)](#3-splitting-a-step-across-multiple-assignees-new-feature)
- [4. Find Vendor & Assign Vendor](#4-find-vendor--assign-vendor)
- [5. Manage Payable — five pricing modes](#5-manage-payable--five-pricing-modes)
- [6. Vendor portal — what the vendor sees & does](#6-vendor-portal--what-the-vendor-sees--does)
- [7. Reviewing the vendor's delivery](#7-reviewing-the-vendors-delivery)
- [8. Customer invoicing & Accounts Receivable](#8-customer-invoicing--accounts-receivable)
- [9. Vendor invoicing & Accounts Payable](#9-vendor-invoicing--accounts-payable)
- [10. Visual cues — quick reference](#10-visual-cues--quick-reference)
- [11. Troubleshooting](#11-troubleshooting)
- [12. FAQ](#12-faq)
- [13. Glossary](#13-glossary)
- [14. Related documents & memory](#14-related-documents--memory)

---

## 0. Concepts & vocabulary

Cethos translation work flows through a small set of database concepts you'll see referenced across the portal. Before you click anything, make sure these are clear:

| Term | What it means | Database |
|---|---|---|
| **Customer** | The end client who placed the order (individual or business). | `customers` |
| **Company** | The customer's parent company (only set for business customers). | `companies` |
| **Quote** | The pre-order pricing artifact. Every order originates from a quote. | `quotes` |
| **Order** | The committed translation job. Created when the quote is accepted. | `orders` |
| **Quote files** | The source / reference files attached to the quote (so they carry through to the order). | `quote_files` |
| **Workflow** | The set of steps an order must pass through. Picked from a workflow **template** when the order is created. | `order_workflows`, `workflow_templates` |
| **Step** | One unit of work within a workflow (Translation, Customer Review, Certification, etc.). | `order_workflow_steps` |
| **Actor type** | Who does a step: `external_vendor`, `internal_work` (in-house staff), `internal_review`, `customer`, `automated`. | `order_workflow_steps.actor_type` |
| **Vendor** | A freelance translator or agency external to Cethos. | `vendors` |
| **Vendor offer** | A pending invitation to a vendor to take a step. They can accept / decline / counter. | `vendor_step_offers` |
| **Step delivery** | A versioned upload of vendor-completed work against a step. | `step_deliveries` |
| **Vendor payable** | The financial obligation Cethos owes the vendor for a step. | `vendor_payables` |
| **Customer invoice** | The financial obligation the customer owes Cethos for the order. | `customer_invoices` |
| **Vendor invoice** | The invoice a vendor submits to Cethos to claim payment for approved payables. | `cvp_payments` / `vendor_invoices` |
| **Split step** *(new)* | A workflow step partitioned across multiple vendors / in-house staff with per-file scope. Parent step is the umbrella; children are the actual work units. | `order_workflow_steps.parent_step_id`, `is_split`, `partition_index`, `step_files` |

The state machine for a step is:

```
pending  →  offered  →  accepted  →  in_progress  →  delivered  →  approved
                  ↓ (vendor declines)             ↓ (revision)
              cancelled                         revision_requested
```

The `recompute_order_work_status` trigger keeps `orders.work_status` in lockstep with the step states. **Split children** roll up to the parent first (via `recompute_parent_step_status`), then the parent's state feeds the order.

---

## 1. Order detail page

Open any order from the **Orders** index or by direct URL:

```
https://portal.cethos.com/admin/orders/{order_id}
```

The page has a fixed left navigation, a wide main column for content, and a sticky right column for messaging + delivery + activity.

![Order detail header](screenshots/01-order-detail-header.png)

**Header band (top):**
- **Order number** — large title (`ORD-2026-354733`).
- **Open in Dropbox** — opens the order's Dropbox folder if one is linked (see `feature_dropbox_files`).
- **Sync** — pushes file changes back to Dropbox if the integration is connected.
- **View Quote (QT-...)** — jumps to the source quote.
- **Edit Order / Cancel Order** — destructive actions go through confirmation dialogs.
- **Order Status** dropdown — high-level state (`Completed`, `Cancelled`, etc.).
- **Work Status** dropdown — derived from workflow steps via trigger, but staff can override to `on_hold` or `cancelled` and the trigger will respect that intent.
- **Unbilled / Billed** badge — invoicing snapshot.

**Customer Information card** carries `Full Name`, `Email`, `Phone`, `Type` (Individual / Business). The "View as customer" link uses `admin-impersonate-customer` to switch you into the customer-portal view with a red impersonation banner so you don't forget you're not really them.

**Project Reference card** — optional `Project #` you can set inline. Useful when the same internal project spans multiple orders.

**Translation Details card** — `Source Language`, `Target Language`, `Intended Use` (e.g. `Immigration Canada — General`), `Certification Type` (e.g. `Oath Commissioner`).

**Documents section** lists the order's source files. Below that the page shows three categories:
- **Source documents** — what the vendor will translate.
- **Reference files** — auxiliary context (style guides, glossaries) the vendor may consult but doesn't translate.
- **Translations & Other Files** — split into **Draft translations** (pending review) and **Completed translations** (approved finals).

**Right column:**
- **Messages** — direct customer messaging. Ctrl+Enter sends; the customer gets an email.
- **Delivery** card — Turnaround Speed, Physical / Digital Delivery, Delivery Fee, Promised Delivery, Actual Delivery.
- **Activity** feed — recent events, manual payments, order created timestamp.

> **Tip:** the **work_status** trigger respects staff intent. If you manually set work_status to `on_hold` the trigger will NOT clobber that back to `in_progress` even if the steps are active. Setting it to `cancelled` is terminal. Anything else (`pending`, `in_progress`, `completed`) gets recomputed from the steps.

---

## 2. The Workflow pipeline

Scroll past Documents to reach the **Workflow / Client Communications / Finance** tab strip. The default tab is **Workflow**.

![Workflow pipeline with Split buttons](screenshots/02-workflow-pipeline.png)

**Header strip:**
- Template name + **+ Add Step** + overall status pill
- Progress bar `N/M steps (X%)` based on `approved + skipped` over `total non-cancelled`
- Financial roll-up `Customer subtotal · Vendor cost · Margin %` — green dot if margin ≥ minimum margin (default 30%), amber if below.

**Each step card carries:**
- **Step number + name** (e.g. *Step 1: Translation*).
- **Actor type pill** (Vendor / Customer / Internal (Work) / Internal Review) — color-coded.
- **Assignment summary** ("Not assigned", or vendor name, or staff name).
- **Language pair** (Spanish (Spain) → English).
- **Right-side controls** depending on state:
  - Move up / Move down arrows (only when status is `pending`).
  - **Status pill** (Pending / Offered / Accepted / In progress / Delivered / Approved / Skipped / Cancelled).
  - `⤴ Split…` pill — the new split action, gated on eligibility (see §3).
  - **× Remove step** (only for terminal / pending states).
  - **▶/▼ chevron** to expand or collapse the card.

**When is the `⤴ Split…` action shown?**
- Step has **no `step_deliveries` rows yet** (no work has been done).
- Step has **no vendor assigned** (`vendor_id IS NULL`) — unassign first if a vendor exists.
- Step has **no live `vendor_payables` row** (none in pending / approved / invoiced / paid status).
- Step is **not already split** (`is_split = false`) and **not the child** of a split (`parent_step_id IS NULL`).
- Step's `actor_type` is `external_vendor` or `internal_work`.
- Step `status` is `pending` or `offered`.

If any of those conditions is false, the button hides. The server (`split-step` edge function) re-checks every one of these on submit — so a stale UI can never sneak a bad split into the DB.

> **Why these gates?** Splitting a step that already has deliveries would orphan the existing work; splitting one with an active payable would leave that payable pointing at a parent that won't ship as a billable unit. Both situations corrupt the QMS audit trail. Force-clean these states first.

---

## 3. Splitting a step across multiple assignees (new feature)

> **Use case:** Translation step has 3 files. You want files 1 and 3 sent to two different vendors (capacity / language coverage), and file 2 to stay in-house because it's short and urgent.

### 3a. Opening the modal

Click `⤴ Split…` on Step 1.

![Split Step modal — initial state](screenshots/03-split-modal-empty.png)

**Modal anatomy:**
- **Header**: `Split step across multiple assignees`
- **Subheader**: `Step N · {Name} · {Source} → {Target} · {N files}` — this is your scope-at-a-glance.
- **Body** is a two-pane layout: **`Order files`** (left) and **`Partitions`** (right).
- **Footer** shows live validation status + `Cancel` / `Save split (N)` buttons.

**Left pane — Order files:**
- Every `quote_files` row for the order's quote, ordered by `original_filename`.
- Each file shows the original filename, page count, word count (from `ai_analysis_results` — see Troubleshooting §11 if these show `—`).
- A `P1` / `P2` / `P3` badge appears once the file is assigned to a partition. The file row dims to indicate it's been placed.

**Right pane — Partitions** (initially one empty card).

### 3b. Configuring a partition

**Each partition card has 5 fields:**

| Field | Behaviour |
|---|---|
| **Files** | Chip list. Click `+ Add file…` to open a dropdown of unassigned files. Selecting one moves it into this partition. Click the `×` on a chip to release the file back to the left pane. |
| **Assignee** radio | `External vendor` (default) or `In-house staff`. Switching kinds resets the dropdown below. |
| **Vendor select** (vendor mode) | Active vendors only, ordered by `full_name`. Capped at 500 alphabetical (see Troubleshooting §11). |
| **Rate** (vendor mode) | Optional per-word rate. If filled, a `vendor_payables` row is created automatically with `status='pending'`. If blank, you set it later via Manage Payable on the child. |
| **Currency** (vendor mode) | CAD / USD / EUR / GBP / INR. Defaults to parent's vendor currency or CAD. |
| **Staff select** (in-house mode) | Active `staff_users` rows. Rate / currency fields disappear — in-house work has no payable. |
| **Deadline** | Date picker. Defaults to the parent step's deadline. Each partition can have its own. |

After picking the vendor for Partition 1:

![Partition 1 vendor selected — file dropdown showing remaining files](screenshots/16-split-modal-p1-vendor.png)

Click `+ Add another partition` to grow the stack. The next partition's `+ Add file…` button only offers files that haven't been placed yet:

![Partition 2 file dropdown](screenshots/17-split-modal-p2-add-file.png)

When you switch a partition to **In-house staff**, the rate fields collapse with a helper line *"In-house work has no payable — rate fields hidden."*:

![Partition 2 — in-house staff selected](screenshots/18-split-modal-p2-staff.png)

The vendor list and staff list both come from a single Supabase round-trip on modal open. There's no per-keystroke filter — staff is small enough that the dropdown is fine.

### 3c. Validation footer

The footer tracks coverage and assignee-completeness in real time:

| Footer state | Meaning |
|---|---|
| 🟠 *"N files not yet assigned to any partition"* | Drop more files in. Save is disabled. |
| 🟠 *"Partition K has no assignee"* | Pick a vendor or staff in that partition. Save is disabled. |
| 🟢 *"All N files assigned"* | Save becomes solid teal. |

![Split modal — all complete, save enabled](screenshots/04-split-modal-complete.png)

### 3d. Saving — what happens server-side

Click `Save split (N)`. The client POSTs to the `split-step` edge function which:

1. **Re-validates everything** (no deliveries / no vendor / no live payable / no nested split / every file covered exactly once / every assignee real and active).
2. **Re-checks revisor independence** — walks `requires_different_vendor_from_step` and unions in children of any prior split. If any vendor in your partitions would violate ISO 17100 §5.3.5, the function returns `409 reviser_separation_violation` with the colliding vendor IDs.
3. **Atomically** (within a single Supabase request burst):
   - Sets `parent.is_split = true`.
   - Inserts N child rows (`step_number = max(workflow.step_number) + i`, `parent_step_id = parent.id`, `partition_index = 0..N-1`, `actor_type = external_vendor` or `internal_work`, `vendor_id` / `assigned_staff_id`, deadline, optional rate).
   - Inserts `step_files` rows mapping each child to its quote files.
   - Inserts optional `vendor_payables` rows (only for vendor partitions where a rate was provided).
   - Inserts `qms.assignment_eligibility_events` audit rows for each vendor child (`call_site='split-step'`, `reason='split_assignment'` or `'in_house_assignment'`).
4. **Calls `recompute_parent_step_status(parent_id)`** explicitly so the parent transitions to its derived status immediately (usually `in_progress` when at least one child is `assigned`).

You get a green toast: *"Split into N partitions"*.

### 3e. Pipeline after the split

The workflow reloads. The parent step now wears the new teal **`⤴ Split N/M`** badge (where N = children completed, M = total children) and its children stack inside a cethos-teal-tinted left rail:

![Workflow pipeline after split](screenshots/05-workflow-pipeline-after-split.png)

Each child mini-card carries:
- Sub-step number (`1.1`, `1.2`, `1.3` — derived from `parent.step_number` and `partition_index`).
- Assignee name with **`IN-HOUSE`** mini-pill where applicable.
- File count (`· 1 file`).
- Status pill (`Assigned`, then progresses through `Accepted` / `In progress` / `Delivered` / `Approved`).
- Per-child deadline + amount (when set).

**The parent has no vendor controls, no Manage Payable button, and no offer actions.** Those live on the children. The Manage Payable server-rejects parents with `409 step_is_split_parent` if anyone tries to call it.

### 3f. Pre-redeploy gotcha (resolved)

When `get-order-workflow` was first patched to expose the new fields but not yet redeployed, children appeared as top-level Steps 5/6/7 instead of nested:

![Children rendering as siblings (pre-redeploy)](screenshots/19-pre-redeploy-children-siblings.png)

This was fixed by deploying the function via the Supabase MCP with `verify_jwt=false` preserved. **If you ever see this on a fresh deploy:** redeploy `get-order-workflow` and the frontend will pick up the parent/child grouping on next refresh.

### 3g. What you CAN'T do (current limitations)

- **Per-child Manage Payable from the pipeline** — children currently render as mini-cards without action buttons. Use the *Manage Payable* button after the split if you set the rate inline in the modal, or wait for the follow-up PR that surfaces per-child actions.
- **Nested splits** — you can't split a child step. Database `CHECK NOT (is_split AND parent_step_id IS NOT NULL)` enforces this.
- **Retroactive splits on delivered steps** — you must cancel any active payable + unassign the vendor + ensure no deliveries before splitting. This is by design (audit trail integrity).
- **Splitting a step that already has a customer or automated actor_type** — the gate only allows `external_vendor` or `internal_work`.

### 3h. ISO 17100 implications

- **Reproducibility (§4.6):** every child step row + `step_files` mapping + `qms.assignment_eligibility_events` event forms a recoverable partition trail.
- **Revisor independence (§5.3.5):** `requires_different_vendor_from_step` now walks `parent_step_id` of any referenced step so a reviser can't slip past via a sibling partition of the translator step.
- **Confidentiality:** vendor's job-detail endpoint intersects `quote_files` with `step_files` when scope rows exist — each vendor sees only their assigned files. Unsplit steps fall back to full visibility (no regression).
- **Qualification basis (R16):** each child step records its own `competence_basis_cited_id`; no change.

No `qms.*` schema migration was required for this feature — the existing audit tables carry the new audit rows naturally.

---

## 4. Find Vendor & Assign Vendor

For the standard (non-split) path, vendor sourcing happens through the **Find Vendor** flow.

### 4a. Find Vendor modal

Click **Find Vendor** on any step that's eligible (pending, no vendor, external_vendor actor type — also works on internal_work after a *Switch Type*).

![Find Vendors modal](screenshots/07-find-vendor.png)

**Top filter bar:**
| Filter | Behaviour |
|---|---|
| **Source Lang / Target Lang** | Pre-filled from the step's language pair |
| **Service** | All services or a specific one (e.g. *Certified Translation*) |
| **Native Lang** | Free-text search for the vendor's native language |
| **Country** | Free-text search |
| **Min Rating** | Slider from `Any` upwards |
| **Max Rate** | Number — capped at this rate per word |
| **Availability** | `All` / `Available` / `Busy` etc. |

**Search field** is a global match against name or email. **Sort by** offers Match Score, Rate (asc/desc), Rating (desc), Distance, Recently active.

**Vendor rows** carry:
- Name + email
- Language pair pills
- Rate (e.g. `$0.06/per_word CAD`)
- Availability pill (`Available` green, `Busy` amber, `Unavailable` red)
- Number of completed `jobs`
- **Native language** pills (`EN`, `FR` etc.)
- **Active jobs** count
- **Score** (composite — language match, capacity, rate, rating, history)

**Action buttons per row:**
- **Assign** — open the direct-assign modal.
- **Offer** — open the offer modal (vendor must accept).

**Batch offer:** check `Select all` (or individual rows), then click `Offer to Selected (N)` at the bottom. Sends a competing offer to multiple vendors; first to accept wins, the rest are auto-retracted by the accept flow.

> **Tip:** if your filters are blowing away too many candidates, hit `Clear filters`. The default ranking by Match Score is usually a good first cut.

### 4b. Assign Vendor modal

Clicking **Assign** on a vendor row opens the assign-only modal:

![Assign Vendor modal](screenshots/08-assign-vendor.png)

**Vendor pill** at the top + **Profile rate** + `View all rates` link.

**Service** auto-detected from the step.

**Pricing mode toggle:**
- **Rate × Units** (default) — creates a vendor_payables row at `rate × units`.
- **Target (no payable)** — used when there's a pre-agreed target total and no payable is needed (e.g. retainer or pre-billed work). No vendor_payables row is created.

**Rate × Units fields:**
- **Rate** (required) — defaults to vendor's profile rate.
- **Rate Unit** (required) — `Per Page`, `Per Word`, `Per Hour`, or `Flat`.
- **Currency** — defaults to vendor's preferred currency (e.g. *Vendor prefers USD* warning surfaces if they prefer something other than CAD).
- **Page Count / Word Count / Hours / Flat amount** — calculated automatically from the order's `ai_analysis_results` totals when possible.
- **Total** is computed live.

**Margin guard:**
- *Customer subtotal* (from the order)
- *This step cost* (your Total)
- *Step margin: X%* — green if ≥ minimum margin, amber if below. The badge changes color in real time as you change the rate / units.

**Deadline** (required) — defaults to the order's promised delivery minus a buffer.

**Instructions for vendor** — free-text; included in the assignment email and the vendor portal job detail.

On submit:
- `order_workflow_steps.vendor_id` is set, `status='assigned'`.
- A `vendor_payables` row is created (unless `Target` mode).
- A Brevo email goes to the vendor.
- The shared `notify-step-accept` helper does NOT fire on assign (only on the *vendor accepting*) — but the new **PM notification helper** (shipped earlier today as PR `cethosvendorportal#222`) DOES fire when the vendor clicks Accept downstream, emailing both the step's `assigned_staff_id` and `pm@cethoscorp.com`.

### 4c. Offer to Vendor modal

Clicking **Offer** instead of Assign opens the offer modal, identical to Assign except for one extra field:

![Offer Vendor modal](screenshots/09-offer-vendor.png)

**Offer expires in** — dropdown of `24 hours` / `48 hours` / `72 hours` / `7 days`. The expire-stale-offers cron auto-retracts unanswered offers after that window.

On submit:
- `vendor_step_offers` row is created with `status='pending'`, `expires_at` set.
- Step status moves to `offered`.
- Brevo email goes to the vendor with Accept / Decline / Counter-offer buttons.

When the vendor accepts (offer path):
- That offer flips to `accepted`.
- All other offers on the step flip to `retracted` (the accept flow handles this).
- `order_workflow_steps.vendor_id` is set, step status → `accepted`.
- The pending `vendor_payables` row for that vendor flips to `approved`; others on the step flip to `cancelled`.
- PM notification helper fires.

### 4d. When to use which path

| Situation | Path |
|---|---|
| You've already negotiated with the vendor (call / email) | **Direct Assign** |
| Deadline is tight + you need confirmation faster than a 24h offer round | **Direct Assign** |
| You want vendors to compete on rate or speed | **Offer to Multiple** with shorter expires_in |
| Vendor is new to you and might decline | **Offer to Vendor** (single) |
| Vendor has a target total, no per-word billing | **Direct Assign** with *Target (no payable)* pricing mode |

---

## 5. Manage Payable — five pricing modes

Once a step has a vendor assigned, **Manage Payable** opens the same modal you'd use to create or replace the per-vendor payable.

You can reach it via:
- The `Manage Payable (N.NN CAD)` button on the expanded step card.
- The inline `Adjust` link next to the payable summary.

### 5a. Adjust payable (inline mini-form)

For quick rate / total tweaks, the inline `Adjust` form appears in place:

![Adjust payable inline form](screenshots/20-adjust-payable-inline.png)

Fields:
- **Current** payable summary (e.g. `$12.00 CAD (per_word)`)
- **New rate** — recomputes Total automatically.
- **New total** — auto-calc from rate × units, or manual override.
- **Reason** (required) — e.g. *"Scope increased — additional 2 pages"*.

Reason is mandatory because the adjustment writes both to `vendor_payables` (overrides `rate`, `total`, etc.) and to an `audit_log` row carrying the reason. This is what an ISO Stage 2 auditor will look for if they ask "why was vendor X's rate changed mid-project?"

### 5b. Full Manage Payable modal — 5 modes

Click **Manage Payable** to open the full modal:

![Manage Payable — Per word mode](screenshots/10-manage-payable-per-word.png)

Top strip:
- Title: `Manage Payable — Step N: {name}`
- `Vendor: {name}` + `Current status: {pending|approved|invoiced|paid|cancelled|voided}`

**Tab strip — 5 pricing modes:**

#### Flat
Single fixed amount with no quantity × rate breakdown.

![Manage Payable — Flat mode](screenshots/11-manage-payable-flat.png)

Fields: **Flat amount (CAD)**, Currency, Tax %, Description. Use when there's a single agreed price (e.g. a one-off project rate).

#### Per word
Rate × source word count.

Fields: **Rate (CAD / word)**, **Words** (auto-filled from `ai_analysis_results` when available), Currency, Tax %, Description. Subtotal = rate × words.

#### Per hour
Same shape as Per word but with **Rate (CAD / hour)** × **Hours**. Use for hourly-billed work (transcription review, complex DTP).

#### Per page
**Rate (CAD / page)** × **Pages**. Useful for short certified documents charged per page.

#### CAT analysis
The Cethos signature feature for memory-discount workflows.

![Manage Payable — CAT analysis mode](screenshots/12-manage-payable-cat.png)

Steps:
1. Enter **Base per-word rate (CAD)** — e.g. `0.10`.
2. Paste the Trados / SDL / memoQ / XTM / Phrase / Plunet / XTRF analysis text, OR click **Upload file** to provide the original CSV / XLSX / XML export (more reliable than a paste).
3. Click **Parse**. The `parse-cat-analysis` edge function uses Claude Opus to extract tier word counts (e.g. *Context Match*, *Repetitions*, *100% Match*, *95-99%*, *No Match*).
4. The vendor's tier percentages (from their profile's CAT grid) are applied: `tier_subtotal = tier_words × base_rate × tier_percentage / 100`.
5. The total subtotal across all tiers is your payable.

**Why is this deterministic?** Claude extracts the words-per-tier numbers from the analysis (a structured-text task it does well). The percentages come from your vendor's saved CAT grid. The arithmetic happens server-side. Claude never picks the final number — that's the ISO reproducibility guarantee.

**Replace vs Create:** if a payable already exists on this step, the modal shows a yellow warning:

> *"A payable already exists on this step ($12.00, status pending). Saving will cancel the existing payable and create a new one. Status transitions on the prior row are preserved for audit."*

Clicking **Replace payable** cancels the old row (`status='cancelled'`) and creates a fresh one (`status='pending'`). The history is preserved — an auditor can see *"PM replaced this payable on YYYY-MM-DD because…"* if you set a Description.

**Tax handling:** Tax % is applied on top of the subtotal. If the vendor's profile has a `tax_rate` set, the modal pre-fills it. Tax is broken out separately in the modal (Subtotal, Tax, Total) and on the resulting payable row.

---

## 6. Vendor portal — what the vendor sees & does

The vendor portal lives at `vendor.cethos.com`.

### 6a. Login

Vendors log in via email + OTP (no passwords).

![Vendor portal login](screenshots/13-vendor-portal-login.png)

The login flow is:
1. Vendor enters their email.
2. Backend issues a one-time code via Brevo email + a session token.
3. Vendor enters the code → session is established.

> **Admin-impersonate-vendor:** for support / training purposes, an admin can impersonate a vendor without going through email. Open the vendor's detail page in admin, click **Actions → Impersonate**, the function `admin-impersonate-vendor` mints a session token, opens vendor.cethos.com with a red **You are impersonating** banner. The vendor's `Portal: Inactive` flag has to be flipped to Active first (some test vendors live in Inactive state by design).

### 6b. My Jobs (vendor sidebar)

After login, the vendor lands on **My Jobs** — a list of:
- **Pending offers** awaiting their accept / decline / counter (status `pending`/`offered`).
- **Assigned jobs** they need to deliver (status `accepted` / `in_progress`).
- **Completed** historical record.

> *(Screenshot not captured in this walkthrough — see [vendor repo](https://github.com/ssraminder/cethosvendorportal) `apps/vendor/src/pages/Jobs.tsx`.)*

### 6c. Job detail

Clicking a job opens **Job detail**:
- **Header**: Order number, language pair, service, deadline.
- **Pricing**: rate, total, currency.
- **Source files** — *only* the files scoped to that child step. The `get-job-detail` Netlify function intersects `quote_files` with `step_files` when any row matches:

```sql
SELECT qf.*
FROM quote_files qf
WHERE qf.quote_id = $1 AND qf.deleted_at IS NULL
  AND (
    NOT EXISTS (SELECT 1 FROM step_files WHERE step_id = $2)
    OR EXISTS (SELECT 1 FROM step_files sf WHERE sf.step_id = $2 AND sf.quote_file_id = qf.id)
  )
```

For unsplit / legacy steps, no `step_files` row exists → vendor sees the full quote (zero regression). For split children, only the assigned subset shows.

- **Reference files** — listed separately.
- **Action panel**:
  - **For offers**: Accept / Decline / Counter-offer.
  - **For assigned steps**: Deliver (uploads), Decline (rare), Message PM.

### 6d. Vendor accepts an offer

Vendor clicks **Accept** on a pending offer:

1. `vendor_step_offers.status = 'accepted'`
2. All sibling offers on the same step → `status='retracted'`
3. `order_workflow_steps.vendor_id` set, status → `accepted`
4. Pending `vendor_payables` for the accepting vendor → `status='approved'`; siblings → `status='cancelled'`
5. **`notify-step-accept`** helper fires:
   - Emails `assigned_staff_id` (the PM who set up the offer) via Brevo
   - Emails `pm@cethoscorp.com` (shared inbox)
   - Writes one `notification_log` row per recipient with `event_type='vendor_accepted'`, `recipient_type='admin'`

The vendor receives a confirmation email; the PM gets the notification email on their next email check.

### 6e. Vendor accepts a direct assignment

Direct-assigned steps follow the same accept logic without the offer retract step. The `notify-step-accept` helper fires with `event_type='vendor_direct_accept'`.

### 6f. Vendor delivers

The vendor opens the **Deliver** modal:

| Field | Required when |
|---|---|
| **Files** | Always |
| **Vendor identifier** (translator name / internal job code) | When `vendor_type='agency'` or `contractor_type='business'` — keeps per-translator traceability inside agency deliveries. Optional otherwise. |
| **Notes** | Optional |

On submit:
- A `step_deliveries` row is written with `version`, `file_paths[]`, `notes`, `vendor_identifier`, `delivered_by_id`, `delivered_at`, `review_status='pending_review'`.
- `order_workflow_steps.status = 'delivered'`, `delivered_at` set.
- PM gets a `step_delivered` Brevo notification.

For a **split child**, the delivery sits on the child's row. The parent doesn't move yet — the rollup happens at approval time.

---

## 7. Reviewing the vendor's delivery

When the vendor delivers, the admin step card expands to show **Current Delivery** with action buttons:

![Step delivery review actions](screenshots/14-delivery-review.png)

### 7a. Action buttons

| Button | Effect |
|---|---|
| **Approve** | Delivery `review_status='approved'`, step `status='approved'`. Trigger cascades to parent (if split) and `orders.work_status`. Vendor receives a *step approved* email. |
| **Changes** *(Request Changes)* | Inline form opens to capture a free-text reason. Vendor receives a *revision-requested* email with your note. Step `status='revision_requested'`, delivery `review_status='revision_requested'`. The vendor's next upload creates `version+1`. |
| **Remind** | Sends the vendor a polite nudge email (no state change). Useful when you're waiting on the next delivery version. |
| **Override** | Admin force-approves without further vendor action. Used when you've reached out-of-band (call / email) to confirm the delivery is good. The override reason is captured to `audit_log` for the QMS trail. |

### 7b. Delivery versioning

Each delivery becomes a row in `step_deliveries` keyed by `(step_id, version)` with `version` auto-incrementing. The "v1" / "v2" badges on the delivery cards show this.

### 7c. Send to Customer

Once the delivery is approved, **Promote to customer draft** uses `promote-step-delivery-to-draft` to:
1. Watermark the file (DRAFT overlay) and convert to PDF.
2. Upload it as a new `quote_files` row with category `Draft Translation`.
3. Group it under a `draft_group_id` so multiple revisions of the same document share a chain.

The customer-facing "Draft Translations (N)" section then lists these for the customer to review, approve, or request revision.

### 7d. Send All Files to Customer

When the order is truly done (typically Step 4 *Final Deliverable* approved), the **Send All Files to Customer** button bundles the completed translations + reference files into a customer-facing email. This uses the `send-final-deliverable` edge function which:
- Signs URLs for each file (24h validity)
- Builds a branded email
- Flips the workflow to `completed`
- Updates `orders.work_status` to `completed`

### 7e. Split parent rollup

For a **split parent**, the parent step moves through statuses based on its children:
| All children status | Parent status |
|---|---|
| All `approved` | `approved` |
| All `delivered` or `approved` (not all approved yet) | `delivered` |
| Any `accepted` / `in_progress` / `delivered` / `revision_requested` | `in_progress` |
| All `pending` / `offered` | `pending` |

This rollup runs in the `recompute_parent_step_status` Postgres function and fires automatically when any child row changes status (via the `tg_order_steps_sync_work_status` trigger).

---

## 8. Customer invoicing & Accounts Receivable

The **Customer Invoices** page lists every customer invoice across all orders:

![Customer Invoices list](screenshots/15-customer-invoice-list.png)

### 8a. KPI bar

- **Total** — count of all invoices ever generated
- **Drafts** — count not yet issued
- **Issued** — sent but unpaid
- **Paid** — settled
- **Outstanding** — sum of unpaid balances (the AR ageing total)

### 8b. Filters

- **Search** by invoice number, customer name, or PO number
- **Status** filter (Sent, Paid, Cancelled, Void, etc.)
- **Branches** — multi-branch deployments scope by branch
- **Types** — direct order, multi-order (combined invoice), credit note, etc.
- **Date range** — issue-date filter

### 8c. Table columns

| Column | Notes |
|---|---|
| **Invoice #** | Cethos invoice number (e.g. `CT-2026-001005`) or imported XTRF format (`2024/1003`) |
| **Customer** | Customer name (or "Multi-order" badge if the invoice spans multiple orders) |
| **Order(s)** | Linked order number(s); `Multi-order` pill when there are several |
| **PO** | Customer PO if they provided one |
| **Total** | Invoice total amount |
| **Balance** | Outstanding amount (red when > $0) |
| **Status** | `Sent` (yellow), `Paid` (green), `Cancelled` (red), `Void` (slate) |
| **Date** | Issue date |
| **Actions** | View PDF, Cancel, Open in external link |

### 8d. Two invoicing paths

**Auto-invoice on Stripe payment:** when the customer pays through the Stripe checkout flow on quote acceptance, the invoice is issued automatically. Stripe webhook → `generate-invoice-pdf` → invoice row + emailed PDF.

**Manual invoice:** click **+ Create Invoice** (top right) for:
- Multi-order invoices (one invoice covering several completed orders for the same customer)
- Net-30 / Net-15 business customers paying by e-transfer or cheque
- Adjustments / credit notes

The PDF is generated server-side from a React-to-PDF template; for business customers it uses the Cethos Design System layout with the AR-approved Net terms (see memory `decision_quote_pdf_business_design_2026_05_27`).

### 8e. AR ageing

Open **Accounts Receivable** (separate sidebar entry) for an aged view: Current / 1-30 / 31-60 / 61-90 / 90+ buckets per customer. The reminder cron (`apostille-consult-sms-reminders` and AR-specific reminder functions) emails business customers automatically when their flag `auto_invoice_reminders_enabled` is true.

> **Memory note:** the auto-reminder cron defaults to OFF (per `project_xtrf_import_and_reminders_2026_05_21`). Set it per-customer in the customer detail view.

---

## 9. Vendor invoicing & Accounts Payable

### 9a. Vendor side — Portal Invoices

Vendors create their own invoices against approved payables from the **Portal Invoices** view on `vendor.cethos.com`:

1. See a list of `vendor_payables` with `status='approved'` and no linked `vendor_invoice_id` yet.
2. Tick the ones to include in this invoice batch.
3. Add their invoice number (their internal numbering), date, optional notes.
4. Submit.

A `cvp_payments` (vendor_invoice) row is created carrying the linked payable IDs. It lands in the admin **Vendor Invoices** view.

### 9b. Admin — Vendor Invoices list

![Vendor Invoices list](screenshots/21-vendor-invoices.png)

Columns:
- **Internal No.** — Cethos-side reference (`PAY-XXXXX` or XTRF-imported format)
- **Invoice No.** — vendor's invoice number (their numbering)
- **Vendor Name** — links to vendor detail
- **Customer Name** — the customer the work was for
- **Project(s)** — order number(s) the invoice covers
- **Branch** — Cethos branch (Calgary / TRSB legacy / etc.)
- **Status** — `Submitted` (vendor sent it), `Confirmed` (admin verified the linked payables), `Disputed`, `Voided`
- **Payment** — `Unpaid`, `Scheduled`, `Paid`
- **Final Date** — vendor's final date for payment
- **DI...** — display column for due date / disputed indicator

Top-right toolbar:
- **Summary** — opens a summary panel with totals per status
- **CSV / XLSX** export
- **Refresh** to re-query

### 9c. Admin — Accounts Payable

For the aged AP view, open **Accounts Payable** (sidebar under Vendor Finance):

![Accounts Payable](screenshots/22-accounts-payable.png)

KPI bar mirrors AR: **Total open** (`$168K`) + ageing buckets (Current / 1-30 / 31-60 / 61+).

**By vendor** view groups outstanding balances per vendor with ageing across columns. Click the open-detail arrow to drill into the vendor's invoices.

**By invoice** view lists individual invoice rows with payment info.

### 9d. Recording payments

To pay a vendor:
1. Open **Vendor Payments** or use **Quick Payment** (sidebar).
2. Pick the vendor, the invoice(s) / payable(s) to settle, payment method (`etransfer`, `bank_transfer`, `paypal`, `cash`, `cheque`, etc.), reference number, payment date.
3. Save. This writes a `vendor_payments` row + a `vendor_payment_allocations` row per payable allocated, flips the underlying `vendor_payables` to `status='paid'` (when fully allocated).

When a payable hits `paid`:
- The `sync_step_vendor_cost_from_payables` trigger updates `order_workflow_steps.vendor_*` cache columns.
- The order's vendor-cost line reconciles to the invoiced/paid total.

### 9e. Bulk payment

For batch settlements (e.g. month-end), **Bulk Payment Modal** lets you pick multiple invoices across vendors, allocate by FIFO or by-invoice, and execute one payment per vendor.

---

## 10. Visual cues — quick reference

| UI element | Meaning |
|---|---|
| 🟢 emerald pill | Approved / Paid / Delivered |
| 🔵 blue pill | Accepted / In progress |
| 🟡 amber pill | Offered / Pending counter / Sent (invoice) |
| ⚪ slate pill | Pending / Completed (terminal) / Voided |
| 🔴 red pill | Declined / Cancelled / Failed / Unpaid |
| `⤴ Split N/M` teal pill | Split parent — N children done out of M |
| `Split…` teal outline button | Step is eligible for split |
| `IN-HOUSE` mini-pill | Child step assigned to staff_user instead of vendor |
| `Multi-order` purple badge | Invoice covers multiple orders |
| `Latest v1`, `v2`, etc. | Delivery version chip |
| 🟢 dot before card title | Step is in active / approved state |
| 🟠 amber margin pill | Step margin below minimum threshold |
| 🟢 green margin pill | Step margin at or above minimum |
| ⏳ hourglass step icon | Step is pending / not started |
| 🔵 blue dot step icon | Step is in progress |
| 👤 person icon | External vendor |
| 🏢 building icon | In-house staff |
| 📦 package icon | Delivery card |
| 💰 money icon | Payable / invoice card |
| `Adjust` teal link | Inline adjust-payable form |

---

## 11. Troubleshooting

### 11a. *"No files on this order"* in the Split modal

**Symptom:** Split modal opens but the left pane shows *"No files on this order"* despite the order having uploaded source documents.

**Cause:** column drift in the modal SELECT — historically `quote_files.word_count` and `vendors.is_active` didn't exist. Fixed in PR #903.

**Fix:** make sure the admin client is on the latest deploy. If you're on the latest and still see this, check the browser console for a Supabase error toast.

### 11b. Children appear as Steps 5/6/7 instead of nested under parent

**Symptom:** after a split, children show up as new top-level Steps 5, 6, 7 in the workflow pipeline.

**Cause:** `get-order-workflow` hasn't been redeployed to expose `parent_step_id`, `is_split`, `partition_index`, `step_files`.

**Fix:** redeploy `get-order-workflow` via Supabase MCP with `verify_jwt=false` preserved. Then hard-reload the order page.

### 11c. Vendor dropdown missing my target vendor

**Symptom:** the Split modal vendor dropdown doesn't include the vendor you wanted to assign.

**Cause:** dropdown is capped at 500 vendors alphabetical for performance. Vendors later in the alphabet (Z names, special characters) don't appear.

**Workaround:** use the standard **Find Vendor** modal on a non-split step, OR raise the cap in `SplitStepModal.tsx` (currently `.limit(500)`).

### 11d. *"reviser_separation_violation"* on Split save

**Symptom:** Save fails with HTTP 409 `reviser_separation_violation` listing colliding vendor IDs.

**Cause:** one of the vendors you picked has already been used on a prior step in this workflow that the current step's template flags as a "must differ" constraint. ISO 17100 §5.3.5.

**Fix:** pick a different vendor, or override with `force_override_reason` (writes to QMS audit log; only do this when you have a real business justification).

### 11e. *"parent_already_assigned"* / *"parent_has_active_payable"* on Split

**Symptom:** Save fails with HTTP 409 telling you the parent has an active vendor / payable.

**Cause:** by design — splitting would orphan the existing assignment.

**Fix:** unassign the vendor on the parent step (`Unassign` button), and cancel / void any active payable. Then retry split.

### 11f. Word / page counts show `—` in the Split modal

**Symptom:** files in the left pane show `— pp · — w` instead of real counts.

**Cause:** `ai_analysis_results` has no per-file rows for this quote. Either the OCR analysis hasn't run, or it ran in the older "quote-wide" mode (no `quote_file_id` set on the analysis rows).

**Fix:** run **Preprocess & OCR** (or **Run OCR for all files**) on the order. New analysis rows will be per-file and the counts will appear next time the modal opens.

### 11g. Brevo email didn't arrive

**Symptom:** vendor / customer reports they didn't receive the assignment / invoice email.

**Diagnosis:**
1. Open **Brevo Email Logs** modal (from a step or vendor detail).
2. Check the delivery status — `delivered` means Brevo accepted it from SMTP; `bounced` / `blocked` / `spam` show the reason.
3. If `sent` but the recipient claims no receipt, ask them to check spam.
4. Re-send using the **Resend email** button — that fires a fresh Brevo message and logs the new attempt.

### 11h. Split parent stuck at `in_progress` even though children are approved

**Symptom:** all child statuses are `approved` but the parent stays `in_progress`.

**Cause:** rare — could be the rollup function failed to fire on the last child status change (e.g. the row was updated via a path that bypassed the trigger, like a direct service_role update with a custom UPDATE).

**Fix:** run `SELECT recompute_parent_step_status('{parent_step_id}');` in Supabase SQL editor. The function is idempotent — it'll move the parent to the correct status based on current children.

### 11i. Margin pill amber

**Symptom:** the step or order shows an amber margin badge.

**Cause:** computed margin `(customer_subtotal - vendor_cost) / customer_subtotal × 100` is below the `minMarginPercent` threshold (default 30%).

**Fix:** either lower the vendor's rate (negotiate with the vendor) or raise the customer's price (only with their consent). Do NOT just override the margin display — that obscures a real business signal.

---

## 12. FAQ

**Q: Can I split a step that's already assigned to a vendor?**
A: No — you have to unassign the vendor first. This protects the existing vendor's audit trail and payable. The flow is **Unassign → Cancel pending payable → Split**.

**Q: Can a child step itself be split?**
A: No. The database check constraint `NOT (is_split AND parent_step_id IS NOT NULL)` prevents nested splits. If you find yourself wanting this, the original step grouping is probably wrong — reconsider the partition structure.

**Q: What happens to the parent step's vendor cost after a split?**
A: Children carry the payables. The parent has no payable. The order finance section sums step-level `vendor_total` across all steps — parent contributes 0, children contribute their amounts. Grand total ends up identical to "one step / one vendor" if you'd assigned without splitting.

**Q: Will vendors see each other's files in a split?**
A: No. The vendor portal's `get-job-detail` intersects `quote_files` with `step_files` — each vendor sees only their assigned subset. The intersection is server-side; no path lets one vendor read another's scope.

**Q: What's the QMS auditor going to see?**
A: For each child step, an `qms.assignment_eligibility_events` row with `call_site='split-step'`, `reason='split_assignment'` (vendor) or `'in_house_assignment'` (staff), the parent_step_id in `payload`, the `quote_file_ids` covered, and `performed_by` (the PM who triggered the split). For each vendor delivery, the usual `step_deliveries` row + Brevo email evidence. For the revisor check, the existing `requires_different_vendor_from_step` enforcement (now extended to walk children).

**Q: Can I undo a split?**
A: There's no one-click undo. You'd need to:
1. Cancel each child step (`status='cancelled'`).
2. Set the parent `is_split=false`.
3. Manually re-assign the parent.

There's no edge function exposing this today — do it via Supabase SQL editor + an audit-log entry explaining why.

**Q: Why is the vendor list capped at 500 in the Split modal?**
A: Performance — loading all ~1500 vendors into a `<select>` adds noticeable jank. The cap is alphabetical so consistently-named vendors are reachable. If you need a Z-name vendor, use the standard Find Vendor flow on the parent before splitting.

**Q: What's the difference between Direct Assign and Offer to Vendor?**
A: Direct Assign sets `vendor_id` immediately; the vendor sees the job as "assigned" and clicks Accept to start work. Offer creates a `vendor_step_offers` row with an expiry; the vendor sees an Offer card with Accept / Decline / Counter buttons. If they decline, the step stays unassigned and you pick another vendor. If they counter, you see the counter in the admin pipeline and accept / reject / counter-back.

**Q: How is the customer notified when their order ships?**
A: When the Final Deliverable step is approved + you click **Send All Files to Customer**, the `send-final-deliverable` function bundles all the completed translations + reference files, signs URLs for each, and emails the customer with a branded link. The order `work_status` flips to `completed` and the workflow `status` is `completed`.

**Q: What happens if a vendor accepts an offer after another vendor already accepted?**
A: The accept flow on the first vendor retracts all sibling offers (status `retracted`) before flipping that vendor's payable to `approved`. So when the late vendor clicks Accept, they get a `409 offer_no_longer_open` error.

**Q: Can multiple staff PMs work on the same order?**
A: Yes. Different steps can have different `assigned_staff_id` (the staff PM responsible). The PM-notification helper emails the specific step's `assigned_staff_id` when the vendor accepts, so each staff member only gets pinged for their own steps. The shared `pm@cethoscorp.com` inbox is always copied.

**Q: How does the customer review their draft translation?**
A: The PM clicks **Promote to customer draft** on an approved step delivery → a watermarked PDF lands in the customer portal under **Draft Translations**. The customer reviews, then either **Approves** the draft (which advances the workflow to PM Review & Certification) or **Requests changes** (which sends a revision back to the vendor).

---

## 13. Glossary

| Term | Meaning |
|---|---|
| **AR** | Accounts Receivable — customer-side outstanding balances |
| **AP** | Accounts Payable — vendor-side outstanding balances |
| **CAT analysis** | Computer-Assisted Translation memory analysis. Trados, memoQ, XTM, etc. output a tier-by-tier breakdown of source words showing which match the translation memory (TM) at various %s. The vendor's rate per tier comes from their saved CAT grid. |
| **Certification** | Cethos's official translator's affidavit + seal. Separate line item in the pricing (`certification_total`). |
| **Child step** | A partition of a split step. Carries vendor / payable / files. |
| **Counter-offer** | A vendor's response to your offer with a different rate / deadline / scope. |
| **Direct assign** | Bypass the offer round and immediately set the step's vendor. |
| **Draft group** | A per-document revision chain in `quote_files.draft_group_id`. v1, v2, v3 of the same logical document share the same group ID. |
| **Final deliverable** | The signed certified PDF (or final translation files) the customer receives. |
| **IRCC** | Immigration, Refugees and Citizenship Canada. Many Cethos translations target IRCC submissions; certification type matters. |
| **ISO 17100** | International standard for translation services. Cethos is targeting Stage 2 audit December 2026. |
| **OCR** | Optical Character Recognition — extracts text + word/page counts from PDF source files. The `ocr-process-mistral` / `ocr-process-next` functions handle this. |
| **Offer** | A pending invitation to a vendor to take a step. Has `expires_at`. |
| **Override** | Admin force-approves a step without further vendor revision. Captured for audit. |
| **Parent step** | A workflow step that has been partitioned into N child steps. Carries `is_split=true`. Umbrella only — no vendor / payable. |
| **Payable** | What Cethos owes a vendor for a step. Settled when the vendor invoices + admin marks the payment. |
| **PM** | Project Manager — the Cethos staff member responsible for an order or a step. `assigned_staff_id` on the step. |
| **Promote to customer draft** | Watermark the vendor's approved file and surface it in the customer portal for review. |
| **Quote file** | A source / reference file attached to the quote (and therefore the order). |
| **Reviser independence** | ISO 17100 §5.3.5 — the person revising a translation cannot be the person who translated it. Enforced via `requires_different_vendor_from_step`. |
| **Step delivery** | A versioned upload of vendor work against a step. |
| **Switch Type** | Action that changes a step's `actor_type` (e.g. external_vendor → internal_work). Used when you decide to bring a step in-house. |
| **Target pricing** | Pricing mode where the rate × units math is replaced by a single agreed target total. No payable row is created. |
| **TM** | Translation Memory — a database of past translations. CAT tools leverage this for cost discounts. |
| **WORM** | Write-Once Read-Many. QMS audit tables (`qms.assignment_eligibility_events`, `qms.qualification_audit_log`) are append-only with hash chains. |

---

## 14. Related documents & memory

- Feature: [Workflow step split](../../memory/feature_step_split_2026_06_08.md)
- Feature: [Notify PM on vendor accept](../../memory/feature_notify_pm_on_vendor_accept_2026_06_08.md)
- Feature: [Final Deliverable step](../../memory/feature_final_deliverable_step_2026_05_25.md)
- Feature: [CAT Payables Phase 1](../../memory/feature_cat_payables_2026_05_25.md)
- Feature: [Vendor business_name + step identifier](../../memory/feature_vendor_business_name_and_identifier_2026_06_04.md)
- Plan: [Step split architectural plan](../../../../Users/RaminderShah/.claude/plans/2nd-issue-can-be-lucky-sprout.md)
- Design system: `design-system/project/Workflow Step Split.html` (prototype)
- ISO foundations: `docs/qms/00-foundations.md`

---

*Driven live by Claude Code on 2026-06-08 via Chrome MCP against portal.cethos.com / vendor.cethos.com. See [screenshots/INDEX.md](screenshots/INDEX.md) for the screenshot capture log.*
