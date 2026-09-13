import { getSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/me/notifications/dismiss
// Body: { key: "d:flash:item_key" } ATAU { keys: ["d:...", ...] } (bulk).
// Menyimpan PENUTUPAN notifikasi turunan (yang di-compute dari snapshot) ke DB,
// supaya tetap hilang walau user ganti perangkat / browser dibersihkan /
// bot-web restart. Key personal (p:) tidak lewat sini (sudah read_at aslinya).
export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { body = null; }
  const keys = Array.isArray(body?.keys)
    ? body.keys.map((k) => String(k)).filter((k) => k.startsWith('d:') && k.length <= 120).slice(0, 50)
    : typeof body?.key === 'string' && body.key.startsWith('d:') && body.key.length <= 120
      ? [body.key]
      : [];
  if (!keys.length) return NextResponse.json({ ok: false, error: 'key tidak valid' }, { status: 400 });

  await schemaReady();
  const db = getDb();
  const now = Date.now();
  for (const k of keys) {
    await db.execute({
      sql: 'INSERT INTO web_notif_dismiss (discord_id, key, dismissed_at) VALUES (?, ?, ?) ON CONFLICT(discord_id, key) DO NOTHING',
      args: [session.discordId, k, now],
    });
  }
  return NextResponse.json({ ok: true, saved: keys.length });
}

// GET -> daftar key yang sudah ditutup user (buat sinkronisasi antar perangkat)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  await schemaReady();
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT key FROM web_notif_dismiss WHERE discord_id = ?',
    args: [session.discordId],
  });
  return NextResponse.json({ ok: true, keys: res.rows.map((r) => String(r.key)) });
}
