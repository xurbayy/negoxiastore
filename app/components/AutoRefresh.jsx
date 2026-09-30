'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// ==========================================
// AutoRefresh
// Menyegarkan data server (snapshot bot) tanpa reload halaman.
// ==========================================
//
// MASALAH YANG DIPERBAIKI (laporan pemilik 2026-09-30: "harus realtime"):
//   Siklus ini sudah jalan, TAPI tidak ada cara bagi pemakai untuk tahu.
//   Akibatnya terasa seperti tidak realtime sama sekali.
//
//   Penyebabnya: getLatestSnapshot() mengembalikan objek yang isinya sama
//   selama bot belum push lagi, dan React membandingkan hasil render. Kalau
//   isinya identik, TIDAK ADA satu pun piksel yang berubah - termasuk label
//   "Diperbarui X lalu" yang dihitung dari ts SNAPSHOT BOT, bukan dari waktu
//   render. Diuji: menunggu 25 detik (melewati satu siklus 20 detik) tidak
//   mengubah label sama sekali.
//
//   Ditambah lagi bot hanya menulis snapshot tiap 60 detik, sedangkan web
//   menyegarkan tiap 20 detik - jadi 2 dari 3 penyegaran memang mengambil
//   data yang sama.
//
// SOLUSI DI SISI WEB:
//   1. Detak "hidup" yang dihitung di BROWSER: label "baru saja diperbarui"
//      berdetak tiap detik, jadi penyegaran terlihat nyata walau isi datanya
//      kebetulan belum berubah.
//   2. Klik untuk menyegarkan segera, tanpa menunggu siklus.
//   3. Saat tab kembali aktif, langsung segarkan (perilaku lama dipertahankan).
//
// Komponen ini sengaja merender UI-nya sendiri supaya setiap halaman yang
// memakainya langsung dapat indikatornya tanpa perlu diubah satu per satu.
export default function AutoRefresh({ intervalMs = 20000 }) {
  const router = useRouter();
  const [detikLalu, setDetikLalu] = useState(0);
  const [menyegarkan, setMenyegarkan] = useState(false);

  // --- detak visual (dihitung di browser, bukan dari data bot) ---
  useEffect(() => {
    const iv = setInterval(() => setDetikLalu((d) => d + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // --- siklus penyegaran data ---
  useEffect(() => {
    function segarkan() {
      setMenyegarkan(true);
      router.refresh();
      // router.refresh() tidak memberi tahu kapan selesai; jeda pendek ini
      // hanya untuk memberi umpan balik visual, bukan penanda selesai.
      setTimeout(() => { setMenyegarkan(false); setDetikLalu(0); }, 600);
    }

    const iv = setInterval(segarkan, intervalMs);
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

  return (
    <button
      type="button"
      onClick={() => { setMenyegarkan(true); router.refresh(); setTimeout(() => { setMenyegarkan(false); setDetikLalu(0); }, 600); }}
      title="Data disegarkan otomatis tiap 20 detik. Klik untuk menyegarkan sekarang."
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-card-cream/95 px-3 py-1.5 text-[0.68rem] font-medium text-ink-muted shadow-[0_4px_14px_rgba(43,33,24,0.12)] backdrop-blur transition-colors hover:border-accent hover:text-ink cursor-pointer"
    >
      {/* titik hijau: berdenyut sesaat setelah penyegaran sebagai tanda hidup */}
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full bg-success ${menyegarkan ? 'pulse-dot' : ''}`}
      />
      {menyegarkan ? 'Menyegarkan...' : `Diperbarui ${umur}`}
    </button>
  );
}
