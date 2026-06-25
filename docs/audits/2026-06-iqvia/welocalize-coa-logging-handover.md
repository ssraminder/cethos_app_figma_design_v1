# Handover — Welocalize COA mailbox → portal review/feedback logging

**Date:** 2026-06-25
**Owner handing off:** Raminder (ss.raminder@gmail.com / raminder@cethos.com)
**Status:** In progress — P1331 + P1332 done; P3236 + TransPerfect pending.

This handover is written so a **fresh session can continue exactly where we left off, the same way**. Read it top-to-bottom, then use the copy-paste prompts in §10.

---

## 1. TL;DR / what this work is

The `review@cethos.com` shared mailbox carries **live COA linguistic-validation (LV) production** for two clients — **Welocalize** (end-client Syneos) and **TransPerfect**. Lead PM on the client side is **Saad Khan** (`saad@cethoscorp.com`); **Usman** (`usman@cethoscorp.com`), **raminder@cethos.com**, and **lv@cethos.com** are on most threads.

For ISO 17100 / the IQVIA audit, the **client review/feedback rounds** (clinician feedback, revisions, cancellations) and the jobs themselves must be **traceable in the portal**, not only in email + Welo's ShareFile/junction. This task = triage the mailbox and **log those review rounds onto the matching portal orders**, back-entering orders that don't exist yet.

## 2. The method (USER DIRECTIVE — do not deviate)

- **Do the actions THROUGH THE ADMIN UI via Chrome MCP — NOT direct DB writes.** (The very first P1331 entry was done in SQL before this directive; everything since is UI.)
- **Per-item loop** (one job at a time):
  1. Read the relevant thread in `review@cethos.com`.
  2. Map it to a portal order by **`client_project_number`** (e.g. `2603_P1332`).
  3. If the order is **missing**, back-enter it as a **Direct order** (see §6 / staff guide).
  4. **Log the client round** in the order's **Client Communications** tab (`+ Add client email`).
  5. Set order status / step deadline as appropriate.
- **Confirm with the user before ANY step that emails a client** (see §5 gotcha).
- Work **Welocalize only** for now. **TransPerfect is deferred** by the user.

## 3. Access & tools

- **Mailbox:** Outlook MCP, shared-mailbox path. Use `outlook_email_search` with `mailboxOwnerEmail: "review@cethos.com"` (date filter OR free-text query, not both). Read full bodies with `read_resource` on the returned `mail:///messages/{id}?owner=review@cethos.com` URI (bodies are huge HTML — extract text). 32 messages since Jun 4; **only the most recent 25 (Jun 24–25) have been reviewed** — 7 older remain.
- **Portal:** Chrome MCP. `list_connected_browsers` → "Browser 1" (Windows, local) is logged in. **Root `portal.cethos.com` shows the public login — ignore it; go straight to `portal.cethos.com/admin`** (the authenticated admin app). Create a working tab with `tabs_context_mcp{createIfEmpty:true}`.
- **DB (read-only, for verification/mapping only):** Supabase MCP `execute_sql`, project `lmzoyezvsjgsxveoakdr`. Do **not** use it for writes (UI only, per §2).

## 4. Data-model cheat-sheet

- `orders.client_project_number` = the client's code (e.g. `2603_P1332`). `orders.po_number`, XTRF fields also exist.
- `order_workflow_steps` — steps per order: `name`, `status`, `revision_count`, `deadline`, `instructions`, `source_language`/`target_language` (UUIDs → `languages`).
- `order_communications` — the **per-order client-email log** (the "Client Communications" tab). `kind='client_email'` is the convention (existing entries are "CLNFBR" = Clinician Feedback Rounds). `created_by` / `last_edited_by` FK → **`public.staff_users.id`** (NOT auth.users). Append-only in the UI.
- `internal_projects` — `project_number` (PRJ-YYYY-NNNNN) + `client_project_number`. One PRJ per client project code.
- IDs you'll reuse: **Welocalize customer** `fcb79ac3-aba6-41b8-9bda-568c1cf5a0ec`; **TransPerfect Inc.** `360e53cd-7187-4fcf-a26f-edebf4c1b1ba`; **RWS** `840f6e4d-...`; **Raminder staff_users.id** `a8b2d97e-4832-41d4-9334-4d6a58558154`.
- Languages: `English (en)`, **`English (Canada)` (en-CA)** ✅ exists, `Danish (da)`, German, Dutch, Spanish (Spain), Spanish (US), Polish, French (Canada), and the region variants used by RWS (Tamil (Malaysia), Punjabi (India), English (India)…).
- Workflow templates (native select on the create form): `clinician_review` (3 steps: Clinician Review → QA Review → Final Deliverable), `cognitive_debriefing` (3 steps), plus LV Adaptation/Back-translation/Reconciliation/etc.

