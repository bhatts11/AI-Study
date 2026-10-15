// Service worker for the free static build: keeps the app's own files so it opens with no internet. Lessons live in the phone's storage, not here.
const CACHE = "coach-static-v1";
const base = self.registration.scope;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch(base, { cache: "reload" });
    if (!res.ok) return;
    const html = await res.clone().text();
    await cache.put(base, res);
    const files = Array.from(html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g), (m) => new URL(m[1], base).href);
    await Promise.all(files.map((u) => cache.add(u).catch(() => {})));
  })().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(base)) return;
  if (request.url.includes("/data/")) return;   // the lesson file is handled by the page
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request, { ignoreSearch: true }) || (request.mode === "navigate" ? await cache.match(base) : undefined);
    if (hit) return hit;
    try { const res = await fetch(request); if (res.ok) cache.put(request, res.clone()); return res; }
    catch (e) { if (request.mode === "navigate") { const shell = await cache.match(base); if (shell) return shell; } throw e; }
  })());
});
