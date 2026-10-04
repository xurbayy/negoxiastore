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
  // ==========================================
  // TAMBAHAN 2026-10-04 (permintaan pemilik: "kenapa di web gw ngatur streak
  // dan lainnya ga keubah ya di usernya di botnya").
  // ==========================================
  // SEBELUMNYA 12 aksi ini HANYA lewat antrean bot (bot_commands) - jadi
  // PERUBAHAN BARU TERJADI kalau bot online DAN sempat poll. Kalau bot mati
  // atau lambat, admin mengubah streak/level di web tapi data TIDAK berubah.
  // Sekarang semuanya langsung ke DB.
  'set_level', 'set_streak', 'set_winstreak', 'set_rpg_level',
  'reset_daily', 'reset_missions', 'clear_lock',
  'set_maintenance', 'giveaway', 'wipe',
  'redeem_promo_web',
  // CATATAN (fix 2026-10-04): 'restock_all' DIHAPUS dari jalur langsung.
  // Implementasi lama memakai `UPDATE ... SET stock = COALESCE(restock_rate, stock)`
  // - SALAH SEMANTIK: restock_rate = interval jam (24), bukan stok default.
  // Akibatnya semua item jadi stok 24 (padahal default beda-beda: 20/10/5/2).
  // Stok default asli hanya ada di katalog seed BOT (utils/database.js shopItems),
  // jadi restock_all WAJIB lewat antrean bot (webBridge case 'restock_all' ->
  // db.adminRestockAll()). Kalau bot mati, aksi tetap pending sampai bot hidup -
  // itu perilaku yang benar untuk aksi yang butuh katalog bot.
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
      // Notifikasi ke user (paritas dengan jalur bot webBridge add_item).
      // Tabel web_notifications ada di schema web (sama seperti /api/bot/notify).
      await db.execute({
        sql: `INSERT INTO web_notifications (discord_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?)`,
        args: [userId, 'info', 'Item Diterima', `Admin telah menambahkan ${qty}x ${itemKey} ke inventory-mu melalui Web.`, Date.now()],
      }).catch(() => {});
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
      await db.execute({
        sql: `INSERT INTO web_notifications (discord_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?)`,
        args: [userId, 'info', 'Item Diambil', `Admin telah menghapus ${qty}x ${itemKey} dari inventory-mu melalui Web.`, Date.now()],
      }).catch(() => {});
      return `-${qty}x ${itemKey} dari ${userId}`;
    }

    // ---------- NEXO PASS ----------
    case 'grant_premium': {
      const userId = req(p.userId, 'userId');
      const days = int(p.days ?? 30) ?? 30;
      const tier = String(p.tier || 'pro');
      // TAMBAH DURASI, BUKAN TIMPA (samakan dengan bot, fix 2026-10-04):
      // bot menambahkan durasi baru ke sisa yang masih aktif (sisa 20 hari +
      // grant 30 = 50 hari). Dulu jalur langsung menimpa expires_at = now+days
      // sehingga sisa hari user HANGUS - hasil berbeda tergantung lewat jalur
      // mana perintahnya masuk.
      const sisa = await db.execute({
        sql: 'SELECT expires_at FROM public.premium WHERE user_id = ? AND expires_at > ?',
        args: [userId, Date.now()],
      });
      const basis = sisa.rows.length ? Number(sisa.rows[0].expires_at) : Date.now();
      const expiresAt = basis + days * 86400000;
      await db.execute({
        sql: `INSERT INTO public.premium (user_id, tier, expires_at, granted_by, created_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT (user_id) DO UPDATE SET tier = EXCLUDED.tier, expires_at = EXCLUDED.expires_at, granted_by = EXCLUDED.granted_by`,
        args: [userId, tier, expiresAt, actorId, Date.now()],
      });
      const totalSisa = Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000));
      return `NEXO Pass ${tier} ${userId} sampai ${new Date(expiresAt).toISOString().slice(0, 10)} (total sisa ${totalSisa} hari)`;
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

    // ==========================================
    // TAMBAHAN 2026-10-04 - aksi yang dulu hanya lewat antrean bot
    // ==========================================

    // ---------- LEVEL & STREAK ----------
    case 'set_level': {
      const userId = req(p.userId, 'userId');
      const level = int(p.level);
      if (level === null || level < 1 || level > 1000) throw new HttpError(400, 'Level harus 1-1000.');
      await ensureUser(db, userId);
      // XP mengikuti rumus bot: floor(100 * (level-1)^1.5).
      const xp = Math.floor(100 * Math.pow(level - 1, 1.5)) || 0;
      await db.execute({ sql: 'UPDATE public.users SET level = ?, xp = ? WHERE user_id = ?', args: [level, xp, userId] });
      return `Level ${userId} -> ${level} (xp ${xp})`;
    }
    case 'set_streak': {
      const userId = req(p.userId, 'userId');
      const val = int(p.value);
      if (val === null || val < 0 || val > 3650) throw new HttpError(400, 'Streak harus 0-3650.');
      await ensureUser(db, userId);
      await db.execute({ sql: 'UPDATE public.users SET daily_streak = ? WHERE user_id = ?', args: [val, userId] });
      return `Daily streak ${userId} -> ${val}`;
    }
    case 'set_winstreak': {
      const userId = req(p.userId, 'userId');
      const val = int(p.value);
      if (val === null || val < 0 || val > 3650) throw new HttpError(400, 'Winstreak harus 0-3650.');
      await ensureUser(db, userId);
      await db.execute({ sql: 'UPDATE public.users SET winstreak = ? WHERE user_id = ?', args: [val, userId] });
      return `Winstreak ${userId} -> ${val}`;
    }
    case 'set_rpg_level': {
      const userId = req(p.userId, 'userId');
      const lvl = int(p.level);
      if (lvl === null || lvl < 1 || lvl > 100) throw new HttpError(400, 'Level RPG harus 1-100.');
      await ensureUser(db, userId);
      // Tabel rpg_progress: user_id, season, max_level, stars.
      // PRIMARY KEY = (user_id, season) - BUKAN user_id saja. Jadi kita cari
      // season terbaru milik user itu dulu, baru update (atau insert baru).
      const ada = await db.execute({
        sql: 'SELECT season FROM public.rpg_progress WHERE user_id = ? ORDER BY season DESC LIMIT 1',
        args: [userId],
      });
      if (ada.rows.length) {
        await db.execute({
          sql: 'UPDATE public.rpg_progress SET max_level = ? WHERE user_id = ? AND season = ?',
          args: [lvl, userId, ada.rows[0].season],
        });
        return `RPG max level ${userId} -> ${lvl} (season ${ada.rows[0].season})`;
      }
      await db.execute({
        sql: 'INSERT INTO public.rpg_progress (user_id, season, max_level, stars) VALUES (?, 1, ?, 0)',
        args: [userId, lvl],
      });
      return `RPG max level ${userId} -> ${lvl} (season 1, baru)`;
    }

    // ---------- RESET HARIAN ----------
    case 'reset_daily': {
      const userId = req(p.userId, 'userId');
      await ensureUser(db, userId);
      await db.execute({
        sql: 'UPDATE public.users SET daily_points = 0, daily_reset = NULL, last_daily_at = NULL WHERE user_id = ?',
        args: [userId],
      });
      return `Limit harian ${userId} di-reset`;
    }
    case 'reset_missions': {
      // userId kosong = re-roll misi SEMUA pemain (perilaku bot).
      const userId = p.userId ? String(p.userId).trim() : null;
      if (userId) {
        const r = await db.execute({ sql: 'DELETE FROM public.daily_missions WHERE user_id = ?', args: [userId] });
        return `Misi harian ${userId} di-reset (${r.rowsAffected || 0} baris)`;
      }
      const r = await db.execute('DELETE FROM public.daily_missions');
      return `Misi harian SEMUA pemain di-reset (${r.rowsAffected || 0} baris)`;
    }

    // ---------- LOCK SESI NYANGKUT ----------
    case 'clear_lock': {
      const userId = p.userId ? String(p.userId).trim() : null;
      if (userId) {
        const r = await db.execute({ sql: 'DELETE FROM public.playing_users WHERE user_id = ?', args: [userId] });
        return `Lock sesi ${userId} dibersihkan (${r.rowsAffected || 0})`;
      }
      const r = await db.execute('DELETE FROM public.playing_users');
      return `SEMUA lock sesi dibersihkan (${r.rowsAffected || 0})`;
    }

    // ---------- MAINTENANCE ----------
    case 'set_maintenance': {
      const on = String(p.status || '').toLowerCase() === 'on';
      const reason = String(p.reason || '').slice(0, 200);
      await db.execute({
        sql: `INSERT INTO public.settings (key, value) VALUES ('maintenance', ?)
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        args: [on ? '1' : '0'],
      });
      if (reason) {
        await db.execute({
          sql: `INSERT INTO public.settings (key, value) VALUES ('maintenance_reason', ?)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          args: [reason],
        });
      }
      return `Maintenance ${on ? 'AKTIF' : 'nonaktif'}${reason ? ' - ' + reason : ''}`;
    }

    // ---------- GIVEAWAY (mass add) ----------
    case 'giveaway': {
      const amount = int(p.amount);
      if (amount === null || amount <= 0) throw new HttpError(400, 'Jumlah giveaway harus > 0.');
      const r = await db.execute(
        'UPDATE public.users SET points = points + ? WHERE registered = 1',
        [amount]
      );
      return `Giveaway +${amount} pts ke ${r.rowsAffected || 0} pemain terdaftar`;
    }

    // ---------- WIPE (hapus data pemain) ----------
    case 'wipe': {
      const userId = req(p.userId, 'userId');
      await ensureUser(db, userId);
      // Hapus data terkait (urutan aman: anak dulu).
      for (const t of ['public.inventory', 'public.user_titles', 'public.transactions',
                       'public.game_scores', 'public.bank_loans', 'public.daily_missions']) {
        await db.execute({ sql: `DELETE FROM ${t} WHERE user_id = ?`, args: [userId] }).catch(() => {});
      }
      await db.execute({ sql: 'DELETE FROM public.premium WHERE user_id = ?', args: [userId] }).catch(() => {});
      await db.execute({ sql: 'DELETE FROM public.playing_users WHERE user_id = ?', args: [userId] }).catch(() => {});
      await db.execute({ sql: 'DELETE FROM public.users WHERE user_id = ?', args: [userId] });
      return `Data ${userId} di-WIPE (semua progres dihapus)`;
    }

    // ---------- RESTOCK SEMUA ----------
    // CATATAN (fix 2026-10-04): case ini TIDAK REACHABLE karena 'restock_all'
    // sudah dikeluarkan dari AKSI_LANGSUNG (lihat komentar di atas). Stok
    // default asli hanya ada di katalog seed bot -> aksi ini selalu lewat
    // antrean bot (webBridge case 'restock_all' -> db.adminRestockAll()).
    // Dibiarkan sebagai jejak historis; jangan masukkan kembali ke AKSI_LANGSUNG.

    // ---------- REDEEM PROMO (dari web) ----------
    case 'redeem_promo_web': {
      const userId = req(p.userId, 'userId');
      const code = String(p.code || '').toUpperCase().trim();
      if (!code) throw new HttpError(400, 'Kode wajib diisi.');
      await ensureUser(db, userId);
      // Kunci + ambil kuota (atomik: cek claimed < quota).
      const r = await db.execute({
        sql: `UPDATE public.promo_codes SET claimed_count = claimed_count + 1
              WHERE code = ? AND claimed_count < quota
              RETURNING reward_type, reward_value`,
        args: [code],
      });
      if (!r.rows.length) throw new HttpError(400, `Kode ${code} tidak valid / kuota habis.`);
      const rc = r.rows[0];
      // Berikan hadiah sesuai tipe.
      if (rc.reward_type === 'points') {
        const v = int(rc.reward_value) || 0;
        await db.execute({ sql: 'UPDATE public.users SET points = points + ? WHERE user_id = ?', args: [v, userId] });
        await tx(db, userId, 'promo', v, `Redeem ${code} (web)`);
        return `Kode ${code} ditukar: +${v} poin untuk ${userId}`;
      }
      if (rc.reward_type === 'premium') {
        const days = int(rc.reward_value) || 30;
        const exp = Date.now() + days * 86400000;
        await db.execute({
          sql: `INSERT INTO public.premium (user_id, tier, expires_at, granted_by, created_at)
                VALUES (?, 'pro', ?, ?, ?)
                ON CONFLICT (user_id) DO UPDATE SET tier = 'pro', expires_at = EXCLUDED.expires_at, granted_by = EXCLUDED.granted_by`,
          args: [userId, exp, `promo:${code}`, Date.now()],
        });
        return `Kode ${code} ditukar: NEXO Pass ${days} hari untuk ${userId}`;
      }
      return `Kode ${code} ditukar (${rc.reward_type}) - hadiah non-poin harus diproses bot`;
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
