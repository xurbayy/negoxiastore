'use client';

import { useEffect } from 'react';
import { hydrateEmojiCatalog } from '../lib/emojisClient';

// Ambil katalog emoji resmi dari /api/emojis (database, di-push bot) lalu
// hydrate resolver client. Dijalankan SEKALI di root layout; kalau gagal,
// resolver tetap memakai file JSON statis -> tampilan tidak pernah kosong.
export default function EmojiHydrator() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/emojis', { cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json().catch(() => ({}));
        if (!cancelled && d?.ok && Array.isArray(d.emojis)) {
          hydrateEmojiCatalog(d.emojis);
        }
      } catch { /* fallback JSON statis sudah aktif */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
