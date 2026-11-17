// Locale-aware money and date formatting.

const LANG = (typeof navigator !== 'undefined' && navigator.language) || 'en-GB';

const BY_LOCALE = {
  'en-GB': 'GBP', 'en-US': 'USD', 'en-CA': 'CAD', 'fr-CA': 'CAD', 'en-AU': 'AUD', 'en-NZ': 'NZD',
  'en-IE': 'EUR', 'en-IN': 'INR', 'en-ZA': 'ZAR', 'pt-BR': 'BRL', 'es-MX': 'MXN', 'ja-JP': 'JPY',
  'sv-SE': 'SEK', 'nb-NO': 'NOK', 'da-DK': 'DKK', 'pl-PL': 'PLN', 'de-CH': 'CHF', 'fr-CH': 'CHF',
};
const EURO_LANGS = /^(de|fr|es|it|nl|pt|fi|el|sk|sl|et|lv|lt|ga|mt|hr)\b/i;

function currencyFor(lang) {
  if (BY_LOCALE[lang]) return BY_LOCALE[lang];
  if (EURO_LANGS.test(lang)) return 'EUR';
  if (/^en\b/i.test(lang) && !lang.includes('-')) return 'USD';
  return null;
}

const currency = currencyFor(LANG);
const moneyFmt = currency
  ? new Intl.NumberFormat(LANG, { style: 'currency', currency })
  : new Intl.NumberFormat(LANG, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wholeFmt = currency
  ? new Intl.NumberFormat(LANG, { style: 'currency', currency, maximumFractionDigits: 0 })
  : new Intl.NumberFormat(LANG, { maximumFractionDigits: 0 });

export const money = (n) => moneyFmt.format(n || 0);
export const moneyShort = (n) => wholeFmt.format(n || 0);

/** True where 03/04 means 3 April (most of the world), false for the US. */
export const DAY_FIRST = !/-(US|PH)$/i.test(LANG) && LANG !== 'en';

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shortDate(dateStr, withYear = false) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LANG, {
    day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}),
  });
}
