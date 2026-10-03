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
