// Versi client-safe dari emoji helper (import JSON langsung, tanpa server-only).
import emojiData from './web-emojis.json';

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

export function emojiSrc(name, size = 64) {
  const e = getEmoji(name);
  if (!e) return null;
  const base = e.url.split('?')[0];
  return `${base}?size=${size}&quality=lossless`;
}

// Render string Discord-emoji ("<:name:id>" / "<a:name:id>") + teks biasa
// jadi campuran <img>+span. Untuk admin title, broadcast, dsb di panel.
export function parseRich(s) {
  if (!s) return [];
  const out = [];
  const re = /<(a?):([A-Za-z0-9_]+):(\d{15,25})>/g;
  let last = 0, m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    out.push({ t: 'emoji', name: m[2], id: m[3], animated: m[1] === 'a' });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}
