'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Segarkan data server (snapshot bot) TANPA reload: interval + saat tab
// kembali fokus. Dipasang di halaman berisi data live.
export default function AutoRefresh({ intervalMs = 20000 }) {
  const router = useRouter();

  useEffect(() => {
    const iv = setInterval(() => router.refresh(), intervalMs);
    function onFocus() { router.refresh(); }
    function onVisible() { if (!document.hidden) router.refresh(); }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