## 5. Decisions & constraints (carry these forward)

- **UI not DB** for actions (§2).
- **One-time client email accepted:** creating a Direct order **emails the customer** an order confirmation (`admin-create-order` → `notify-customer-order-confirmed`, gates only on `is_ar_customer` + `amount_paid=0` + per-order dedup; Welo is AR + $0 → it sends). **No UI toggle to suppress it.** User approved sending it **this once** for P1332. **For each future business-client back-entry, RE-CONFIRM with the user before creating** (each creation = one client email).
- **HANDOVER CODE ITEM (must build in a future session):** add a **"don't notify customer" option** to the create-order form (`client/pages/admin/AdminCreateOrder.tsx`) passed through `admin-create-order` (`supabase/functions/admin-create-order/index.ts`, ~line 596), ideally with a per-customer default for business clients. See memory `handover_business_client_email_optional_2026_06_25.md`.
- **TransPerfect deferred** by the user — do not touch until they say so.

## 6. What's been done

### P1331 (Welocalize / Syneos — daDK Clinician feedback) — DONE
- Order **ORD-2026-10494** (id `3e463052-2231-4c32-8742-974def981507`), project `2603_P1331`, EN→Danish, Clinician Review step (id `e723b21f-e9d3-4482-8e82-9f8d00761dba`).
- Logged the client round (Consuelo de Urquiza, 2026-06-25): **daDK Clinician to address 8 lines highlighted GREEN on the SIGMA SLE**; daDK is the **client priority** (delivery next week, feedback due end of week).
- Recorded as a `client_email` in Client Communications + Clinician Review **deadline set to 2026-06-27** + note appended to step instructions. (This one was done in SQL before the UI directive; it renders correctly in the UI.)

### P1332 (Welocalize / Syneos — enCA Clinician feedback) — DONE via UI
- **Back-entered** as **ORD-2026-10525** (id `318d1a75-559e-46a2-9bee-46b6d86144d0`), new project **PRJ-2026-00214** (`2603_P1332`), **English → English (Canada)**, **Clinician Review · 3 steps**, Client PM **Consuelo De Urquiza**, promised delivery Jul 3, status **In Production**. Dropbox folder auto-created.
- enCA feedback logged in **Client Communications** (`client_email`, back-dated to the real email time Jun 24 9:08 PM): **enCA Clinician to address 6 lines highlighted BLUE on the SIGMA SLE**, ShareFile ref, cross-linked to the daDK priority on ORD-2026-10494.
- **The one-time confirmation email to `info@welocalize.com` fired** (user-approved).

## 7. The exact UI process (replicable)

Full step-by-step with field-level detail is in the **staff guide**: `docs/guides/coa-direct-order-and-client-feedback-staff-guide.md`. Summary:

