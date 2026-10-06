import { verifyBearer, json, ready } from '../../../lib/api-helpers';
import { sisipNotifAdmin } from '../../../lib/adminNotif';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/bot/admin-alert — alert ke PANEL ADMIN (bell + push perangkat admin)
// ==========================================
// DIPANGGIL BOT (permintaan pemilik 2026-10-06): monitor VPS (CPU/RAM/disk
// >=80%) dan kejadian penting lain mengirim alert ke panel admin. Berbeda
// dari /api/bot/notify (user) & /api/bot/broadcast (semua user) - ini khusus
// panel admin, target = perangkat admin yang menyalakan toggle.
export async function POST(request) {
  const denied = verifyBearer(request, 'write');
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid json' }, 400); }
  const tipe = String(body?.tipe || 'info');
  const judul = String(body?.judul || '').trim();
  const isi = String(body?.isi || '').trim();
  const url = String(body?.url || '/admin');
  if (!judul) return json({ ok: false, error: 'judul wajib' }, 400);

  await ready();
  const hasil = await sisipNotifAdmin({ tipe, judul, isi, url, tag: 'nexo-admin-' + tipe });
  return json({ ok: true, ...hasil });
}
