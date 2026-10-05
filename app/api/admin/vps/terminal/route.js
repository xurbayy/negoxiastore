import { getAdminSession, getSession } from '../../../../lib/session';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/vps/terminal  —  proxy terminal whitelist ke BOT
// ==========================================
// GET  -> daftar perintah yang diizinkan (id + label)
// POST -> jalankan satu perintah { perintah: id }
//
// KEAMANAN: web TIDAK pernah mengirim string shell. Hanya ID dari whitelist
// yang dikenali bot. Bot mengeksekusi execFile dengan argumen tetap.
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

async function panggilBot(path, method, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    return await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'network error') };
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  if (!URL_BASE) return json({ ok: false, error: 'BOT_API_URL belum diset' }, 503);
  const d = await panggilBot('/vps/terminal', 'GET');
  return json(d);
}

export async function POST(request) {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  if (!URL_BASE) return json({ ok: false, error: 'BOT_API_URL belum diset' }, 503);
  let body;
  try { body = await request.json(); } catch { body = null; }
  const id = String(body?.perintah || '');
  if (!id) return json({ ok: false, error: 'perintah kosong' }, 400);
  const d = await panggilBot('/vps/terminal', 'POST', { perintah: id });
  return json(d);
}
