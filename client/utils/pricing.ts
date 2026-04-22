// System default base rate — only used as fallback when no stored effective rate
// is available. The actual per-document rate is stored in ai_analysis_results.base_rate
// and includes the language multiplier adjustment (e.g., $75 for Arabic 1.15×).
export const BASE_RATE_PER_PAGE = 65.00;

// ============================================================================
// Chat-screenshot pricing rule
// ----------------------------------------------------------------------------
// Files detected as `chat_screenshot` use a flat per-screenshot rate (with a
// quote-level minimum), bypassing the words/225 × language × complexity
// formula. Settings are stored in app_settings so admins can tune them at
// runtime — see `screenshot_*` keys.
// ============================================================================

export const CHAT_SCREENSHOT_DOC_TYPE = "chat_screenshot";
export const CHAT_SCREENSHOT_UNIT = "per_screenshot";

export interface ChatScreenshotSettings {
  enabled: boolean;
  ratePerScreenshot: number;
  quoteMinimum: number;
  screenshotsPerBusinessDay: number;
  standardBaselineDays: number;
  rushBusinessDays: number;
}

export const DEFAULT_CHAT_SCREENSHOT_SETTINGS: ChatScreenshotSettings = {
  enabled: true,
  ratePerScreenshot: 12.0,
  quoteMinimum: 120.0,
  screenshotsPerBusinessDay: 5,
  standardBaselineDays: 1,
  rushBusinessDays: 1,
};

/**
 * Parse the relevant rows from app_settings into a typed settings object.
 * Pass an array of `{setting_key, setting_value}` objects loaded from the
 * `app_settings` table; missing keys fall back to the defaults.
 */
