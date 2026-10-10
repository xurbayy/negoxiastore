import emojiData from './web-emojis.json';

// Index nama -> entry emoji (entry pertama menang), termasuk alias.
// JSON baru: emoji di-dedupe by ID, nama lama dipertahankan sebagai `aliases`.
const byName = {};
const byAlias = {};
for (const e of emojiData.emojis) {
  if (!byName[e.name]) byName[e.name] = e;
  for (const a of e.aliases || []) {
    if (!byAlias[a]) byAlias[a] = e;
  }
}

export function getEmoji(name) {
  return byName[name] || byAlias[name] || null;
}

// URL CDN Discord siap pakai untuk <img src>. Fallback null kalau nama tidak ada.
//
// DEFAULT SIZE 48 (samakan dengan emojisClient.js, 2026-10-10): ikon UI tampil
// 16-40px, jadi 48 sudah tajam di retina 2x. Dulu 64 -> homepage memuat ~39
// emoji GIF @56KB = 466KB. Khusus canvas/kartu gambar pemanggil tetap minta
// size eksplisit besar.
export function emojiSrc(name, size = 48) {
  const e = getEmoji(name);
  if (!e) return null;
  const base = e.url.split('?')[0];
  return `${base}?size=${size}&quality=lossless`;
}
