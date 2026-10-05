// ==========================================
// Service Worker NEXO Games - Web Push
// ==========================================
// Menerima notifikasi push dari server dan menampilkannya di perangkat
// (HP/laptop) walau tab web sedang TIDAK dibuka. Klik notifikasi -> buka web.
// File ini harus ada di root (public/) supaya scope-nya seluruh situs.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
