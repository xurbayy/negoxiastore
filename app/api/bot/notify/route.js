import { verifyBearer, json, ready } from '../../../lib/api-helpers';
import { sisipNotif } from '../../../lib/notif';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const denied = verifyBearer(request, 'write');
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid json' }, 400); }
  
  const { userId, type, title, text } = body;
  if (!userId || !type || !title) return json({ ok: false, error: 'missing fields' }, 400);

  await ready();
  // Lewat helper terpusat: sisip bell + kirim push perangkat (kalau dinyalakan).
  await sisipNotif({ userId, type, title, body: text });

  return json({ ok: true });
}
