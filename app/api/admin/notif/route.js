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
//
// CATATAN (fix 2026-10-06): route ini DULU mencoba CREATE TABLE IF NOT EXISTS
// tiap request. Karena produksi lewat proxy bot yang MEMBLOKIR DDL, percobaan
// itu gagal senyap tapi MEMBANJIRI log VPS ("query DITOLAK (DDL)" berkali-
// kali per menit). Tabel sudah dikelola migrasi VPS (owner role nexo) - route
// sekarang TIDAK membuat tabel, hanya mentoleransi tabel belum ada.
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

export async function GET(request) {
  const actor = await boleh();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  const n = Math.max(1, Math.min(200, Number(new URL(request.url).searchParams.get('n') || 50)));
  try {
    const r = await db.execute({
      sql: 'SELECT id, tipe, judul, isi, url, read_at, created_at FROM web.admin_notifications ORDER BY id DESC LIMIT ?',
      args: [n],
    });
    const notif = (r.rows || []).map((x) => ({
      id: Number(x.id), tipe: x.tipe, judul: x.judul, isi: x.isi || '', url: x.url || '/admin',
      read: x.read_at != null, createdAt: Number(x.created_at),
    }));
    return json({ ok: true, notif, belum: notif.filter((x) => !x.read).length });
  } catch {
    // Tabel belum dibuat (migrasi VPS belum jalan / dev lokal) -> kosong.
    return json({ ok: true, notif: [], belum: 0 });
  }
}

export async function PATCH(request) {
  const actor = await boleh();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  const sp = new URL(request.url).searchParams;
  try {
    if (sp.get('all') === '1') {
      await db.execute({ sql: 'UPDATE web.admin_notifications SET read_at = ? WHERE read_at IS NULL', args: [Date.now()] });
    } else {
      const id = Number(sp.get('id'));
      if (!id) return json({ ok: false, error: 'id wajib' }, 400);
      await db.execute({ sql: 'UPDATE web.admin_notifications SET read_at = ? WHERE id = ? AND read_at IS NULL', args: [Date.now(), id] });
    }
  } catch { /* tabel belum ada -> abaikan */ }
  return json({ ok: true });
}

export async function DELETE(request) {
  const actor = await boleh();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  const sp = new URL(request.url).searchParams;
  try {
    if (sp.get('all') === '1') {
      await db.execute('DELETE FROM web.admin_notifications');
    } else {
      const id = Number(sp.get('id'));
      if (!id) return json({ ok: false, error: 'id wajib' }, 400);
      await db.execute({ sql: 'DELETE FROM web.admin_notifications WHERE id = ?', args: [id] });
    }
  } catch { /* tabel belum ada -> abaikan */ }
  return json({ ok: true });
}
