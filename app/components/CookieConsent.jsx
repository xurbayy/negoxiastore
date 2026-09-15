'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Pemberitahuan cookie - SANTAI & TIDAK MEMAKSA (revisi 2026-09-16).
//
// KENAPA DIREVISI: versi sebelumnya mengunci user - satu-satunya tombol adalah
// "Mengerti", sedangkan "Pelajari dulu" cuma link ke halaman privasi sehingga
// dialog tetap menutupi layar. User merasa terkekang (dan memang tidak ada
// jalan keluar selain menyetujui).
//
// PRINSIP BARU - seperti situs besar yang ramah:
//   1. SELALU bisa ditutup: tombol X di pojok + tombol "Tutup" + tombol Escape.
//   2. Menutup = keputusan yang DIHORMATI. Kami tidak menagih lagi
//      (menutup dianggap "oke, lanjut" - bukan diabaikan lalu muncul terus).
//   3. Tidak menghalangi layar: strip kecil di bawah, bukan modal penuh;
//      halaman tetap bisa dibaca & dipakai tanpa menutupnya lebih dulu.
//   4. Sekali seumur perangkat (localStorage), tidak ada cookie tambahan.
//
// CATATAN JUJUR: NEXO hanya memakai cookie ESENSIAL (sesi login + 2FA admin).
// Tidak ada analitik, tidak ada pelacak, tidak ada iklan. Karena itu
// pemberitahuan ini murni informasi - bukan permintaan izin.
const KUNCI = 'nexo_cookie_ok';

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  // Catat keputusan user (dipakai untuk "Mengerti" maupun "Tutup" - keduanya
  // sama-sama menyelesaikan pemberitahuan; tidak ada yang dianggap salah).
  function simpan() {
    try { localStorage.setItem(KUNCI, '1'); } catch {}
    setShow(false);
  }

  useEffect(() => {
    // setTimeout(0): hindari setState sinkron di effect (cascade render).
    const t = setTimeout(() => {
      try {
        if (!localStorage.getItem(KUNCI)) setShow(true);
      } catch {
        // localStorage diblokir (mode privat ketat): jangan paksa tampil terus -
        // cukup tampilkan sekali untuk sesi ini, tanpa mengganggu lagi.
        setShow(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Tombol Escape juga menutup (harapan umum pengguna desktop).
  useEffect(() => {
    if (!show) return;
    const onKey = (e) => { if (e.key === 'Escape') simpan(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Pemberitahuan cookie"
      className="fixed inset-x-3 bottom-3 z-[90] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:max-w-md"
    >
      <div className="relative rounded-2xl border border-border-soft bg-bg/95 p-4 pr-10 shadow-xl backdrop-blur-xl">
        {/* Tombol tutup: SELALU ada. Menutup dihormati, tidak ditagih lagi. */}
        <button
          type="button"
          onClick={simpan}
          aria-label="Tutup pemberitahuan cookie"
          title="Tutup"
          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-white/10 hover:text-ink cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <p className="font-display text-sm font-bold text-ink">Soal cookie</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
          NEXO cuma pakai cookie fungsional: biar kamu tetap login dan notifikasi
          terbawa. Tidak ada pelacak, iklan, atau pihak ketiga.{' '}
          <Link href="/privacy-policy" className="font-semibold text-accent-hover underline-offset-2 hover:underline cursor-pointer">
            Detail
          </Link>
        </p>

        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={simpan} className="btn-primary px-4! py-1.5! text-sm cursor-pointer">
            Oke, mengerti
          </button>
          <button type="button" onClick={simpan} className="btn-ghost px-4! py-1.5! text-sm cursor-pointer">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
