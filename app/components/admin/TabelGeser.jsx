'use client';

// ==========================================
// TabelGeser
// Pembungkus tabel lebar supaya enak dipakai di HP.
// ==========================================
//
// MASALAH di mobile (2026-09-30):
//   Tabel di panel admin (Shop, Activity Log, Bank, Redeem, dst.) memang
//   dibuat lebar (min-w 640px) dan dibungkus overflow-x-auto. Secara teknis
//   ini BENAR - halaman tidak meluber dan tabelnya bisa digeser.
//
//   Tapi di HP tidak ada tanda apa pun bahwa tabelnya bisa digeser. Tab
//   terpotong di tepi kanan saja tidak cukup; sebagian orang tidak menyadari
//   ada kolom lagi di sebelah kanan.
//
// SOLUSI: petunjuk teks kecil yang HANYA muncul di layar sempit, dan
// menghilang begitu tabelnya benar-benar digeser (karena saat itu pengguna
// sudah tahu). Tidak ada perubahan pada tabelnya sendiri.

import { useEffect, useRef, useState } from 'react';

export default function TabelGeser({ children, className = '' }) {
  const wadah = useRef(null);
  const [bisaGeser, setBisaGeser] = useState(false);
  const [sudahDigeser, setSudahDigeser] = useState(false);

  useEffect(() => {
    const el = wadah.current;
    if (!el) return;

    // Periksa ulang saat ukuran berubah (rotasi layar / jendela di-resize).
    function periksa() {
      if (!el) return;
      setBisaGeser(el.scrollWidth > el.clientWidth + 4);
    }
    periksa();

    const ro = new ResizeObserver(periksa);
    ro.observe(el);
    window.addEventListener('resize', periksa);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', periksa);
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={wadah}
        onScroll={(e) => { if (e.currentTarget.scrollLeft > 8) setSudahDigeser(true); }}
        className={`overflow-x-auto ${className}`}
      >
        {children}
      </div>

      {/* Petunjuk geser: hanya di HP (sm ke atas disembunyikan), dan hilang
          setelah tabelnya digeser sekali. pointer-events-none supaya tidak
          menghalangi sentuhan ke tabelnya. */}
      {bisaGeser && !sudahDigeser && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center sm:hidden">
          <div className="h-full w-10 bg-gradient-to-l from-bg-soft to-transparent" aria-hidden="true" />
          <span className="absolute right-1 rounded-full border border-border-soft bg-card-cream/95 px-2 py-0.5 text-[0.6rem] font-medium text-ink-muted shadow-sm">
            geser →
          </span>
        </div>
      )}
    </div>
  );
}
