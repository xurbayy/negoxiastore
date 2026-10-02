import { getSession, getAdminSession } from '../../../../lib/session';
import { cekModelAda } from '../../../../lib/groq';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/cek-model - validasi model ada di provider
// ==========================================
//
// Permintaan pemilik (2026-10-02): "kasih validasi kalo model itu gada di
// providernya, jadi bisa di-test dulu model ini ada apa engga".
//
// GET ?provider=<slug>&model=<nama model>
//   -> { ok, ada, tersedia[], mirip[], label }
// Tidak memanggil chat completion - hanya membaca daftar model provider
// (murah, tidak memakan kuota token).
async function izinkan() {
  const admin = await getAdminSession();
  if (admin) return true;
  const session = await getSession();
  if (!session) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(session.discordId);
}

export async function GET(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || '';
  const model = url.searchParams.get('model') || '';
  const hasil = await cekModelAda(provider, model);
  return json(hasil);
}
