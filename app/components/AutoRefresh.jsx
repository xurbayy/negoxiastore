'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ==========================================
// AutoRefresh (senyap - tanpa indikator)
// ==========================================
// Sejak migrasi ke SATU database PostgreSQL (2026-10-03), web membaca data
// LANGSUNG dari database - bukan lagi dari "snapshot push bot". Karena itu:
//   - tidak ada lagi "umur data bot" yang perlu ditampilkan
//   - indikator mengambang "Data bot: X lalu" DIHAPUS (permintaan pemilik)
//
// UPGRADE REALTIME (2026-10-06, permintaan pemilik: "jangan terlalu lama
// delay-nya"): komponen ini sekarang memakai LONG-POLL /api/realtime yang
// ditahan server sampai ADA PERUBAHAN DATA (trigger Postgres -> NOTIFY
// nexo_data -> bot naikkan versi). Jadi:
//   - data berubah  -> refresh dalam <1-2 dtk (dulu tunggu 30 dtk)
//   - data diam     -> TIDAK ada refresh terbuang (dulu tetap refresh tiap 30 dtk)
// `intervalMs` dipertahankan sebagai FALLBACK poll jarang kalau endpoint
// realtime mati (mis. bot & agent down) supaya halaman tidak basi selamanya.
export default function AutoRefresh({ intervalMs = 60000 }) {
  const router = useRouter();
  const hidup = useRef(true);
  const versi = useRef(0);

  useEffect(() => {
    hidup.current = true;
    let timer = null;
    let gagal = 0;
    const jeda = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });

    async function loop() {
      while (hidup.current) {
        const mulai = Date.now();
        try {
          const res = await fetch('/api/realtime' + (versi.current ? '?sejak=' + versi.current : ''), { cache: 'no-store' });
          const d = await res.json().catch(() => ({}));
          if (!hidup.current) return;
          if (d?.ok) {
            gagal = 0;
            const v = Number(d.versi) || 0;
            if (v > versi.current) {
              if (versi.current > 0 && !document.hidden) router.refresh();
              versi.current = v;
            }
            // Anti-spin kalau server balas instan (long-poll gagal ditahan).
            if (Date.now() - mulai < 1000) await jeda(1500);
            continue;
          }
          gagal++;
          await jeda(Math.min(intervalMs, 4000 * gagal));
        } catch {
          gagal++;
          if (!hidup.current) return;
          await jeda(intervalMs); // fallback poll jarang
        }
      }
    }

    const t0 = setTimeout(loop, 1200);

    function onFocus() { cekSekali(); }
    function onVisible() { if (!document.hidden) cekSekali(); }
    async function cekSekali() {
      try {
        const res = await fetch('/api/realtime', { cache: 'no-store' });
        const d = await res.json().catch(() => ({}));
        if (!hidup.current || !d?.ok) return;
        const v = Number(d.versi) || 0;
        if (v > versi.current) {
          versi.current = v;
          router.refresh();
        }
      } catch { /* diamkan */ }
    }

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      hidup.current = false;
      clearTimeout(t0);
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
