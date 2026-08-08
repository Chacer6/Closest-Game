const CACHE = "sports-game-watch-v9";
const APP = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const u = new URL(event.request.url);

  // Keep live ESPN/MLB data uncached.
  if (u.hostname.includes("api.espn.com") ||
      u.hostname.includes("site.api.espn.com") ||
      u.hostname.includes("statsapi.mlb.com")) return;

  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  );
});
