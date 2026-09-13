import { getSession } from '../../lib/session';
import { getDb } from '../../lib/db';
import { json, ready } from '../../lib/api-helpers';
import { rateLimit } from '../../lib/rate-limit';
import { touchActivity } from '../../lib/activity';

export const dynamic = 'force-dynamic';

// POST /api/feedback - user kirim saran/bug/laporan. Disimpan ke web_feedback
// DAN diantrkan ke bot (aksi 'web_feedback') untuk di-post sebagai embed ke
// channel laporan admin di Discord. Rate limit 5x/10 menit per user.
const KINDS = new Set(['Saran', 'Bug', 'Laporan']);

export async function POST(request) {
  const session = await getSession();
  if (!session) return json({ ok: false, reason: 'Login dulu ya biar kami bisa balas.' }, 401);

  if (!rateLimit('fb:' + session.discordId, 5, 10 * 60_000)) {
    return json({ ok: false, reason: 'Terlalu sering kirim. Tunggu sebentar ya.' }, 429);
  }

  let body;
  try { body = await request.json(); } catch { body = null; }
  const kind = KINDS.has(String(body?.kind)) ? String(body.kind) : 'Saran';
  const message = String(body?.message || '').trim().slice(0, 1500);
  const page = String(body?.page || '').slice(0, 60);
  if (message.length < 5) {
    return json({ ok: false, reason: 'Ceritain sedikit lebih detail ya (min. 5 karakter).' }, 400);
  }

  await ready();
  const db = getDb();
  const now = Date.now();
  await db.execute({
    sql: 'INSERT INTO web_feedback (discord_id, username, kind, message, page, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [session.discordId, session.username, kind, message, page, now],
  });

  // Antrekan ke bot -> embed ke channel laporan. Bot yang belum support aksi
  // ini otomatis balas 'rejected' (aman, feedback tetap tersimpan di web).
  await db.execute({
    sql: 'INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
    args: ['web_feedback', JSON.stringify({ userId: session.discordId, username: session.username, kind, message, page }), session.discordId, 'pending', now],
  });
  await touchActivity().catch(() => {});

  return json({ ok: true, message: 'Terkirim! Terima kasih sudah membantu NEXO jadi lebih baik.' });
}
