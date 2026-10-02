import { getSession, getAdminSession } from '../../../../lib/session';
import { cekUsageProvider } from '../../../../lib/groq';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/usage - info pemakaian / kuota provider
// ==========================================
//
// Permintaan pemilik 2026-10-02: "gw mau ada usage setiap provider jadi tau ini
// udah limit apa engga".
//
// GET ?provider=<slug>
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
  const hasil = await cekUsageProvider(provider);
  return json(hasil);
}
