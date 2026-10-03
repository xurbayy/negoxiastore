// ==========================================
// app/lib/shopAdmin.js
// Kelola katalog shop LANGSUNG di database Supabase (tabel bot public.*).
// ==========================================
// Web sudah memakai SATU database dengan bot (tanpa bridge). Panel admin dulu
// mengirim aksi ke antrean bot (bot_commands) dan membaca katalog dari
// "snapshot push" yang bisa basi/kosong -> admin melihat data lama dan aksi
// gagal ("shopItems is not defined" di sisi bot). Modul ini menggantinya:
// baca & tulis langsung ke public.shop_items / public.shop_discounts.
//
// PENTING - tiru logika bot (utils/database.js) PERSIS supaya konsisten:
//   adminSetDiscount  : simpan original_price (harga asli) + timpa price=diskon
//   adminSetItemPrice : hapus diskon (kalau ada) + set price
//   adminRemoveDiscount: restore price=<seed bot> lalu hapus diskon
// Bot tetap membaca tabel yang sama, jadi perubahan langsung terlihat di
// halaman /shop publik DAN di Discord (nxshop) tanpa sinkronisasi apa pun.
import { getDb, schemaReady } from './db';

// Batas yang sama dengan webBridge (CAP_PRICE bot).
const CAP_PRICE = 100_000_000;
const MAX_DISCOUNT_HOURS = 720; // 30 hari, sama dengan validasi bot

// Kolom seed bot untuk RESTORE harga saat diskon dihapus. Karena web tidak
// memuat katalog seed bot yang besar, kita simpan harga asli di baris diskon
// (kolom original_price) - ini yang dipakai bot saat restore, jadi pasti benar.
// Untuk item yang belum pernah didiskon, harga it.price saat ini = harga asli.

// ---------------------------------------------------------------------------
// BACA
// ---------------------------------------------------------------------------

// Ambil SELURUH item + diskon aktif dalam SATU panggilan (untuk panel admin).
// `emojiUrl` diisi dari registry web-emojis.json supaya ikon tampil; kalau
// tidak ketemu, UI jatuh ke inisial nama.
export async function listShopAdmin() {
  await schemaReady();
  const db = getDb();
  const now = Date.now();
  const [items, discs, emap] = await Promise.all([
    // Kolom yang ada di public.shop_items: id, item_key, name, description,
    // price, emoji, game_type, effect_type, effect_value, is_active, stock,
    // restock_rate. (Tidak ada `category` - kategori dihitung oleh bot/web
    // dari game_type+effect_type, jadi tidak dipakai di sini.)
    db.execute(
      'SELECT item_key, name, description, price, stock, game_type, effect_type, emoji, is_active FROM public.shop_items ORDER BY price ASC'
    ),
    db.execute(
      'SELECT item_key, original_price, discount_price, expires_at FROM public.shop_discounts WHERE expires_at > ? ORDER BY expires_at ASC',
      [now]
    ).catch(() => ({ rows: [] })),
    emojiUrlMap(),
  ]);

  const discMap = {};
  for (const d of discs.rows) {
    discMap[d.item_key] = {
      originalPrice: d.original_price === null || d.original_price === undefined ? null : Number(d.original_price),
      discountPrice: Number(d.discount_price),
      expiresAt: Number(d.expires_at),
    };
  }

  return items.rows.map((it) => {
    const d = discMap[it.item_key] || null;
    return {
      itemKey: it.item_key,
      name: it.name,
      description: it.description,
      price: Number(it.price || 0),
      stock: Number(it.stock ?? -1),
      gameType: it.game_type,
      emoji: it.emoji,
      emojiUrl: emojiUrl(it.emoji, emap),
      isActive: Number(it.is_active ?? 1) !== 0,
      diskon: d,
    };
  });
}

// ---------------------------------------------------------------------------
// TULIS
// ---------------------------------------------------------------------------

// Restock 1 item. amount null/kosong = kembali ke stok default BOT.
// Karena web tidak memuat katalog seed bot, "default" di sini = stok saat ini
// TIDAK berubah kalau amount kosong -> kita tolak dengan pesan jelas supaya
// admin mengisi angka (lebih aman daripada menebak stok default).
export async function restockItem(itemKey, amount) {
  await schemaReady();
  const db = getDb();
  const key = normalizeKey(itemKey);
  if (!key) throw new HttpError(400, 'itemKey wajib.');
  const amt = toInt(amount);
  if (amt === null || amt < 0) throw new HttpError(400, 'Jumlah restock harus angka >= 0.');

  const res = await db.execute({
    sql: 'UPDATE public.shop_items SET stock = ? WHERE item_key = ?',
    args: [amt, key],
  });
  if (!res.rowsAffected) throw new HttpError(404, `Item ${key} tidak ditemukan.`);
  await logRestock(db, key);
  return { itemKey: key, stock: amt };
}

// Restock SEMUA item ke stok default bot. Web tidak punya katalog seed, jadi
// ini hanya bisa didelegasikan ke bot. Kita kembalikan error ramah supaya
// panel tidak menampilkan "berhasil" palsu.
export async function restockAll() {
  throw new HttpError(
    501,
    'Restock semua butuh stok default dari bot dan belum bisa dari web. Restock per item saja.'
  );
}

