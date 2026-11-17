// Offline support.
// Online: always fetch the latest files (bypassing the browser's HTTP cache,
// which GitHub Pages lets keep files for 10 minutes) and save a copy.
// Offline or very slow network: serve the saved copy.
const CACHE = 'grocery-v5';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'lib.js', 'format.js', 'receipts.js', 'insights.js',
  'receipts-ui.js', 'sample-data.js', 'manifest.webmanifest', 'icon.svg',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    try {
      // Prefer the network, but don't leave the user staring at a blank screen on a bad connection.
      return await Promise.race([
        network,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
      ]);
    } catch {
      const cached = await cache.match(req, { ignoreSearch: true });
      return cached || network;
    }
  })());
});
