'use client';

import { useEffect, useRef, useState } from 'react';
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
  // Menampung fungsi segarkan dari efek di bawah, supaya tombol memakai jalur
  // yang SAMA (timer, fokus tab, dan klik tidak boleh berbeda perilaku).
  const segarkanRef = useRef(null);

  // --- detak visual (dihitung di browser, bukan dari data bot) ---
  useEffect(() => {
    const iv = setInterval(() => setDetikLalu((d) => d + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // --- siklus penyegaran data ---
  //
  // SATU fungsi dipakai oleh timer, fokus tab, dan klik tombol - supaya
  // semuanya berperilaku persis sama. Dulu logika klik ditulis ulang di
  // atribut onClick sehingga bisa berbeda dari jalur timer.
  useEffect(() => {
    function segarkan() {
      setMenyegarkan(true);
      // router.refresh() memuat ulang Server Component TANPA mengubah URL dan
      // tanpa kehilangan state klien. Ini yang membuat data snapshot terbaru
      // ikut terambil - bukan sekadar animasi.
      router.refresh();
      // router.refresh() tidak memberi tahu kapan selesai; jeda pendek ini
      // hanya umpan balik visual, bukan penanda selesai.
      setTimeout(() => { setMenyegarkan(false); setDetikLalu(0); }, 600);
    }
    // Dipakai tombol di bawah (bukan disalin ulang).
    segarkanRef.current = segarkan;

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
      onClick={() => segarkanRef.current && segarkanRef.current()}
      title="Klik untuk menyegarkan data sekarang. Data juga disegarkan otomatis."
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
