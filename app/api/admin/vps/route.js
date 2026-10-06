import { getAdminSession, getSession } from '../../../lib/session';
import { json } from '../../../lib/api-helpers';
import { panggilVps, vpsTersedia } from '../../../lib/vpsBridge';

export const dynamic = 'force-dynamic';
// FIX 2026-10-06: probe agent kini RETRY 3x saat bot baru start (worst-case
// ~9,5 dtk: 3x timeout 2 dtk + 2x jeda 1 dtk + sampling CPU 1 dtk). Naikkan
// batas durasi fungsi supaya respons tidak dipotong di tengah jalan.
export const maxDuration = 30;

// ==========================================
// /api/admin/vps  —  kontrol VPS via AGENT (fallback: bot)
// ==========================================
// GET  -> status VPS (CPU/RAM/uptime/disk) + status bot (+ responsif?)
// POST -> kontrol bot { aksi: 'restart'|'stop'|'start' }
//
// FIX 2026-10-05: dulu route ini selalu lewat BOT - kalau bot beku, restart
// dari web mustahil (request nyangkut). Sekarang lewat AGENT mandiri dulu
// (nexo-agent.service di VPS, hidup di cgroup sendiri).
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

export async function GET() {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  if (!vpsTersedia()) return belum();
  const d = await panggilVps('/vps/status', 'GET');
  return json(d);
}

export async function POST(request) {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  if (!vpsTersedia()) return belum();
  let body;
  try { body = await request.json(); } catch { body = null; }
  const aksi = String(body?.aksi || '');
  // 'force' = restart paksa (SIGKILL + start) untuk bot yang beku.
  if (!['restart', 'stop', 'start', 'force'].includes(aksi)) return json({ ok: false, error: 'aksi tidak valid' }, 400);
  // BUGFIX KRITIS 2026-10-06 (laporan pemilik: "restart di web beku mulu,
  // udah restart paksa dan restart biasa"):
  //   Dulu baris ini menulis `{ aksi, aktor }` padahal variabelnya bernama
  //   `actor` -> ReferenceError -> POST SELALU 500 -> perintah restart TIDAK
  //   PERNAH sampai ke VPS. Tombol Mulai/Restart/Restart Paksa/Hentikan di
  //   panel diam-diam tidak berfungsi sejak panel dibuat.
  const d = await panggilVps('/vps/kontrol', 'POST', { aksi, aktor: actor });
  return json(d);
}
