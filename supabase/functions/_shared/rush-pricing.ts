// ============================================================================
// rush-pricing.ts — single source of truth for rush surcharge math in emails
// ----------------------------------------------------------------------------
// Resolves the rush multiplier (e.g. 1.30 = +30%) from:
//   1. The active turnaround_options row tagged code='rush' (if present)
//   2. app_settings.rush_multiplier
//   3. Hardcoded fallback 1.30 (the rate the business has been quoting since
//      May 2026; kept as the floor so an empty DB never produces nonsense).
//
// Used by quote-ready + pay-link emails to advertise the standard ⟷ rush
// trade-off without baking rush into the displayed subtotal/total. **Never
// hardcode the percentage in an email template** — call `getRushConfig` and
// render `rush.label`.
// ============================================================================

export interface RushConfig {
  multiplier: number;
  surcharge: number;
  label: string;
  estimatedDays: number | null;
  source: "turnaround_options" | "app_settings" | "fallback";
}

const FALLBACK_MULTIPLIER = 1.3;

export async function getRushConfig(supabase: any): Promise<RushConfig> {
  // 1. Try the turnaround_options table (admin-managed UI surface).
  try {
    const { data: option } = await supabase
      .from("turnaround_options")
      .select("multiplier, estimated_days")
      .eq("code", "rush")
      .eq("is_active", true)
      .maybeSingle();
    const m = option?.multiplier != null ? Number(option.multiplier) : null;
    if (m && Number.isFinite(m) && m > 1) {
      return {
        multiplier: m,
        surcharge: m - 1,
        label: formatRushLabel(m - 1),
        estimatedDays: option?.estimated_days ?? null,
        source: "turnaround_options",
      };
    }
  } catch (e) {
    console.warn(
      "rush-pricing: turnaround_options lookup failed, falling back",
      (e as Error)?.message ?? e,
    );
  }

  // 2. Try app_settings.rush_multiplier.
  try {
    const { data: setting } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "rush_multiplier")
      .maybeSingle();
    const m = setting?.setting_value != null ? Number(setting.setting_value) : null;
    if (m && Number.isFinite(m) && m > 1) {
      return {
        multiplier: m,
        surcharge: m - 1,
        label: formatRushLabel(m - 1),
        estimatedDays: null,
        source: "app_settings",
      };
    }
  } catch (e) {
    console.warn(
      "rush-pricing: app_settings lookup failed, using fallback",
      (e as Error)?.message ?? e,
    );
  }

  // 3. Hardcoded fallback (matches the business's stated +30%).
  return {
    multiplier: FALLBACK_MULTIPLIER,
    surcharge: FALLBACK_MULTIPLIER - 1,
    label: formatRushLabel(FALLBACK_MULTIPLIER - 1),
    estimatedDays: null,
    source: "fallback",
  };
}

export function formatRushLabel(surcharge: number): string {
  return `+${Math.round(surcharge * 100)}%`;
}

export function computeRush(subtotal: number, surcharge: number): {
  rushFee: number;
  rushedSubtotal: number;
} {
  const rushFee = round2(subtotal * surcharge);
  const rushedSubtotal = round2(subtotal + rushFee);
  return { rushFee, rushedSubtotal };
}

export function computeRushTotal(args: {
  subtotal: number;
  taxRate: number;
  surcharge: number;
}): {
  rushFee: number;
  rushedSubtotal: number;
  rushedTaxAmount: number;
  rushedTotal: number;
} {
  const { rushFee, rushedSubtotal } = computeRush(args.subtotal, args.surcharge);
  const rushedTaxAmount = round2(rushedSubtotal * args.taxRate);
  const rushedTotal = round2(rushedSubtotal + rushedTaxAmount);
  return { rushFee, rushedSubtotal, rushedTaxAmount, rushedTotal };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatMoney(amount: number, currency = "CAD"): string {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
