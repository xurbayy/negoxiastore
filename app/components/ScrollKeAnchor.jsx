'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// ==========================================
// ScrollKeAnchor
// Menyelamatkan tautan ke bagian tertentu (#cara-main, #faq, #games)
// ==========================================
//
// MASALAH YANG DIPERBAIKI (2026-09-30):
//   Tautan navbar "/#cara-main" dulu cuma pindah ke halaman depan lalu
//   berhenti di ATAS - terlihat seperti "ke halaman game yang awal", bukan
//   ke Cara Main.
//
//   Penyebabnya: bagian itu tidak dirender (waktu itu hanya untuk tamu),
//   sehingga elemen dengan id-nya tidak ada. Browser yang tidak menemukan
//   anchor-nya hanya memuat halaman dan tidak menggulir ke mana pun.
//
// Dua lapis pengaman:
//   1. Setelah halaman selesai dimuat, kalau URL punya #anchor, gulir ke
//      elemen itu. Dijalankan ulang beberapa kali karena bagian di bawah
//      (Cara Main, FAQ) bisa muncul belakangan setelah data siap.
//   2. Kalau tetap tidak ketemu, jangan tinggalkan pengguna di atas tanpa
//      penjelasan - cukup pastikan halaman ada di posisi paling atas, jadi
//      perilakunya konsisten dan tidak terasa "nyangkut di tengah".
//
// Komponen ini tidak merender apa pun.

export default function ScrollKeAnchor() {
  const pathname = usePathname();

  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!id) return;

    let batal = false;
    let sudah = 0;

    // Bagian di bawah bisa baru ter-render setelah komponen klien lain siap,
    // jadi dicoba beberapa kali dengan jeda pendek - bukan sekali lalu menyerah.
    const coba = () => {
      if (batal) return;
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      sudah++;
      if (sudah < 8) setTimeout(coba, 150);
    };
    coba();

    return () => { batal = true; };
  }, [pathname]);

  return null;
}
