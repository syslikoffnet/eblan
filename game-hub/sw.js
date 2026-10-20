/* EBLAN BOX — service worker: полный офлайн */
const CACHE = 'eblan-box-v1';
const SHELL = [
  './', './index.html', './app.css', './app.js', './engine.js',
  './manifest.webmanifest', './assets/icon-512.png',
  './games/index.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL).catch(() => {});
    // кэшируем все игровые модули
    try {
      const mod = await import('./games/index.js');
      const files = (mod.GAMES || []).map(g => './games/' + g.file);
      await c.addAll(files).catch(() => {});
    } catch {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // картинки-скриншоты: кэш, потом сеть
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok && url.origin === self.location.origin) {
          const c = await caches.open(CACHE);
          c.put(e.request, res.clone());
        }
        return res;
      } catch {
        return new Response('', { status: 404 });
      }
    })());
    return;
  }

  // остальное: кэш, при промахе — сеть с дообучением кэша
  e.respondWith((async () => {
    const hit = await caches.match(e.request);
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok && url.origin === self.location.origin) {
        const c = await caches.open(CACHE);
        c.put(e.request, res.clone());
      }
      return res;
    } catch {
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      return new Response('offline', { status: 503 });
    }
  })());
});
