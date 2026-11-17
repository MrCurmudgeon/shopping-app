// Bundles the app into one self-contained HTML file (dist/grocery-list.html),
// for hosts that serve a single page. Offline caching (sw.js) is not included.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('styles.css');
const lib = read('lib.js').replace(/^export /gm, '');
const app = read('app.js').replace(/^import[\s\S]*?from '\.\/lib\.js';\n/m, '');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/\s*<script src="app\.js"[^>]*><\/script>/, '');
const icon = `data:image/svg+xml,${encodeURIComponent(read('icon.svg'))}`;

const out = `<title>Grocery List</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#2f7d4f">
<link rel="icon" href="${icon}">
<style>
${css}</style>
${body.trim()}
<script type="module">
${lib}
${app}</script>
`;
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/grocery-list.html', import.meta.url), out);
console.log(`dist/grocery-list.html (${(out.length / 1024).toFixed(1)} KB)`);
