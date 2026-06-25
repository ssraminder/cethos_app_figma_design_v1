# Staff Guide — Logging COA jobs & client review rounds in the portal

**Audience:** Cethos PMs / LV coordinators (Saad, Usman, LV team).
**Purpose:** Record client (Welocalize / TransPerfect / RWS / etc.) COA linguistic-validation jobs and every **client review/feedback round** in the admin portal, so the full history is traceable (ISO 17100 / IQVIA).
**Where:** `https://portal.cethos.com/admin` (sign in with your Cethos staff email).

> **Golden rule:** the portal is the **system of record**. When a client sends a feedback/revision round by email, it must also be **logged on the order** (Part B). Email + ShareFile alone is not enough.

---

## Part A — Create a job (Direct order) for an AR/business client

Use this for back-entering or opening a job for Welocalize, TransPerfect, RWS, etc. (invoice-on-delivery clients).

> ⚠️ **Creating the order sends the client an automatic "order confirmation" email.** There is currently no toggle to turn this off. For **back-entries** (jobs the client already knows about), check with your manager before creating, so we don't send an unexpected email. *(A "don't notify" option is planned.)*

1. **Orders** (left nav) → **New project** (top-right).
2. Choose **Direct order** (the right-hand card — "Skip quote, invoice on delivery").
3. **Customer:** search and select the client (e.g. *Welocalize, Inc.*). This unlocks the Project & Client PM fields.
4. **Service type:** pick the service — e.g. **Clinician Review**, **Cognitive Debriefing**, or the relevant LV service.
5. **Language pair(s):** set **Source** and **Target** (e.g. English → English (Canada)). *Each pair becomes its own order under one shared project.* Use **+ Add language pair** for multiple.
6. **Standard delivery:** set the promised delivery date/time (required).
7. **Workflow template:** pick the matching template (e.g. **Clinician Review · 3 steps** or **Cognitive Debriefing · 3 steps**). This auto-creates the steps.
8. **Admin fields → Project:** type the client's project code (e.g. `2603_P1332`). If it doesn't exist, click **"Create now → get PRJ #"** (mints a new PRJ-…). If it exists, pick it.
9. **Admin fields → Client Project Manager:** search the client's directory for the PM on the job (e.g. *Consuelo De Urquiza*). If they're not listed, use **"+ Add new project manager"**.
10. (Optional) **Special instructions / internal notes**, **Project files**.
11. Click **Create direct order**. You land on the new order (ORD-…).
12. **Set Order Status** (top-left dropdown) to **In Production** for active work (it defaults to "Paid" when the total is $0).
13. **Finance tab → add receivable** when you have the **rate** and **PO**: description, quantity, rate, tax, PO, client project number. The order total recomputes automatically. *(Leave until the PO arrives if it hasn't.)*

## Part B — Log a client review / feedback round

Do this **every time** the client emails feedback, a revision request, or a clinician feedback round (CLNFBR).

1. Open the order → scroll to the tabs → **Client Communications**.
2. Click **+ Add client email**.
3. Fill in:
   - **Subject:** the client email's subject (e.g. `URGENT: 2603_P1331 / 2603_P1332 | Multi | LV with CR + CD`).
   - **Email date:** ⚠️ **back-date this to when the client actually sent it** (not "now").
   - **Email body:** paste or summarize exactly what the client asked — instrument, what to fix, how many lines/where highlighted, deadlines, and the ShareFile/package link. Be specific and factual.
   - **Attachments:** optional (the flagged file, etc.).
4. **Save communication.** It appears in the **append-only log** (it can't be deleted — that's intended, for audit).
5. (Optional) **Generate** the AI **vendor job-instructions** brief from the logged communications, then review/approve it before the vendor sees it.
6. If there's a hard turnaround, note the deadline in the relevant **workflow step** and assign/notify the vendor.

## Part C — Adding subsequent review rounds

Client feedback often comes in **multiple rounds** (round 1, round 2, post-review, etc.).

- **Each round = a new entry** via **+ Add client email** (Part B). Do **not** overwrite the previous one — the append-only log preserves the full sequence in order, which is exactly what auditors want to see.
- Label each clearly in the subject/body (e.g. "Round 2 — remaining 3 lines on SIGMA SLE").
- After a new round, **re-Generate** the job-instructions brief so the vendor's brief reflects the latest, then re-approve.
- When the deliverable goes back to the client and returns again, that's another round → log it the same way. The workflow step tracks revision cycles.

## Part D — Quick reference

| Task | Where |
|---|---|
| New job (AR client) | Orders → New project → **Direct order** |
| Client feedback / review round | Order → **Client Communications** → **+ Add client email** |
| Internal-only note | Order → **Staff notes (internal)** (not shown to client/vendor) |
| Message the client (sends email) | Order → **Messages** panel (right side) — use deliberately |
| Pricing / PO | Order → **Finance** tab → add receivable |
| Vendor brief from feedback | Client Communications → **Generate** (approve before vendor sees) |

## Cautions

- **Client Communications** = logging what the client sent (no email goes out). **Messages** (right panel) = actually emails the client. Don't confuse them.
- Always **back-date** the email date so the timeline is accurate.
- Creating an order emails AR/business clients automatically (see Part A warning).
- One **PRJ** per client project code; each **language pair** is its own order.
