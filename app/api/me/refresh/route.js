import { getSession } from '../../../lib/session';
import { getDb } from '../../../lib/db';
import { json, ready } from '../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// POST /api/me/refresh - minta bot kirim ulang profil (data_requests).
export async function POST() {
  const session = await getSession();
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  await ready();
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, ?, ?)',
    args: [session.discordId, 'pending', Date.now()],
  });

  return json({ ok: true });
}
