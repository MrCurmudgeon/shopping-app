// Pure helpers (no DOM) so they can be unit tested with `node --test`.

export const CATEGORIES = [
  'Produce',
  'Bakery',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Pantry',
  'Frozen',
  'Drinks',
  'Snacks',
  'Household',
  'Personal Care',
  'Other',
];

const KEYWORDS = {
  'Produce': ['apple', 'banana', 'avocado', 'lettuce', 'tomato', 'onion', 'garlic', 'potato', 'carrot', 'pepper', 'cucumber', 'spinach', 'lemon', 'lime', 'orange', 'grape', 'berry', 'berries', 'strawberr', 'blueberr', 'broccoli', 'mushroom', 'herb', 'basil', 'cilantro', 'parsley', 'celery', 'zucchini', 'kale', 'pear', 'peach', 'melon', 'fruit', 'veg', 'salad', 'ginger'],
  'Bakery': ['bread', 'bagel', 'baguette', 'bun', 'roll', 'croissant', 'muffin', 'tortilla', 'pita', 'cake', 'loaf'],
  'Dairy & Eggs': ['milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'egg', 'cheddar', 'mozzarella', 'parmesan', 'feta'],
  'Meat & Seafood': ['chicken', 'beef', 'pork', 'steak', 'bacon', 'sausage', 'ham', 'turkey', 'lamb', 'mince', 'fish', 'salmon', 'tuna', 'shrimp', 'prawn'],
  'Pantry': ['rice', 'pasta', 'noodle', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'beans', 'lentil', 'cereal', 'oat', 'honey', 'jam', 'peanut butter', 'spice', 'stock', 'broth', 'soup', 'canned', 'coffee', 'tea', 'ketchup', 'mustard', 'mayo'],
  'Frozen': ['frozen', 'ice cream', 'pizza', 'peas', 'ice'],
  'Drinks': ['water', 'juice', 'soda', 'cola', 'beer', 'wine', 'sparkling', 'kombucha', 'lemonade'],
  'Snacks': ['chips', 'crisps', 'cookie', 'biscuit', 'chocolate', 'candy', 'popcorn', 'nuts', 'cracker', 'pretzel', 'granola'],
  'Household': ['paper towel', 'toilet paper', 'tissue', 'detergent', 'soap', 'dish', 'sponge', 'trash bag', 'bin bag', 'foil', 'cling', 'battery', 'batteries', 'bleach', 'cleaner'],
  'Personal Care': ['shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'deodorant', 'razor', 'lotion', 'sunscreen', 'floss'],
};

/**
 * Guess a category from an item name. `history` maps lowercased names to
 * the category the user last chose, which always wins over keywords.
 */
export function guessCategory(name, history = {}) {
  const key = name.trim().toLowerCase();
  if (history[key]) return history[key];
  // Match keywords at the start of a word. The match that ends last wins
  // (the head noun: "orange juice" is a drink), then the longest one
  // ("peanut butter" beats "butter"). "toilet" never matches "oil".
  const padded = ` ${key.replace(/[^a-z0-9 ]/g, ' ')} `;
  let best = 'Other';
  let bestEnd = -1;
  let bestLen = 0;
  for (const [category, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      const at = padded.lastIndexOf(` ${w}`);
      if (at < 0) continue;
      const rest = padded.slice(at + 1 + w.length);
      const end = at + 1 + w.length + (rest.match(/^[a-z]*/)[0].length);
      if (end > bestEnd || (end === bestEnd && w.length > bestLen)) {
        best = category;
        bestEnd = end;
        bestLen = w.length;
      }
    }
  }
  return best;
}

const UNITS = ['kg', 'g', 'lb', 'lbs', 'oz', 'l', 'ml', 'pack', 'packs', 'bag', 'bags', 'box', 'boxes', 'can', 'cans', 'bottle', 'bottles', 'jar', 'jars', 'dozen', 'bunch', 'bunches'];

/**
 * Parse free text like "2 avocados", "3x milk", "500g flour", "1.5 kg rice"
 * into { name, qty, unit }.
 */
export function parseItemInput(text) {
  let s = text.trim().replace(/\s+/g, ' ');
  let qty = 1;
  let unit = '';

  // Leading number must be followed by a space, "x", or a unit ("500g"),
  // so names like "7up" stay intact.
  const m = s.match(/^(\d+(?:[.,]\d+)?)(\s*[x×]\s+|\s+|(?=[a-z]+\s))(.*)$/i);
  const unitAttached = m && !m[2] && UNITS.includes((m[3].match(/^[a-z]+/i) || [''])[0].toLowerCase());
  if (m && m[3] && (m[2] || unitAttached)) {
    qty = Number(m[1].replace(',', '.'));
    s = m[3];
    const u = s.match(/^([a-z]+)\.?\s+(?:of\s+)?(.+)$/i);
    if (!/[x×]/i.test(m[2]) && u && UNITS.includes(u[1].toLowerCase())) {
      unit = u[1].toLowerCase();
      s = u[2];
    }
  } else {
    const t = s.match(/^(.*?)\s*(?:x|×)\s*(\d+)$/i);
    if (t && t[1]) {
      s = t[1];
      qty = Number(t[2]);
    }
  }

  if (!Number.isFinite(qty) || qty <= 0) qty = 1;
  const name = s.charAt(0).toUpperCase() + s.slice(1);
  return { name, qty, unit };
}

export function formatQty(item) {
  if (item.unit) return `${item.qty} ${item.unit}`;
  return item.qty > 1 ? `×${item.qty}` : '';
}

/** Estimated total for an item (price is per unit / each). */
export function itemTotal(item) {
  if (!item.price) return 0;
  return item.unit ? item.price : item.price * item.qty;
}

export function listToText(list) {
  const lines = [list.name, ''];
  const byCat = groupByCategory(list.items);
  for (const [cat, items] of byCat) {
    lines.push(`${cat}:`);
    for (const it of items) {
      const q = formatQty(it);
      lines.push(`${it.checked ? '[x]' : '[ ]'} ${it.name}${q ? ` (${q})` : ''}${it.note ? ` – ${it.note}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/** Group items by category in store order; unchecked items first within each group. */
export function groupByCategory(items) {
  const groups = new Map();
  for (const cat of CATEGORIES) groups.set(cat, []);
  for (const it of items) {
    const cat = groups.has(it.category) ? it.category : 'Other';
    groups.get(cat).push(it);
  }
  for (const [cat, arr] of groups) {
    if (arr.length === 0) groups.delete(cat);
    else arr.sort((a, b) => Number(a.checked) - Number(b.checked) || a.createdAt - b.createdAt);
  }
  return groups;
}
