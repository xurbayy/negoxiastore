import { getSession, getAdminSession } from '../../../../lib/session';
import { ujiModelProvider } from '../../../../lib/ujiModel';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ==========================================
// /api/admin/ai/uji-model - uji nyata apakah model bisa dipakai
// ==========================================
//
// Permintaan pemilik 2026-10-02: "sebelum list semua model, cek dulu bisa apa
// engga. Yang ga bisa ga usah ditampilkan."
//
// POST { provider, models: ["id1","id2",...] }
//   -> { ok, hasil: [{ model, ok, alasan, cached }] }
//
// Hanya dijalankan saat pemilik menekan tombol (boros kuota sedikit).
async function izinkan() {
  const admin = await getAdminSession();
  if (admin) return true;
  const session = await getSession();
  if (!session) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(session.discordId);
}

export async function POST(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const provider = String(body?.provider || '').trim();
  const models = Array.isArray(body?.models) ? body.models : [];
  if (!provider || !models.length) return json({ ok: false, error: 'provider & models wajib.' }, 400);
  const hasil = await ujiModelProvider(provider, models);
  return json(hasil);
}
