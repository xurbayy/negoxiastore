import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb } from '../../../../lib/db';
import { json, ready } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const admin = await getAdminSession();
  let actorId = null;
  if (admin) actorId = true;
  else {
    const session = await getSession();
    if (session) {
      const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (adminIds.includes(session.discordId)) actorId = true;
    }
  }
  if (!actorId) return json({ ok: false, error: 'forbidden' }, 403);

  const resolvedParams = await params;
  const id = Number(resolvedParams.id);
  if (!id || isNaN(id)) return json({ ok: false, error: 'invalid id' }, 400);

  try {
    await ready();
    const db = getDb();
    const res = await db.execute({
      sql: 'SELECT status, result FROM bot_commands WHERE id = ? LIMIT 1',
      args: [id],
    });

    if (!res.rows.length) return json({ ok: false, error: 'not found' }, 404);
    const row = res.rows[0];

    return json({ ok: true, status: row.status, result: row.result });
  } catch (e) {
    console.error('[admin/command:id] gagal:', (e && e.message) || e);
    return json({ ok: false, error: 'Gagal membaca status perintah.' }, 503);
  }
}
