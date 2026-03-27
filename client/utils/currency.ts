export const CURRENCY_SYMBOLS: Record<string, string> = {
  CAD: '$', USD: '$', EUR: '€', GBP: '£', JPY: '¥',
  CNY: '¥', CHF: 'CHF', AUD: 'A$', NZD: 'NZ$', HKD: 'HK$',
  MXN: 'MX$', BRL: 'R$', INR: '₹', KRW: '₩', SEK: 'kr',
  NOK: 'kr', DKK: 'kr', TRY: '₺', SAR: 'SAR', ILS: '₪',
  THB: '฿', MYR: 'RM', IDR: 'Rp', TWD: 'NT$', PEN: 'S/',
  VND: '₫',
};

export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

export function formatCurrencyAmount(amount: number | null | undefined, currency = 'CAD'): string {
  if (amount == null) return `${getCurrencySymbol(currency)}0.00`;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `${getCurrencySymbol(currency)}${num.toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCurrencyWithCode(amount: number | null | undefined, currency = 'CAD'): string {
  return `${formatCurrencyAmount(amount, currency)} ${currency}`;
}

export type CurrencyBadgeColor = 'gray' | 'blue' | 'green' | 'purple' | 'yellow';

export function getCurrencyBadgeColor(code: string): CurrencyBadgeColor {
  switch (code) {
    case 'CAD': return 'gray';
    case 'USD': return 'blue';
    case 'EUR': return 'green';
    case 'GBP': return 'purple';
    default: return 'yellow';
  }
}

const BADGE_CLASSES: Record<CurrencyBadgeColor, string> = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  purple: 'bg-purple-100 text-purple-700',
  yellow: 'bg-yellow-100 text-yellow-700',
};

export function getCurrencyBadgeClasses(code: string): string {
  return BADGE_CLASSES[getCurrencyBadgeColor(code)];
}
