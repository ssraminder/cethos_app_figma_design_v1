// System default base rate — only used as fallback when no stored effective rate
// is available. The actual per-document rate is stored in ai_analysis_results.base_rate
// and includes the language multiplier adjustment (e.g., $75 for Arabic 1.15×).
export const BASE_RATE_PER_PAGE = 65.00;

/**
 * Round a number UP to the next $2.50 increment
 * Examples:
 *   roundToNext250(58.50) → 60.00
 *   roundToNext250(65.00) → 65.00
 *   roundToNext250(78.00) → 80.00
 *   roundToNext250(91.00) → 92.50
 */
export const roundToNext250 = (amount: number): number => {
  return Math.ceil(amount / 2.50) * 2.50;
};

/**
 * Calculate per-page rate based on language multiplier
 * @param multiplier - Language tier multiplier (e.g., 0.9, 1.0, 1.2, 1.4)
 * @param baseRate - Optional override for base rate (defaults to $65.00)
 * @returns Per-page rate rounded to next $2.50
 */
export const calculatePerPageRate = (
  multiplier: number = 1.0,
  baseRate: number = BASE_RATE_PER_PAGE
): number => {
  const rawRate = baseRate * multiplier;
  return roundToNext250(rawRate);
};

/**
 * Calculate line total for a document
 * @param billablePages - Number of billable pages (can be decimal)
 * @param multiplier - Language tier multiplier
 * @param complexityMultiplier - Complexity multiplier (1.0, 1.15, 1.25)
 * @param baseRate - Optional override for base rate
 * @returns Line total rounded to 2 decimal places
 */
export const calculateLineTotal = (
  billablePages: number,
  multiplier: number = 1.0,
  complexityMultiplier: number = 1.0,
  baseRate: number = BASE_RATE_PER_PAGE
): number => {
  const perPageRate = calculatePerPageRate(multiplier, baseRate);
  const total = billablePages * perPageRate * complexityMultiplier;
  return Math.round(total * 100) / 100; // Round to 2 decimal places
};

/**
 * Format currency for display
 */
export const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};

/**
 * Get pricing breakdown for display
 */
export const getPricingBreakdown = (
  multiplier: number,
  baseRate: number = BASE_RATE_PER_PAGE
): {
  baseRate: number;
  multiplier: number;
  rawRate: number;
  perPageRate: number;
  breakdownText: string;
} => {
  const rawRate = baseRate * multiplier;
  const perPageRate = roundToNext250(rawRate);

  return {
    baseRate,
    multiplier,
    rawRate,
    perPageRate,
    breakdownText: `$${baseRate.toFixed(2)} × ${multiplier.toFixed(2)} = $${rawRate.toFixed(2)} → $${perPageRate.toFixed(2)}`
  };
};
