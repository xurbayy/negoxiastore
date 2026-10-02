import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { getLatestSnapshot } from '../../../../lib/snapshot';
import { saranDinamis, SARAN_DISKUSI, susunKonteks } from '../../../../lib/aiKonteks';
import { tanyaGroq } from '../../../../lib/groq';
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
  // segar=1: bypass saran agen, pakai snapshot real-time.
  const segar = url.searchParams.get('segar') === '1';
  // ai=1: MINTA AI GENERATE saran (paling relevan, tapi pakai token + delay).
  const mintaAI = url.searchParams.get('ai') === '1';
  const provider = url.searchParams.get('provider') || undefined;
  const model = url.searchParams.get('model') || undefined;

  // 0) AI GENERATE saran dari kondisi terkini (paling relevan).
  if (mintaAI) {
    try {
      const snap = await getLatestSnapshot();
      if (snap) {
        const konteks = await susunKonteks(snap, {}, { ringkas: true });
        const hasil = await tanyaGroq([
          { role: 'system', content: 'Kamu asisten analisis NEXO. Tugas: usulkan pertanyaan analisis PALING relevan dengan kondisi data saat ini. Bahasa Indonesia santai.' },
          { role: 'user', content: 'DATA NEXO SAAT INI:\n\n' + konteks },
          { role: 'user', content: [
            'Berdasarkan data di atas, usulkan 8 PERTANYAAN analisis yang PALING relevan',
            'dan MENDESAK untuk pemilik bot saat ini. Fokus ke masalah nyata yang terlihat di data',
            '(server kosong, churn, item mati, anomali ekonomi, pola mencurigakan, dll).',
            '',
            'Format WAJIB - tepat 8 baris, tiap baris satu pertanyaan, tanpa nomor/bullet:',
            'Pertanyaan1?',
            'Pertanyaan2?',
            '...',
            '',
            'Aturan: maksimal 70 karakter per pertanyaan. Langsung ke inti. Jangan umum/basi.',
          ].join('\n') },
        ], { provider, model, maxTokens: 700, kecerdasan: 7 });
        if (hasil.ok && hasil.teks) {
          const baris = String(hasil.teks)
            .split('\n')
            .map((s) => s.replace(/^\s*[-*\d.)\]]+\s*/, '').trim())
            .filter((s) => s.length > 8 && s.endsWith('?'))
            .slice(0, 8);
          if (baris.length >= 3) {
            return json({
              ok: true,
              sumber: 'ai',
              saran: baris.map((s, i) => ({ id: `ai-${i}`, label: s.slice(0, 70), tanya: s, sumber: 'ai' })),
            });
          }
        }
      }
    } catch { /* gagal AI -> lanjut fallback dinamis */ }
  }

  // 1) SARAN DARI AGEN (hasil cek agen sebelumnya) - kecuali mode segar.
  if (!segar) {
    try {
      await schemaReady();
      const db = getDb();
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
  }

  // 2) SARAN DINAMIS dari snapshot (real-time) - termasuk mode segar.
  try {
    const snap = await getLatestSnapshot();
    const saran = saranDinamis(snap).map((s) => ({ id: s.id, label: s.label, tanya: s.tanya, sumber: 'snapshot' }));
    if (saran.length) return json({ ok: true, saran, sumber: segar ? 'snapshot-segar' : 'snapshot' });
  } catch { /* lanjut */ }

  // 3) Fallback terakhir: statis.
  return json({
    ok: true,
    sumber: 'statis',
    saran: SARAN_DISKUSI.map((s) => ({ id: s.id, label: s.label, tanya: s.tanya, sumber: 'statis' })),
  });
}
