import { getAdminSession, getSession } from '../../../../lib/session';
import { json } from '../../../../lib/api-helpers';
import { getDb, schemaReady } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/push/info — jumlah perangkat menyalakan notifikasi
// ==========================================
// GET -> { ok: true, perangkat: N }
// Info kecil untuk panel admin (bukan kontrol - user yang nyalakan sendiri).
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    const session = await getSession();
    const ids = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!session || !ids.includes(session.discordId)) return json({ ok: false, error: 'forbidden' }, 403);
  }
  await schemaReady();
  const db = getDb();
  const r = await db.execute({ sql: 'SELECT COUNT(*) AS c FROM push_subscriptions', args: [] });
  return json({ ok: true, perangkat: Number(r.rows?.[0]?.c || 0) });
}
