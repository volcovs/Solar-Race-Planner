// Offline (FE-09). The build fills in FILES, VERSION and API (vite.config.ts).
const FILES = __FILES__;
const APP = `app-${__VERSION__}`;
const API = new RegExp(__API__); // the plan and forecast: the last answer is kept for offline
const MAX_TILES = 4000;

// The whole app is saved up front. On the first visit this worker takes charge at once; a newer
// one waits until the page asks (its "Reload" button), so nothing changes mid-race.
self.addEventListener("install", (event) => event.waitUntil(caches.open(APP).then((cache) => cache.addAll(FILES))));

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith("app-") && name !== APP) await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const { scope } = self.registration;
  const file = request.url.startsWith(scope) ? request.url.slice(scope.length).split(/[?#]/)[0] : null;

  if (request.mode === "navigate") event.respondWith(saved("index.html", request));
  else if (FILES.includes(file)) event.respondWith(saved(file, request));
  else if (API.test(request.url)) event.respondWith(networkFirst(request));
  else if (request.url.startsWith("https://tiles.openfreemap.org/")) event.respondWith(mapFile(event));
});

async function saved(file, request) {
  return (await (await caches.open(APP)).match(file)) ?? fetch(request);
}

/** Fresh with signal; without it, the last answer. */
async function networkFirst(request) {
  const cache = await caches.open("api");
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) ?? Promise.reject(error);
  }
}

/** Tiles never change at a URL: once seen, from the cache. Styles do: the saved copy, refreshed behind it. */
async function mapFile(event) {
  const { request } = event;
  const isTile = /\.(pbf|png|jpg|webp)$/.test(new URL(request.url).pathname);
  const cache = await caches.open(isTile ? "map-tiles" : "map-styles");
  const copy = await cache.match(request);
  if (copy && isTile) return copy;

  const fresh = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
      if (isTile && ++tilesSaved % 100 === 0) await trim(cache);
    }
    return response;
  });
  if (!copy) return fresh;
  event.waitUntil(fresh.catch(() => {})); // refresh the style for next time
  return copy;
}

let tilesSaved = 0;

/** Oldest tiles out once there are too many (a cache lists them oldest first). */
async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, keys.length - MAX_TILES)) await cache.delete(key);
}
