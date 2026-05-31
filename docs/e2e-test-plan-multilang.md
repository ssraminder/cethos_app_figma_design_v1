# E2E Test Plan — Multi-Language Fan-out + Quote/Order/Invoice Lifecycle

Browser-only (Chrome) end-to-end test plan for the multi-language quote/order
fan-out feature and the surrounding customer-link, payment, conversion, and
invoicing flows. Run as a real user against `https://portal.cethos.com`. No
database actions — every assertion is something visible on screen.

Related work: PR #815 (direct-order multi-pair), #816 (quote/order fan-out),
#817 (customer-list child filter), #818 (multi-page bundle discount). Source of
truth for fan-out behavior: `memory/decisions.md` (2026-05-30 entry) and
`supabase/functions/_shared/` + `convert_quote_to_orders` RPC.

---

## 0. Conventions & prerequisites

- Log in at `/admin` as staff.
- **Prefix all test data `ZZ TEST`** so it's trivial to find and delete.
- **Stripe is in LIVE mode.** Use **tiny amounts ($1–$2)** for any test that
  actually completes a payment, and **refund** afterwards. A `4242…` test card
  will **not** work in live mode — use a real card.
- **Searchable dropdowns** (languages, service, intended use): *click the field
  → it opens → type to filter → click the option.* Typing alone won't commit a
  value.
- **Per-document / per-line pair selectors** default to "Inherit quote
  source/target"; override them to build distinct pairs.
- For customer-link tests, open links in an **incognito window** (or a second
  browser) so you experience them logged-out, as the customer does.
- Test pairs used throughout: **ES→EN** (Spanish (Spain) → English),
  **FR→EN** (French → English), **PA→EN** (Punjabi → English).
- Clean up via UI at the end (Phase 9).

**Pass/fail:** mark each TC ✅/❌; capture the quote/order/invoice number and a
screenshot for any ❌.

---

## Phase 1 — Quote creation (fan-out)

### TC-01 — Fast Quote, 3 distinct pairs
**Route:** `/admin/quotes/fast-create`
1. Customer: `ZZ TEST FastQuote`, email, phone.
2. Translation Details: Source = **Spanish (Spain)**, Target = **English**; pick any **Intended Use**.
3. Document 1: name it; leave pair on **Inherit** (= ES→EN).
4. **Add Document** → Doc 2 → set its Source = **French**.
5. **Add Document** → Doc 3 → set its Source = **Punjabi**.
6. **Create Quote.**

**✅ Expect:** lands on the parent quote (`QT-…`, status **Quote Ready**) showing **3 documents** and one combined total. *Covers: create-fast-quote fan-out, FastQuoteCreate per-document pair UI.*

### TC-02 — AdminCreateOrder, Quote mode, 2 pairs
**Route:** `/admin/orders/new` → toggle **Quote**
1. **Add new customer** `ZZ TEST QuoteMode`; tax = Alberta GST 5%; **Create customer**.
2. Service type = **Certified Translation**; Source = **Spanish (Spain)**, Target = **English**.
3. Line 1: leave inherited ES→EN; Unit = Per page, Qty 1, Rate 55.
4. **Add line** → Line 2 → Source = **French**; Qty 1, Rate 55.
5. **Create quote.**

**✅ Expect:** parent quote created as in TC-01. *Covers: AdminCreateOrder quote-mode per-line pair builder.*

### TC-03 — Single-pair quote (regression baseline)
Fast Quote with one document / one pair → Create.
**✅ Expect:** **1 quote, no children**; behaves exactly as before the feature. *Covers: N=1 unchanged path.*

---

## Phase 2 — Direct order (multi-pair, AR-only)

### TC-10 — Direct order, 2 pairs
**Route:** `/admin/orders/new` → click **Direct order**
1. **Add new customer** `ZZ TEST DirectOrder` (AR-approved box auto-checked, Net 30); **Create customer**.
2. Service type = **Certified Translation**.
3. **Language pairs:** Pair 1 = Spanish (Spain) → English. **Add language pair** → Pair 2 = French → English.
4. **Project** (required): type `ZZ TEST Direct PRJ`. Fill **Client Project Manager** if required.
5. Set Standard delivery if required. **Create order.**

**✅ Expect:** redirects to a project/order view with **2 separate orders** (one per pair) under **one shared project number**. *Covers: direct-order fan-out (`admin-create-order`).*

---

## Phase 3 — Customer-facing links

### TC-20 — Quote Review Link renders for the customer
Open parent quote → **Create Quote Link** → URL fills the **Quote Review Link** box → copy → open in **incognito**.
**✅ Expect:** customer quote-review page renders (no login): correct quote #, all line items, subtotal/tax/total, delivery options, and **Pay** + (AR only) **Approve on AR** buttons. *Covers: validate-quote-token, QuoteReviewPage.*

