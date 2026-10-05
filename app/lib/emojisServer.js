// ==========================================
// app/lib/emojisServer.js  (SERVER ONLY)
// Katalog emoji dinamis: BACA dari database (di-push bot) + fallback file JSON.
// ==========================================
// MASALAH: web dulu hanya punya app/lib/web-emojis.json (statis, 127 emoji).
// Kalau bot/server menambah atau mengganti emoji, web tetap memakai yang lama
// sampai file itu diperbarui manual + deploy ulang.
//
// SOLUSI: bot mengirim daftar emoji resminya ke tabel web.emoji_catalog
// (endpoint POST /api/bot/emojis). Web membaca dari tabel itu - kalau tabel
// kosong/belum pernah diisi, otomatis fallback ke file JSON supaya tampilan
// tidak pernah kosong.
//
// BENTUK BARIS: { name, aliases[], id, animated, url, usage }
//   - `name`   : nama emoji (untuk resolve di web, mis. "goldcoin")
//   - `aliases`: nama lain yang menunjuk emoji sama
//   - `url`    : URL CDN Discord (png/gif)
//   - `usage`  : deskripsi singkat (dokumentasi, tidak dipakai rendering)
import { getDb, schemaReady, PROXY_AKTIF } from './db';
import emojiData from './web-emojis.json';

// Katalog statis = fallback / bawaan. Disalin ke memori sekali saat module load.
const STATIC_EMOJIS = Array.isArray(emojiData?.emojis) ? emojiData.emojis : [];

// TANPA CACHE (permintaan pemilik): katalog emoji dibaca dari DB setiap
// pemanggilan supaya begitu bot push emoji baru, web langsung ikut berubah.

// Buat tabel kalau belum ada. SEKALI per proses saja (di-memoize) supaya
// tidak mengirim CREATE TABLE tiap request - tiap round-trip ke pooler
// Supabase ~180 ms, dan itu berulang di setiap baca/tulis.
let _tableReady = null;
function ensureTable(db) {
  // PROXY MODE (2026-10-05): tabel web.emoji_catalog SUDAH ADA di DB VPS;
  // CREATE TABLE lewat proxy = 403. Skip saat proxy.
  if (PROXY_AKTIF) { _tableReady = Promise.resolve(); return _tableReady; }
  if (!_tableReady) {
    _tableReady = db.execute(`
      CREATE TABLE IF NOT EXISTS web.emoji_catalog (
        id          TEXT PRIMARY KEY,        -- emoji id Discord (unik)
        name        TEXT NOT NULL,
        aliases     TEXT DEFAULT '',         -- dipisah koma
        animated    INTEGER DEFAULT 0,
        url         TEXT NOT NULL,
        usage       TEXT,
        updated_at  INTEGER NOT NULL
      )
    `).catch((e) => { _tableReady = null; throw e; });
  }
  return _tableReady;
}

function normalizeRow(r) {
  return {
    name: r.name,
    aliases: r.aliases ? String(r.aliases).split(',').filter(Boolean) : [],
    id: String(r.id),
    animated: Number(r.animated) === 1,
    url: r.url,
    usage: r.usage || '',
  };
}

function dedupe(list) {
  // ID unik; nama pertama menang (konsisten dengan format web-emojis.json).
  const byId = new Map();
  for (const e of list) {
    if (!e || !e.id || !e.url) continue;
    if (!byId.has(String(e.id))) byId.set(String(e.id), e);
  }
  return [...byId.values()];
}

// Daftar emoji: DB dulu, lalu fallback JSON kalau DB kosong / error.
// Selalu mengembalikan array (tidak pernah null) supaya pemanggil aman.
export async function getEmojiCatalog() {
  let list = null;
  try {
    await schemaReady();
    const db = getDb();
    const res = await db.execute('SELECT id, name, aliases, animated, url, usage FROM web.emoji_catalog ORDER BY name ASC');
    if (res.rows.length) list = dedupe(res.rows.map(normalizeRow));
  } catch { /* DB error -> fallback di bawah */ }

  if (!list || !list.length) list = dedupe(STATIC_EMOJIS);
  return list;
}

// Simpan katalog dari bot (replace-all, karena ini katalog resmi bot).
// Body: { emojis: [{ name, aliases?, id, url, animated?, usage? }] }
export async function replaceEmojiCatalog(emojis) {
  if (!Array.isArray(emojis) || !emojis.length) {
    throw new Error('Daftar emoji kosong.');
  }
  await schemaReady();
  const db = getDb();
  await ensureTable(db);

  const now = Date.now();
  const bersih = [];
  for (const e of emojis) {
    const id = e?.id ? String(e.id).trim() : '';
    const url = e?.url ? String(e.url).trim() : '';
    const name = e?.name ? String(e.name).trim() : '';
    if (!id || !url || !name) continue; // lewati entri tak valid
    const aliases = Array.isArray(e.aliases) ? e.aliases.filter(Boolean).join(',') : (e.aliases ? String(e.aliases) : '');
    bersih.push({ id, name, aliases, animated: e.animated ? 1 : 0, url, usage: e.usage || '' });
  }
  if (!bersih.length) throw new Error('Tidak ada emoji valid di payload.');

  // Ganti seluruh isi tabel. PENTING: pakai INSERT MULTI-VALUES per batch,
  // BUKAN satu query per emoji. Versi lama melakukan 127 query berurutan
  // (~250 ms masing-masing lewat pooler Supabase) = >30 detik, sehingga bot
  // timeout di 10 detik dan push SELALU gagal. Satu query batch selesai <1 dtk.
  await db.execute('DELETE FROM web.emoji_catalog');

  const BATCH = 200; // 200 baris x 7 kolom = 1400 parameter (aman di bawah batas PG)
  for (let i = 0; i < bersih.length; i += BATCH) {
    const keping = bersih.slice(i, i + BATCH);
    const valuesSql = keping.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
    const args = [];
    for (const e of keping) args.push(e.id, e.name, e.aliases, e.animated, e.url, e.usage, now);
    await db.execute({
      sql: `INSERT INTO web.emoji_catalog (id, name, aliases, animated, url, usage, updated_at)
            VALUES ${valuesSql}
            ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, aliases=EXCLUDED.aliases,
              animated=EXCLUDED.animated, url=EXCLUDED.url, usage=EXCLUDED.usage, updated_at=EXCLUDED.updated_at`,
      args,
    });
  }

  return { count: bersih.length };
}

// Info untuk panel/diagnostik: kapan terakhir di-push, berapa jumlahnya.
export async function getEmojiMeta() {
  try {
    await schemaReady();
    const db = getDb();
    await ensureTable(db);
    const res = await db.execute('SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM web.emoji_catalog');
    const n = Number(res.rows[0]?.n || 0);
    return { count: n, updatedAt: n ? Number(res.rows[0]?.at || 0) : null, source: n ? 'database' : 'file-json' };
  } catch {
    return { count: STATIC_EMOJIS.length, updatedAt: null, source: 'file-json' };
  }
}
