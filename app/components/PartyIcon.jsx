'use client';

import { emojiSrcById, emojiSrcStatisById } from '../lib/emojisClient';

// ==========================================
// PartyIcon - emoji GIF party untuk peringkat #1
// ==========================================
// Sama seperti MedalIcon: SELALU panggil lewat ID, bukan nama (nama katalog
// dinamis bisa bentrok / berubah - lihat catatan di MedalIcon).
//
// ID DIGANTI 2026-10-08: 1516446871785046149 -> 1557655292739854396
// (permintaan pemilik, emoji GIF baru untuk juara #1 leaderboard).
export const PARTY_ID = '1557655292739854396';

// UKURAN SUMBER DIPAKU 64 (bukan prop `size`): CDN Discord menolak sebagian
// varian ukuran kecil untuk GIF tertentu - emoji 1557655292739854396 gagal
// dimuat pada `size=18` (HTTP error, naturalWidth=0) sehingga ikon #1 tidak
// tampil. Ambil ukuran 64 yang selalu ada di CDN, lalu biarkan CSS (h-4 w-4 /
// h-[18px]) yang mengecilkannya. Prop `size` tetap dipakai untuk atribut
// width/height + ukuran fallback PNG.
const SUMBER = 64;

export default function PartyIcon({ size = 18, className = '' }) {
  const src = emojiSrcById(PARTY_ID, SUMBER);
  const gantiKeStatis = (e) => {
    const el = e.currentTarget;
    if (el.dataset.fb === '1') return;
    el.dataset.fb = '1';
    el.src = emojiSrcStatisById(PARTY_ID, SUMBER) || el.src;
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