**Back-enter an order:** `/admin/orders` → **New project** → **Direct order** → pick customer → Service type → Language pair(s) (each pair = one order) → Standard delivery date → Workflow template (`Clinician Review` / `Cognitive Debriefing`) → Admin fields: **Project** (type the client code → "Create now → get PRJ #") + **Client PM** (search the customer's directory, or "+ Add new project manager") → **Create direct order**. Then set **Order Status** (e.g. In Production), add the **receivable** (rate/PO) on the **Finance** tab when known.

**Log a client review round:** open the order → **Client Communications** tab → **+ Add client email** → Subject, **Email date back-dated to the real email time**, Email body (paste/summarize the client's request), attachments optional → **Save communication**. Optionally **Generate** the AI vendor job-instructions brief (needs approval before the vendor sees it).

## 8. What's pending / next steps

1. **P1332 receivable** — order is $0 / Unbilled. Need the **rate + PO** (the email had no P1332 PO; Welo may not have issued one). Add a CR receivable on the Finance tab when known, or leave $0 until the PO lands.
2. **2606_P3236 (ESUS – Cognitive Debriefing)** — Welo kickoff (Saad confirmed file receipt 06-24); **not in the portal**. Back-enter like P1332 (service = Cognitive Debriefing; confirm language(s) + PM from the thread). No client feedback round yet. **Will fire one confirmation email — confirm with user first.**
3. **TransPerfect (DEFERRED — only on user's go):** `US2209797` (Achondroplasia CogDeb — **hiIN cancelled mid-work**, report cost; **thTH delivered**; stZA/zuZA due **Jul 21**), `US2274780` (Achondroplasia CogDeb — enIN off-hold), `US2198673` (Bengali **Medical Review** — new, **PO received**). TransPerfect Inc. already has 13 older orders but NOT these three.
4. **Read the 7 older review@ emails** (since Jun 4) for any other open Welo feedback rounds.
5. **Staff guide → polished .docx — DONE:** `docs/guides/Cethos-COA-Order-and-Feedback-Staff-Guide.docx` (annotated illustrated SOP, Parts A–C, built with Pillow + python-docx). Source markdown: `docs/guides/coa-direct-order-and-client-feedback-staff-guide.md`. NB: the images are faithful **annotated recreations** of the screens (the Chrome MCP screenshots can't be exported to a file to embed, and the desktop-capture approval timed out) — swap in literal screen-grabs later if wanted.
6. **Code item** from §5 (email-optional) — separate build session.

## 9. Gotchas

- Root `portal.cethos.com` = public login screen; use `/admin`.
- Direct-order creation **emails the client** (§5). No suppress toggle yet.
- `order_communications.created_by` → `staff_users.id` (use Raminder `a8b2d97e-...`), **not** auth.users.
- Each **language pair** on the create form becomes its **own order**; receivables/PO/client-project-number are added per order on the **Finance tab** after creation.
- Chrome MCP screenshots intermittently time out ("renderer unresponsive") — just retry the screenshot; the action usually succeeded.
- One PRJ per client project code — for a new code, type it in the Project field and "Create now → get PRJ #".

## 10. Copy-paste prompts for the new session

**A. Resume the work:**
> Resume the Welocalize COA mailbox→portal logging. Read `docs/audits/2026-06-iqvia/welocalize-coa-logging-handover.md` and the staff guide it references, plus memory. We log client review rounds from the `review@cethos.com` shared mailbox (Outlook MCP) into portal orders **through the admin UI via Chrome MCP** (`portal.cethos.com/admin`) — **never direct DB writes**. Work the pending items in the handover one at a time, and **confirm with me before any step that emails a client**.

**B. Back-enter P3236:**
> Back-enter Welocalize **2606_P3236 (ESUS – Cognitive Debriefing)** as a Direct order in the admin UI, exactly the way ORD-2026-10525 (P1332) was created. First read the latest P3236 thread in `review@cethos.com` to confirm the language(s) and Client PM. Service = Cognitive Debriefing; new project labeled `2606_P3236`; then log the kickoff email in Client Communications. **It will fire one order-confirmation email to Welo — confirm with me before you click Create.**

**C. TransPerfect (only after I say go):**
> Now handle the deferred TransPerfect projects: `US2209797`, `US2274780`, `US2198673`. For each, read the `review@cethos.com` thread, back-enter the order(s) in the admin UI like P1332, and log the review/feedback events — including the **hiIN cancellation** on US2209797 (use the order's Cancel flow) and the new **Bengali Medical Review** US2198673 (PO already received). Confirm before any client email.

**D. Build the email-optional code change:**
> Implement the handover code item: make order-confirmation emails **optional for business/AR clients**. Add a "don't notify customer" option on the create-order form (`client/pages/admin/AdminCreateOrder.tsx`) passed through `admin-create-order` (`supabase/functions/admin-create-order/index.ts`, ~line 596 where it calls `notify-customer-order-confirmed`), ideally with a per-customer default for business clients. See memory `handover_business_client_email_optional_2026_06_25.md`. Open a PR.
