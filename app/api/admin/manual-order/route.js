import { NextResponse } from 'next/server';
import { getAdminSession, getSession } from '../../../lib/session';
import { getDb, schemaReady } from '../../../lib/db';
import { touchActivity } from '../../../lib/activity';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const admin = await getAdminSession();
  const session = await getSession();
  
  let authorized = Boolean(admin);
  if (!authorized && session) {
    const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    authorized = adminIds.includes(session.discordId);
  }
  if (!authorized) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  
  const { orderId, action } = body;
  if (!orderId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'Invalid parameters' }, { status: 400 });
  }

  await schemaReady();
  const db = getDb();
  
  const orderRes = await db.execute({
    sql: "SELECT discord_id, status FROM orders WHERE id = ? AND gateway = 'manual'",
    args: [Number(orderId)],
  });

  if (!orderRes.rows.length) {
    return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
  }
  
  const order = orderRes.rows[0];
  if (order.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'Order sudah diproses sebelumnya.' }, { status: 400 });
  }

  const now = Date.now();
  if (action === 'approve') {
    const flip = await db.execute({
      sql: "UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'",
      args: [now, Number(orderId)],
    });
    
    if (flip.rowsAffected > 0 && order.discord_id) {
      await db.execute({
        sql: "INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES ('grant_premium', ?, 'admin_manual', 'pending', ?)",
        args: [JSON.stringify({ userId: order.discord_id, tier: 'pro', days: 30 }), now],
      });
      await db.execute({
        sql: "INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, 'pending', ?)",
        args: [order.discord_id, now],
      });
    }
  } else {
    // reject
    await db.execute({
      sql: "UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'pending'",
      args: [Number(orderId)],
    });
  }

  await touchActivity().catch(() => {});
  return NextResponse.json({ ok: true });
}
