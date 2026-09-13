import { getSession, getAdminSession } from '../../../lib/session';
import { getDb, schemaReady } from '../../../lib/db';
import { getLatestSnapshot } from '../../../lib/snapshot';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TYPES = new Set(['token', 'info', 'event']);

// POST /api/admin/notify - kirim notifikasi personal / broadcast.
// Jalur akses: session admin (username+password) ATAU member di ADMIN_DISCORD_IDS.
// Body: { target: 'all' | discordId, type, title, body?, code? }
// type 'token' WAJIB punya code yang valid (ada di promoCodes snapshot terakhir).
export async function POST(request) {
  let actorId = null;
  const admin = await getAdminSession();
  if (admin) {
    actorId = `admin:${admin.adminUsername}`;
  } else {
    const session = await getSession();
    if (session) {
      const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (adminIds.includes(session.discordId)) actorId = session.discordId;
    }
  }
  if (!actorId) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { body = null; }

  const target = String(body?.target || 'all').trim();
  const type = String(body?.type || '').trim();
  const title = String(body?.title || '').trim();
  const text = String(body?.body || '').trim();
  const code = String(body?.code || '').toUpperCase().trim();

  if (!TYPES.has(type)) {
    return NextResponse.json({ ok: false, error: 'type harus token, info, atau event.' }, { status: 400 });
  }
  if (!title || title.length > 120) {
    return NextResponse.json({ ok: false, error: 'Judul wajib (maks 120 karakter).' }, { status: 400 });
  }
  if (text.length > 500) {
    return NextResponse.json({ ok: false, error: 'Isi maksimal 500 karakter.' }, { status: 400 });
  }
  if (type === 'token' && !code) {
    return NextResponse.json({ ok: false, error: 'Notifikasi token wajib menyertakan kode redeem.' }, { status: 400 });
  }

  // Untuk type token: pastikan kodenya benar-benar ada di promo snapshot
  if (type === 'token') {
    const snap = await getLatestSnapshot();
    const valid = (snap?.promoCodes || []).some((p) => String(p.code).toUpperCase() === code);
    if (!valid) {
      return NextResponse.json({ ok: false, error: `Kode ${code} tidak ditemukan di data terakhir bot.` }, { status: 400 });
    }
  }

  // target 'all' -> broadcast (discord_id NULL); selain itu wajib format discord ID
  let discordId = null;
  if (target !== 'all') {
    if (!/^\d{5,25}$/.test(target)) {
      return NextResponse.json({ ok: false, error: 'Target harus "all" atau Discord User ID angka.' }, { status: 400 });
    }
    discordId = target;
  }

  await schemaReady();
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO web_notifications (discord_id, type, title, body, code, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [discordId, type, title, text || null, type === 'token' ? code : null, Date.now()],
  });

  return NextResponse.json({ ok: true, target: target === 'all' ? 'semua user' : discordId });
}
