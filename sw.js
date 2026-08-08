
const CACHE = "sports-game-watch-v1";
const APP = ["./", "./index.html", "./manifest.json"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.hostname.includes("api.espn.com")) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
