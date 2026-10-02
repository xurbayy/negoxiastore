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
  const [detikLalu, setDetikLalu] = useState(0);
  const [menyegarkan, setMenyegarkan] = useState(false);

  // --- detak visual (murni di browser, nol request) ---
  useEffect(() => {
    const iv = setInterval(() => setDetikLalu((d) => d + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // --- siklus penyegaran data ---
  useEffect(() => {
    function segarkan() {
      // HEMAT BANDWIDTH: jangan menyegarkan saat tab tidak terlihat. Sebelumnya
      // tab yang ditinggal terbuka tetap memanggil router.refresh() tiap 20-30
      // detik -> membebani bandwidth Vercel tanpa ada yang menonton.
      if (document.hidden) return;
      setMenyegarkan(true);
      // router.refresh() memuat ulang Server Component TANPA mengubah URL dan
      // tanpa kehilangan state klien. Ini yang membuat data snapshot terbaru
      // ikut terambil.
      router.refresh();
      // router.refresh() tidak memberi tahu kapan selesai; jeda pendek ini
      // hanya umpan balik visual, bukan penanda selesai.
      setTimeout(() => { setMenyegarkan(false); setDetikLalu(0); }, 600);
    }

    const iv = setInterval(segarkan, intervalMs);
    // Tab kembali aktif -> segarkan sekali (data basi saat pengguna kembali).
    function onFocus() { if (!document.hidden) segarkan(); }
    function onVisible() { if (!document.hidden) segarkan(); }

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, intervalMs]);

  const umur = detikLalu < 5
    ? 'baru saja'
    : detikLalu < 60
      ? `${detikLalu} detik lalu`
      : `${Math.floor(detikLalu / 60)} menit lalu`;

  // Span, BUKAN button: tidak ada lagi aksi manual yang bisa memicu request.
  return (
    <span
      aria-live="polite"
      title="Data disegarkan otomatis. Tidak perlu klik apa pun."
      className="pointer-events-none fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-card-cream/95 px-3 py-1.5 text-[0.68rem] font-medium text-ink-muted shadow-[0_4px_14px_rgba(43,33,24,0.12)] backdrop-blur"
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full bg-success ${menyegarkan ? 'pulse-dot' : ''}`}
      />
      {menyegarkan ? 'Menyegarkan...' : `Diperbarui ${umur}`}
    </span>
  );
}
