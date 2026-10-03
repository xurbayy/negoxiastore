// Versi client-safe dari emoji helper.
// - Bawaan: file JSON statis (langsung tersedia, sinkron).
// - Dinamis: katalog dari database (di-push bot) di-hydrate lewat
//   hydrateEmojiCatalog() lalu menimpa/menambah entri statis.
// PENTING: resolver ini DIPAKAI SINKRON di banyak komponen, jadi struktur
// objeknya tetap sinkron; data DB hanya memperkaya peta di belakang layar.
import emojiData from './web-emojis.json';

const byName = {};
const byAlias = {};
const byId = {}; // id Discord -> entri (untuk hydrate & lookup)
function daftar(e) {
  if (!e || !e.id || !e.url) return;
  const id = String(e.id);
  byId[id] = e;
  if (!byName[e.name]) byName[e.name] = e;
  for (const a of e.aliases || []) {
    if (!byAlias[a]) byAlias[a] = e;
  }
}
for (const e of emojiData.emojis) daftar(e);

// Hydrate dari katalog DB (bentuk ringkas: { n,a,i,u,an }).
// Entri BARU dari DB ditambahkan; entri dengan id sama DIPERBARUI (nama/url)
// supaya kalau bot ganti emoji, web ikut berubah tanpa deploy ulang.
export function hydrateEmojiCatalog(ringkas) {
  if (!Array.isArray(ringkas)) return;
  for (const r of ringkas) {
    const e = { name: r.n, aliases: r.a || [], id: String(r.i), url: r.u, animated: Number(r.an) === 1 };
    if (!e.id || !e.url || !e.name) continue;
    const lama = byId[e.id];
    if (lama) {
      // Perbarui entri yang sudah ada (nama & url bisa berubah di sisi bot).
      lama.url = e.url;
      lama.animated = e.animated;
      lama.aliases = e.aliases;
      if (lama.name !== e.name) {
        // Nama berubah: daftarkan nama baru, biarkan alias lama tetap resolve.
        byName[e.name] = lama;
      }
    } else {
      daftar(e);
    }
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

/**
 * URL emoji sebagai GAMBAR STATIS (PNG) - khusus untuk digambar ke <canvas>.
 *
 * KENAPA: emoji animasi ber-ekstensi .gif. Canvas TIDAK bisa menggambar GIF
 * (yang tergambar cuma frame pertama atau gagal total), sehingga ikon di kartu
 * bagikan bisa kosong di sebagian browser. Discord CDN menyediakan versi .png
 * (frame pertama, statis) dengan mengganti ekstensinya - sudah diverifikasi
 * HTTP 200. Emoji statis tidak berubah.
 *
 * Pakai ini untuk KARTU GAMBAR (canvas); untuk tampilan HTML biasa pakai
 * emojiSrc() supaya animasinya tetap jalan.
 */
export function emojiSrcStatis(name, size = 64) {
  const e = getEmoji(name);
  if (!e) return null;
  const base = e.url.split('?')[0].replace(/\.gif$/i, '.png');
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
