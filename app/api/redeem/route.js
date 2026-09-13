import { getSession } from '../../lib/session';
import { getDb } from '../../lib/db';
import { reserveSlot, releaseSlot, GONE_MSG, STOLEN_MSG } from '../../lib/promo-cache';
import { json, ready } from '../../lib/api-helpers';
import { touchActivity } from '../../lib/activity';
import { verifyTurnstile } from '../../lib/turnstile';

export const dynamic = 'force-dynamic';

// Rate limit in-memory: max 5 attempt/menit per user.
const _attempts = new Map(); // discordId -> [timestamps]
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

function rateLimited(discordId) {
  const now = Date.now();
  const list = (_attempts.get(discordId) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  _attempts.set(discordId, list);
  return list.length > MAX_ATTEMPTS;
}

// POST /api/redeem - klaim kode promo dari web.
// Jalur aman: masukkan klaim + antrekan action add_points/add_item (whitelist bot)
// + refresh profil. Bot memvalidasi ulang di sisinya.
export async function POST(request) {
  const session = await getSession();
  if (!session) return json({ ok: false, reason: 'Harus login dulu.' }, 401);

  let body;
  try { body = await request.json(); } catch { body = null; }
  const code = String(body?.code || '').toUpperCase().trim();

  // 1. Format
  if (!/^[A-Z0-9_]{3,24}$/.test(code)) {
    return json({ ok: false, reason: 'Format kode salah (3-24 karakter, A-Z 0-9 _).' }, 400);
  }

  // 2. Cloudflare Turnstile: bukti manusia (token sekali-pakai, diminta
  //    ulang tiap percobaan dari widget di halaman Redeem).
  if (process.env.TURNSTILE_SECRET_KEY) {
    const v = await verifyTurnstile(body?.cfToken, request.headers.get('x-real-ip') || undefined);
    if (!v.ok) {
      return json({ ok: false, turnstile: true, reason: v.netError ? 'Verifikasi sedang terganggu, coba lagi.' : 'Centang dulu kotak "saya bukan robot".' }, 400);
    }
  }

  // 3. Rate limit
  if (rateLimited(session.discordId)) {
    return json({ ok: false, reason: 'Terlalu banyak percobaan. Tunggu sebentar.' }, 429);
  }

  await ready();
  const db = getDb();

  // 4. Sudah klaim? (yang sudah 'failed' boleh dicoba lagi)
  const claimed = await db.execute({
    sql: "SELECT status FROM web_redeem_claims WHERE discord_id = ? AND code = ?",
    args: [session.discordId, code],
  });
  if (claimed.rows.length && String(claimed.rows[0].status) !== 'failed') {
    return json({ ok: false, reason: 'Kamu sudah klaim kode ini.' }, 400);
  }
  if (claimed.rows.length) {
    await db.execute({
      sql: 'DELETE FROM web_redeem_claims WHERE discord_id = ? AND code = ?',
      args: [session.discordId, code],
    });
  }

  // 5. Stok dari web_promo_cache (real-time, TANPA nanya bot):
  //    kode tidak terdaftar / exhausted -> tolak tanpa claim/antrean.
  const cacheRow = await db.execute({
    sql: 'SELECT exhausted FROM web_promo_cache WHERE code = ?',
    args: [code],
  });
  if (!cacheRow.rows.length || Number(cacheRow.rows[0].exhausted) === 1) {
    return json({ ok: false, reason: GONE_MSG }, 400);
  }

  // 6. RESERVASI ATOMIK: kunci satu slot (anti over-claim saat ramai).
  const got = await reserveSlot(db, code);
  if (!got) {
    return json({ ok: false, reason: STOLEN_MSG }, 400);
  }

  // 7. Lolos reservasi: INSERT CLAIM DULU (audit S2) - PK (discord_id, code)
  //    menjamin race user sama terblokir SEBELUM command dibuat, jadi tidak
  //    pernah ada "command yatim" yang bisa memaksa bot ack 'sudah menukarkan'
  //    -> exhausted palsu. Baru setelah itu antrekan command + refresh profil.
  //    Error apa pun -> klaim dihapus, slot wajib dilepas.
  try {
    await db.execute({
      sql: "INSERT INTO web_redeem_claims (discord_id, code, claimed_at, command_id, status) VALUES (?, ?, ?, NULL, 'pending')",
      args: [session.discordId, code, Date.now()],
    });
  } catch {
    await releaseSlot(db, code).catch(() => {});
    return json({ ok: false, reason: 'Kamu sudah klaim kode ini.' }, 400);
  }

  try {
    await db.execute({
      sql: 'INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      args: ['redeem_promo_web', JSON.stringify({ userId: session.discordId, code }), session.discordId, 'pending', Date.now()],
    });
    const lastCmd = await db.execute('SELECT MAX(id) as m FROM bot_commands');
    const commandId = Number(lastCmd.rows[0]?.m || 0) || null;
    await db.execute({
      sql: 'UPDATE web_redeem_claims SET command_id = ? WHERE discord_id = ? AND code = ?',
      args: [commandId, session.discordId, code],
    });
    await db.execute({
      sql: "INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, 'pending', ?)",
      args: [session.discordId, Date.now()],
    });
  } catch {
    await db.execute({
      sql: 'DELETE FROM web_redeem_claims WHERE discord_id = ? AND code = ?',
      args: [session.discordId, code],
    }).catch(() => {});
    await releaseSlot(db, code).catch(() => {});
    return json({ ok: false, reason: 'Terjadi kesalahan di server. Coba lagi.' }, 500);
  }

  await touchActivity();
  return json({ ok: true, message: 'Berhasil! Hadiah masuk in-game dalam ~5-10 detik.' });
}
