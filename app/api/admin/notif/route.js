import { getAdminSession, getSession } from '../../../lib/session';
import { getDb, schemaReady } from '../../../lib/db';
import { json } from '../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/notif — notifikasi panel admin (pintar)
// ==========================================
// GET    ?n=50            -> daftar notif admin terbaru + jumlah belum dibaca
// PATCH  ?id=N            -> tandai satu sudah dibaca
// PATCH  ?all=1           -> tandai semua sudah dibaca
// DELETE ?id=N            -> hapus satu
// DELETE ?all=1           -> bersihkan semua
//
// Sumber: web.admin_notifications (tabel terpisah dari notif user).
// Isi: pembelian NEXO Pass, alert VPS (CPU/RAM/disk >=80%), laporan agen.
async function boleh() {
  const admin = await getAdminSession();
  if (admin) return `admin:${admin.adminUsername}`;
  const session = await getSession();
  if (session) {
    const ids = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.includes(session.discordId)) return session.discordId;
  }
  return null;
}

let _siap = null;
async function pastikanTabel(db) {
  if (_siap) return _siap;
  _siap = (async () => {
    await db.execute(`CREATE TABLE IF NOT EXISTS web.admin_notifications (
      id          BIGSERIAL PRIMARY KEY,
      tipe        TEXT NOT NULL DEFAULT 'info',
      judul       TEXT NOT NULL,
      isi         TEXT,
      url         TEXT,
      read_at     BIGINT,
      created_at  BIGINT NOT NULL
    )`).catch(() => {});
    await db.execute(`CREATE TABLE IF NOT EXISTS web.admin_push_devices (
      endpoint    TEXT PRIMARY KEY,
      discord_id  TEXT NOT NULL,
      p256dh      TEXT,
      auth        TEXT,
      created_at  BIGINT NOT NULL
    )`).catch(() => {});
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_admin_notif_created ON web.admin_notifications (created_at DESC)`).catch(() => {});
  })();
  return _siap;
}

export async function GET(request) {
  const actor = await boleh();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  await pastikanTabel(db);

  const n = Math.max(1, Math.min(200, Number(new URL(request.url).searchParams.get('n') || 50)));
  const r = await db.execute({
    sql: 'SELECT id, tipe, judul, isi, url, read_at, created_at FROM web.admin_notifications ORDER BY id DESC LIMIT ?',
    args: [n],
  });
  const notif = (r.rows || []).map((x) => ({
    id: Number(x.id), tipe: x.tipe, judul: x.judul, isi: x.isi || '', url: x.url || '/admin',
    read: x.read_at != null, createdAt: Number(x.created_at),
  }));
  const belum = notif.filter((x) => !x.read).length;
  return json({ ok: true, notif, belum });
}

export async function PATCH(request) {
  const actor = await boleh();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  await pastikanTabel(db);
  const sp = new URL(request.url).searchParams;
  if (sp.get('all') === '1') {
    await db.execute({ sql: 'UPDATE web.admin_notifications SET read_at = ? WHERE read_at IS NULL', args: [Date.now()] });
    return json({ ok: true });
  }
  const id = Number(sp.get('id'));
  if (!id) return json({ ok: false, error: 'id wajib' }, 400);
  await db.execute({ sql: 'UPDATE web.admin_notifications SET read_at = ? WHERE id = ? AND read_at IS NULL', args: [Date.now(), id] });
  return json({ ok: true });
}

export async function DELETE(request) {
  const actor = await boleh();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  await pastikanTabel(db);
  const sp = new URL(request.url).searchParams;
  if (sp.get('all') === '1') {
    await db.execute('DELETE FROM web.admin_notifications').catch(() => {});
    return json({ ok: true });
  }
  const id = Number(sp.get('id'));
  if (!id) return json({ ok: false, error: 'id wajib' }, 400);
  await db.execute({ sql: 'DELETE FROM web.admin_notifications WHERE id = ?', args: [id] });
  return json({ ok: true });
}