export function parseChatScreenshotSettings(
  rows: Array<{ setting_key: string; setting_value: string }>,
): ChatScreenshotSettings {
  const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  const num = (k: string, fallback: number) => {
    const v = map.get(k);
    if (v == null) return fallback;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const bool = (k: string, fallback: boolean) => {
    const v = map.get(k);
    if (v == null) return fallback;
    return v === "true" || v === "1";
  };
  return {
    enabled: bool("screenshot_pricing_enabled", DEFAULT_CHAT_SCREENSHOT_SETTINGS.enabled),
    ratePerScreenshot: num("screenshot_rate", DEFAULT_CHAT_SCREENSHOT_SETTINGS.ratePerScreenshot),
    quoteMinimum: num("screenshot_quote_minimum", DEFAULT_CHAT_SCREENSHOT_SETTINGS.quoteMinimum),
    screenshotsPerBusinessDay: num(
      "screenshot_per_business_day",
      DEFAULT_CHAT_SCREENSHOT_SETTINGS.screenshotsPerBusinessDay,
    ),
    standardBaselineDays: num(
      "screenshot_standard_baseline_days",
      DEFAULT_CHAT_SCREENSHOT_SETTINGS.standardBaselineDays,
    ),
    rushBusinessDays: num(
      "screenshot_rush_business_days",
      DEFAULT_CHAT_SCREENSHOT_SETTINGS.rushBusinessDays,
    ),
  };
}

export interface ChatScreenshotPricedLine {
  billable_pages: number;
  base_rate: number;
  line_total: number;
  calculation_unit: typeof CHAT_SCREENSHOT_UNIT;
  unit_quantity: number;
  complexity_multiplier: number;
}

/**
 * Compute the chat-screenshot pricing for a single file/line.
 *
 * @param screenshotCount  Number of screenshots (typically `page_count`)
 * @param settings         Chat-screenshot settings (from app_settings)
 * @returns                Pricing fields ready to write to ai_analysis_results,
 *                         OR null if the rule shouldn't apply (disabled, zero count).
 */
export function applyChatScreenshotRule(
  screenshotCount: number,
  settings: ChatScreenshotSettings,
): ChatScreenshotPricedLine | null {
  if (!settings.enabled) return null;
  if (!Number.isFinite(screenshotCount) || screenshotCount <= 0) return null;
  return {
    billable_pages: screenshotCount,
    base_rate: settings.ratePerScreenshot,
    line_total: Math.round(screenshotCount * settings.ratePerScreenshot * 100) / 100,
    calculation_unit: CHAT_SCREENSHOT_UNIT,
    unit_quantity: screenshotCount,
    complexity_multiplier: 1.0,
  };
}

/**
 * Decide whether a row qualifies for the chat_screenshot auto-rule.
 * Skip when staff has manually overridden the pricing (`is_pricing_overridden`)
 * or staff has explicitly chosen a non-screenshot calculation unit.
 */
export function shouldApplyChatScreenshotRule(row: {
  detected_document_type?: string | null;
  is_pricing_overridden?: boolean | null;
  calculation_unit?: string | null;
}): boolean {
  if (row.detected_document_type !== CHAT_SCREENSHOT_DOC_TYPE) return false;
  if (row.is_pricing_overridden) return false;
  // If a non-screenshot unit is already set explicitly, treat as override.
  if (row.calculation_unit && row.calculation_unit !== "per_page" && row.calculation_unit !== CHAT_SCREENSHOT_UNIT) {
    return false;
  }
  return true;
}

/**
 * Apply the per-quote minimum to a list of chat_screenshot line totals.
 * Returns the difference to add as a "minimum top-up" line OR returns the
 * adjusted lines, depending on caller preference.
 *
 * Convention: returns `0` if the sum already meets/exceeds the minimum,
 * otherwise returns the additional amount needed.
 */
export function chatScreenshotQuoteMinimumDelta(
  chatScreenshotLineTotals: number[],
  settings: ChatScreenshotSettings,
): number {
  if (!settings.enabled || chatScreenshotLineTotals.length === 0) return 0;
  const sum = chatScreenshotLineTotals.reduce((a, b) => a + b, 0);
  if (sum >= settings.quoteMinimum) return 0;
  return Math.round((settings.quoteMinimum - sum) * 100) / 100;
}

/**
 * Compute business days needed for a given number of chat screenshots.
 *
 *   standard: ceil(count / screenshotsPerBusinessDay) + standardBaselineDays
 *   rush:     rushBusinessDays (flat)
 *
 * Returns 0 when count is 0 or the rule is disabled.
 */
export function chatScreenshotTurnaroundDays(
  screenshotCount: number,
  isRush: boolean,
  settings: ChatScreenshotSettings,
): number {
  if (!settings.enabled || screenshotCount <= 0) return 0;
  if (isRush) return settings.rushBusinessDays;
  const perDay = Math.max(1, settings.screenshotsPerBusinessDay);
  return Math.ceil(screenshotCount / perDay) + settings.standardBaselineDays;
}

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
 * @param isManualOverride - When true, skips $2.50 rounding (quote has base_rate_override set)
 * @returns Per-page rate (rounded to next $2.50 unless isManualOverride is true)
 */
export const calculatePerPageRate = (
  multiplier: number = 1.0,
  baseRate: number = BASE_RATE_PER_PAGE,
  isManualOverride: boolean = false
): number => {
  const rawRate = baseRate * multiplier;
  return isManualOverride ? rawRate : roundToNext250(rawRate);
};

/**
 * Calculate line total for a document
 * @param billablePages - Number of billable pages (can be decimal)
 * @param multiplier - Language tier multiplier
 * @param complexityMultiplier - Complexity multiplier (1.0, 1.15, 1.25)
 * @param baseRate - Optional override for base rate
 * @param isManualOverride - When true, skips $2.50 rounding (quote has base_rate_override set)
 * @returns Line total rounded to 2 decimal places
 */
export const calculateLineTotal = (
  billablePages: number,
  multiplier: number = 1.0,
  complexityMultiplier: number = 1.0,
  baseRate: number = BASE_RATE_PER_PAGE,
  isManualOverride: boolean = false
): number => {
  const perPageRate = calculatePerPageRate(multiplier, baseRate, isManualOverride);
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
  baseRate: number = BASE_RATE_PER_PAGE,
  isManualOverride: boolean = false
): {
  baseRate: number;
  multiplier: number;
  rawRate: number;
  perPageRate: number;
  breakdownText: string;
} => {
  const rawRate = baseRate * multiplier;
  const perPageRate = isManualOverride ? rawRate : roundToNext250(rawRate);

  return {
    baseRate,
    multiplier,
    rawRate,
    perPageRate,
    breakdownText: `$${baseRate.toFixed(2)} × ${multiplier.toFixed(2)} = $${rawRate.toFixed(2)} → $${perPageRate.toFixed(2)}`
  };
};
