import { verifyBearer, json, ready } from '../../../lib/api-helpers';
import { siarkanBroadcast } from '../../../lib/broadcast';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/bot/broadcast - siarkan notif ke SEMUA user (bell + push perangkat)
// ==========================================
// DIPANGGIL BOT (fix audit notif 2026-10-06): saat admin Discord membuat
// flash sale / memasang pengumuman, bot memanggil endpoint ini supaya user
// dapat notifikasi di PERANGKAT walau web sedang ditutup. Sebelumnya notif
// flash sale/pengumuman hanya dihitung on-the-fly saat user membuka web ->
// user yang tidak membuka web tidak pernah tahu.
export async function POST(request) {
  const denied = verifyBearer(request, 'write');
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid json' }, 400); }

  const type = String(body?.type || 'info');
  const title = String(body?.title || '').trim();
  const text = String(body?.text || '').trim();
  const url = String(body?.url || '/me');
  if (!title) return json({ ok: false, error: 'title wajib' }, 400);

  await ready();
  const hasil = await siarkanBroadcast({ type, title, body: text, url, tag: 'nexo-broadcast' });
  return json({ ok: true, ...hasil });
}
