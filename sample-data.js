// Six weeks of believable example receipts so Insights can be tried before
// any real receipts exist. Every receipt is flagged `sample: true`.

import { guessCategory } from './lib.js';
import { toDay, fromDay } from './insights.js';

// name, price each, qty, every N days, first day offset
const PRODUCTS = [
  ['Semi skimmed milk', 1.65, 2, 7, 0],
  ['Bananas', 1.2, 1, 7, 0],
  ['Sourdough bread', 2.5, 1, 7, 0],
  ['Greek yogurt', 2.1, 1, 7, 0],
  ['Chicken thighs', 4.5, 1, 7, 0],
  ['Free range eggs', 2.35, 1, 14, 0],
  ['Cheddar', 3.2, 1, 14, 7],
  ['Penne pasta', 0.95, 2, 14, 0],
  ['Coffee beans', 6.5, 1, 21, 7],
  ['Toilet paper', 4.0, 1, 28, 0],
  ['Spinach', 1.35, 1, 7, 0],
  ['Tomatoes', 1.6, 1, 7, 7],
  ['Orange juice', 2.2, 1, 14, 7],
  ['Washing up liquid', 1.5, 1, 35, 0],
];
const TREATS = [['Dark chocolate', 2.0], ['Red wine', 7.5], ['Crisps', 1.75], ['Ice cream', 3.5], ['Salmon fillets', 5.0]];

export function makeSampleReceipts(today) {
  const end = toDay(today) - 6; // last big shop six days ago, so the weekly items are due
  const receipts = [];
  for (let week = 5; week >= 0; week--) {
    const day = end - week * 7;
    const elapsed = (5 - week) * 7;
    const items = [];
    for (const [name, price, qty, every, offset] of PRODUCTS) {
      if ((elapsed - offset) >= 0 && (elapsed - offset) % every === 0) {
        const drift = name === 'Coffee beans' && week < 2 ? 0.6 : name === 'Cheddar' && week < 1 ? 0.3 : 0;
        items.push({ name, raw: name, qty, unit: '', price: +((price + drift) * qty).toFixed(2), category: guessCategory(name) });
      }
    }
    const [tName, tPrice] = TREATS[week % TREATS.length];
    items.push({ name: tName, raw: tName, qty: 1, unit: '', price: tPrice, category: guessCategory(tName) });
    receipts.push({
      id: `sample-${week}`,
      date: fromDay(day),
      store: 'Sample Supermarket',
      total: +items.reduce((s, i) => s + i.price, 0).toFixed(2),
      items,
      sample: true,
    });
    if (week % 2 === 1) {
      // A mid-week top-up shop.
      const top = [
        { name: 'Semi skimmed milk', raw: 'Semi skimmed milk', qty: 1, unit: '', price: 1.65, category: 'Dairy & Eggs' },
        { name: 'Bananas', raw: 'Bananas', qty: 1, unit: '', price: 1.2, category: 'Produce' },
      ];
      receipts.push({ id: `sample-${week}b`, date: fromDay(day + 3), store: 'Sample Express', total: 2.85, items: top, sample: true });
    }
  }
  return receipts;
}
