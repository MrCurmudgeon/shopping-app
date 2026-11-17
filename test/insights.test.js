import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekStart, weeklySpend, summary, categorySpend, itemHistory, predictNextShop, priceChanges, topItems, predictionReason,
} from '../insights.js';

const item = (name, price, qty = 1, category = 'Other') => ({ name, price, qty, unit: '', category });
const receipt = (date, items, total) => ({ id: date, date, store: 'Shop', total, items });

// Milk weekly, bread every ~2 weeks, a one-off cake, coffee bought long ago.
const receipts = [
  receipt('2026-09-01', [item('Coffee', 6)]),
  receipt('2026-09-15', [item('Coffee', 6)]),
  receipt('2026-10-20', [item('Milk', 1.6, 2, 'Dairy & Eggs'), item('Bread', 2.5, 1, 'Bakery')]),
  receipt('2026-10-27', [item('Milk', 1.6, 2, 'Dairy & Eggs')]),
  receipt('2026-11-03', [item('milk', 1.6, 2, 'Dairy & Eggs'), item('Bread', 2.5, 1, 'Bakery'), item('Cake', 8)]),
  receipt('2026-11-10', [item('Milk', 1.8, 2, 'Dairy & Eggs')], 1.8),
];
const today = '2026-11-15';

test('weekStart returns the Monday', () => {
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday -> Monday before
  assert.equal(weekStart('2026-11-09'), '2026-11-09');
});

test('weeklySpend fills empty weeks and sums receipts', () => {
  const w = weeklySpend(receipts, today, 4);
  assert.deepEqual(w.map((x) => [x.week, x.total]), [
    ['2026-10-19', 4.1], ['2026-10-26', 1.6], ['2026-11-02', 12.1], ['2026-11-09', 1.8],
  ]);
});

test('summary and category spend', () => {
  const s = summary(receipts, today, 28);
  assert.equal(s.trips, 4);
  assert.equal(s.spent, 19.6);
  assert.equal(s.perWeek, 4.9);
  const c = categorySpend(receipts, today, 56);
  assert.equal(c[0].category, 'Other');
  assert.deepEqual(c.map((x) => x.category), ['Other', 'Dairy & Eggs', 'Bakery']);
});

test('itemHistory merges spelling variants', () => {
  const milk = itemHistory(receipts).find((h) => h.key === 'milk');
  assert.equal(milk.purchases.length, 4);
});

test('predictNextShop suggests regular items that are due', () => {
  const p = predictNextShop(receipts, today, 7);
  const names = p.map((x) => x.name);
  assert.ok(names.includes('Milk'), 'weekly milk is due');
  assert.ok(names.includes('Bread'), 'bread every 14 days, last 12 days ago');
  assert.ok(!names.includes('Cake'), 'one-off purchase');
  assert.ok(!names.includes('Coffee'), 'not bought for two months');
  const milk = p.find((x) => x.name === 'Milk');
  assert.equal(milk.qty, 2);
  assert.equal(milk.interval, 7);
  assert.equal(milk.estCost, 1.8);
  assert.ok(milk.confidence > p.find((x) => x.name === 'Bread').confidence);
  assert.equal(predictionReason(milk), 'Usually weekly · last bought 5 days ago');
});

test('priceChanges and topItems', () => {
  const pc = priceChanges(receipts);
  assert.equal(pc[0].name, 'Milk');
  assert.equal(pc[0].prev, 0.8);
  assert.equal(pc[0].latest, 0.9);
  assert.equal(topItems(receipts, today, 56)[0].name, 'Cake');
});
