// Ledger service worker
// Caches the app shell (HTML/CSS/JS/icons/fonts) so the app loads instantly and works
// offline. Live price APIs (xaus.com, CoinGecko) and anything off-origin that isn't a
// font are deliberately left untouched — they need a real network hit to be meaningful.

const CACHE_VERSION = "ledger-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./favicon.ico",
];

// Google Fonts — fetched no-cors, so responses are opaque, but still cacheable for offline use
const FONT_URLS = [
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE_URLS);
      await Promise.all(
        FONT_URLS.map((url) =>
          fetch(url, { mode: "no-cors" }).then((res) => cache.put(url, res)).catch(() => {})
        )
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("ledger-") && k !== SHELL_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isAppShellRequest(url) {
  return url.origin === self.location.origin || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Live market-data APIs and anything else off-origin: let the network handle it
  // untouched. No caching, no offline fallback — stale prices are worse than none.
  if (!isAppShellRequest(url)) return;

  // App shell: stale-while-revalidate — serve from cache immediately for speed,
  // then refresh the cache in the background for next time.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })()
  );
});
