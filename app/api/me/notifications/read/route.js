import { getSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/me/notifications/read
// Body: { id: "p:12" } utk satu notif personal, atau { all: true } utk semua.
export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { body = null; }

  await schemaReady();
  const db = getDb();
  const now = Date.now();

  if (body?.all) {
    await db.execute({
      sql: 'UPDATE web_notifications SET read_at = ? WHERE discord_id = ? AND read_at IS NULL',
      args: [now, session.discordId],
    });
    // Broadcast (NULL): tandai terbaca PER USER (audit B1), sama seperti jalur id.
    const bcasts = await db.execute('SELECT id FROM web_notifications WHERE discord_id IS NULL');
    for (const b of bcasts.rows) {
      await db.execute({
        sql: 'INSERT INTO notif_reads (discord_id, notification_id, read_at) VALUES (?, ?, ?) ON CONFLICT(discord_id, notification_id) DO NOTHING',
        args: [session.discordId, Number(b.id), now],
      });
    }
    return NextResponse.json({ ok: true });
  }

  const id = String(body?.id || '');

  // Notifikasi TURUNAN (d:...) -> tutup permanen per user di DB.
  // Bukan localStorage lagi: hilang = hilang, walau ganti HP/browser di
  // bersih/in, atau bot & web mati-nyala. Notifikasi baru (key berbeda) tetap muncul.
  if (id.startsWith('d:')) {
    const key = id.slice(0, 120);
    await db.execute({
      sql: 'INSERT INTO web_notif_dismiss (discord_id, key, dismissed_at) VALUES (?, ?, ?) ON CONFLICT(discord_id, key) DO NOTHING',
      args: [session.discordId, key, now],
    });
    return NextResponse.json({ ok: true });
  }

  const numId = Number(id.replace('p:', ''));
  if (!Number.isFinite(numId)) return NextResponse.json({ ok: false, error: 'id tidak valid' }, { status: 400 });

  const target = await db.execute({
    sql: 'SELECT id, discord_id FROM web_notifications WHERE id = ? AND (discord_id = ? OR discord_id IS NULL)',
    args: [numId, session.discordId],
  });
  const row = target.rows[0];
  if (!row) return NextResponse.json({ ok: false, error: 'notif tidak ditemukan' }, { status: 404 });

  if (row.discord_id == null) {
    // Broadcast: read per-user di notif_reads - tidak menyentuh baris aslinya
    // (dulu: UPDATE global -> satu klik mematikan broadcast untuk SEMUA user).
    await db.execute({
      sql: 'INSERT INTO notif_reads (discord_id, notification_id, read_at) VALUES (?, ?, ?) ON CONFLICT(discord_id, notification_id) DO NOTHING',
      args: [session.discordId, numId, now],
    });
  } else {
    await db.execute({
      sql: 'UPDATE web_notifications SET read_at = ? WHERE id = ? AND discord_id = ?',
      args: [now, numId, session.discordId],
    });
  }
  return NextResponse.json({ ok: true });
}
