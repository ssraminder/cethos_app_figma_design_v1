// Currency options offered in admin assignment / payable modals.
// Mirrors the recruitment-app list at apps/recruitment/src/lib/currencies.ts
// so any currency a vendor can pick during onboarding is also available
// when admin assigns or settles their payable.
export const ADMIN_CURRENCIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "CNY", label: "CNY — Chinese Yuan" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "MXN", label: "MXN — Mexican Peso" },
  { code: "BRL", label: "BRL — Brazilian Real" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "ZAR", label: "ZAR — South African Rand" },
  { code: "SEK", label: "SEK — Swedish Krona" },
  { code: "NOK", label: "NOK — Norwegian Krone" },
  { code: "DKK", label: "DKK — Danish Krone" },
  { code: "HKD", label: "HKD — Hong Kong Dollar" },
  { code: "PKR", label: "PKR — Pakistani Rupee" },
  { code: "HUF", label: "HUF — Hungarian Forint" },
  { code: "KES", label: "KES — Kenyan Shilling" },
];

export const ADMIN_CURRENCY_CODES = ADMIN_CURRENCIES.map((c) => c.code);

export function isSupportedAdminCurrency(code: string | null | undefined): boolean {
  if (!code) return false;
  return ADMIN_CURRENCY_CODES.includes(code.toUpperCase());
}
