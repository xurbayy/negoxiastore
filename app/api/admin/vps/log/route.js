import { getAdminSession, getSession } from '../../../../lib/session';
import { json } from '../../../../lib/api-helpers';
import { panggilVps, vpsTersedia } from '../../../../lib/vpsBridge';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/vps/log  —  cuplikan log bot (console live)
// ==========================================
// GET ?n=60 -> N baris terakhir journalctl bot, sudah dirapikan.
// Via AGENT dulu (tetap jalan walau bot beku), fallback ke bot.
async function authorize() {
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
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  if (!vpsTersedia()) return json({ ok: false, error: 'BOT_API_URL belum diset' }, 503);
  const n = new URL(request.url).searchParams.get('n') || '60';
  const d = await panggilVps(`/vps/log?n=${encodeURIComponent(n)}`, 'GET');
  return json(d);
}
