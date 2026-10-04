// ==========================================
// app/lib/aksiAdminLangsung.js
// Eksekusi aksi admin LANGSUNG ke database (tanpa lewat antrean bot).
// ==========================================
// KENAPA ADA (permintaan pemilik 2026-10-04):
//   Usulan agen AI dikirim ke bot lewat bot_commands, tapi eksekusi di sisi bot
//   gagal dengan "shopItems is not defined" (bot versi lama / bug di sana).
//   Karena SEMUA web sudah langsung ke database, aksi yang bisa dilakukan dari
//   web sebaiknya TIDAK bergantung pada bot sama sekali.
//
// Cakupan: aksi yang aman & datanya ada di tabel bot (public.*). Aksi yang
// butuh Discord (mis. DM admin, timeout Discord) tetap lewat bot.
import { getDb, schemaReady } from './db';
import { restockItem, setItemPrice, setDiscount, removeDiscount, HttpError } from './shopAdmin';

// Aksi yang BISA dieksekusi langsung dari web.
export const AKSI_LANGSUNG = new Set([
  'add_points', 'remove_points', 'set_points',
  'restock_item', 'set_price', 'set_discount', 'remove_discount',
  'add_item', 'remove_item',
  'grant_premium', 'revoke_premium',
  'add_title', 'set_admin_title', 'clear_admin_title',
  'set_announcement', 'create_promo', 'delete_promo',
  'clear_loan', 'set_chemistry',
  'ban', 'unban', 'timeout',
]);

