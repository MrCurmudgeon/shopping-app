// Renders the PNG app icons from icons/*.svg. Needs Playwright with Chromium:
//   node scripts/render-icons.cjs
// iOS ignores SVG for home-screen icons, so these PNGs are required.
const path = require('path');
const { chromium } = require('playwright');

const ICONS = [
  ['icon.svg', 'apple-touch-icon.png', 180],
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
];

(async () => {
  const dir = path.join(__dirname, '..', 'icons');
  const browser = await chromium.launch();
  for (const [src, out, size] of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    // Open the SVG itself: with a viewBox and no fixed size it fills the viewport.
    await page.goto(`file://${path.join(dir, src)}`);
    await page.screenshot({ path: path.join(dir, out), clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`icons/${out} (${size}×${size})`);
  }
  await browser.close();
})();
