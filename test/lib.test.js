import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItemInput, guessCategory, groupByCategory, itemTotal, listToText } from '../lib.js';

test('parseItemInput handles plain names', () => {
  assert.deepEqual(parseItemInput('milk'), { name: 'Milk', qty: 1, unit: '' });
});

test('parseItemInput handles leading counts and x-notation', () => {
  assert.deepEqual(parseItemInput('2 avocados'), { name: 'Avocados', qty: 2, unit: '' });
  assert.deepEqual(parseItemInput('3x eggs'), { name: 'Eggs', qty: 3, unit: '' });
  assert.deepEqual(parseItemInput('bananas x 6'), { name: 'Bananas', qty: 6, unit: '' });
});

test('parseItemInput handles units', () => {
  assert.deepEqual(parseItemInput('500g flour'), { name: 'Flour', qty: 500, unit: 'g' });
  assert.deepEqual(parseItemInput('1,5 kg rice'), { name: 'Rice', qty: 1.5, unit: 'kg' });
  assert.deepEqual(parseItemInput('2 bags of chips'), { name: 'Chips', qty: 2, unit: 'bags' });
});

test('parseItemInput does not treat a bare number as a quantity', () => {
  assert.deepEqual(parseItemInput('7up'), { name: '7up', qty: 1, unit: '' });
});

test('guessCategory uses keywords and history', () => {
  assert.equal(guessCategory('Bananas'), 'Produce');
  assert.equal(guessCategory('Whole milk'), 'Dairy & Eggs');
  assert.equal(guessCategory('Toilet paper'), 'Household');
  assert.equal(guessCategory('Mystery thing'), 'Other');
  assert.equal(guessCategory('Bananas', { bananas: 'Snacks' }), 'Snacks');
});

test('groupByCategory follows store order and puts checked items last', () => {
  const items = [
    { name: 'Milk', category: 'Dairy & Eggs', checked: false, createdAt: 1 },
    { name: 'Apples', category: 'Produce', checked: true, createdAt: 2 },
    { name: 'Pears', category: 'Produce', checked: false, createdAt: 3 },
  ];
  const groups = groupByCategory(items);
  assert.deepEqual([...groups.keys()], ['Produce', 'Dairy & Eggs']);
  assert.deepEqual(groups.get('Produce').map((i) => i.name), ['Pears', 'Apples']);
});

test('itemTotal multiplies countable items only', () => {
  assert.equal(itemTotal({ qty: 3, unit: '', price: 2 }), 6);
  assert.equal(itemTotal({ qty: 500, unit: 'g', price: 2 }), 2);
  assert.equal(itemTotal({ qty: 3, unit: '', price: null }), 0);
});

test('listToText renders a readable list', () => {
  const text = listToText({
    name: 'Weekly',
    items: [{ name: 'Eggs', qty: 12, unit: '', category: 'Dairy & Eggs', checked: false, createdAt: 1, note: 'free range' }],
  });
  assert.equal(text, 'Weekly\n\nDairy & Eggs:\n[ ] Eggs (×12) – free range');
});

test('guessCategory avoids substring false positives', () => {
  assert.equal(guessCategory('Peanut butter'), 'Pantry');
  assert.equal(guessCategory('Orange juice'), 'Drinks');
  assert.equal(guessCategory('Rice'), 'Pantry');
});

test('guessCategory prefers the last noun', () => {
  assert.equal(guessCategory('Chicken stock'), 'Pantry');
  assert.equal(guessCategory('Ice cream'), 'Frozen');
  assert.equal(guessCategory('Dish soap'), 'Household');
});
