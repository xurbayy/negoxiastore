import { getSession } from '../../../lib/session';
import { json } from '../../../lib/api-helpers';
import { getDb, schemaReady } from '../../../lib/db';
import { pushTersedia, vapidPublic, simpanLangganan, hapusLangganan, setPref, pushAktif, jumlahPerangkat } from '../../../lib/pushNotif';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/me/push  —  kelola notifikasi push perangkat
// ==========================================
// GET  -> status: tersedia? aktif? jumlah perangkat? + VAPID public key
// POST -> { aksi: 'subscribe', subscription }  daftarkan perangkat (toggle ON)
//         { aksi: 'unsubscribe', endpoint? }    hapus langganan
//         { aksi: 'matikan' }                   toggle OFF (hapus semua)
// Wajib login (getSession) - hanya user sendiri.

export async function GET() {
  const session = await getSession();
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  await schemaReady();
  const [aktif, jml] = await Promise.all([pushAktif(session.discordId), jumlahPerangkat(session.discordId)]);
  return json({
    ok: true,
    tersedia: pushTersedia(),
    aktif,
    perangkat: jml,
    vapid: vapidPublic(),
  });
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  await schemaReady();

  let body;
  try { body = await request.json(); } catch { body = null; }
  const aksi = String(body?.aksi || '');

  try {
    if (aksi === 'subscribe') {
      if (!pushTersedia()) return json({ ok: false, error: 'Push belum aktif di server (VAPID belum diset).' }, 503);
      await simpanLangganan(session.discordId, body?.subscription, request.headers.get('user-agent'));
      await setPref(session.discordId, true);
      const jml = await jumlahPerangkat(session.discordId);
      return json({ ok: true, aktif: true, perangkat: jml });
    }
    if (aksi === 'unsubscribe') {
      await hapusLangganan(session.discordId, body?.endpoint || null);
      const jml = await jumlahPerangkat(session.discordId);
      if (jml === 0) await setPref(session.discordId, false);
      return json({ ok: true, aktif: jml > 0, perangkat: jml });
    }
    if (aksi === 'matikan') {
      await setPref(session.discordId, false);
      return json({ ok: true, aktif: false, perangkat: 0 });
    }
    return json({ ok: false, error: 'aksi tidak dikenal' }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
