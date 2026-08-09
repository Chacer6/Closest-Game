/*
 * CLOSEST GAME — Production Service Worker
 * -----------------------------------------
 * Goals:
 *  - Never serve stale live sports data.
 *  - Pick up new GitHub Pages deployments quickly.
 *  - Keep the app shell available during a temporary connection loss.
 *  - Automatically activate a newer worker when the page tells us it is ready.
 *  - Clean old caches so previous versions do not pile up.
 *
 * IMPORTANT:
 * This file must be hosted on HTTPS (GitHub Pages works).
 * Live ESPN/MLB API responses are intentionally NOT cached.
 */

const APP_VERSION = "closest-game-v2026-08-09-01";
const CACHE_NAME = APP_VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

// Files that are safe/useful to cache as the application shell.
// Add local CSS/JS/image files here if Closest Game later gets split into them.
const SHELL_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".json",
  ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico",
  ".woff", ".woff2", ".ttf"
]);

const API_HOSTS = new Set([
  "site.api.espn.com",
  "site.web.api.espn.com",
  "cdn.espn.com",
  "statsapi.mlb.com"
]);

/* ---------- install ---------- */

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ---------- activate ---------- */

self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      // Remove every old Closest Game cache.
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      ),
      // Take control immediately instead of waiting for all tabs to close.
      self.clients.claim()
    ]).then(() => notifyClients("SW_ACTIVATED"))
  );
});

/* ---------- messages from the page ---------- */

self.addEventListener("message", event => {
  const data = event.data || {};

  // Lets the webpage request an immediate update.
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  // Lets the webpage ask the worker to check for an updated index.
  if (data.type === "CHECK_FOR_UPDATE") {
    event.waitUntil(checkForUpdate());
  }

  // Clear all Closest Game caches if the user needs a hard reset.
  if (data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys()
        .then(keys =>
          Promise.all(
            keys
              .filter(key => key.startsWith("closest-game-"))
              .map(key => caches.delete(key))
          )
        )
        .then(() => notifyClients("CACHE_CLEARED"))
    );
  }
});

/* ---------- fetch ---------- */

self.addEventListener("fetch", event => {
  const request = event.request;

  // Only GET requests are cacheable.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept cross-origin API calls that provide live scores.
  // This is critical: cached ESPN data could make Closest Game look outdated.
  if (API_HOSTS.has(url.hostname)) {
    event.respondWith(fetch(request, {
      cache: "no-store",
      credentials: "omit"
    }));
    return;
  }

  // Ignore browser extensions and other unrelated origins.
  if (url.origin !== self.location.origin) return;

  // Navigation requests: NETWORK FIRST.
  // This makes a new GitHub Pages deployment appear as soon as possible.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // App-shell/static files: NETWORK FIRST, cached fallback.
  if (isShellResource(url)) {
    event.respondWith(networkFirstStatic(request));
  }
});

/* ---------- strategies ---------- */

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, {
      cache: "no-store"
    });

    if (response && response.ok) {
      // Store the newest HTML so it is available during a temporary outage.
      const cache = await caches.open(CACHE_NAME);
      await cache.put("./index.html", response.clone());
      return response;
    }

    throw new Error("Navigation request was not successful.");
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);

    return (
      await cache.match(request) ||
      await cache.match("./index.html") ||
      offlineResponse()
    );
  }
}

async function networkFirstStatic(request) {
  try {
    const response = await fetch(request, {
      cache: "no-store"
    });

    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
      return response;
    }

    throw new Error("Static resource request failed.");
  } catch (error) {
    const cached = await caches.match(request);
    return cached || offlineResponse();
  }
}

/* ---------- update checking ---------- */

async function checkForUpdate() {
  try {
    // Fetch the live index without allowing the browser HTTP cache to answer.
    const response = await fetch("./index.html", {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    if (!response || !response.ok) return false;

    const cache = await caches.open(CACHE_NAME);
    const oldResponse = await cache.match("./index.html");

    const newText = await response.clone().text();
    const oldText = oldResponse ? await oldResponse.text() : "";

    if (oldText && newText !== oldText) {
      // Save the new shell, then tell the page that an update exists.
      await cache.put("./index.html", response.clone());
      notifyClients("UPDATE_AVAILABLE");
      return true;
    }

    // Keep the current shell fresh even when its contents haven't changed.
    await cache.put("./index.html", response.clone());
    return false;
  } catch {
    return false;
  }
}

/* ---------- helpers ---------- */

function isShellResource(url) {
  const path = url.pathname.toLowerCase();

  if (path.endsWith("/") || path.endsWith(".html")) return true;

  for (const extension of SHELL_EXTENSIONS) {
    if (path.endsWith(extension)) return true;
  }

  return false;
}

function notifyClients(type) {
  return self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  }).then(clients => {
    for (const client of clients) {
      client.postMessage({
        type,
        version: APP_VERSION
      });
    }
  });
}

function offlineResponse() {
  return new Response(
    `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Closest Game</title>
<style>
body{margin:0;background:#090b0d;color:#e7eaec;font-family:Arial,sans-serif;
display:grid;place-items:center;min-height:100vh;text-align:center}
main{padding:28px}h1{font-size:24px;margin:0 0 8px}
p{color:#9aa2a8;font-size:14px}
</style>
</head>
<body>
<main>
<h1>Closest Game</h1>
<p>You're offline. Reconnect to load live scores.</p>
</main>
</body>
</html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
