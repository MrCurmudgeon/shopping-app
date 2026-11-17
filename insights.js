// Spending analytics and next-week predictions from saved receipts.
// Receipts: { id, date: 'YYYY-MM-DD', store, total, items: [{ name, qty, unit, price, category }] }
// Pure functions, no DOM.

import { normalizeName } from './receipts.js';

const DAY = 86400000;

export function toDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}

export function fromDay(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

/** Monday of the week containing dateStr. */
export function weekStart(dateStr) {
  const day = toDay(dateStr);
  const dow = (new Date(day * DAY).getUTCDay() + 6) % 7; // Monday = 0
  return fromDay(day - dow);
}

export function receiptTotal(r) {
  if (typeof r.total === 'number' && r.total > 0) return r.total;
  return r.items.reduce((s, i) => s + (i.price || 0), 0);
}

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Spend per week for the last `weeks` weeks (oldest first), including empty weeks. */
export function weeklySpend(receipts, today, weeks = 8) {
  const end = toDay(weekStart(today));
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ week: fromDay(end - i * 7), total: 0, trips: 0 });
  const index = new Map(out.map((w, i) => [w.week, i]));
  for (const r of receipts) {
    const i = index.get(weekStart(r.date));
    if (i === undefined) continue;
    out[i].total = round2(out[i].total + receiptTotal(r));
    out[i].trips += 1;
  }
  return out;
}

function inRange(r, today, days) {
  const age = toDay(today) - toDay(r.date);
  return age >= 0 && age < days;
}

/** Headline numbers for the last `days` days. */
export function summary(receipts, today, days = 28) {
  const recent = receipts.filter((r) => inRange(r, today, days));
  const spent = round2(recent.reduce((s, r) => s + receiptTotal(r), 0));
  return {
    spent,
    trips: recent.length,
    perWeek: round2(spent / (days / 7)),
    perTrip: recent.length ? round2(spent / recent.length) : 0,
  };
}

/** Spend by category over the last `days` days, largest first. */
export function categorySpend(receipts, today, days = 56) {
  const totals = new Map();
  for (const r of receipts.filter((x) => inRange(x, today, days))) {
    for (const it of r.items) {
      const c = it.category || 'Other';
      totals.set(c, (totals.get(c) || 0) + (it.price || 0));
    }
  }
  return [...totals].map(([category, total]) => ({ category, total: round2(total) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Every product's purchase history, merged by normalized name and by day. */
export function itemHistory(receipts) {
  const map = new Map();
  const sorted = [...receipts].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of sorted) {
    for (const it of r.items) {
      const key = normalizeName(it.name);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { key, name: it.name, unit: it.unit || '', category: it.category, purchases: [] });
      const h = map.get(key);
      h.name = it.name; // latest spelling wins
      h.category = it.category || h.category;
      h.unit = it.unit || h.unit;
      const last = h.purchases[h.purchases.length - 1];
      if (last && last.date === r.date) {
        last.qty += it.qty || 1;
        last.price += it.price || 0;
      } else {
        h.purchases.push({ date: r.date, qty: it.qty || 1, price: it.price || 0 });
      }
    }
  }
  return [...map.values()];
}

/** Products you spend most on over the last `days` days. */
export function topItems(receipts, today, days = 56, n = 8) {
  const recent = receipts.filter((r) => inRange(r, today, days));
  return itemHistory(recent)
    .map((h) => ({
      name: h.name,
      times: h.purchases.length,
      spent: round2(h.purchases.reduce((s, p) => s + p.price, 0)),
    }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, n);
}

/** Products whose latest unit price moved by at least `threshold` versus the one before. */
export function priceChanges(receipts, threshold = 0.05) {
  const out = [];
  for (const h of itemHistory(receipts)) {
    const p = h.purchases.filter((x) => x.qty > 0 && x.price > 0);
    if (p.length < 2) continue;
    const prev = p[p.length - 2].price / p[p.length - 2].qty;
    const latest = p[p.length - 1].price / p[p.length - 1].qty;
    const change = (latest - prev) / prev;
    if (Math.abs(change) >= threshold) {
      out.push({ name: h.name, unit: h.unit, prev: round2(prev), latest: round2(latest), change });
    }
  }
  return out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/**
 * Predict what you'll need in the next `horizon` days.
 * For each product bought on at least two different days, take the median
 * gap between purchases; if the next purchase falls due within the horizon,
 * suggest it. Confidence grows with how many times it was bought and how
 * regular the gaps are; products that look abandoned are dropped.
 */
export function predictNextShop(receipts, today, horizon = 7) {
  const now = toDay(today);
  const out = [];
  for (const h of itemHistory(receipts)) {
    const days = h.purchases.map((p) => toDay(p.date)).filter((d) => d <= now);
    if (days.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
    const interval = Math.max(1, median(gaps));
    const since = now - days[days.length - 1];
    const dueIn = interval - since;
    if (dueIn > horizon) continue; // not needed yet
    if (since > Math.max(interval * 3, interval + 28)) continue; // probably stopped buying it

    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
    const regularity = gaps.length > 1 ? Math.max(0, 1 - sd / mean) : 0.5;
    const evidence = Math.min(1, gaps.length / 4);
    let confidence = 0.35 + 0.35 * regularity + 0.3 * evidence;
    if (since > interval * 1.75) confidence *= 0.75; // overdue: less sure
    confidence = Math.round(Math.min(0.99, confidence) * 100) / 100;

    const qty = median(h.purchases.map((p) => p.qty));
    const last = h.purchases[h.purchases.length - 1];
    const unitPrice = last.qty ? last.price / last.qty : last.price;

    out.push({
      name: h.name,
      category: h.category,
      unit: h.unit,
      qty: h.unit ? round2(qty) : Math.max(1, Math.round(qty)),
      estCost: round2(unitPrice * qty),
      interval: Math.round(interval),
      since,
      dueIn: Math.round(dueIn),
      confidence,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.dueIn - b.dueIn);
}

/** Describe a prediction in plain words. */
export function predictionReason(p) {
  const every = p.interval === 7 ? 'weekly' : p.interval === 14 ? 'every 2 weeks' : `every ~${p.interval} days`;
  const last = p.since === 0 ? 'bought today' : p.since === 1 ? 'last bought yesterday' : `last bought ${p.since} days ago`;
  return `Usually ${every} · ${last}`;
}

/**
 * The Monday a new weekly list is for: this week's Monday until Thursday,
 * next week's from Friday on (when people usually plan ahead).
 */
export function planningWeekStart(today) {
  const monday = toDay(weekStart(today));
  const dow = toDay(today) - monday; // Monday = 0
  return fromDay(dow >= 4 ? monday + 7 : monday);
}
