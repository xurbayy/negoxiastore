// ==========================================
// app/components/GuildEmoji.jsx
// Render emoji guild (token Discord <:nama:id> / <a:nama:id>) sebagai <img>.
// ==========================================
// Bot menyimpan emoji guild di kolom TERPISAH (guilds.emoji), jadi token-nya
// tidak pernah nyasar ke dalam teks nama. Komponen ini konversi token ke URL
// CDN Discord LANGSUNG dari ID (tanpa tergantung registry/katalog) - persis
// pola _emojiUrl di bot. Kalau bukan token Discord (emoji unicode atau kosong),
// fallback ke emojiSrc() berbasis nama; kalau dua-duanya gagal, tidak render
// apa pun supaya layout tetap rapi.

import { emojiSrc } from '../lib/emojis';

function cdnUrl(token) {
  const m = /<(a)?:([A-Za-z0-9_]+):(\d{15,25})>/.exec(String(token || ''));
  if (!m) return null;
  return {
    name: m[2],
    url: `https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? 'gif' : 'png'}?size=64&quality=lossless`,
  };
}

/**
 * Ikon emoji guild. Ukuran default 18px (seukuran teks tabel).
 * @param {object} props
 * @param {string|null} props.token  Token emoji Discord dari DB bot (guilds.emoji / profile.guild.emoji)
 * @param {string|null} props.fallbackToken  Sumber cadangan (mis. nama guild ikut mengandung token)
 */
export default function GuildEmoji({ token, fallbackToken, size = 18, className = '' }) {
  const u = cdnUrl(token) || cdnUrl(fallbackToken);
  // Token tidak ada / unicode: pakai ikon castle (identik dengan judul tabel
  // guild di leaderboard) supaya baris tanpa emoji tetap punya ikon rapi.
  const src = u ? u.url : emojiSrc('castle', 64);
  if (!src) return null;
  const alt = u?.name || 'guild';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      title={`:${alt}:`}
      width={size}
      height={size}
      className={`inline-block shrink-0 align-middle ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