// Jalankan satu aksi. Melempar HttpError bila gagal.
export async function jalankanAksiLangsung(aksi, payload, actorId) {
  await schemaReady();
  const db = getDb();
  const p = payload || {};

  switch (aksi) {
    // ---------- POIN ----------
    case 'add_points': {
      const userId = req(p.userId, 'userId');
      const amount = int(p.amount, 'amount');
      if (amount === null) throw new HttpError(400, 'amount wajib angka.');
      await ensureUser(db, userId);
      await db.execute({ sql: 'UPDATE public.users SET points = points + ? WHERE user_id = ?', args: [amount, userId] });
      await tx(db, userId, 'admin', amount, `Admin add by ${actorId}`);
      return `+${amount} pts ke ${userId}`;
    }
    case 'remove_points': {
      const userId = req(p.userId, 'userId');
      const amount = int(p.amount, 'amount');
      if (amount === null || amount <= 0) throw new HttpError(400, 'amount wajib angka > 0.');
      await ensureUser(db, userId);
      const r = await db.execute({ sql: 'UPDATE public.users SET points = points - ? WHERE user_id = ? AND points >= ?', args: [amount, userId, amount] });
      if (!r.rowsAffected) throw new HttpError(400, `Saldo ${userId} tidak cukup.`);
      await tx(db, userId, 'admin', -amount, `Admin remove by ${actorId}`);
      return `-${amount} pts dari ${userId}`;
    }
    case 'set_points': {
      const userId = req(p.userId, 'userId');
      const amount = int(p.amount, 'amount');
      if (amount === null || amount < 0) throw new HttpError(400, 'amount wajib angka >= 0.');
      await ensureUser(db, userId);
      await db.execute({ sql: 'UPDATE public.users SET points = ? WHERE user_id = ?', args: [amount, userId] });
      await tx(db, userId, 'admin_set', amount, `Admin set by ${actorId}`);
      return `Saldo ${userId} -> ${amount}`;
    }

    // ---------- TOKO ----------
    case 'restock_item': {
      const r = await restockItem(p.itemKey, p.amount);
      return `Stok ${r.itemKey} -> ${r.stock}`;
    }
    case 'set_price': {
      const r = await setItemPrice(p.itemKey, p.price);
      return `Harga ${r.itemKey} -> ${r.price}`;
    }
    case 'set_discount': {
      const r = await setDiscount(p.itemKey, p.discountPrice, p.durationHours);
      return `Diskon ${r.itemKey}: ${r.originalPrice} -> ${r.discountPrice}`;
    }
    case 'remove_discount': {
      const r = await removeDiscount(p.itemKey);
      return `Diskon ${r.itemKey} dihapus (harga ${r.price})`;
    }

    // ---------- ITEM ----------
    case 'add_item': {
      const userId = req(p.userId, 'userId');
      const itemKey = req(p.itemKey, 'itemKey');
      const qty = int(p.qty ?? p.amount ?? 1) ?? 1;
      await db.execute({
        sql: `INSERT INTO public.inventory (user_id, item_key, quantity) VALUES (?, ?, ?)
              ON CONFLICT (user_id, item_key) DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity`,
        args: [userId, itemKey, qty],
      });
      return `+${qty}x ${itemKey} ke ${userId}`;
    }
    case 'remove_item': {
      const userId = req(p.userId, 'userId');
      const itemKey = req(p.itemKey, 'itemKey');
      const qty = int(p.qty ?? p.amount ?? 1) ?? 1;
      const r = await db.execute({
        sql: 'UPDATE public.inventory SET quantity = GREATEST(0, quantity - ?) WHERE user_id = ? AND item_key = ?',
        args: [qty, userId, itemKey],
      });
      if (!r.rowsAffected) throw new HttpError(404, `${userId} tidak punya ${itemKey}.`);
      return `-${qty}x ${itemKey} dari ${userId}`;
    }

    // ---------- NEXO PASS ----------
    case 'grant_premium': {
      const userId = req(p.userId, 'userId');
      const days = int(p.days ?? 30) ?? 30;
      const tier = String(p.tier || 'pro');
      const expiresAt = Date.now() + days * 86400000;
      await db.execute({
        sql: `INSERT INTO public.premium (user_id, tier, expires_at, granted_by, created_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT (user_id) DO UPDATE SET tier = EXCLUDED.tier, expires_at = EXCLUDED.expires_at, granted_by = EXCLUDED.granted_by`,
        args: [userId, tier, expiresAt, actorId, Date.now()],
      });
      return `NEXO Pass ${tier} ${userId} sampai ${new Date(expiresAt).toISOString().slice(0, 10)}`;
    }
    case 'revoke_premium': {
      const userId = req(p.userId, 'userId');
      const r = await db.execute({ sql: 'DELETE FROM public.premium WHERE user_id = ?', args: [userId] });
      if (!r.rowsAffected) throw new HttpError(404, `${userId} tidak punya NEXO Pass.`);
      return `NEXO Pass ${userId} dicabut`;
    }

    // ---------- TITLE ----------
    case 'add_title': {
      const userId = req(p.userId, 'userId');
      const titleKey = req(p.titleKey, 'titleKey');
      await db.execute({
        sql: `INSERT INTO public.user_titles (user_id, title_key, purchased_at) VALUES (?, ?, ?)
              ON CONFLICT DO NOTHING`,
        args: [userId, titleKey, Date.now()],
      });
      return `Title ${titleKey} -> ${userId}`;
    }
    case 'set_admin_title': {
      const userId = req(p.userId, 'userId');
      const text = String(p.text || '').slice(0, 100);
      if (!text.trim()) throw new HttpError(400, 'Teks admin title kosong.');
      await db.execute({ sql: 'UPDATE public.users SET admin_title = ? WHERE user_id = ?', args: [text, userId] });
      return `Admin title ${userId} dipasang`;
    }
    case 'clear_admin_title': {
      const userId = req(p.userId, 'userId');
      await db.execute({ sql: 'UPDATE public.users SET admin_title = NULL WHERE user_id = ?', args: [userId] });
      return `Admin title ${userId} dihapus`;
    }

    // ---------- PENGUMUMAN ----------
    case 'set_announcement': {
      const channel = p.channel === 'shop' ? 'shop_announcement' : 'global_announcement';
      const text = String(p.text || '').slice(0, 800);
      await db.execute({
        sql: `INSERT INTO public.settings (key, value) VALUES (?, ?)
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        args: [channel, text],
      });
      return `Pengumuman ${p.channel === 'shop' ? 'shop' : 'global'} ${text ? 'dipasang' : 'dihapus'}`;
    }

    // ---------- PROMO ----------
    case 'create_promo': {
      const code = String(p.code || '').toUpperCase().trim();
      if (!/^[A-Z0-9_]{3,24}$/.test(code)) throw new HttpError(400, 'Kode 3-24 karakter (A-Z, 0-9, _).');
      await db.execute({
        sql: `INSERT INTO public.promo_codes (code, reward_type, reward_value, quota, claimed_count, created_at)
              VALUES (?, ?, ?, ?, 0, ?)
              ON CONFLICT (code) DO UPDATE SET reward_type = EXCLUDED.reward_type, reward_value = EXCLUDED.reward_value, quota = EXCLUDED.quota, claimed_count = 0`,
        args: [code, String(p.rewardType || 'points'), String(p.rewardValue ?? ''), int(p.quota ?? 100) ?? 100, Math.floor(Date.now() / 1000)],
      });
      return `Kode ${code} dibuat`;
    }
    case 'delete_promo': {
      const code = String(p.code || '').toUpperCase().trim();
      const r = await db.execute({ sql: 'DELETE FROM public.promo_codes WHERE code = ?', args: [code] });
      if (!r.rowsAffected) throw new HttpError(404, `Kode ${code} tidak ada.`);
      return `Kode ${code} dihapus`;
    }

    // ---------- BANK & CHEMISTRY ----------
    case 'clear_loan': {
      const userId = req(p.userId, 'userId');
      const r = await db.execute({ sql: 'DELETE FROM public.bank_loans WHERE user_id = ?', args: [userId] });
      if (!r.rowsAffected) throw new HttpError(404, `${userId} tidak punya hutang.`);
      return `Hutang ${userId} dibebaskan`;
    }
    case 'set_chemistry': {
      const a = req(p.user1, 'user1');
      const b = req(p.user2, 'user2');
      const amount = int(p.amount) ?? 0;
      const [x, y] = [a, b].sort();
      // Kolom asli tabel public.chemistry: user1_id, user2_id, score.
      await db.execute({
        sql: `INSERT INTO public.chemistry (user1_id, user2_id, score) VALUES (?, ?, ?)
              ON CONFLICT (user1_id, user2_id) DO UPDATE SET score = EXCLUDED.score`,
        args: [x, y, amount],
      });
      return `Chemistry ${x} <-> ${y} = ${amount}`;
    }

    // ---------- SANKSI ----------
    case 'ban': {
      const userId = req(p.userId, 'userId');
      await db.execute({
        sql: `INSERT INTO public.banned_users (user_id, reason, banned_at, timeout_until) VALUES (?, ?, ?, 0)
              ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_at = EXCLUDED.banned_at, timeout_until = 0`,
        args: [userId, String(p.reason || 'Melanggar ToS'), Date.now()],
      });
      return `${userId} dibanned`;
    }
    case 'unban': {
      const userId = req(p.userId, 'userId');
      const r = await db.execute({ sql: 'DELETE FROM public.banned_users WHERE user_id = ?', args: [userId] });
      if (!r.rowsAffected) throw new HttpError(404, `${userId} tidak sedang dihukum.`);
      return `${userId} di-unban`;
    }
    case 'timeout': {
      const userId = req(p.userId, 'userId');
      const mins = int(p.mins) ?? 60;
      const until = Date.now() + mins * 60000;
      await db.execute({
        sql: `INSERT INTO public.banned_users (user_id, reason, banned_at, timeout_until) VALUES (?, ?, ?, ?)
              ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason, timeout_until = EXCLUDED.timeout_until`,
        args: [userId, String(p.reason || 'Timeout'), Date.now(), until],
      });
      return `${userId} timeout ${mins} menit`;
    }

    default:
      throw new HttpError(400, `Aksi "${aksi}" belum didukung jalur langsung (butuh bot).`);
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function req(v, nama) {
  const s = String(v || '').trim();
  if (!s) throw new HttpError(400, `${nama} wajib diisi.`);
  return s;
}
function int(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
async function ensureUser(db, userId) {
  const r = await db.execute({ sql: 'SELECT 1 FROM public.users WHERE user_id = ?', args: [userId] });
  if (!r.rows.length) throw new HttpError(404, `User ${userId} tidak ditemukan di database bot.`);
}
async function tx(db, userId, type, amount, description) {
  try {
    await db.execute({
      sql: 'INSERT INTO public.transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)',
      args: ['GLOBAL', userId, type, amount, description],
    });
  } catch { /* tabel transaksi mungkin beda struktur -> tidak fatal */ }
}
