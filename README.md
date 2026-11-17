# shopping-app

A simple grocery shopping list that works offline. It's a Progressive Web App:
plain HTML/CSS/JS with no build step and no dependencies, and you can install it on your phone's home screen.

## Features

- **Quick add with natural input**: type `2 avocados`, `3x eggs`, `bananas x 6`, `500g flour` or `1.5 kg rice`.
- **Automatic aisle grouping**: items are sorted into store sections (Produce, Dairy, Pantry…). Pick a category once and the app remembers it for that item.
- **Check off while you shop**, with a progress bar and a "Hide checked" toggle.
- **Quantity +/- buttons**. Adding an item that is already on the list increases its quantity.
- **Edit items**: name, quantity, unit, category, note, and an optional price for a running estimate.
- **Multiple lists** (weekly shop, party, hardware store…) that you can rename, reset or delete.
- **Suggestions** from items you've bought before.
- **Clear checked** with undo, plus **Share / copy** the list as text.
- Works offline (service worker). Data is saved in the browser (`localStorage`) and stays in sync across tabs.
- Light and dark mode, mobile-first layout.

### Receipts and insights

- **Scan a receipt photo.** The text is read on the phone with [Tesseract.js](https://tesseract.projectnaptha.com/); the photo is never uploaded. The first scan downloads the reader (a few MB) from jsDelivr.
- **Paste receipt text** from emailed or online receipts, or **type a receipt in**.
- **Review before saving**: the app picks out store, date, items, quantities, weights, discounts and the total, and flags a mismatch with the total. When you rename an abbreviated item ("BNNS ORG" → "Organic bananas"), it remembers that for next time.
- **Insights**: spend per week, by category, most-bought items, price changes, and averages per week and per shop.
- **Next week's shop**: suggests the items you're due to buy again, based on how often you usually buy them. Add them to your list in one tap.
- **Back up and restore** all your data as a file, since it lives only on your device.
- Try it straight away with **sample receipts** (Insights tab), then remove them.

## Run it

```sh
npm start          # serves on http://localhost:8000 (uses python3)
```

Any static file server works.

### Install on your phone (GitHub Pages)

1. In the repo on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, then pick the branch
   and the `/ (root)` folder and click **Save**.
3. After about a minute the app is live at `https://<owner>.github.io/shopping-app/`.
4. Open that address on your phone and add it to the home screen: in Safari, tap **Share → Add to Home Screen**; in Chrome on Android, tap **⋮ → Add to Home screen** or **Install app**.

GitHub Pages for a private repository requires a paid GitHub plan. On a free plan the repository has to be public.

### Single-file build

```sh
node scripts/build-single.mjs   # writes dist/grocery-list.html
```

This puts the whole app into one HTML file, for hosts that serve a single page.
The single file doesn't include offline caching.

## Test

```sh
npm test           # unit tests for parsing, categorisation, receipts and predictions (Node 18+)
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell and dialogs |
| `styles.css` | Styles (light/dark) |
| `app.js` | UI, state and persistence |
| `lib.js` | Pure helpers: input parsing, category guessing, grouping |
| `receipts.js` | Receipt text parser (store, date, items, discounts, total) |
| `insights.js` | Spending analytics and next-shop predictions |
| `receipts-ui.js` | Receipts and Insights screens, photo scanning |
| `format.js` | Money and date formatting for your locale |
| `sample-data.js` | Example receipts for trying Insights |
| `sw.js` | Offline cache |
| `manifest.webmanifest`, `icon.svg` | Install metadata |
