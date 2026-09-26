/**
 * Arcade Hub service worker — çevrimdışı çalışma.
 *
 * Strateji: ÖNCE AĞ, sonra önbellek. Çevrimiçiyken her istek sunucudan gelir (GitHub Pages'e yapılan
 * her push hemen görünür) ve yanıt önbelleğe yazılır; ağ yoksa son görülen sürüm verilir.
 * Dosya listesi tutulmaz: sayfa ilk yüklemede kullandığı kaynakları mesajla bildirir (app.js),
 * sonrasında her GET isteği kendiliğinden önbelleğe girer. Yeni oyun eklemek bakım gerektirmez.
 * Tüm yollar bu dosyanın konumuna göredir (site /arcade-hub/ alt dizininde çalışır).
 */
const CACHE = 'arcade-hub-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const sameOrigin = (url) => new URL(url, self.location.href).origin === self.location.origin;

// İlk ziyarette sayfa, service worker devreye girmeden yüklediği dosyaları bildirir.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache' || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(event.data.urls.filter(sameOrigin).map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok) await cache.put(url, res);
      } catch {
        /* çevrimdışı ya da bulunamadı: sonraki ziyarette tekrar denenir */
      }
    }));
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !sameOrigin(req.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = (await cache.match('./')) || (await cache.match('./index.html'));
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
