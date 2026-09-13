import { verifyBearer, json, ready } from '../../../lib/api-helpers';
import { getDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const denied = verifyBearer(request);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid json' }, 400); }
  
  const { userId, type, title, text } = body;
  if (!userId || !type || !title) return json({ ok: false, error: 'missing fields' }, 400);

  await ready();
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO web_notifications (discord_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [String(userId), String(type), String(title), text ? String(text) : null, Date.now()],
  });

  return json({ ok: true });
}
