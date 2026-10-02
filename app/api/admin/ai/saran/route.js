import { getSession, getAdminSession } from '../../../../lib/session';
import { getLatestSnapshot } from '../../../../lib/snapshot';
import { saranDinamis, SARAN_DISKUSI } from '../../../../lib/aiKonteks';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/saran - saran pertanyaan DINAMIS dari kondisi data
// ==========================================
//
// Dipakai panel AI supaya daftar saran SELALU menyesuaikan kondisi terkini
// (bukan statis). Ringan: hanya baca snapshot + susun saran, tanpa memanggil
// AI. Dipisah dari /ai supaya panel tetap dapat saran walau /ai bermasalah.
async function izinkan() {
  const admin = await getAdminSession();
  if (admin) return true;
  const session = await getSession();
  if (!session) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(session.discordId);
}

export async function GET() {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  let saran = [];
  try {
    const snap = await getLatestSnapshot();
    saran = saranDinamis(snap).map((s) => ({ id: s.id, label: s.label, tanya: s.tanya }));
  } catch { /* gagal - pakai umum */ }
  if (!saran.length) saran = SARAN_DISKUSI.map((s) => ({ id: s.id, label: s.label, tanya: s.tanya }));
  return json({ ok: true, saran });
}
