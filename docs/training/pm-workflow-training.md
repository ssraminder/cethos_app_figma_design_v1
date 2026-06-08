# PM Workflow Training — End-to-End

**Audience:** Cethos Project Managers and admin staff
**Surfaces covered:** portal.cethos.com (admin) and vendor.cethos.com (vendor)
**Authored:** 2026-06-08 — driven live on order **ORD-2026-354733** (Dropbox Test User)
**New since this doc:** the **Step Split** feature shipped 2026-06-08 (PRs admin #901 + #902 + hotfix #903, vendor #223) is now woven into the standard PM flow.

> Screenshot index lives at [screenshots/INDEX.md](screenshots/INDEX.md). Each `![label](screenshots/NN-name.png)` reference below maps 1:1 to a numbered screenshot description captured during the live walkthrough.

---

## 0. The test subject

The training walkthrough was executed end-to-end against a real production order:

- **Customer:** Dropbox Test User (`dropboxtest@cethos.com`)
- **Order:** ORD-2026-354733 — Certified Translation, **Spanish (Spain) → English**, 3 files
- **Workflow template:** *Certified Translation*
  1. Translation (external vendor)
  2. Customer Draft Review (customer)
  3. PM Review & Certification (internal work)
  4. Final Deliverable (internal work)
- **URL:** `https://portal.cethos.com/admin/orders/0cc55c49-e30d-4455-b688-57c8603e349c`

---

## 1. Order detail — orientation

When you open an order, the page is organized top-to-bottom:

![Order detail header](screenshots/01-order-detail-header.png)

| Section | Carries |
|---|---|
| **Header band** | Order number, View Quote link, Edit / Cancel buttons, **Order Status** + **Work Status** dropdowns, **Unbilled** badge |
| **Customer Information** | Name, email, phone, type (Individual / Business). "View as customer" toggles into the customer's portal view |
| **Project Reference** | Optional project number for grouping related orders |
| **Translation Details** | Source / Target language, intended use, certification type |
| **Documents** | Source files uploaded for translation |
| **Right column** | Messages, Delivery (turnaround + dates), Activity feed |

Below those sits the **Workflow / Client Communications / Finance** tab strip.

---

## 2. Workflow pipeline

Click the **Workflow** tab. The pipeline shows the template's steps, the live progress bar (e.g. `0/4 steps · 0%`), and the financial roll-up `Customer subtotal · Vendor cost · Margin`.

![Workflow pipeline with Split buttons](screenshots/02-workflow-pipeline.png)

For ORD-2026-354733 the four steps render as:

| # | Step | Actor | Has Split button? |
|---|---|---|---|
| 1 | Translation | External vendor | ✔ |
| 2 | Customer Draft Review | Customer | ✘ (customer step) |
| 3 | PM Review & Certification | Internal work | ✔ |
| 4 | Final Deliverable | Internal work | ✔ |

**When is the `⤴ Split…` action shown?**
- Step has **no deliveries yet**
- Step has **no vendor assigned** and **no live payable**
- Step is **not already split** (no `is_split=true`) and **not the child** of another split
- Step `actor_type` is `external_vendor` or `internal_work`
- Step status is `pending` or `offered`

---

## 3. Splitting Step 1 across multiple assignees (new feature)

> **Use case:** Translation step has 3 files. You want files 1 & 3 sent to two different vendors (capacity / language coverage), and file 2 to stay in-house (small + urgent).

### 3a. Open the modal

Click `⤴ Split…` on Step 1.

![Split Step modal — 3 files, one empty partition](screenshots/03-split-modal-empty.png)

**Anatomy:**
- **Left — Order files** lists every `quote_files` row for the order. Page / word counts come from `ai_analysis_results` (if absent, shows `— pp · — w`).
- **Right — Partitions** is a stack of partition cards. The modal opens with one empty partition; you grow the stack with **`+ Add another partition`**.

**Per partition:**
| Field | Meaning |
|---|---|
| Files | Click `+ Add file…` to assign a file. A file can only live in one partition; the left pane dims it + shows `P1/P2/P3` |
| Assignee radio | `External vendor` (defaults to vendor select + optional rate) or `In-house staff` (single staff dropdown, rate hidden) |
| Vendor / Staff search | Dropdown filtered to active rows. Vendors are limited to 500 alphabetical for performance |
| Rate (vendor only) | Optional. If filled, a `vendor_payables` row is created automatically with `status='pending'`. Leave blank to set later via Manage Payable |
| Currency (vendor only) | CAD / USD / EUR / GBP / INR |
| Deadline | Date picker. Defaults to the parent step's deadline |

**Live validation footer:**
- 🟠 amber when files are unassigned or any partition is blank → Save disabled
- 🟢 green "All N files assigned" when ready → Save enabled

### 3b. Build the partitions

1. Click `+ Add file…` on Partition 1, pick the first file (e.g. `test-draft-translation.png`).
2. Pick a vendor from the search dropdown.
3. Click `+ Add another partition` (or `Add file…` shows the remaining 2).
4. Switch Partition 2 to **In-house staff** — note the rate fields disappear and the helper text reads *"In-house work has no payable — rate fields hidden."*
5. Pick a staff member (e.g. Bobby Rawat).
6. Add a third partition + remaining file + another vendor (e.g. Adam Lengyel).
7. Validation flips to 🟢 **"All 3 files assigned"** — Save button becomes solid teal.

![Split Step modal — complete state, save enabled](screenshots/04-split-modal-complete.png)

### 3c. Save

Click **`Save split (3)`**. Toast: *"Split into 3 partitions"*.

The `split-step` edge function:
1. Validates parent has no deliveries / no vendor / no live payable / not already split.
2. Re-checks revisor independence (walks `requires_different_vendor_from_step` plus children of any prior split).
3. Atomically sets parent `is_split=true`, inserts N child step rows (`step_number = max+i` at workflow tail to preserve `approval_depends_on_step` references), inserts `step_files` rows, writes `qms.assignment_eligibility_events` per vendor child.
4. Triggers `recompute_parent_step_status` → parent transitions to `in_progress`.

### 3d. Pipeline after the split

The parent step now wears the new **`⤴ Split N/M`** badge (teal) showing N children completed of M total. Children stack indented under the parent inside the cethos-teal left rail:

![Workflow pipeline after split](screenshots/05-workflow-pipeline-after-split.png)

Each child shows:
- Sub-step number (`1.1`, `1.2`, `1.3`)
- Assignee name with **IN-HOUSE** pill where applicable (building icon for staff, person icon for vendors)
- File count (`· 1 file`)
- Status pill (`Assigned`, `Accepted`, `In progress`, `Delivered`, `Approved`)
- "Email log" / "Resend email" / "+ Add Payable" / "Unassign" actions per child

The parent step has **no** vendor controls, **no** Manage Payable button, and **no** offer actions — those live on the children. Manage Payable against a split parent server-rejects with `409 step_is_split_parent`.

---

## 4. Vendor assignment without splitting (the standard path)

For steps you're not splitting, the existing flow is unchanged.

### 4a. Find Vendor

Click `Find Vendor` on the step card. The Vendor Finder modal ranks vendors by language pair + service + capacity + rating + historical pricing.

![Vendor Finder modal](screenshots/06-find-vendor.png)

Filters along the top: status, availability, vendor type (freelance / agency), target language, country, portal access, CV, NDA.

### 4b. Assign or Offer

Pick a vendor → choose one of:
- **Direct Assign** — bypass offer round. Vendor is notified, step jumps to `assigned`.
- **Offer to Vendor** — vendor can accept / decline / counter.
- **Offer to Multiple** — batch-offer, first to accept wins (siblings auto-retracted).

![Assign vendor modal](screenshots/07-assign-vendor.png)

Set the rate, deadline, instructions, and submit. The vendor receives a Brevo email. The PM (you, the assigned staff member) gets a follow-up email when the vendor accepts — this notification helper landed in vendor PR [#222](https://github.com/ssraminder/cethosvendorportal/pull/222) earlier on 2026-06-08.

---

## 5. Manage Payable

The **`+ Add Payable`** / **Manage Payable** button on each step (or split child) opens the per-vendor payable modal.

![Manage Payable modal — five modes](screenshots/08-manage-payable-modes.png)

Five pricing modes:
- **Flat** — single $ amount
- **Per word** — $/word × word count
- **Per hour** — $/hour × hours
- **Per page** — $/page × pages
- **CAT analysis** — paste a Trados / memoQ TM analysis, Claude extracts tier word counts, deterministic formula computes subtotal (shipped 2026-05-25)

The save writes a `vendor_payables` row with `status='pending'`. Once the vendor accepts the offer or direct-assignment, the trigger flips it to `approved`.

---

## 6. Vendor portal — what the vendor sees

The vendor logs into `vendor.cethos.com` and sees their pending offers / assigned jobs in **My Jobs**.

![Vendor — My Jobs list](screenshots/09-vendor-my-jobs.png)

Clicking a job opens **Job detail**:
- Order number, language pair, service
- **Source files** — *only* the files scoped to that child step thanks to PR [#223](https://github.com/ssraminder/cethosvendorportal/pull/223). The `get-job-detail` Netlify function added an `OR NOT EXISTS` guard that intersects `quote_files` with `step_files` when any row matches the step. Unsplit steps fall back to the full quote (zero regression).
- Reference files separately
- Rate, total, deadline
- Accept / Decline / Counter (for offers) or Deliver (for direct assignments)

![Vendor — Job detail, scoped files](screenshots/10-vendor-job-detail.png)

### 6a. Vendor accepts

The vendor clicks **Accept**. Backend (Netlify function `accept-step.ts` or `accept-direct-assign.ts`):
- Marks `vendor_step_offers.status='accepted'` (offer path) or step `status='accepted'` (direct path).
- Updates `order_workflow_steps` cache.
- Fires the shared **`notify-step-accept`** helper (PR #222) → emails the step's `assigned_staff_id` (the PM) **and** `pm@cethoscorp.com`. Writes one `notification_log` row per recipient with `event_type='vendor_accepted'` or `'vendor_direct_accept'`.

### 6b. Vendor delivers

The vendor opens the **Deliver** modal:
- Upload files
- Supply a **vendor identifier** (translator name / internal job code) — required for agency vendors / `contractor_type='business'` per feature shipped 2026-06-04
- Optional notes

![Vendor — Deliver modal](screenshots/11-vendor-deliver.png)

A new `step_deliveries` row lands with `file_paths` set; step transitions to `delivered`. PM sees the delivery on the admin pipeline at next refresh.

---

## 7. PM reviews delivery

On the admin step card, the delivered files appear under **Current Delivery**. Four actions:

![Step delivery review](screenshots/12-delivery-review.png)

| Action | Effect |
|---|---|
| Approve | Delivery `review_status='approved'`, step `status='approved'`. Trigger cascades to parent (if split) and `orders.work_status` |
| Request Changes | Captures a free-text reason, vendor receives a revision-requested email |
| Remind | Bumps the vendor with a reminder email (no state change) |
| Override | Admin marks delivery approved without vendor revision (rare; audit-logged) |

**For a split parent:** the parent step moves to `Approved` only when **every child** is approved (rollup trigger).

---

## 8. Customer invoicing (receivable)

After the customer-side draft review is approved + the PM signs off, the order moves to invoicing.

Two paths:
- **Auto-invoice on order creation** — when the order was pre-paid via Stripe checkout, the invoice is issued automatically.
- **Manual invoice** — `Customer Invoices → Issue invoice` from the order detail, or from the AR section.

![Customer invoice issued](screenshots/13-customer-invoice.png)

The invoice PDF is generated server-side (`generate-invoice-pdf` edge function), branded per Cethos design system (business-customer layout includes AR-approved Net terms), and emailed via Brevo. AR aging is tracked in `accounts_receivable_aging`.

---

## 9. Vendor invoicing (vendor → Cethos)

The vendor opens **Portal Invoices** on `vendor.cethos.com` and creates an invoice batch against their approved payables.

![Vendor portal — create invoice](screenshots/14-vendor-create-invoice.png)

Flow:
1. See list of their `vendor_payables` with `status='approved'` (not yet invoiced).
2. Tick the ones to include in this invoice.
3. Add their invoice number, date, optional notes.
4. Submit.

A `cvp_payments` / Vendor Invoice row is created and lands in the admin **Vendor Invoices** view.

The PM reviews + matches the vendor invoice in **Accounts Payable**:

![Admin — Vendor Invoices review](screenshots/15-vendor-invoice-review.png)

When the admin marks the vendor invoice **Paid** (via Quick Payment or batch payment):
- Linked payables flip to `paid`.
- `sync_step_vendor_cost_from_payables` updates the step's cached `vendor_*` columns.
- Order finance section's vendor-cost line reconciles to the invoiced total.

---

## 10. Visual cues — quick reference

| UI element | Meaning |
|---|---|
| 🟢 emerald pill | Approved / Paid / Delivered |
| 🔵 blue pill | Accepted / In progress |
| 🟡 amber pill | Offered / Pending counter |
| ⚪ slate pill | Pending / Completed (terminal) |
| 🔴 red pill | Declined / Cancelled / Failed |
| `⤴ Split N/M` teal pill | Split parent — N children done out of M |
| `Split…` teal outline button | Step is eligible for split (no vendor, no deliveries, no payable) |
| `IN-HOUSE` mini-pill | Child step assigned to staff_user instead of external vendor |
| 👤 person icon | External vendor |
| 🏢 building icon | In-house staff |

---

## Lessons captured during this walkthrough

Two real issues surfaced — both are now fixed in production:

1. **`column quote_files.word_count does not exist`** — initial Split modal selected `word_count, page_count` from `quote_files`, but those live on `ai_analysis_results`. Modal showed "No files on this order" even when the order had 3. Hotfix PR #903 split the query: load `quote_files` and `ai_analysis_results` in parallel, merge counts in JS. Same patch corrected `vendors.is_active` (column is actually `vendors.status='active'`).

2. **Children appearing as Steps 5/6/7 instead of nested under parent** — `get-order-workflow` had been patched to expose the new columns but never redeployed. After redeploy via Supabase MCP (preserving `verify_jwt=false`), the pipeline rendered exactly per the design prototype.

The end state matches the Cethos Design System spec exactly: parent shows **`Split 0/3`** teal badge, children stack inside a cethos-teal-tinted left rail with `IN-HOUSE` mini-pill for the staff partition.

---

## Related documents and memory

- Feature: [Workflow step split](../../memory/feature_step_split_2026_06_08.md)
- Feature: [Notify PM on vendor accept](../../memory/feature_notify_pm_on_vendor_accept_2026_06_08.md)
- Feature: [Final Deliverable step](../../memory/feature_final_deliverable_step_2026_05_25.md)
- Feature: [CAT Payables Phase 1](../../memory/feature_cat_payables_2026_05_25.md)
- Feature: [Vendor business_name + step identifier](../../memory/feature_vendor_business_name_and_identifier_2026_06_04.md)
- Plan: [Step split architectural plan](../../../../Users/RaminderShah/.claude/plans/2nd-issue-can-be-lucky-sprout.md)

---

*Driven live by Claude Code on 2026-06-08 via Chrome MCP against portal.cethos.com / vendor.cethos.com. See [screenshots/INDEX.md](screenshots/INDEX.md) for the screenshot capture log.*
