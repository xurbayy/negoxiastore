import { getAdminSession, getSession } from '../../../../lib/session';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/vps/log  —  cuplikan log bot (console live)
// ==========================================
// GET ?n=60 -> N baris terakhir journalctl bot, sudah dirapikan.
const URL_BASE = (process.env.BOT_API_URL || '').replace(/\/+$/, '');
const KEY = process.env.BOT_API_KEY || '';

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
  if (!URL_BASE) return json({ ok: false, error: 'BOT_API_URL belum diset' }, 503);
  const n = new URL(request.url).searchParams.get('n') || '60';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${URL_BASE}/vps/log?n=${encodeURIComponent(n)}`, {
      headers: { Authorization: `Bearer ${KEY}` },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    return json(await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` })));
  } catch (e) {
    return json({ ok: false, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'network error') });
  } finally {
    clearTimeout(t);
  }
}
