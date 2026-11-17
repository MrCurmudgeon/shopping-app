// Turns raw receipt text (from OCR or pasted from an e-receipt) into
// { store, date, total, items: [{ name, raw, qty, unit, price, category }] }.
// Pure functions, no DOM, so they can be unit tested.

import { guessCategory } from './lib.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Lines that carry a price but are not products.
const NOT_ITEM = /\b(sub\s*-?\s*total|total|tax|vat|gst|hst|pst|change|cash|card|visa|master\s*card|mastercard|amex|debit|credit|balance|tender(ed)?|payment|paid|auth(orization)?|approv(al|ed)|acct|account|terminal|merchant|points|rewards|loyalty|you saved|total sav|items? sold|number of items|no\.? of items|contactless|due)\b/i;
const DISCOUNT = /\b(discount|coupon|promo|offer|saving|savings|multibuy|multi-buy|price cut|reduction|deal|member price|clubcard price|bonus buy)\b/i;
const TOTAL = /(^|\s)(grand\s+total|total(\s+due|\s+to\s+pay)?|balance\s+due|amount\s+due|to\s+pay)\b/i;
const PRICE_AT_END = /(-?)[$£€]?\s?(\d{1,5}[.,]\d{2})\s*(-)?\s*[A-Z*#]{0,2}\s*$/;

export function parseMoney(s) {
  const n = Number(String(s).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Lowercased, punctuation-free, crude singular form, used to match the same product across receipts. */
export function normalizeName(name) {
  const words = String(name).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const last = words[words.length - 1];
  if (last.length > 4 && last.endsWith('ies')) words[words.length - 1] = `${last.slice(0, -3)}y`;
  else if (last.length > 4 && last.endsWith('oes')) words[words.length - 1] = last.slice(0, -2);
  else if (last.length > 3 && last.endsWith('s') && !last.endsWith('ss') && !last.endsWith('us')) words[words.length - 1] = last.slice(0, -1);
  return words.join(' ');
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function validDate(y, m, d) {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Find a purchase date. `dayFirst` decides ambiguous dates like 03/04/2026
 * (true = 3 April, as in the UK/EU; false = March 4, as in the US).
 */
export function findDate(text, dayFirst = true) {
  let m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) {
    const d = validDate(+m[1], +m[2], +m[3]);
    if (d) return d;
  }
  const re = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g;
  while ((m = re.exec(text))) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    let d = null;
    if (a > 12) d = validDate(y, b, a);
    else if (b > 12) d = validDate(y, a, b);
    else d = dayFirst ? validDate(y, b, a) : validDate(y, a, b);
    if (d) return d;
  }
  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{2,4})\b/i);
  if (m) {
    const d = validDate(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
    if (d) return d;
  }
  m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/i);
  if (m) {
    const d = validDate(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
    if (d) return d;
  }
  return null;
}

function cleanName(s) {
  return s
    .replace(/^\s*\d{5,}\s*/, '') // leading barcode / SKU
    .replace(/\s+\d{5,}\s*$/, '') // trailing barcode / SKU
    .replace(/[^\p{L}\p{N}%&'./ -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.\-/]+|[\s.\-/]+$/g, '')
    .trim();
}

/**
 * @param {string} text  raw receipt text
 * @param {object} opts  { aliases: {normalizedRaw: name}, history: {lowercased: category}, dayFirst, today }
 */
export function parseReceiptText(text, opts = {}) {
  const { aliases = {}, history = {}, dayFirst = true, today = new Date().toISOString().slice(0, 10) } = opts;
  const lines = String(text).split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  // Store: first early line that is mostly letters.
  let store = '';
  for (const l of lines.slice(0, 6)) {
    const letters = (l.match(/\p{L}/gu) || []).length;
    if (letters >= 3 && letters / l.length > 0.6 && !PRICE_AT_END.test(l) && !findDate(l, dayFirst)) {
      store = titleCase(cleanName(l));
      break;
    }
  }

  const date = findDate(lines.join('\n'), dayFirst) || today;

  let total = null;
  const items = [];
  let pendingName = null; // product name on its own line, waiting for a "2 @ 1.25  2.50" line
  let seenTotal = false;

  for (const line of lines) {
    const pm = line.match(PRICE_AT_END);
    if (!pm) {
      // A name-only line can precede its quantity/weight line.
      const letters = (line.match(/\p{L}/gu) || []).length;
      pendingName = !seenTotal && letters >= 2 && !NOT_ITEM.test(line) && !DISCOUNT.test(line) && line !== lines[0] ? line : null;
      continue;
    }

    const negative = pm[1] === '-' || pm[3] === '-';
    const amount = parseMoney(pm[2]) * (negative ? -1 : 1);
    let label = line.slice(0, pm.index).trim();

    if (TOTAL.test(label) && !/sub\s*-?\s*total|sav/i.test(label)) {
      if (total === null) total = Math.abs(amount);
      seenTotal = true;
      pendingName = null;
      continue;
    }
    if (seenTotal || NOT_ITEM.test(label)) { pendingName = null; continue; }

    if (negative || DISCOUNT.test(label)) {
      const prev = items[items.length - 1];
      if (prev) prev.price = Math.max(0, +(prev.price - Math.abs(amount)).toFixed(2));
      pendingName = null;
      continue;
    }

    let qty = 1;
    let unit = '';

    // Weighed items: "0.512 kg @ 2.99/kg 1.53"
    const w = label.match(/(\d+[.,]\d+)\s*(kg|g|lb|lbs)\b(?:\s*(?:@|x|at)\s*[$£€]?\d+[.,]\d{2}\s*(?:\/\s*(?:kg|g|lb|lbs)\b)?)?/i);
    if (w) {
      qty = parseMoney(w[1]);
      unit = w[2].toLowerCase();
      label = (label.slice(0, w.index) + label.slice(w.index + w[0].length)).trim();
    } else {
      // "2 x 1.25", "2 @ 1.25", "2x MILK", "MILK 2 @ 1.25"
      const q = label.match(/(?:^|\s)(\d{1,3})\s*[x@×]\s*(?:[$£€]?\d+[.,]\d{2}\b)?/i);
      if (q) {
        qty = +q[1] || 1;
        label = (label.slice(0, q.index) + label.slice(q.index + q[0].length)).trim();
      }
    }

    let name = cleanName(label);
    if (!(name.match(/\p{L}/gu) || []).length || name.length < 2) {
      if (!pendingName) continue; // a stray number, not an item
      name = cleanName(pendingName);
    }
    pendingName = null;
    if (amount <= 0) continue;

    const raw = name;
    const alias = aliases[normalizeName(raw)];
    const display = alias || titleCase(raw);
    items.push({
      name: display,
      raw,
      qty,
      unit,
      price: +amount.toFixed(2),
      category: guessCategory(display, history),
    });
  }

  return { store, date, total, items };
}
