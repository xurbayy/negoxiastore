'use client';
import { parseRich, emojiSrc } from '../../lib/emojisClient';

// Render teks yang mengandung emoji custom Discord -> <img>.
export default function RichText({ text, size = 18, className = '' }) {
  const parts = parseRich(String(text || ''));
  if (!parts.length) return null;
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.t === 'emoji') {
          // Discord CDN requires 'size' to be a power of 2 (16, 32, 64, 128...)
          // If size is not a power of 2, request a larger power of 2 to avoid 400 Bad Request
          const cdnSize = [16, 32, 64, 128].find(s => s >= size) || 64;
          const src = emojiSrc(p.name, cdnSize) || `https://cdn.discordapp.com/emojis/${p.id}.${p.animated ? 'gif' : 'png'}?size=${cdnSize}&quality=lossless`;
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={i} src={src} alt={p.name} title={`:${p.name}:`} width={size} height={size} className="mx-0.5 inline-block align-[-3px]" />;
        }
        return <span key={i}>{p.v}</span>;
      })}
    </span>
  );
}
