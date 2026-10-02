import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { getLatestSnapshot } from '../../../../lib/snapshot';
import { saranDinamis, SARAN_DISKUSI } from '../../../../lib/aiKonteks';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/saran - saran pertanyaan untuk kartu panel
// ==========================================
//
// PRIORITAS (permintaan pemilik 2026-10-02): saran DIAMBIL DARI HASIL AGEN
// (ai_agen_saran) - jadi benar-benar berbasis cek agen (kode + data), bukan
// daftar statis. Kalau agen belum pernah jalan, pakai saran dinamis dari
// snapshot, lalu fallback statis.
//
// GET            -> saran peran 'umum' (untuk mode diskusi biasa)
// GET ?peran=bug -> saran khusus peran itu (dari agen)
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
  const peran = (url.searchParams.get('peran') || 'umum').trim().toLowerCase();

  // 1) SARAN DARI AGEN (prioritas utama).
  try {
    await schemaReady();
    const db = getDb();
    // Ambil saran terbaru peran ini (maks 8 terakhir, masih relevan).
    const r = await db.execute({
      sql: 'SELECT saran, dibuat_at FROM ai_agen_saran WHERE peran = ? ORDER BY dibuat_at DESC LIMIT 8',
      args: [peran],
    });
    const dariAgen = (r.rows || []).map((x, i) => ({
      id: `agen-${peran}-${i}`,
      label: String(x.saran).slice(0, 60),
      tanya: String(x.saran),
      sumber: 'agen',
    }));
    if (dariAgen.length) return json({ ok: true, saran: dariAgen, sumber: 'agen' });
  } catch { /* lanjut ke fallback */ }

  // 2) Fallback: saran dinamis dari snapshot (untuk peran umum).
  if (peran === 'umum') {
    let saran = [];
    try {
      const snap = await getLatestSnapshot();
      saran = saranDinamis(snap).map((s) => ({ id: s.id, label: s.label, tanya: s.tanya, sumber: 'snapshot' }));
    } catch { /* lanjut */ }
    if (saran.length) return json({ ok: true, saran, sumber: 'snapshot' });
  }

  // 3) Fallback terakhir: statis.
  return json({
    ok: true,
    sumber: 'statis',
    saran: SARAN_DISKUSI.map((s) => ({ id: s.id, label: s.label, tanya: s.tanya, sumber: 'statis' })),
  });
}
