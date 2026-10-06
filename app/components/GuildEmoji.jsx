// ==========================================
// app/components/GuildEmoji.jsx
// Render emoji guild: token Discord <:nama:id> / <a:nama:id> ATAU emoji unicode.
// ==========================================
// Bot menyimpan emoji guild di kolom TERPISAH (guilds.emoji), jadi token-nya
// tidak pernah nyasar ke dalam teks nama. Isi kolom bisa DUA bentuk:
//   1. Token Discord custom: '<:negoxiaremovebgpreview:1516450592204128287>'
//      atau animasi '<a:swords:...>' -> dirender <img> dari CDN Discord
//      (langsung dari ID, tanpa tergantung registry/katalog).
//   2. Emoji UNICODE: '👑', '⚔️', dst (form modal bot menerima emoji apa pun).
//
// BUGFIX 2026-10-06 (laporan pemilik: "emoji guild ga sesuai yang di web"):
//   Dulu komponen ini HANYA mengenali token Discord. Guild yang emoji-nya
//   unicode (mis. Titut pakai 👑) jatuh ke fallback castle -> di web tampil
//   kastil, padahal di Discord tampil mahkota = "ga sesuai". Sekarang unicode
//   dirender sebagai teks apa adanya; castle HANYA untuk kasus kosong/gagal.
//
// Kalau token bukan format Discord dan bukan unicode (mis. teks sampah),
// tidak render apa pun supaya layout tetap rapi.

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
 * @param {string|null} props.token  Token emoji Discord ATAU emoji unicode dari DB bot (guilds.emoji / profile.guild.emoji)
 * @param {string|null} props.fallbackToken  Sumber cadangan (mis. nama guild ikut mengandung token)
 */
export default function GuildEmoji({ token, fallbackToken, size = 18, className = '' }) {
  const u = cdnUrl(token) || cdnUrl(fallbackToken);
  if (u) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={u.url}
        alt={u.name}
        title={`:${u.name}:`}
        width={size}
        height={size}
        className={`inline-block shrink-0 align-middle ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Unicode: pakai nilai token apa adanya (kalau kosong, pakai fallbackToken).
  const teks = String(token || fallbackToken || '').trim();
  if (teks) {
    return (
      <span
        role="img"
        aria-label={teks}
        title={teks}
        className={`inline-block shrink-0 text-center align-middle leading-none ${className}`}
        style={{ fontSize: Math.round(size * 0.9), width: size }}
      >
        {teks}
      </span>
    );
  }

  // Kosong / gagal: pakai ikon castle (identik dengan judul tabel guild)
  // supaya baris tanpa emoji tetap punya ikon rapi.
  const src = emojiSrc('castle', 64);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="guild"
      title=":guild:"
      width={size}
      height={size}
      className={`inline-block shrink-0 align-middle ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
