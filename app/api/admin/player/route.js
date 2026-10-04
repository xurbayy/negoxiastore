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

  // ==========================================
  // FALLBACK DB LANGSUNG (fix 2026-10-04)
  // ==========================================
  // MASALAH: profil hanya diisi bot lewat data_requests. Kalau bot mati/lambat,
  // panel menampilkan "Menyegarkan data dari bot..." TERUS-MENERUS dan data
  // tidak pernah muncul. Padahal semua data ada di database!
  //
  // Sekarang: kalau profil bot belum ada, kita BANGUN dari tabel bot langsung
  // (users, premium, inventory, transactions, user_titles). Admin langsung
  // melihat data tanpa menunggu bot. Bot tetap diminta refresh di latar untuk
  // melengkapi bagian yang butuh Discord (mis. nama/avatar terbaru).
  if (!profile) {
    const adaUser = await db.execute({
      sql: 'SELECT user_id, username, points, level, xp, daily_streak, winstreak, total_won, total_bet, admin_title FROM public.users WHERE user_id = ? LIMIT 1',
      args: [id],
    }).catch(() => ({ rows: [] }));

    if (adaUser.rows.length) {
      const u = adaUser.rows[0];
      const [prem, inv, tx, tit] = await Promise.all([
        db.execute({ sql: 'SELECT tier, expires_at FROM public.premium WHERE user_id = ? LIMIT 1', args: [id] }).catch(() => ({ rows: [] })),
        db.execute({ sql: 'SELECT item_key, quantity FROM public.inventory WHERE user_id = ? ORDER BY item_key', args: [id] }).catch(() => ({ rows: [] })),
        db.execute({ sql: 'SELECT type, amount, description, created_at FROM public.transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50', args: [id] }).catch(() => ({ rows: [] })),
        db.execute({ sql: 'SELECT title_key FROM public.user_titles WHERE user_id = ?', args: [id] }).catch(() => ({ rows: [] })),
      ]);
      const p0 = prem.rows[0];
      const expAt = p0 ? Number(p0.expires_at) : 0;
      const premiumStatus = p0 ? (expAt > Date.now() ? 'active' : 'expired') : 'none';

      profile = {
        exists: true,
        registered: true,
        needsOnboarding: false,
        // Penanda supaya UI tahu ini dari DB langsung (bukan jawaban bot).
        dariDbLangsung: true,
        profile: {
          userId: String(u.user_id),
          username: u.username,
          avatarUrl: null, // butuh Discord; UI pakai avatar default
          points: Number(u.points || 0),
          level: Number(u.level || 1),
          xp: Number(u.xp || 0),
          dailyStreak: Number(u.daily_streak || 0),
          winstreak: Number(u.winstreak || 0),
          totalWon: Number(u.total_won || 0),
          totalBet: Number(u.total_bet || 0),
          premiumStatus,
          premiumTier: p0?.tier || null,
          premiumExpiresAt: expAt || null,
          adminTitle: u.admin_title || null,
          titles: tit.rows.map((t) => t.title_key),
          inventory: inv.rows.map((r) => ({ itemKey: r.item_key, quantity: Number(r.quantity || 0) })),
          transactions: tx.rows.map((r) => ({
            type: r.type, amount: Number(r.amount || 0),
            description: r.description, createdAt: Number(r.created_at || 0) * 1000,
          })),
        },
      };
      profileAge = 0; // data segar (langsung dari DB)
    }
  }

  // basi (>2 menit) -> minta segarkan.
  // ANTI-SPAM (fix 2026-09-14): selain cek pending, hormati cooldown 30 dtk
  // sejak permintaan terakhir (pending ATAU baru selesai). Dulu untuk user
  // tak dikenal (profile selalu null) tiap klik admin mengantre permintaan
  // baru lagi - antrean bot bisa dibanjiri klik berulang.
  //
  // PENTING (fix 2026-10-04): kalau profil sudah dibangun dari DB LANGSUNG
  // (dariDbLangsung), JANGAN set refreshing=true - data sudah tampil, dan
  // menyalakan refreshing membuat UI berputar "Menyegarkan data dari bot..."
  // terus-menerus padahal tidak ada yang kurang. Bot tetap diminta refresh di
  // latar (untuk melengkapi avatar/nama), tapi UI tidak menunggunya.
  let refreshing = false;
  // PENTING (fix 2026-10-04): kalau DATA SUDAH ADA (profil dari bot ATAU dari
  // DB langsung), JANGAN pernah set refreshing=true. Dulu flag ini dinyalakan
  // tiap profil >2 menit - padahal data tetap tampil - sehingga UI berputar
  // "Menyegarkan data dari bot..." terus-menerus (keluhan pemilik). Sekarang
  // refresh hanya diminta di LATAR; UI tidak menunggu.
  const adaData = Boolean(profile);
  const perluSegarkan = !adaData;              // UI menunggu HANYA kalau kosong
  const mintaLatar = adaData;                   // selalu minta refresh di latar
  if (perluSegarkan || mintaLatar) {
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
    // UI menunggu HANYA kalau benar-benar belum ada data sama sekali.
    refreshing = !adaData;
  }

  // jejak perintah bot yang menyentuh user ini (add_points, gift/reward, premium, dsb)
  // BATAS 50 (permintaan pemilik 2026-10-04): seragam dengan semua history lain.
  const like = `%"userId":"${id}"%`;
  const cmds = await db.execute({
    sql: "SELECT id, action, status, result, actor_id, created_at, executed_at FROM bot_commands WHERE payload LIKE ? ORDER BY id DESC LIMIT 50",
    args: [like],
  });
  // log transfer/manual masuk DB bot tidak di-web - tapi ack RESULT string dari bot
  // sudah memuat "+N pts ke username" -> cukup utk verifikasi gift.

  // riwayat transaksi lokal web (order & klaim redeem) utk user ini
  const orders = await db.execute({
    sql: 'SELECT id, plan, amount, status, created_at, paid_at FROM orders WHERE discord_id = ? ORDER BY id DESC LIMIT 50',
    args: [id],
  });
  const claims = await db.execute({
    sql: 'SELECT code, claimed_at, status, fail_reason FROM web_redeem_claims WHERE discord_id = ? ORDER BY claimed_at DESC LIMIT 50',
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