### TC-21 — Pay button → Stripe page is displayed
On the review page, click **Pay**.
**✅ Expect:** redirect to `checkout.stripe.com` and the **hosted Stripe checkout page renders** with the **correct amount** (the parent's full total) and the quote # in the description. *(Do not complete yet.)* *Covers: create-checkout-session happy path.*

### TC-22 — Payment Link (Stripe) is displayed
Back in admin, parent quote → **Create Payment Link** → the **Payment Link (Stripe)** box fills with a Stripe URL → open it.
**✅ Expect:** Stripe payment page renders with the correct amount. *Covers: create-payment-link / create-checkout-session.*

### TC-23 — Send quote-link email
Quote → **Send** (quote-link email) to a mailbox you control.
**✅ Expect:** email arrives with a working review-link button → lands on TC-20's page. *Covers: send-quote-link-email.*

### TC-24 — Child quote is not independently payable
Open a child quote's review URL directly (swap the id in the URL) and click Pay.
**✅ Expect:** rejected — *"This is a sub-quote of a multi-language order; pay the parent quote instead."* *Covers: create-checkout-session child guard.*

---

## Phase 4 — Stripe prepay → fan-out → order

### TC-30 — Pay the parent (real card, small amount)
Build a **~$2** 2-pair quote (TC-01/02), open the review link, **complete payment** with a real card.
**✅ Expect:** redirect to the **order success** page showing **one** order # + the full amount; confirmation email arrives. *Covers: stripe-webhook (live), convert_quote_to_orders (Stripe branch).*

### TC-31 — Parent order shows the work-units panel
`/admin/orders` → open the new order → **Workflow** tab.
**✅ Expect:** a **"Work units (N)"** panel listing each child order with its pair (e.g. Spanish (Spain) → English, French → English); the parent has **no** standalone workflow. *Covers: AdminOrderDetail.*

### TC-32 — Child order shows its own workflow
Click a work unit.
**✅ Expect:** the child order renders its **own** Workflow section ("Assign Workflow", Certified Translation template). *Covers: routing.*

### TC-33 — Money lives on the parent only
Parent Finance tab: amount paid = full total, balance 0; each child shows **$0**. *Covers: money model / no double-count.*

### TC-34 — Idempotency
Re-trigger the same webhook event (Stripe dashboard → resend `checkout.session.completed`).
**✅ Expect:** **no duplicate orders** (still 1 parent + N children). *Covers: convert_quote_to_orders idempotency.*

### TC-35 — Refund
Refund the TC-30 charge in the Stripe dashboard.

---

## Phase 5 — Manual / cash conversion ⚠️

> ⚠️ The manual/cash conversion path is **separate** from Stripe and AR. The
> fan-out only branches in `stripe-webhook` and `customer-approve-quote-ar`, so
> this is the test most likely to reveal a gap — verify it fans out.

### TC-40 — Convert a multi-pair quote with CASH
Build a 2-pair quote. On the quote → **Receive Payment** → method **Cash**,
amount = full total, reference → **Confirm**.
**✅ Expect (correct):** quote converts to a **parent order (paid)** + **N child
work-unit orders** — same fan-out as Stripe; the order's Workflow tab shows the
work-units panel.
**❌ If instead** a **single order with no children / no work-units panel** is
created → the manual-payment conversion path is **missing the fan-out branch**.
File it; the fix is to route this path through `convert_quote_to_orders`.
*Covers: admin manual-payment conversion (Receive Payment / manage-customer-payments).*

### TC-41 — Single-pair cash conversion (baseline)
Repeat with a 1-pair quote.
**✅ Expect:** exactly **1 paid order** (works regardless of the gap above).

---

## Phase 6 — AR customer: approve → invoice → manual payment

### TC-50 — AR build + approve
Create an **AR-approved** customer `ZZ TEST AR`; build a 2-pair quote; from the
customer review link click **Approve & bill on AR (Net 30)** (or admin
Direct-order AR).
**✅ Expect:** parent order created **balance_due = full total**, children $0;
quote shows **AR approved**; work-units panel present; **no** payment captured.
*Covers: customer-approve-quote-ar, AR conversion branch.*

### TC-51 — Create / issue invoice
Open the parent (AR) order → **Finance** tab → **Create / Issue Invoice**.
**✅ Expect:** an invoice (`INV-…`) created against the **parent** order for the
full balance; status unpaid. *Covers: customer_invoices, invoice creation.*

### TC-52 — Invoice PDF
**Download / View invoice PDF.**
**✅ Expect:** PDF renders with correct customer, INV #, line items, total,
Net-30 terms. *Covers: generate-invoice-pdf.*

### TC-53 — Send invoice email
**Send Invoice** to a mailbox you control.
**✅ Expect:** customer receives the invoice email with PDF/link. *Covers: send-invoice-email.*

### TC-54 — Record manual payment against the invoice
Finance tab → **Receive / Record Payment** → method **Cheque** (or Cash/
E-transfer), amount = invoice total, reference → **Confirm**.
**✅ Expect:** invoice → **Paid**; order balance → 0 / status **paid**; the
payment row shows method + reference. *Covers: manage-customer-payments, allocation.*

### TC-55 — Partial payment (optional)
Record a partial amount first → invoice shows partial paid + remaining balance;
a second payment clears it.

---

## Phase 7 — Pricing: multi-page bundle discount

> Tiered % discount (per PR #818): **2 pages = 5%**, **3–4 pages = 7%**,
> **5+ pages = 10%**. Requires the 3 edge functions redeployed with the new
> `_shared/multi-page-discount.ts` bundled.

### TC-60 — 2-page bundle discount applies
Build a quote with **one document, 2 billable pages** (single pair).
**✅ Expect:** the price summary shows an **auto bundle discount** line
(`auto_multi_page_bundle_2p`, ~5% off translation). *Covers: multi-page-discount.ts.*

### TC-61 — Tier boundaries (optional)
3-page and 5-page docs → discount shifts to 7% / 10% respectively.

### TC-62 — Override suppresses (optional)
With a base-rate override set, the auto bundle discount does **not** apply.

---

## Phase 8 — Project, vendor workflow, customer portal

### TC-70 — Project grouping
Open the parent order → its **project** link (or `/admin/projects`).
**✅ Expect:** parent order + all child orders listed under one project. *Covers: project grouping.*

### TC-71 — Vendor workflow resolves the right pair
Open each **child** order → **Assign Workflow**.
**✅ Expect:** vendor matching uses **that child's** pair (FR→EN child surfaces
FR→EN vendors, not the parent's ES→EN). Repeat per child. *Covers:
assign-order-workflow, find-matching-vendors — the whole point of the fan-out.*

### TC-72 — Customer portal hides children
Log in / impersonate the customer → **Dashboard**, **Orders**, **Quotes**.
**✅ Expect:** Dashboard counters/activity and the **Orders** and **Quotes**
lists show **one** parent per purchase — **no children** (the PR #817 fix;
previously leaked). The order-success page shows the parent. *Covers:
get-customer-dashboard, get-customer-orders v47, get-customer-quotes v44.*

---

## Phase 9 — Cleanup (all via UI)

- Delete test **quotes** from the quotes list (⋮ → Delete) — works for unconverted ones.
- **Cancel / void** test **orders** and **invoices** from the detail pages.
- **Refund** any real Stripe charge in the Stripe dashboard.
- Remove `ZZ TEST` customers via the Customers admin (or leave them — they're prefixed).

---

## Known issues / watch-list

1. **TC-40** may reveal the manual/cash conversion doesn't fan out (high priority if so).
2. `checkout.stripe.com` cannot be driven by browser automation (safety block) —
   a human opening the URL works fine. Manual step.
3. **Phase 7** discount only takes effect once the 3 edge functions
   (`create-fast-quote`, `create-fast-quote-kiosk`, `admin-create-order`) are
   redeployed bundling the new `_shared/multi-page-discount.ts`.
4. `get-customer-orders` / `get-customer-quotes` are **reconstructed** functions
   (originals were unrecoverable); the leak fix + direct fields are verified, but
   computed fields (`document_count`, `pending_review_count`, `has_invoice`)
   are validated-by-inference — sanity-check them on an order/quote with non-zero
   counts.

---

## Coverage map

| Surface / function | Covered by |
|---|---|
| create-fast-quote (fan-out) | TC-01, TC-03 |
| FastQuoteCreate per-doc pairs | TC-01 |
| AdminCreateOrder quote-mode | TC-02 |
| admin-create-order direct fan-out | TC-10 |
| Quote review link / validate-quote-token | TC-20 |
| create-checkout-session (pay + guard) | TC-21, TC-22, TC-24 |
| send-quote-link-email | TC-23 |
| stripe-webhook + convert_quote_to_orders (Stripe) | TC-30, TC-34 |
| AdminOrderDetail work-units panel / routing | TC-31, TC-32 |
| Money model | TC-33 |
| Manual/cash conversion | TC-40, TC-41 |
| customer-approve-quote-ar (AR branch) | TC-50 |
| Invoice create / PDF / send / pay | TC-51–TC-55 |
| multi-page-discount.ts | TC-60–TC-62 |
| Project grouping | TC-70 |
| assign-order-workflow / find-matching-vendors | TC-71 |
| get-customer-dashboard / orders v47 / quotes v44 | TC-72 |
| N=1 regression | TC-03, TC-41 |
