// Service worker: lets the app shell open offline. Never touches /api/ (personal and access-key protected).
// Bump VERSION to drop every old cache on the next activate.
const VERSION = "v2";
const CACHE = `coach-shell-${VERSION}`;

// On install the shell and its hashed files are fetched at once, so one online visit is enough to open the app offline
// (the very first page load happens before this worker controls the page, so it could not cache those files itself).
async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch("/", { cache: "reload" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put("/", res);
  const files = new Set(Array.from(html.matchAll(/(?:src|href)="(\/[^"]+)"/g), (m) => m[1]).filter((u) => u.startsWith("/assets/") || /\.(svg|png|webmanifest)$/.test(u)));
  await Promise.all(Array.from(files, (u) => cache.add(u).catch(() => {})));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put("/", res.clone());   // every page request is the same single-page shell
    else if (res.status >= 502) { const hit = await cache.match("/"); if (hit) return hit; }   // a gateway error page is no use when the shell is saved
    return res;
  } catch (err) {
    const hit = await cache.match("/");
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;   // leave to the network
  if (url.pathname.startsWith("/assets/")) event.respondWith(cacheFirst(request));   // hashed file names never change
  else if (request.mode === "navigate") event.respondWith(networkFirst(request));
});
