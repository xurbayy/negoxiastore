'use client';

import { emojiSrc } from '../lib/emojisClient';

// ==========================================
// EmojiReg - render emoji CUSTOM dari registry bot sebagai <img>
// ==========================================
// Dipakai halaman panduan & tentang supaya ikonnya konsisten dengan yang
// tampil di Discord (bukan unicode). `nama` = nama/alias dari web-emojis.json.
// Kalau nama tidak ketemu, fallback ke `fallback` (unicode) atau tidak render.
export default function EmojiReg({ nama, fallback = '', size = 24, className = '' }) {
  const src = nama ? emojiSrc(nama, 64) : null;
  if (!src) {
    if (!fallback) return null;
    return <span className={className} aria-hidden="true">{fallback}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      decoding="async"
      draggable={false}
      className={className || `inline-block h-[${size}px] w-[${size}px]`}
      style={className ? undefined : { width: size, height: size }}
    />
  );
}
