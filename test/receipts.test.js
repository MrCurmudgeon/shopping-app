import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText, findDate, normalizeName } from '../receipts.js';

const UK = `FRESHWAY SUPERMARKET
12 High Street, Leeds
Tel 0113 496 0000
14/11/2026 18:42
BANANAS LOOSE            1.20
SEMI SKIMMED MILK 4PT
2 x 0.85                 1.70
GREEK YOGURT             2.10
  CLUBCARD PRICE        -0.40
CARROTS
0.512 kg @ 0.90/kg       0.46
5012345678900 SOURDOUGH  2.50 A
SUBTOTAL                 7.56
TOTAL                    7.56
VISA DEBIT               7.56
CHANGE                   0.00
THANK YOU FOR SHOPPING`;

test('parses store, date, total and items from a UK-style receipt', () => {
  const r = parseReceiptText(UK, { today: '2026-11-17' });
  assert.equal(r.store, 'Freshway Supermarket');
  assert.equal(r.date, '2026-11-14');
  assert.equal(r.total, 7.56);
  assert.deepEqual(
    r.items.map((i) => [i.name, i.qty, i.unit, i.price]),
    [
      ['Bananas Loose', 1, '', 1.2],
      ['Semi Skimmed Milk 4pt', 2, '', 1.7],
      ['Greek Yogurt', 1, '', 1.7],
      ['Carrots', 0.512, 'kg', 0.46],
      ['Sourdough', 1, '', 2.5],
    ],
  );
  const sum = r.items.reduce((s, i) => s + i.price, 0);
  assert.equal(Math.round(sum * 100) / 100, r.total);
});

test('skips payment lines and guesses categories', () => {
  const r = parseReceiptText(UK, { today: '2026-11-17' });
  assert.ok(!r.items.some((i) => /visa|change|total|thank/i.test(i.name)));
  assert.deepEqual(r.items.map((i) => i.category), ['Produce', 'Dairy & Eggs', 'Dairy & Eggs', 'Produce', 'Bakery']);
});

test('US-style receipt with name-then-quantity lines and month names', () => {
  const text = `Corner Market
Nov 9, 2026
EGGS LARGE 12CT
  2 @ 3.49              6.98
ORANGE JUICE            4.29 F
SALES TAX               0.00
BALANCE DUE            11.27`;
  const r = parseReceiptText(text, { dayFirst: false });
  assert.equal(r.date, '2026-11-09');
  assert.equal(r.total, 11.27);
  assert.deepEqual(r.items.map((i) => [i.name, i.qty, i.price]), [
    ['Eggs Large 12ct', 2, 6.98],
    ['Orange Juice', 1, 4.29],
  ]);
});

test('aliases rename abbreviated receipt names', () => {
  const r = parseReceiptText('SHOP\nBNNS ORG   1.50\nTOTAL 1.50', { aliases: { 'bnns org': 'Organic bananas' } });
  assert.equal(r.items[0].name, 'Organic bananas');
  assert.equal(r.items[0].raw, 'BNNS ORG');
  assert.equal(r.items[0].category, 'Produce');
});

test('findDate handles formats and ambiguity', () => {
  assert.equal(findDate('2026-03-04'), '2026-03-04');
  assert.equal(findDate('03/04/26', true), '2026-04-03');
  assert.equal(findDate('03/04/26', false), '2026-03-04');
  assert.equal(findDate('25/12/2026', false), '2026-12-25');
  assert.equal(findDate('7 Nov 2026'), '2026-11-07');
  assert.equal(findDate('no date here 12.50'), null);
});

test('normalizeName merges spelling variants', () => {
  assert.equal(normalizeName('Bananas'), normalizeName('banana'));
  assert.equal(normalizeName('Tomatoes'), 'tomato');
  assert.equal(normalizeName('Berries!'), 'berry');
  assert.equal(normalizeName('Hummus'), 'hummus');
  assert.equal(normalizeName('Glass'), 'glass');
});
