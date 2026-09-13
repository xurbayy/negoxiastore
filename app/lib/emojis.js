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
export function emojiSrc(name, size = 64) {
  const e = getEmoji(name);
  if (!e) return null;
  const base = e.url.split('?')[0];
  return `${base}?size=${size}&quality=lossless`;
}
