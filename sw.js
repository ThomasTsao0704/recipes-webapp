const CACHE_NAME = "recipes-cache-v20250820035521";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.js",
  "./recipes.csv",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate for everything; App Shell is pre-cached
self.addEventListener("fetch", (event) => {
  const req = event.request;
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(networkRes => {
        // Only cache GET and same-origin responses
        try {
          const url = new URL(req.url);
          if (req.method === "GET" && url.origin === location.origin) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          }
        } catch (e) {}
        return networkRes;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});