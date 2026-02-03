import {
  QuotePage,
  DocumentGroup,
  GroupPage,
  PricingSettings,
  PricingTotals,
  Complexity,
  COMPLEXITY_MULTIPLIERS,
  DEFAULT_PRICING_SETTINGS
} from '../types';

/**
 * Calculate billable pages for a single page
 * Formula: CEIL((words / 225) × complexity × 10) / 10
 */
export function calculatePageBillable(
  wordCount: number,
  complexityMultiplier: number,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
): number {
  const raw = (wordCount / settings.words_per_page) * complexityMultiplier;
  // Round UP to nearest 0.10
  return Math.ceil(raw * 10) / 10;
}

/**
 * Calculate billable pages for a document (sum of pages, min 1.0)
 */
export function calculateDocumentBillable(
  pages: GroupPage[],
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
): number {
  const total = pages.reduce((sum, page) => sum + page.billable_pages, 0);
  return Math.max(settings.min_billable_pages, Math.ceil(total * 10) / 10);
}

/**
 * Calculate translation cost for a document
 * Formula: CEIL(billable × base_rate × lang_mult / 2.50) × 2.50
 */
export function calculateTranslationCost(
  billablePages: number,
  baseRate: number,
  languageMultiplier: number
): number {
  const raw = billablePages * baseRate * languageMultiplier;
  // Round UP to nearest $2.50
  return Math.ceil(raw / 2.5) * 2.5;
}

/**
 * Calculate total for a document group
 */
export function calculateGroupTotal(
  translationCost: number,
  certificationPrice: number
): number {
  return translationCost + certificationPrice;
}

/**
 * Get complexity multiplier from complexity string
 */
export function getComplexityMultiplier(complexity: Complexity): number {
  return COMPLEXITY_MULTIPLIERS[complexity] || COMPLEXITY_MULTIPLIERS.medium;
}

/**
 * Build GroupPage array from QuotePages
 */
export function buildGroupPages(
  pages: QuotePage[],
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
): GroupPage[] {
  return pages.map(page => ({
    id: page.id,
    page_number: page.page_number,
    word_count: page.word_count,
    complexity: page.complexity || 'medium',
    complexity_multiplier: page.complexity_multiplier || getComplexityMultiplier(page.complexity || 'medium'),
    billable_pages: calculatePageBillable(
      page.word_count,
      page.complexity_multiplier || getComplexityMultiplier(page.complexity || 'medium'),
      settings
    ),
  }));
}

/**
 * Calculate pricing totals for all groups
 */
export function calculatePricingTotals(
  groups: DocumentGroup[],
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
): PricingTotals {
  const totals: PricingTotals = {
    total_documents: groups.length,
    total_pages: 0,
    total_words: 0,
    total_billable_pages: 0,
    translation_subtotal: 0,
    certification_subtotal: 0,
    subtotal: 0,
  };

  groups.forEach(group => {
    totals.total_pages += group.pages.length;
    totals.total_words += group.total_words;
    totals.total_billable_pages += group.total_billable_pages;
    totals.translation_subtotal += group.translation_cost;
    totals.certification_subtotal += group.certification_price;
    totals.subtotal += group.group_total;
  });

  return totals;
}

/**
 * Recalculate a document group with new data
 */
export function recalculateGroup(
  group: DocumentGroup,
  baseRate: number,
  languageMultiplier: number,
  certificationPrice: number,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
): DocumentGroup {
  const totalWords = group.pages.reduce((sum, p) => sum + p.word_count, 0);
  const totalBillable = calculateDocumentBillable(group.pages, settings);
  const translationCost = calculateTranslationCost(totalBillable, baseRate, languageMultiplier);
  const groupTotal = calculateGroupTotal(translationCost, certificationPrice);

  return {
    ...group,
    total_words: totalWords,
    total_billable_pages: totalBillable,
    certification_price: certificationPrice,
    translation_cost: translationCost,
    group_total: groupTotal,
  };
}
