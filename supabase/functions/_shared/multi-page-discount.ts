// ⚠️ RECONSTRUCTED — this is NOT the original source.
// The canonical _shared/multi-page-discount.ts was lost: it is absent from git
// (every ref, after a full fetch), from disk, and from ALL deployed edge-function
// bundles (create-fast-quote v59, admin-create-order v49). It only ever existed
// as an uncommitted working file in the elastic-kapitsa worktree. This file is a
// best-effort rebuild (2026-05-30) so the auto bundle discount applies again.
//
// It is anchored to the ONLY surviving evidence:
//   • Historical adjustment — quote QT26-10416 (2026-05-05):
//       2 billable pages, base rate $55, language ×1  →  $15.00 off
//       (quote_adjustments: reason 'auto_multi_page_bundle_2p', value_type 'fixed')
//   • Call-site comment in create-fast-quote/index.ts:
//       "Auto multi-page bundle discount (e.g. 2-page = $95 instead of 2 × $55)"
//
// ──────────────────────────────────────────────────────────────────────────
// OPEN QUESTIONS — could not be recovered; the tier math below is UNVERIFIED.
// A reviewer who knows the real rule must confirm/correct before this is relied
// on for 3+ page orders or for base rates other than the one verified case:
//   1. Does the discount scale with the per-page rate / language multiplier, or
//      is it a flat dollar amount? Implemented here as a FLAT $15 per page beyond
//      the first — the only model that reproduces the single data point with
//      round numbers. (baseRate/langMult are used only to cap the discount and
//      to honor an override.)
//   2. What are the 3p / 4p / 5p+ tiers? Implemented as a linear extrapolation
//      of the 2p anchor: (pages − 1) × $15. UNCONFIRMED.
//   3. Should an explicit base-rate override suppress the bundle discount?
//      Implemented as yes.
// ──────────────────────────────────────────────────────────────────────────

export interface MultiPageBundleResult {
  applies: boolean;
  amount: number;
  reason: string;
}

// Dollar discount per page beyond the first. Anchored to the single known
// historical adjustment ($15 off a 2-page / $55 order). UNVERIFIED — see header.
const DISCOUNT_PER_EXTRA_PAGE = 15;

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
  // Bundle pricing only applies to genuine multi-page orders (2+).
  if (pages < 2) return NONE;

  // Per-page list rate, using the same $2.50-rounded convention as the rest of
  // the codebase (client document-flow calculateTranslationCost / calculatePerPageRate).
  const perPage = Math.ceil((Number(baseRate) * Number(langMult)) / 2.5) * 2.5;
  const gross = perPage * pages;

  // Linear extrapolation of the single known tier. UNVERIFIED for pages >= 3.
  let amount = (pages - 1) * DISCOUNT_PER_EXTRA_PAGE;

  // Never go negative or exceed the order value.
  amount = Math.min(Math.max(amount, 0), gross);
  amount = Math.round(amount * 100) / 100;
  if (amount <= 0) return NONE;

  return {
    applies: true,
    amount,
    reason: `auto_multi_page_bundle_${pages}p`,
  };
}
