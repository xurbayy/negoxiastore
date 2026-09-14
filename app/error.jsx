'use client';

// Error boundary tingkat halaman (App Router). Tanpa file ini, error runtime
// apa pun menampilkan layar bawaan Next.js yang tidak sesuai tema (dan di mode
// dev menampilkan stack trace). Ini menangkapnya dan memberi pemain pilihan
// jelas: coba lagi, atau kembali ke beranda.
//
// Catatan: halaman ini SENGAJA tidak mengirim detail error ke user - hanya pesan
// ramah. Detailnya dicatat ke console untuk admin/developer.
import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    // Jejak untuk deployment log / console admin (tidak ditampilkan ke user).
    console.error('[NEXO] error halaman:', error);
  }, [error]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-bg px-5 text-center text-ink">
      <div className="bg-grid absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 max-w-md">
        <p className="font-display text-6xl font-extrabold text-accent/25" aria-hidden="true">
          Aduh
        </p>
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight">
          Ada yang error di halaman ini
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">
          Bukan salahmu. Coba muat ulang halaman ini dulu. Kalau masih error, kembali ke
          beranda atau laporkan lewat tombol Feedback.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => reset()} className="btn-primary cursor-pointer">
            Coba Lagi
          </button>
          <Link href="/" className="btn-ghost cursor-pointer">
            Ke Beranda
          </Link>
        </div>
      </div>
    </main>
  );
}
