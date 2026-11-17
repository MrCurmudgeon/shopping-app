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

## Run it

```sh
npm start          # serves on http://localhost:8000 (uses python3)
```

Any static file server works. To install it on a phone, host the folder over HTTPS
(for example GitHub Pages) and use "Add to Home Screen".

## Test

```sh
npm test           # unit tests for parsing and categorisation (Node 18+)
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell and dialogs |
| `styles.css` | Styles (light/dark) |
| `app.js` | UI, state and persistence |
| `lib.js` | Pure helpers: input parsing, category guessing, grouping |
| `sw.js` | Offline cache |
| `manifest.webmanifest`, `icon.svg` | Install metadata |
