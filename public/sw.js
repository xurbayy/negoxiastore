// ==========================================
// Service Worker NEXO Games - Web Push
// ==========================================
// Menerima notifikasi push dari server dan menampilkannya di perangkat
// (HP/laptop) walau tab web sedang TIDAK dibuka. Klik notifikasi -> buka web.
// File ini harus ada di root (public/) supaya scope-nya seluruh situs.
//
// CATATAN 3 Nov 2026: fitur "Pasang Aplikasi" (PWA) DIHAPUS dari situs
// (manifest + prompt install dicabut - heuristik Safe Browsing membaca prompt
// install otomatis sebagai unwanted software). WEB PUSH TETAP ADA: butuh
// service worker + izin notifikasi, TIDAK butuh manifest - jadi file ini,
// fetch handler, dan registrasi dari PushToggle/NotifPrompt/Notifications
// dibiarkan utuh.
// Strategi cache yang dipakai fetch handler:
//   - Aset statis ber-hash / gambar -> cache-first (tidak pernah berubah)
//   - Navigasi HTML                 -> network-first, fallback cache saat offline
//   - API                           -> network only (data harus segar, tidak
//     pernah ter-cache supaya sesi login / saldo poin tidak basi)
const CACHE_STATIS = 'nexo-statis-v1';
const CACHE_HTML = 'nexo-html-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Bersihkan cache versi lama.
    const semua = await caches.keys();
    await Promise.all(
      semua.filter((k) => k !== CACHE_STATIS && k !== CACHE_HTML).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Hanya origin sendiri.
  if (url.origin !== self.location.origin) return;

  // API: selalu network (data harus segar; gagal = gagal, jangan basi).
  if (url.pathname.startsWith('/api/')) return;

  // Aset statis ber-hash + gambar: cache-first.
  if (url.pathname.startsWith('/_next/static/') || /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_STATIS);
      const ada = await cache.match(req);
      if (ada) return ada;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Halaman HTML: network-first, simpan versi terbaru, fallback cache saat offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_HTML);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const lama = await cache.match(req);
        if (lama) return lama;
        const beranda = await cache.match('/');
        return beranda || Response.error();
      }
    })());
    return;
  }
});

// Terima push dari server.
self.addEventListener('push', (event) => {
  let data = { title: 'NEXO Games', body: 'Ada notifikasi baru.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    try { data.body = event.data.text(); } catch (_) {}
  }

  const options = {
    body: data.body || '',
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-48x48.png',
    tag: data.tag || 'nexo-notif',       // notif bertag sama menimpa yang lama
    renotify: true,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(data.title || 'NEXO Games', options));
});

// Klik notifikasi -> fokuskan tab yang ada / buka baru.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(target); return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
