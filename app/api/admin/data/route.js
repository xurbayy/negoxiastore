import { getSession, getAdminSession } from '../../../lib/session';
import { getDb } from '../../../lib/db';
import { getSnapshotSeries, getLatestSnapshot } from '../../../lib/snapshot';
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
  const db = getDb();

  const orders = await db.execute(
    'SELECT id, discord_id, plan, amount, gateway, gateway_ref, status, created_at, paid_at FROM orders ORDER BY created_at DESC LIMIT 50'
  );

  const log = await db.execute(
    'SELECT id, action, payload, actor_id, status, result, created_at, executed_at FROM bot_commands ORDER BY created_at DESC LIMIT 500'
  );

  const promoCache = await getPromoCache().catch(() => []);

    const feedback = await db.execute(
      'SELECT id, discord_id, username, kind, message, page, created_at FROM web_feedback ORDER BY created_at DESC LIMIT 100'
    );

    return json({
      ok: true,
      promoCache,
      actorId: admin ? `admin:${admin.adminUsername}` : session?.discordId,
      snapshot: snap,
      series,
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
