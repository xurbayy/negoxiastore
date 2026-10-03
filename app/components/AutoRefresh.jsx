'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ==========================================
// AutoRefresh (senyap - tanpa indikator)
// ==========================================
// Sejak migrasi ke SATU database PostgreSQL (2026-10-03), web membaca data
// LANGSUNG dari database - bukan lagi dari "snapshot push bot". Karena itu:
//   - tidak ada lagi "umur data bot" yang perlu ditampilkan
//   - indikator mengambang "Data bot: X lalu" DIHAPUS (permintaan pemilik)
//
// Komponen ini sekarang hanya MENYEGARKAN halaman secara berkala (server
// component re-render -> query DB terbaru). Tidak merender UI apa pun.
export default function AutoRefresh({ intervalMs = 30000 }) {
  const router = useRouter();

  useEffect(() => {
    const segarkan = () => { if (!document.hidden) router.refresh(); };
    const iv = setInterval(segarkan, intervalMs);

    function onFocus() { segarkan(); }
    function onVisible() { if (!document.hidden) segarkan(); }

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
