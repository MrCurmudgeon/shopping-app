// Bundles the app into one self-contained HTML file (dist/grocery-list.html),
// for hosts that serve a single page. Offline caching (sw.js) is not included.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('styles.css');
// Modules in dependency order; their import/export syntax is stripped so they share one scope.
const MODULES = ['lib.js', 'format.js', 'receipts.js', 'insights.js', 'sample-data.js', 'receipts-ui.js', 'app.js'];
const js = MODULES.map((f) => `// ---- ${f} ----\n${read(f)
  .replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
  .replace(/^export /gm, '')}`).join('\n')
  // Several modules define the same tiny `$` helper; keep only the first.
  .replace(/(const \$ = \(id\) => document\.getElementById\(id\);\n)([\s\S]*)/, (m, first, rest) => first + rest.split(first).join(''));
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace('src="icons/avatar.svg"', `src="data:image/svg+xml,${encodeURIComponent(read('icons/avatar.svg'))}"`)
  .replace(/\s*<script src="app\.js"[^>]*><\/script>/, '');
const icon = `data:image/svg+xml,${encodeURIComponent(read('icons/icon.svg'))}`;

const out = `<meta charset="utf-8">
<title>Grocery List</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#2f7d4f">
<link rel="icon" href="${icon}">
<style>
${css}</style>
${body.trim()}
<script type="module">
${js}</script>
`;
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/grocery-list.html', import.meta.url), out);
console.log(`dist/grocery-list.html (${(out.length / 1024).toFixed(1)} KB)`);
