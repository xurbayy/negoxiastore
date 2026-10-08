'use client';

import { emojiSrcById, emojiSrcStatisById } from '../lib/emojisClient';

// ==========================================
// PartyIcon - emoji GIF party untuk peringkat #1
// ==========================================
// Sama seperti MedalIcon: SELALU panggil lewat ID, bukan nama.
// Katalog emoji dinamis menamai id 1516446871785046149 sebagai
// "30348trophyfixed" (nama asli Discord), sehingga men cari lewat nama
// "party" tidak bisa diandalkan. Lihat catatan di MedalIcon.
export const PARTY_ID = '1516446871785046149';

export default function PartyIcon({ size = 18, className = '' }) {
  const src = emojiSrcById(PARTY_ID, size);
  const gantiKeStatis = (e) => {
    const el = e.currentTarget;
    if (el.dataset.fb === '1') return;
    el.dataset.fb = '1';
    el.src = emojiSrcStatisById(PARTY_ID, size) || el.src;
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
