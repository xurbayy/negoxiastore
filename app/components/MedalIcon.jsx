'use client';

import { emojiSrcById, emojiSrcStatisById } from '../lib/emojisClient';

// ==========================================
// MedalIcon - emoji medali GIF untuk peringkat #2/#3
// ==========================================
// SATU titik logika untuk semua tabel berperingkat (Top Pemain, Top Guild,
// Komunitas).
//
// PENTING - PAKAI ID, BUKAN NAMA: katalog emoji dinamis memakai nama asli
// Discord. Emoji medali podium id 1516381655089283203 bernama asli "1st",
// sedangkan nama "medal" dipegang emoji trophy lama (1516381982961959072).
// Kalau resolver memakai nama "medal", ikon berubah jadi emoji lama (insiden
// 2026-10-08). Karena itu di sini SELALU panggil lewat ID.
//
// - Fallback PNG: kalau request GIF gagal (jaringan/CDN), turun ke versi PNG
//   statis sekali saja (dataset.fb mencegah loop kalau PNG ikut gagal).
// - decoding="async" + draggable={false}: mengurangi kerja render di HP.
export const MEDAL_ID = '1516381655089283203';

export default function MedalIcon({ size = 16, className = '' }) {
  const src = emojiSrcById(MEDAL_ID, size);
  const gantiKeStatis = (e) => {
    const el = e.currentTarget;
    if (el.dataset.fb === '1') return; // sudah pernah fallback -> jangan ulang
    el.dataset.fb = '1';
    el.src = emojiSrcStatisById(MEDAL_ID, size) || el.src;
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
