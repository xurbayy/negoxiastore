import { getAdminSession, getSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { json } from '../../../../lib/api-helpers';
import { pushTersedia, vapidPublic } from '../../../../lib/pushNotif';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/push/toggle — nyalakan/matikan notif perangkat ADMIN
// ==========================================
// GET  -> { tersedia, aktif, perangkat, vapid } (status perangkat INI)
// POST -> { aksi: 'aktifkan', subscription }  daftarkan perangkat ini
//         { aksi: 'matikan', endpoint? }        hapus langganan
//
// BEDA dari /api/me/push (user): perangkat admin disimpan di
// web.admin_push_devices (terpisah) supaya notif ADMIN (NEXO Pass, alert VPS,
// laporan agen) TIDAK ikut terkirim ke semua user, dan sebaliknya. Perangkat
// tetap di-register ke push_subscriptions juga supaya mekanisme kirim push
// (kirimPush) yang sudah ada bisa dipakai apa adanya.
async function aktor() {
  const admin = await getAdminSession();
  if (admin) return `admin:${admin.adminUsername}`;
  const session = await getSession();
  if (session) {
    const ids = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.includes(session.discordId)) return session.discordId;
  }
  return null;
}

// CATATAN (fix 2026-10-06): route ini DULU mencoba CREATE TABLE tiap request.
// Produksi lewat proxy bot yang MEMBLOKIR DDL -> percobaan gagal + membanjiri
// log VPS ("query DITOLAK (DDL)"). Tabel web.admin_push_devices sudah
// dikelola migrasi VPS (owner role nexo) - route sekarang tidak membuat
// tabel, hanya mentoleransi tabel belum ada.

// discord_id penanda admin yang menyalakan toggle di panel.
async function ambilUserId() {
  const session = await getSession();
  return session?.discordId || null;
}

export async function GET(request) {
  if (!(await aktor())) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  const endpoint = new URL(request.url).searchParams.get('endpoint') || '';
  let aktif = false;
  try {
    if (endpoint) {
      const r = await db.execute({ sql: 'SELECT 1 FROM web.admin_push_devices WHERE endpoint = ?', args: [endpoint] });
      aktif = Boolean(r.rows?.length);
    } else {
      const r = await db.execute('SELECT COUNT(*) AS c FROM web.admin_push_devices');
      aktif = Number(r.rows?.[0]?.c || 0) > 0;
    }
  } catch { /* tabel belum ada -> anggap belum aktif */ }
  return json({ ok: true, tersedia: pushTersedia(), aktif, vapid: vapidPublic() });
}

export async function POST(request) {
  if (!(await aktor())) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();

  let body;
  try { body = await request.json(); } catch { body = null; }
  const aksi = String(body?.aksi || '');

  if (aksi === 'aktifkan') {
    if (!pushTersedia()) return json({ ok: false, error: 'Push belum aktif di server (VAPID belum diset).' }, 503);
    const sub = body?.subscription;
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) return json({ ok: false, error: 'langganan tidak lengkap' }, 400);
    const userId = await ambilUserId();

    // Simpan ke push_subscriptions juga (dipakai kirimPush) - pakai discord_id
    // admin supaya kirimPush(id) menemukannya.
    await db.execute({
      sql: `INSERT INTO push_subscriptions (endpoint, discord_id, p256dh, auth, ua, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET discord_id = excluded.discord_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      args: [endpoint, String(userId || 'admin'), p256dh, auth, 'admin-panel', Date.now()],
    });
    // Tandai sebagai perangkat ADMIN.
    await db.execute({
      sql: `INSERT INTO web.admin_push_devices (endpoint, discord_id, p256dh, auth, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET discord_id = excluded.discord_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      args: [endpoint, String(userId || 'admin'), p256dh, auth, Date.now()],
    });
    return json({ ok: true, aktif: true });
  }

  if (aksi === 'matikan') {
    const endpoint = String(body?.endpoint || '');
    if (endpoint) {
      await db.execute({ sql: 'DELETE FROM web.admin_push_devices WHERE endpoint = ?', args: [endpoint] }).catch(() => {});
      await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?', args: [endpoint] }).catch(() => {});
    }
    return json({ ok: true, aktif: false });
  }

  return json({ ok: false, error: 'aksi tidak dikenal' }, 400);
}
