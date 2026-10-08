'use client';

import { emojiSrc, emojiSrcStatis } from '../lib/emojisClient';

// ==========================================
// MedalIcon - emoji medali GIF untuk peringkat #2/#3
// ==========================================
// SATU titik logika untuk semua tabel berperingkat (Top Pemain, Top Guild,
// Komunitas). Sebelumnya tiap file menulis <img> sendiri sehingga fallback
// dan atribut bisa berbeda diam-diam.
//
// - Sumber: katalog emoji web (nama "medal"), id 1516381655089283203
//   (nama asli Discord: "1st"). GIF, jadi animasinya hidup di HTML.
// - FALLBACK PNG: kalau request GIF gagal (jaringan/CDN), turun ke versi
//   PNG statis sekali saja (dataset.fb mencegah loop kalau PNG ikut gagal).
// - decoding="async" + draggable={false}: mengurangi kerja render di HP
//   (tidak memblokir paint, tidak ikut ter-drag saat scroll).
export default function MedalIcon({ size = 16, className = '' }) {
  const src = emojiSrc('medal');
  if (!src) return null;
  const gantiKeStatis = (e) => {
    const el = e.currentTarget;
    if (el.dataset.fb === '1') return; // sudah pernah fallback -> jangan ulang
    el.dataset.fb = '1';
    el.src = emojiSrcStatis('medal', 64) || el.src;
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      onError={gantiKeStatis}
      alt=""
      width={size}
      height={size}
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}
