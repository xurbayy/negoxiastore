import { getSession, getAdminSession } from '../../../lib/session';
import { getDb } from '../../../lib/db';
import { getSnapshotSeries, getLatestSnapshot, getBotHeartbeat, getLiveStats } from '../../../lib/snapshot';
import { getPromoCache } from '../../../lib/promo-cache';
import { json, ready } from '../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// GET /api/admin/data - semua data untuk admin panel (dashboard + log).
// Jalur akses: session admin (username+password) ATAU member di ADMIN_DISCORD_IDS.
export async function GET() {
  const admin = await getAdminSession();
  const session = await getSession(); // HARUS di scope fungsi: dipakai lagi di actorId di bawah
  let authorized = Boolean(admin);
  if (!authorized && session) {
    const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    authorized = adminIds.includes(session.discordId);
  }
  if (!authorized) return json({ ok: false, error: 'forbidden' }, 403);

  await ready();
  const [snap, series] = await Promise.all([getLatestSnapshot(), getSnapshotSeries(7)]);
  // Heartbeat + statistik LANGSUNG dari DB bot (Supabase) - tidak bergantung
  // snapshot push, jadi status bot akurat walau bridge push belum jalan.
  const [heartbeat, liveStats] = await Promise.all([getBotHeartbeat(), getLiveStats()]);
  const db = getDb();

  const orders = await db.execute(
    'SELECT id, discord_id, plan, amount, gateway, gateway_ref, status, created_at, paid_at FROM orders ORDER BY created_at DESC LIMIT 30'
  );

  const log = await db.execute(
    'SELECT id, action, payload, actor_id, status, result, created_at, executed_at FROM bot_commands ORDER BY created_at DESC LIMIT 100'
  );

  const promoCache = await getPromoCache().catch(() => []);

  // BANK LOANS LANGSUNG DARI DB BOT (2026-10-03): BankManager dulu membaca
  // dari snapshot push (umur bisa 60+ dtk) sehingga setelah pemutihan daftar
  // masih menampilkan hutang lama -> admin mengira harus clear 2x.
  const bankLoans = await db.execute(`
    SELECT b.user_id, b.total_due, b.due_date,
           (SELECT u.username FROM public.users u WHERE u.user_id = b.user_id) AS username
    FROM public.bank_loans b
    ORDER BY b.due_date ASC
  `).catch(() => ({ rows: [] }));

    const feedback = await db.execute(
      'SELECT id, discord_id, username, kind, message, page, created_at FROM web_feedback ORDER BY created_at DESC LIMIT 30'
    );

  // ==========================================
  // DATA LANGSUNG DARI DB (permintaan pemilik 2026-10-03)
  // ==========================================
  // Dulu Promo/Redeem, NEXO Pass, Moderasi, dan Admin Title membaca dari
  // SNAPSHOT PUSH BOT (bisa basi 60+ dtk) -> admin mengira perintah/tombol
  // gagal padahal cuma telat. Sekarang diambil LANGSUNG dari tabel bot,
  // sama seperti BankManager & ManualOrders. Snapshot tetap dikirim sebagai
  // cadangan kalau query DB gagal.
  const [promoCodes, premiumMembers, bannedUsers, adminTitleHolders] = await Promise.all([
    db.execute(
      `SELECT code, reward_type, reward_value, quota, claimed_count, created_at
         FROM public.promo_codes ORDER BY created_at DESC`
    ).catch(() => ({ rows: [] })),
    db.execute(
      `SELECT p.user_id, p.tier, p.expires_at, p.granted_by,
              (SELECT u.username FROM public.users u WHERE u.user_id = p.user_id) AS username
         FROM public.premium p
        WHERE p.expires_at > ?
        ORDER BY p.expires_at ASC`,
      [Date.now()]
    ).catch(() => ({ rows: [] })),
    db.execute(
      `SELECT b.user_id, b.reason, b.banned_at, b.timeout_until,
              (SELECT u.username FROM public.users u WHERE u.user_id = b.user_id) AS username
         FROM public.banned_users b ORDER BY b.banned_at DESC`
    ).catch(() => ({ rows: [] })),
    db.execute(
      `SELECT user_id, username, admin_title FROM public.users
        WHERE admin_title IS NOT NULL ORDER BY username ASC`
    ).catch(() => ({ rows: [] })),
  ]);

    return json({
      ok: true,
      promoCache,
      actorId: admin ? `admin:${admin.adminUsername}` : session?.discordId,
      snapshot: snap,
      bankLoans: bankLoans.rows.map((r) => ({
        userId: String(r.user_id),
        username: r.username || null,
        totalDue: Number(r.total_due || 0),
        dueDate: r.due_date ? Number(r.due_date) : null,
      })),
      series,
      botHeartbeat: heartbeat,
      liveStats,
      feedback: feedback.rows.map((r) => ({
        id: Number(r.id),
        discordId: r.discord_id,
        username: r.username,
        kind: r.kind,
        message: r.message,
        page: r.page,
        createdAt: Number(r.created_at),
      })),
      orders: orders.rows.map((r) => ({
        id: Number(r.id),
        discordId: r.discord_id,
        plan: r.plan,
        amount: Number(r.amount),
        gateway: r.gateway,
        gatewayRef: r.gateway_ref,
        status: r.status,
        createdAt: Number(r.created_at),
        paidAt: r.paid_at ? Number(r.paid_at) : null,
      })),
      // Data LIVE dari DB (menggantikan snapshot yang bisa basi).
      promoCodes: promoCodes.rows.map((r) => ({
        code: r.code,
        rewardType: r.reward_type,
        rewardValue: r.reward_value,
        quota: Number(r.quota || 0),
        claimed: Number(r.claimed_count || 0),
        createdAtMs: Number(r.created_at || 0) * 1000,
      })),
      premiumMembers: premiumMembers.rows.map((r) => ({
        userId: String(r.user_id),
        username: r.username || null,
        tier: r.tier,
        expiresAt: r.expires_at ? Number(r.expires_at) : null,
        grantedBy: r.granted_by || null,
      })),
      bannedUsers: bannedUsers.rows.map((r) => ({
        userId: String(r.user_id),
        username: r.username || null,
        reason: r.reason,
        bannedAt: r.banned_at ? Number(r.banned_at) : null,
        timeoutUntil: r.timeout_until ? Number(r.timeout_until) : null,
      })),
      adminTitleHolders: adminTitleHolders.rows.map((r) => ({
        userId: String(r.user_id),
        username: r.username || null,
        adminTitle: r.admin_title,
      })),
      log: log.rows.map((r) => ({
        id: Number(r.id),
        action: r.action,
        payload: safeParse(r.payload),
        actorId: r.actor_id,
        status: r.status,
        result: r.result,
        createdAt: Number(r.created_at),
        executedAt: r.executed_at ? Number(r.executed_at) : null,
      })),
    });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
