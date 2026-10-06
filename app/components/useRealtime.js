'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ==========================================
// useRealtime - refresh halaman saat DATA BERUBAH (LISTEN/NOTIFY)
// ==========================================
// Permintaan pemilik 2026-10-06: "info dari database ke web realtime lewat
// jalur bridge bot - dashboard admin, komunitas, leaderboard, profile/me
// jangan terlalu lama delay".
//
// CARA KERJA (long-poll, bukan polling buta):
//   1. Ambil versi data sekarang dari /api/realtime.
//   2. Panggil /api/realtime?sejak=<versi> -> DITAHAN di server sampai versi
//      berubah (trigger Postgres -> NOTIFY nexo_data -> bot naikkan versi)
//      atau timeout ~20 dtk.
//   3. Begitu balasan datang dengan berubah=true -> router.refresh() (server
//      component re-render, query DB terbaru) -> ulangi dari langkah 2.
//
// FALLBACK: kalau endpoint gagal (bot mati total), pasang poll jarang
// (fallbackMs) supaya halaman tidak pernah basi selamanya. Tidak ada
// indikator visual - sama seperti AutoRefresh yang digantikan.
export default function useRealtime({ aktif = true, fallbackMs = 60000 } = {}) {
  const router = useRouter();
  const hidup = useRef(true);
  const versi = useRef(0);

  useEffect(() => {
    hidup.current = true;
    if (!aktif) return () => { hidup.current = false; };

    let timer = null;
    let gagalBeruntun = 0;

    const jeda = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });

    async function loop() {
      while (hidup.current) {
        const mulai = Date.now();
        try {
          const res = await fetch('/api/realtime' + (versi.current ? '?sejak=' + versi.current : ''), { cache: 'no-store' });
          const d = await res.json().catch(() => ({}));
          if (!hidup.current) return;

          if (d?.ok) {
            gagalBeruntun = 0;
            const v = Number(d.versi) || 0;
            if (v > versi.current) {
              // Ada perubahan nyata -> segarkan server component.
              if (versi.current > 0 && !document.hidden) router.refresh();
              versi.current = v;
            }
            // Anti-spin: long-poll normalnya ditahan server ~20 dtk. Kalau
            // balasan datang instan (< 1 dtk) berarti server tidak menahan
            // (mis. fallback agent) -> kasih jeda kecil supaya tidak spam.
            if (Date.now() - mulai < 1000) await jeda(1500);
            continue;
          }

          // Endpoint membalas ok=false (bot/agent tidak merespons).
          gagalBeruntun++;
          await jeda(Math.min(30000, 3000 * gagalBeruntun));
        } catch {
          gagalBeruntun++;
          if (!hidup.current) return;
          // FALLBACK poll jarang saat jaringan/endpoint bermasalah.
          await jeda(fallbackMs);
        }
      }
    }

    // Tunda start dikit supaya tidak berebut dengan render pertama.
    const t0 = setTimeout(loop, 1200);

    function onVisible() {
      // Balik ke tab: cek versi sekali (kalau ketinggalan banyak perubahan,
      // refresh langsung terasa instan).
      if (!document.hidden) loopOnce();
    }
    async function loopOnce() {
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

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      hidup.current = false;
      clearTimeout(t0);
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, aktif, fallbackMs]);
}
