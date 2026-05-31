// Auto multi-page bundle discount.
//
// The per-page rate is uniform for every page (set in admin/settings →
// `base_rate_per_page`, language-adjusted). This applies a tiered PERCENTAGE
// off the translation order total based on the billable page count:
//
//   1 page                       → no discount
//   2 pages                      →  5% off the order
//   3–4 pages                    →  7% off the order
//   5+ pages (more than 4)       → 10% off the order
//   base-rate override in effect → no discount
//
// Tier percentages per the product owner (2026-05-30). The returned `amount`
// is a positive dollar value; the caller inserts it as a `fixed` discount
// adjustment with reason `auto_multi_page_bundle_<pages>p`.
//
// (History: the original shared file was lost — never committed, absent from all
// deployed bundles. The one legacy adjustment row, 2026-05-05, used a different
// value and predates this rule.)

export interface MultiPageBundleResult {
  applies: boolean;
  amount: number;
  reason: string;
}

export function calculateMultiPageBundleDiscount(
  totalBillable: number,
  baseRate: number,
  langMult: number,
  hasOverride: boolean,
): MultiPageBundleResult {
  const NONE: MultiPageBundleResult = { applies: false, amount: 0, reason: "" };

  // Manual base-rate override in effect → leave pricing exactly as staff set it.
  if (hasOverride) return NONE;

  const pages = Math.max(0, Math.floor(Number(totalBillable) || 0));
  if (pages < 2) return NONE;

  // Tiered percentage off the order.
  let rate: number;
  if (pages >= 5) rate = 0.10;
  else if (pages >= 3) rate = 0.07; // 3–4 pages
  else rate = 0.05; // exactly 2 pages

  // Uniform per-page rate (same for every page), using the codebase's
  // $2.50-rounded effective-rate convention so the discount base matches the
  // translation subtotal that is actually charged.
  const perPage = Math.ceil((Number(baseRate) * Number(langMult)) / 2.5) * 2.5;
  const orderTotal = perPage * pages;

  let amount = Math.round(orderTotal * rate * 100) / 100;
  amount = Math.min(Math.max(amount, 0), orderTotal);
  if (amount <= 0) return NONE;

  return {
    applies: true,
    amount,
    reason: `auto_multi_page_bundle_${pages}p`,
  };
}
