'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// ==========================================
// AutoRefresh
// Menyegarkan data server (snapshot bot) otomatis, tanpa reload halaman.
// ==========================================
//
// KENAPA CUMA OTOMATIS, TANPA TOMBOL KLIK (permintaan pemilik 2026-09-30):
//   Versi sebelumnya bisa diklik untuk menyegarkan segera. Pemilik memutuskan
//   tombol itu DIHAPUS supaya tidak ada request tambahan ke database di luar
//   jadwal - satu klik = satu pemuatan ulang server. Penyegaran otomatis
//   sudah cukup, jadi tidak ada alasan memicu yang manual.
//
// Yang tersisa hanya INDIKATOR PASIF (bukan tombol):
//   - berdetak tiap detik, dihitung di BROWSER (bukan dari data bot), jadi
//     pemakai melihat datanya memang hidup walau isi snapshot belum berubah
//   - titik hijau berdenyut sesaat setiap kali penyegaran berjalan
//
// Komponen ini merender UI-nya sendiri supaya setiap halaman yang memakainya
// langsung dapat indikatornya tanpa perlu diubah satu per satu.
export default function AutoRefresh({ intervalMs = 30000 }) {
  const router = useRouter();
  // umur data BOT (dari snapshot.ts), bukan waktu browser refresh. Ini yang
  // benar: kalau bot mati, indikator menunjukkan data makin tua.
  const [umurData, setUmurData] = useState(null); // detik | null
  const [ada, setAda] = useState(true);
  const [menyegarkan, setMenyegarkan] = useState(false);

  // --- siklus penyegaran data + ambil umur data bot ---
  useEffect(() => {
    function ambilUmur() {
      fetch('/api/snapshot-umur', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (d.ok) { setAda(d.ada); if (d.ada) setUmurData(d.umurDetik); } })
        .catch(() => { /* abaikan */ });
    }

    function segarkan() {
      // HEMAT BANDWIDTH: jangan menyegarkan saat tab tidak terlihat.
      if (document.hidden) return;
      setMenyegarkan(true);
      // router.refresh() memuat ulang Server Component TANPA mengubah URL dan
      // tanpa kehilangan state klien.
      router.refresh();
      ambilUmur();
      setTimeout(() => setMenyegarkan(false), 600);
    }

    ambilUmur();
    const iv = setInterval(() => {
      // Umur data dihitung ulang tiap detik di klien agar terus bertambah,
      // walau belum menyegarkan (biar tidak "diam" padahal data makin tua).
      setUmurData((u) => (u == null ? u : u + 1));
    }, 1000);
    const ivSegar = setInterval(segarkan, intervalMs);

    function onFocus() { if (!document.hidden) segarkan(); }
    function onVisible() { if (!document.hidden) segarkan(); }

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(iv);
      clearInterval(ivSegar);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, intervalMs]);

  // Teks umur DATA BOT (bukan waktu refresh browser).
  let umur = null;
  if (!ada) umur = 'data belum ada';
  else if (umurData == null) umur = 'memuat...';
  else if (umurData < 5) umur = 'baru saja';
  else if (umurData < 60) umur = `${umurData} detik lalu`;
  else if (umurData < 3600) umur = `${Math.floor(umurData / 60)} menit lalu`;
  else umur = `${Math.floor(umurData / 3600)} jam lalu`;

  // Data dianggap BASI kalau umur > 5 menit (bot mungkin mati).
  const basi = umurData != null && umurData > 300;

  // Span, BUKAN button: tidak ada lagi aksi manual yang bisa memicu request.
  return (
    <span
      aria-live="polite"
      title="Umur data terakhir dari bot (bukan waktu refresh halaman)."
      className="pointer-events-none fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-card-cream/95 px-3 py-1.5 text-[0.68rem] font-medium text-ink-muted shadow-[0_4px_14px_rgba(43,33,24,0.12)] backdrop-blur"
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${basi ? 'bg-danger' : 'bg-success'} ${menyegarkan ? 'pulse-dot' : ''}`}
      />
      {menyegarkan ? 'Menyegarkan...' : `Data bot: ${umur}`}
    </span>
  );
}
