import { getSession, getAdminSession } from '../../../lib/session';
import { getDb } from '../../../lib/db';
import { json, ready } from '../../../lib/api-helpers';
import { touchActivity } from '../../../lib/activity';

export const dynamic = 'force-dynamic';

// GET /api/admin/player?id=<discordId> - PANEL PLAYER LOOKUP.
// Admin memasukkan ID -> profil penuh (snapshot data_requests terakhir dari bot)
// + log perintah bot yang menarget user itu (cek gift/reward MASUK atau belum).
// Kalau profil belum ada/basi -> automasi: antrekan data_requests baru (bot poll
// <=5 dtk, ack mengisi) -> response berstatus 'refreshing'.
export async function GET(request) {
  // jalur akses sama seperti admin panel lain
  let actorId = null;
  const admin = await getAdminSession();
  if (admin) actorId = `admin:${admin.adminUsername}`;
  if (!actorId) {
    const session = await getSession();
    if (session) {
      const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (adminIds.includes(session.discordId)) actorId = session.discordId;
    }
  }
  if (!actorId) return json({ ok: false, error: 'forbidden' }, 403);

  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').trim();
  if (!/^\d{5,25}$/.test(id)) return json({ ok: false, error: 'ID tidak valid (5-25 digit angka).' }, 400);

  await ready();
  const db = getDb();

  // profil terbaru dari bot
  const dr = await db.execute({
    sql: "SELECT data, filled_at FROM data_requests WHERE discord_id = ? AND status = 'done' ORDER BY filled_at DESC LIMIT 1",
    args: [id],
  });
  let profile = null, profileAge = null;
  if (dr.rows.length) {
    try { profile = JSON.parse(dr.rows[0].data); profileAge = Date.now() - Number(dr.rows[0].filled_at); } catch {}
    if (profile && !profile.exists) profile = null; // user tak dikenal bot
  }

  // basi (>2 menit) -> minta segarkan.
  // ANTI-SPAM (fix 2026-09-14): selain cek pending, hormati cooldown 30 dtk
  // sejak permintaan terakhir (pending ATAU baru selesai). Dulu untuk user
  // tak dikenal (profile selalu null) tiap klik admin mengantre permintaan
  // baru lagi - antrean bot bisa dibanjiri klik berulang.
  let refreshing = false;
  if (!profile || profileAge > 2 * 60_000) {
    const recent = await db.execute({
      sql: `SELECT id, status, created_at, filled_at FROM data_requests
            WHERE discord_id = ? AND (status = 'pending' OR filled_at > ?)
            ORDER BY id DESC LIMIT 1`,
      args: [id, Date.now() - 30_000],
    });
    if (!recent.rows.length) {
      await db.execute({
        sql: "INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, 'pending', ?)",
        args: [id, Date.now()],
      });
      // Segarkan cepat: tanpa hint ini bot mode idle baru tarik antrean <=30 dtk
      // sementara client hanya poll 8x3dtk -> profil tidak kunjung muncul.
      await touchActivity().catch(() => {});
    }
    refreshing = true;
  }

  // jejak perintah bot yang menyentuh user ini (add_points, gift/reward, premium, dsb)
  const like = `%"userId":"${id}"%`;
  const cmds = await db.execute({
    sql: "SELECT id, action, status, result, actor_id, created_at, executed_at FROM bot_commands WHERE payload LIKE ? ORDER BY id DESC LIMIT 15",
    args: [like],
  });
  // log transfer/manual masuk DB bot tidak di-web - tapi ack RESULT string dari bot
  // sudah memuat "+N pts ke username" -> cukup utk verifikasi gift.

  // riwayat transaksi lokal web (order & klaim redeem) utk user ini
  const orders = await db.execute({
    sql: 'SELECT id, plan, amount, status, created_at, paid_at FROM orders WHERE discord_id = ? ORDER BY id DESC LIMIT 8',
    args: [id],
  });
  const claims = await db.execute({
    sql: 'SELECT code, claimed_at, status, fail_reason FROM web_redeem_claims WHERE discord_id = ? ORDER BY claimed_at DESC LIMIT 8',
    args: [id],
  });

  return json({
    ok: true,
    refreshing,
    profile,
    profileAge,
    commands: cmds.rows.map((r) => ({
      id: Number(r.id), action: r.action, status: r.status, result: r.result,
      actorId: r.actor_id, createdAt: Number(r.created_at), executedAt: r.executed_at ? Number(r.executed_at) : null,
    })),
    orders: orders.rows.map((r) => ({ id: Number(r.id), plan: r.plan, amount: Number(r.amount), status: r.status, createdAt: Number(r.created_at), paidAt: r.paid_at ? Number(r.paid_at) : null })),
    claims: claims.rows.map((r) => ({ code: r.code, claimedAt: Number(r.claimed_at), status: r.status, failReason: r.fail_reason })),
  });
}
