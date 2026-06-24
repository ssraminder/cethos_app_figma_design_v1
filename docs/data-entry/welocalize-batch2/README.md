# Welocalize — 2nd batch back-entry (2026-06-23)

Source: `2nd Batch.xlsx` (38 already-delivered Linguistic-Validation order lines).
Customer: **Welocalize, Inc.** `fcb79ac3-aba6-41b8-9bda-568c1cf5a0ec` (AR, tax-exempt, USD, net_45, branch 2 = 12537494 Canada Inc.).
Operator staff: raminder@cethos.com `a8b2d97e-4832-41d4-9334-4d6a58558154`.

## Phase 1 (this entry): jobs → receivables → invoices

| Stage | What | Result |
|---|---|---|
| A | 38 direct orders + 38 draft receivables | `ORD-2026-10445 … 10482` |
| C | 6 PO-grouped invoices from receivables (+ AR ledger) | `CT-2026-001015 … 001020` = **$48,250 USD** |
| PDF | branded PDFs via `generate-invoice-pdf` | all 6 rendered, tax 0% |

Column reading: **"Client PO"** = USD revenue billed; **"PO Number"** = the Welocalize PO ref; **"Expense"** = vendor cost (Phase 2); **Status "Submitted"** = delivered. Source = English (`en`), target = the row's locale. Chinese/China → Chinese (Simplified) `zh-Hans`.

### Per-PO invoices
| Invoice | PO | Lines | USD |
|---|---|---|---|
| CT-2026-001015 | PO-1414502 | 4 | 7,750 |
| CT-2026-001016 | PO-1417055 | 5 | 6,350 |
| CT-2026-001017 | PO-1418133 | 3 | 2,850 |
| CT-2026-001018 | PO-1418158 | 7 | 8,800 |
| CT-2026-001019 | PO-1420602 | 18 | 18,700 |
| CT-2026-001020 | PO-1421561 | 1 | 3,800 |

Invoice line format (from `trg_enrich_invoice_line_description`, pass `description=NULL`):
`Order {ORD#} | {Service} | English > {Target} | PO: {PO}` + `client_project_number` column.

## Method
- Orders created via **SQL** (not `admin-create-order`) to avoid firing 38 customer order-confirmation emails for already-delivered work. Mirrors admin-create-order exactly (quote 'paid' + direct order + workflow + steps). Each stage was dry-run (forced ROLLBACK) before commit.
- Receivables drive order totals (`recalculate_direct_order_totals` AFTER trigger).
- Steps left **unassigned** — Phase 2 = assign vendors (Usman exclusive for Cogdeb/ClinRev) + payables incl. the 50% profit-share step.

## Bugs found in `generate-customer-invoice` (the portal Create-Invoice wizard backend)
The canary call exposed two live bugs, so the 6 invoices were built via controlled SQL instead:
1. **GST applied to a tax-exempt customer** — adds 5% even though `customers.is_tax_exempt=true` (same as batch 1).
2. **Doubled/ugly line descriptions** — it passes its own `"Order X · PO: Y"` as the line description, which the
   (2026-06-23) enrich trigger now *preserves* → `Order X | Order X · PO: Y | src > tgt | PO: Y`, dropping the
   clean service/job-type segment. Regression from the receivables-first "preserve caller description" change.

Both need a source fix (function is currently a source-less deployed bundle). Until fixed, prefer the
receivables-first path (`description=NULL` → clean enriched line) over the wizard for tax-exempt / multi-order invoicing.

## Known limitation
Multi-order PO invoices have `customer_invoices.order_id = NULL` (an invoice spanning N orders has no single owner),
so the per-order detail page (which looks up invoices by `order_id`) won't show "issued" on those 33 orders and the
receivable editor stays unlocked. The receivable `status='invoiced'` + AR rows are the source of truth. Matches batch 1.

Scripts: `stageA_orders_receivables.sql`, `stageC_invoices.sql`.
