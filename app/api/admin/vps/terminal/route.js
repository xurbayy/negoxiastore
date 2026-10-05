import { getAdminSession, getSession } from '../../../../lib/session';
import { json } from '../../../../lib/api-helpers';
import { panggilVps, vpsTersedia } from '../../../../lib/vpsBridge';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/vps/terminal  —  proxy terminal whitelist ke AGENT/BOT
// ==========================================
// GET  -> daftar perintah yang diizinkan (id + label)
// POST -> jalankan satu perintah { perintah: id }
//
// KEAMANAN: web TIDAK pernah mengirim string shell. Hanya ID dari whitelist
// yang dikenali VPS. VPS mengeksekusi execFile dengan argumen tetap.
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

export async function GET() {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  if (!vpsTersedia()) return json({ ok: false, error: 'BOT_API_URL belum diset' }, 503);
  const d = await panggilVps('/vps/terminal', 'GET');
  return json(d);
}

export async function POST(request) {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  if (!vpsTersedia()) return json({ ok: false, error: 'BOT_API_URL belum diset' }, 503);
  let body;
  try { body = await request.json(); } catch { body = null; }
  const id = String(body?.perintah || '');
  if (!id) return json({ ok: false, error: 'perintah kosong' }, 400);
  const d = await panggilVps('/vps/terminal', 'POST', { perintah: id, aktor: actor });
  return json(d);
}
