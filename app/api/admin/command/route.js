import { getSession, getAdminSession } from '../../../lib/session';
import { getDb } from '../../../lib/db';
import { json, ready } from '../../../lib/api-helpers';
import { touchActivity } from '../../../lib/activity';

export const dynamic = 'force-dynamic';

// Whitelist aksi admin web -> bot (harus persis dengan ALLOWED_ACTIONS bot).
const ACTIONS = new Set([
  'add_points', 'remove_points', 'set_points', 'giveaway', 'set_level',
  'set_streak', 'set_winstreak', 'add_item', 'remove_item', 'restock_item',
  'restock_all', 'set_price', 'set_discount', 'remove_discount', 'clear_loan',
  'set_chemistry', 'create_promo', 'delete_promo', 'set_maintenance',
  'grant_premium', 'revoke_premium', 'redeem_promo_web',
  'reset_daily', 'reset_missions', 'clear_lock', 'add_title',
  'set_admin_title', 'clear_admin_title', 'set_announcement',
  'timeout', 'ban', 'unban', 'wipe',
]);

// POST /api/admin/command - antrekan 1 aksi bot (INSERT bot_commands).
// Jalur akses: session admin (username+password) ATAU member di ADMIN_DISCORD_IDS.
export async function POST(request) {
  let actorId = null;
  const admin = await getAdminSession();
  if (admin) {
    actorId = `admin:${admin.adminUsername}`;
  } else {
    const session = await getSession();
    if (session) {
      const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (adminIds.includes(session.discordId)) actorId = session.discordId;
    }
  }
  if (!actorId) return json({ ok: false, error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { body = null; }
  const action = String(body?.action || '');
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : null;

  await ready();
  const db = getDb();

  // Aksi khusus web-only (tidak dikirim ke bot)
  if (action === 'delete_feedback' && payload?.id) {
    await db.execute({ sql: 'DELETE FROM web_feedback WHERE id = ?', args: [payload.id] });
    return json({ ok: true });
  }

  if (!ACTIONS.has(action) || !payload) {
    return json({ ok: false, error: 'Aksi tidak dikenal atau payload kosong.' }, 400);
  }

  // Guard server-side: cegah command yang PASTI ditolak bot masuk antrean
  // (dulu lolos dari form -> failed senyap di Activity Log). Semua range di
  // sini cermin persis validasi webBridge.executeCommand.
  const guardErr = validatePayload(action, payload);
  if (guardErr) return json({ ok: false, error: guardErr }, 400);

  // Bot cap grant_premium days 1-3650. "lifetime" (36500) dari UI -> clamp ke
  // 3650 (~10 th, efektif lifetime). Hindari failed senyap di Activity Log.
  const clamped = clampDays(action, payload);

  const res = await db.execute({
    sql: 'INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [action, JSON.stringify(clamped), actorId, 'pending', Date.now()],
  });

  await touchActivity();
  return json({ ok: true, id: Number(res.lastInsertRowid) });
}

// Cermin validasi webBridge.executeCommand (utils/webBridge.js bot).
// Return pesan error string kalau invalid, null kalau lolos.
function validatePayload(action, p) {
  const int = (v) => { const n = Number(v); return Number.isFinite(n) && Number.isInteger(n) ? n : null; };
  const isId = (v) => typeof v === 'string' && /^\d{5,25}$/.test(v.trim());
  const needId = () => (isId(p.userId) ? null : 'Discord ID tidak valid (5-25 digit angka).');

  switch (action) {
    case 'add_points':
    case 'remove_points': {
      const e = needId(); if (e) return e;
      const a = int(p.amount);
      return a !== null && a > 0 && a <= 1_000_000 ? null : 'Amount harus 1 - 1.000.000.';
    }
    case 'set_points': {
      const e = needId(); if (e) return e;
      const a = int(p.amount);
      return a !== null && a >= 0 && a <= 100_000_000 ? null : 'Saldo harus 0 - 100.000.000.';
    }
    case 'giveaway': {
      const a = int(p.amount);
      return a !== null && a > 0 && a <= 250_000 ? null : 'Giveaway harus 1 - 250.000.';
    }
    case 'set_level': {
      const e = needId(); if (e) return e;
      const v = int(p.level);
      return v !== null && v >= 1 && v <= 1000 ? null : 'Level harus 1 - 1000.';
    }
    case 'set_streak':
    case 'set_winstreak': {
      const e = needId(); if (e) return e;
      const v = int(p.value);
      return v !== null && v >= 0 && v <= 3650 ? null : 'Nilai harus 0 - 3650.';
    }
    case 'add_item':
    case 'remove_item': {
      const e = needId(); if (e) return e;
      if (!p.itemKey) return 'Item wajib dipilih.';
      const q = int(p.qty ?? 1);
      return q !== null && q >= 1 && q <= 999 ? null : 'Qty harus 1 - 999.';
    }
    case 'restock_item': {
      if (!p.itemKey) return 'Item wajib dipilih.';
      if (p.amount === undefined || p.amount === null) return null; // default restock
      const a = int(p.amount);
      return a !== null && a >= 0 ? null : 'Jumlah restock harus >= 0.';
    }
    case 'set_price': {
      if (!p.itemKey) return 'Item wajib dipilih.';
      const v = int(p.price);
      return v !== null && v >= 0 && v <= 100_000_000 ? null : 'Harga harus 0 - 100.000.000.';
    }
    case 'set_discount': {
      if (!p.itemKey) return 'Item wajib dipilih.';
      const price = int(p.discountPrice);
      const hours = int(p.durationHours);
      if (price === null || price < 1) return 'Harga diskon minimal 1.';
      if (hours === null || hours < 1 || hours > 720) return 'Durasi diskon harus 1 - 720 jam.';
      return null;
    }
    case 'grant_premium': {
      const e = needId(); if (e) return e;
      const d = int(p.days);
      if (d === null || d < 1) return 'Durasi premium minimal 1 hari.';
      return null; // > 3650 di-clamp di clampDays
    }
    case 'timeout': {
      const e = needId(); if (e) return e;
      const m = int(p.mins);
      return m !== null && m > 0 ? null : 'Menit timeout harus > 0.';
    }
    case 'ban':
    case 'unban':
    case 'wipe':
    case 'clear_loan':
    case 'reset_daily': {
      return needId();
    }
    case 'create_promo': {
      const code = String(p.code || '').toUpperCase().trim();
      if (!/^[A-Z0-9_]{3,24}$/.test(code)) return 'Kode harus 3-24 karakter (A-Z, 0-9, _).';
      if (!['points', 'item', 'title'].includes(p.rewardType)) return 'Reward harus points/item/title.';
      if (p.rewardValue === undefined || p.rewardValue === null || String(p.rewardValue).length > 100) return 'Reward value tidak valid (maks 100 karakter).';
      if (p.rewardType === 'points') {
        const v = int(p.rewardValue);
        if (v === null || v <= 0) return 'Reward points harus angka > 0.';
      }
      const q = int(p.quota);
      return q !== null && q >= 1 && q <= 100000 ? null : 'Kuota harus 1 - 100.000.';
    }
    case 'set_chemistry': {
      if (!isId(p.user1) || !isId(p.user2)) return 'Kedua Discord ID tidak valid.';
      const a = int(p.amount);
      return a !== null ? null : 'Amount chemistry harus angka.';
    }
    case 'add_title': {
      const e = needId(); if (e) return e;
      return p.titleKey ? null : 'Title wajib dipilih.';
    }
    case 'set_admin_title': {
      const e = needId(); if (e) return e;
      const t = String(p.text || '').trim();
      if (!t) return 'Teks admin title kosong.';
      return t.length <= 100 ? null : 'Teks admin title maks 100 karakter.';
    }
    default:
      return null; // aksi lain divalidasi bot / tanpa range khusus
  }
}

// grant_premium: days > 3650 clamp ke 3650 (bot reject di atas itu).
function clampDays(action, payload) {
  if (action !== 'grant_premium') return payload;
  const d = Number(payload?.days);
  if (Number.isFinite(d) && d > 3650) {
    return { ...payload, days: 3650 };
  }
  return payload;
}
