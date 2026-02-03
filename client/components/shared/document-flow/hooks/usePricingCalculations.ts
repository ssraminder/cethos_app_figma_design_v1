import { useMemo, useCallback } from 'react';
import { DocumentGroup, PricingSettings, PricingTotals, DEFAULT_PRICING_SETTINGS } from '../types';
import { calculatePricingTotals, recalculateGroup } from '../utils/calculations';

export function usePricingCalculations(
  groups: DocumentGroup[],
  pricingSettings: PricingSettings = DEFAULT_PRICING_SETTINGS,
  languageMultiplier: number = 1.0
) {
  // Calculate totals whenever groups change
  const totals = useMemo<PricingTotals>(() => {
    return calculatePricingTotals(groups, pricingSettings);
  }, [groups, pricingSettings]);

  // Recalculate a single group
  const recalculate = useCallback(
    (group: DocumentGroup, newCertificationPrice?: number) => {
      return recalculateGroup(
        group,
        pricingSettings.base_rate,
        languageMultiplier,
        newCertificationPrice ?? group.certification_price,
        pricingSettings
      );
    },
    [pricingSettings, languageMultiplier]
  );

  return {
    totals,
    recalculate,
    baseRate: pricingSettings.base_rate,
    wordsPerPage: pricingSettings.words_per_page,
  };
}