// Set harga normal. Meniru adminSetItemPrice bot: HAPUS diskon lebih dulu
// (karena diskon meng-override price), lalu set price.
export async function setItemPrice(itemKey, price) {
  await schemaReady();
  const db = getDb();
  const key = normalizeKey(itemKey);
  if (!key) throw new HttpError(400, 'itemKey wajib.');
  const p = toInt(price);
  if (p === null || p < 0 || p > CAP_PRICE) {
    throw new HttpError(400, `Harga harus 0 - ${CAP_PRICE.toLocaleString('id-ID')}.`);
  }

  const adaDiskon = await db.execute({
    sql: 'SELECT 1 FROM public.shop_discounts WHERE item_key = ?',
    args: [key],
  }).then((r) => r.rows.length > 0).catch(() => false);

  await db.execute({ sql: 'DELETE FROM public.shop_discounts WHERE item_key = ?', args: [key] });
  const res = await db.execute({
    sql: 'UPDATE public.shop_items SET price = ? WHERE item_key = ?',
    args: [p, key],
  });
  if (!res.rowsAffected) throw new HttpError(404, `Item ${key} tidak ditemukan.`);
  return { itemKey: key, price: p, diskonDihapus: adaDiskon };
}

// Terapkan flash sale. Meniru adminSetDiscount bot:
//   original_price = harga asli (kalau sudah ada diskon, PAKAI original_price
//   yang lama supaya perpanjangan tidak menurunkan harga asli bertingkat)
//   price          = harga diskon (ditimpa ke shop_items.price)
export async function setDiscount(itemKey, discountPrice, durationHours) {
  await schemaReady();
  const db = getDb();
  const key = normalizeKey(itemKey);
  if (!key) throw new HttpError(400, 'itemKey wajib.');
  const dp = toInt(discountPrice);
  const hours = toInt(durationHours);
  if (dp === null || dp < 1) throw new HttpError(400, 'Harga diskon minimal 1.');
  if (hours === null || hours < 1 || hours > MAX_DISCOUNT_HOURS) {
    throw new HttpError(400, `Durasi diskon harus 1 - ${MAX_DISCOUNT_HOURS} jam.`);
  }

  const item = await db.execute({
    sql: 'SELECT price FROM public.shop_items WHERE item_key = ?',
    args: [key],
  });
  if (!item.rows.length) throw new HttpError(404, `Item ${key} tidak ditemukan.`);

  // Harga asli: kalau sudah ada diskon, pertahankan original_price lama.
  const existing = await db.execute({
    sql: 'SELECT original_price FROM public.shop_discounts WHERE item_key = ?',
    args: [key],
  });
  const hargaAsliSekarang = Number(item.rows[0].price || 0);
  const originalPrice = existing.rows.length
    ? Number(existing.rows[0].original_price)
    : hargaAsliSekarang;

  if (dp >= originalPrice) {
    throw new HttpError(400, `Harga diskon (${dp.toLocaleString('id-ID')}) harus di bawah harga asli (${originalPrice.toLocaleString('id-ID')}).`);
  }

  const expiresAt = Date.now() + hours * 60 * 60 * 1000;
  await db.execute({
    sql: `INSERT INTO public.shop_discounts (item_key, original_price, discount_price, expires_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(item_key) DO UPDATE SET
            discount_price = excluded.discount_price,
            expires_at = excluded.expires_at`,
    args: [key, originalPrice, dp, expiresAt],
  });
  await db.execute({
    sql: 'UPDATE public.shop_items SET price = ? WHERE item_key = ?',
    args: [dp, key],
  });

  return { itemKey: key, originalPrice, discountPrice: dp, expiresAt };
}

// Hapus diskon + restore harga asli. Meniru adminRemoveDiscount bot.
export async function removeDiscount(itemKey) {
  await schemaReady();
  const db = getDb();
  const key = normalizeKey(itemKey);
  if (!key) throw new HttpError(400, 'itemKey wajib.');

  const existing = await db.execute({
    sql: 'SELECT original_price FROM public.shop_discounts WHERE item_key = ?',
    args: [key],
  });
  if (!existing.rows.length) throw new HttpError(404, 'Item ini tidak sedang diskon.');

  const restore = Number(existing.rows[0].original_price);
  await db.execute({
    sql: 'UPDATE public.shop_items SET price = ? WHERE item_key = ?',
    args: [restore, key],
  });
  await db.execute({ sql: 'DELETE FROM public.shop_discounts WHERE item_key = ?', args: [key] });
  return { itemKey: key, price: restore };
}

// ---------------------------------------------------------------------------
// HELPER
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export { HttpError };

function normalizeKey(v) {
  return typeof v === 'string' ? v.toLowerCase().trim() : '';
}
function toInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function logRestock(db, itemKey) {
  try {
    await db.execute({
      sql: 'INSERT INTO public.shop_restock_log (item_key, restocked_at) VALUES (?, ?)',
      args: [itemKey, Math.floor(Date.now() / 1000)],
    });
  } catch { /* tabel log mungkin belum ada -> restock tetap sukses */ }
}

// Emoji registry: DB dulu (emoji dinamis) lalu web-emojis.json statis.
async function emojiUrlMap() {
  try {
    const db = getDb();
    const res = await db.execute('SELECT emoji_id, emoji_url FROM emoji_registry').catch(() => ({ rows: [] }));
    const m = {};
    for (const r of res.rows) m[String(r.emoji_id)] = r.emoji_url;
    return m;
  } catch { return {}; }
}

import emojiData from './web-emojis.json';
const staticEmojiById = {};
for (const e of emojiData.emojis) {
  const id = String(e.id || (e.url || '').match(/emojis\/(\d+)/)?.[1] || '');
  if (id && !staticEmojiById[id]) staticEmojiById[id] = e.url;
}

function emojiUrl(emoji, map) {
  const m = String(emoji || '').match(/<a?:[A-Za-z0-9_]+:(\d+)>/);
  if (!m) return null;
  return map[m[1]] || staticEmojiById[m[1]] || null;
}
