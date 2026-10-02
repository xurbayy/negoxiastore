import { getSession, getAdminSession } from '../../../../lib/session';
import { tesKoneksi } from '../../../../lib/groq';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/tes-koneksi - validasi URL base + API key provider
// ==========================================
//
// Permintaan pemilik 2026-10-02: "full validasi kalo api-nya yang salah juga
// ada". Dipakai tombol "Tes koneksi" di form tambah provider - memastikan URL
// base & API key benar SEBELUM disimpan.
//
// POST { base_url, api_key?, env_key? }
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
  const hasil = await tesKoneksi({
    baseUrl: body?.base_url || '',
    apiKey: body?.api_key || '',
  });
  return json(hasil);
}
