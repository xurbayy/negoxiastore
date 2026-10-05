import { getAdminSession, getSession } from '../../../lib/session';
import { json } from '../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/vps  —  proxy ke endpoint kontrol VPS di BOT
// ==========================================
// GET  -> status VPS (CPU/RAM/uptime/disk) + status bot
// POST -> kontrol bot { aksi: 'restart'|'stop'|'start' }
//
// Web TIDAK bisa bicara langsung ke VPS (bot yang punya akses systemctl).
// Route ini meneruskan permintaan ke bot lewat HTTPS (BOT_API_URL).
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

function belum() {
  return json({ ok: false, error: 'BOT_API_URL belum diset di lingkungan ini. Kontrol VPS butuh koneksi ke bot.' }, 503);
}

async function panggilBot(path, method, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const d = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    return d;
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'network error') };
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  if (!URL_BASE) return belum();
  const d = await panggilBot('/vps/status', 'GET');
  return json(d);
}

export async function POST(request) {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  if (!URL_BASE) return belum();
  let body;
  try { body = await request.json(); } catch { body = null; }
  const aksi = String(body?.aksi || '');
  if (!['restart', 'stop', 'start'].includes(aksi)) return json({ ok: false, error: 'aksi tidak valid' }, 400);
  const d = await panggilBot('/vps/kontrol', 'POST', { aksi });
  return json(d);
}
