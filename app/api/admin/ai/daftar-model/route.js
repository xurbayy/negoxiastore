import { getSession, getAdminSession } from '../../../../lib/session';
import { daftarModelProvider } from '../../../../lib/groq';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/daftar-model - daftar model provider (+ tandai gratis)
// ==========================================
//
// Permintaan pemilik 2026-10-02: "kalo gw nambahin providernya terus bakal
// muncul semua nama modelnya yang free saja".
//
// GET ?provider=<slug>&gratis=1  -> hanya model gratis
//   -> { ok, gratis[], semua[], label, jumlah, jumlahGratis }
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
  const hasil = await daftarModelProvider(provider);
  if (!hasil.ok) return json(hasil);
  const hanyaGratis = url.searchParams.get('gratis') === '1';
  // Batasi jumlah yang dikirim supaya payload tidak membengkak.
  const kirim = hanyaGratis ? hasil.gratis.slice(0, 300) : (hasil.semua || []).slice(0, 300);
  return json({
    ok: true,
    label: hasil.label,
    urlDicek: hasil.urlDicek,
    jumlah: hasil.jumlah,
    jumlahGratis: hasil.jumlahGratis,
    models: kirim,
  });
}
