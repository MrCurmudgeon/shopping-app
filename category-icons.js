// Small line icons for each aisle (24×24, drawn with the current text colour).

const PATHS = {
  // Apple with a leaf
  'Produce': [
    'M12 7.5c-1.6-1.3-5.2-1.6-6.6 1.4C4 12 5 16.2 7.3 19c1.5 1.8 3.1 1.6 4.7.8 1.6.8 3.2 1 4.7-.8 2.3-2.8 3.3-7 1.9-10.1-1.4-3-5-2.7-6.6-1.4Z',
    'M12 7.5c0-2.2 1-3.8 3.2-4.5',
    'M12.6 5.4c1.6-.2 3 .3 3.9 1.4-1.5.6-2.9.4-3.9-1.4Z',
  ],
  // Loaf with score marks
  'Bakery': [
    'M5.5 11.5a3.2 3.2 0 0 1-1.3-6C6 4.3 8.8 3.8 12 3.8s6 .5 7.8 1.7a3.2 3.2 0 0 1-1.3 6V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19Z',
    'M9 10.5l1.6-1.8M12.4 10.5 14 8.7',
  ],
  // Gable-top milk carton
  'Dairy & Eggs': [
    'M6.5 9.5 9 4.2h6l2.5 5.3V20a1.2 1.2 0 0 1-1.2 1.2H7.7A1.2 1.2 0 0 1 6.5 20Z',
    'M9 4.2 11.5 9.5h6',
    'M11.5 9.5v11.7',
    'M9 2.6h6',
  ],
  // Fish
  'Meat & Seafood': [
    'M2 12c3-5.6 10-7.2 14.6-3L21.5 5v14l-4.9-4C12 19.2 5 17.6 2 12Z',
    'M7.4 10.8h.01',
    'M11.5 8.6c.9 1 1.3 2.1 1.3 3.4s-.4 2.4-1.3 3.4',
  ],
  // Jar with label
  'Pantry': [
    'M7.5 3h9v3.2h-9Z',
    'M6.5 6.2h11v13.6a1.2 1.2 0 0 1-1.2 1.2H7.7a1.2 1.2 0 0 1-1.2-1.2Z',
    'M9.5 12h5M9.5 15.5h5',
  ],
  // Snowflake
  'Frozen': [
    'M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6',
    'M9.3 4.4 12 6.2l2.7-1.8M9.3 19.6 12 17.8l2.7 1.8',
  ],
  // Bottle
  'Drinks': [
    'M10 2.5h4v3.8l2.2 3.2V20a1.2 1.2 0 0 1-1.2 1.2H9A1.2 1.2 0 0 1 7.8 20V9.5L10 6.3Z',
    'M7.8 12.5h8.4v4.5H7.8',
  ],
  // Cookie with a bite
  'Snacks': [
    'M12 3a9 9 0 1 0 9 9 3 3 0 0 1-3.2-3.1A3 3 0 0 1 14.6 6 3 3 0 0 1 12 3Z',
    'M8.5 10h.01M13.5 15h.01M9 15.5h.01M12 11.5h.01',
  ],
  // Spray bottle
  'Household': [
    'M8.5 10.5h6.5l1 2.5v7a1.2 1.2 0 0 1-1.2 1.2H8.7A1.2 1.2 0 0 1 7.5 20v-7Z',
    'M9.5 10.5V7h5.5',
    'M11 7V4.5h3.5l3 2',
    'M19 5h.01M19.5 8h.01',
  ],
  // Pump bottle
  'Personal Care': [
    'M7.5 10.5h9V20a1.2 1.2 0 0 1-1.2 1.2H8.7A1.2 1.2 0 0 1 7.5 20Z',
    'M10.5 10.5v-3h3v3',
    'M12 7.5V4h4.5',
    'M10 15h4',
  ],
  // Shopping bag
  'Other': [
    'M5 8h14l-1.2 12a1.2 1.2 0 0 1-1.2 1H7.4a1.2 1.2 0 0 1-1.2-1Z',
    'M9 8V6.5a3 3 0 0 1 6 0V8',
  ],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An inline SVG icon for a category (falls back to the shopping bag). */
export function categoryIcon(category, className = 'cat-icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of PATHS[category] || PATHS.Other) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export const ICON_CATEGORIES = Object.keys(PATHS);
