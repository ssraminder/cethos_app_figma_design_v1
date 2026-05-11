# Pricing convention

**Effective:** 2026-05-11 (migration `20260511_normalize_subtotal_convention.sql`).

This document is the single source of truth for what each pricing column
means and how totals are computed. Every consumer — SQL functions, edge
functions, frontend, invoice PDF generator — must use these formulas.

## Field semantics

At every level (per-row, per-quote, per-order, per-invoice):

| Field | Meaning |
|---|---|
| `line_total` | **Translation cost only** for one document/group row. Does not include certification. |
| `certification_price` | Per-row certification cost. Separate from `line_total`. |
| `subtotal` | Sum of `line_total` for all active rows on the quote/order/invoice. **Translation only.** |
| `certification_total` | Sum of per-row `certification_price` + quote-level `quote_certifications`. |
| `rush_fee` | Currency amount of rush surcharge. |
| `delivery_fee` | Currency amount of physical delivery fee. |
| `surcharge_total` | Sum of manual surcharge adjustments (currency, after % evaluation). |
| `discount_total` | Sum of manual discount adjustments (currency, positive value). |
| `tax_rate` | Decimal tax rate (e.g. `0.05` for 5%). |
| `tax_amount` | Currency amount of tax applied to `pre_tax`. |
| `total` / `total_amount` | Final amount payable. |

## The two formulas you need

```
pre_tax = subtotal + certification_total
        + rush_fee + delivery_fee
        + surcharge_total - discount_total

total   = pre_tax + tax_amount
```

That's it. Any code that derives a different `pre_tax` or `total` is wrong.

## Percentage rush / percentage adjustments

When `rush_fee_type = 'percentage'` or an adjustment row has
`value_type = 'percentage'`, the percentage is applied to:

```
pct_base = subtotal + certification_total
```

(Option B from the 2026-05-11 design call: percentages apply to the
"goods and services" line, before any fees.)

Note: the rush computation also adds `adjustments_total` to this base
(`v_fee_base := v_pct_base + v_adjustments_total`) so the order of
operations stays "compute adjustments → compute rush → compute tax".

## Worked example

Translation $99, certification $40, no rush/delivery/discount/surcharge, 5% tax:

```
subtotal             =  99.00
certification_total  =  40.00
rush_fee             =   0.00
delivery_fee         =   0.00
surcharge_total      =   0.00
discount_total       =   0.00
pre_tax              = 139.00   (99 + 40 + 0 + 0 + 0 - 0)
tax_amount           =   6.95   (ROUND(139 * 0.05, 2))
total                = 145.95   (139 + 6.95)
```

## Historical data (pre-2026-05-11)

The migration **does not backfill** existing rows (per design call: "moving
forward it should be ok"). Rows created before the migration:

* `quotes.subtotal` may equal `translation + certification` (analysis path)
  or `translation` (groups path) — depends on which recalc function ran.
* `ai_analysis_results.line_total` may equal `translation + certification`
  rather than translation only.
* `quotes.total` is always correct (it was correct under both prior
  conventions).

These rows transition to the new convention the next time their parent
quote is recalculated. Code that needs to derive pre-tax on historical
data MUST compute it as `total - tax_amount` (always correct), not as
`SUM(component fields)`.

## Where the convention is enforced

| Layer | Enforced by |
|---|---|
| Per-row line totals | `recalculate_document_totals(p_analysis_id)`, `recalculate_document_group(p_group_id)` |
| Per-quote totals | `recalculate_quote_totals(p_quote_id)` (analysis path), `recalculate_quote_from_groups(p_quote_id)` (groups path) |
| Direct orders (no quote) | `recalculate_direct_order_totals(p_order_id)` |
| Edge function dispatch | `supabase/functions/recalculate-quote-pricing/index.ts` |
| Edge function loaders | `supabase/functions/get-order-workflow/index.ts` (`loadOrderFinancials`) |
| Order creation mirror | `supabase/functions/admin-create-order/index.ts`, `crm-create-order/index.ts` |
| Invoice PDF | `supabase/functions/generate-invoice-pdf/index.ts` |
| Quote detail UI | `client/pages/admin/AdminQuoteDetail.tsx` |
| Order finance UI | `client/components/admin/OrderFinanceTab.tsx`, `OrderFinanceSection.tsx` |
| Quote create flows | `client/pages/admin/FastQuoteCreate.tsx`, `client/pages/kiosk/KioskStaffForm.tsx`, `client/components/quote/Step4ReviewCheckout.tsx` |
| Order edit | `client/components/admin/EditOrderModal.tsx` |
| Invoice create | `client/pages/admin/invoices/CreateInvoice.tsx` |

## Code patterns to follow

**Computing displayed pre-tax (handles both old and new records):**

```ts
const preTax = Math.max(0, Number(row.total || 0) - Number(row.tax_amount || 0));
```

**Computing a NEW quote/order total client-side:**

```ts
const preTax = subtotal + certificationTotal + rushFee + deliveryFee
             + surchargeTotal - discountTotal;
const taxAmount = ROUND(preTax * taxRate, 2);
const total = preTax + taxAmount;
```

**Computing percentage rush / adjustment client-side preview:**

```ts
const pctBase = (quote.subtotal || 0) + (quote.certification_total || 0);
const calculatedAmount = pctBase * (percentValue / 100);
```

**Deriving translation-only from a row of unknown vintage:**

```ts
// Identity holds under both conventions
const translation = Math.max(0,
  row.total - row.tax_amount - row.rush_fee - row.delivery_fee
  - row.surcharge_total + row.discount_total - row.certification_total
);
```
