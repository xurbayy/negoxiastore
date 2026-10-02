import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { getLatestSnapshot } from '../../../../lib/snapshot';
import { susunKonteks } from '../../../../lib/aiKonteks';
import { tanyaGroq } from '../../../../lib/groq';
import { PROMPT_AGEN, uraikanUsulan, validasiUsulan, risikoAksi } from '../../../../lib/aiAgen';
import { json } from '../../../../lib/api-helpers';
import { hariIniWib } from '../../../../lib/waktuWib';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ==========================================
// /api/admin/ai/agen - Agen AI (laporan + usulan aksi)
// ==========================================
//
// GET  -> daftar laporan agen + usulan menunggu
// POST -> JALANKAN agen sekarang (analisis 1x). Dipakai cron harian & tombol.
//   body { provider?, model? }
//
// Aksi TIDAK dijalankan di sini - usulan disimpan menunggu persetujuan pemilik.
// Persetujuan ada di /api/admin/ai/agen/usulan (PATCH).
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
  await schemaReady();
  const db = getDb();
  const [laporan, usulan] = await Promise.all([
    db.execute('SELECT id, tanggal, ringkasan, temuan, model, provider, dibuat_at FROM ai_agen ORDER BY dibuat_at DESC LIMIT 14'),
    db.execute("SELECT id, agen_id, judul, aksi, payload, alasan, risiko, status, hasil, dibuat_at FROM ai_agen_usulan ORDER BY dibuat_at DESC LIMIT 50"),
  ]);
  return json({
    ok: true,
    laporan: (laporan.rows || []).map((r) => ({
      id: Number(r.id), tanggal: r.tanggal, ringkasan: r.ringkasan, temuan: r.temuan,
      model: r.model || null, provider: r.provider || null, dibuatAt: Number(r.dibuat_at),
    })),
    usulan: (usulan.rows || []).map((r) => {
      let payload = null;
      try { payload = JSON.parse(r.payload); } catch { payload = null; }
      return {
        id: Number(r.id), agenId: Number(r.agen_id), judul: r.judul, aksi: r.aksi, payload,
        alasan: r.alasan, risiko: r.risiko, tingkat: risikoAksi(r.aksi), status: r.status, hasil: r.hasil || null,
        dibuatAt: Number(r.dibuat_at),
      };
    }),
  });
}

export async function POST(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  let body = null;
  try { body = await request.json(); } catch { body = null; }

  const snap = await getLatestSnapshot();
  if (!snap) return json({ ok: false, error: 'Belum ada snapshot dari bot.' }, 400);

  // Konteks data (tanpa kode base - agen fokus ekonomi/aktivitas).
  const konteks = await susunKonteks(snap, {});
  const instruksi = [
    PROMPT_AGEN,
    '',
    'Buat laporan harian + usulan aksi berdasarkan DATA di atas.',
  ].join('\n');

  const hasil = await tanyaGroq([
    { role: 'system', content: 'Kamu agen pemantau NEXO. Jawab dalam bahasa Indonesia santai.' },
    { role: 'user', content: 'DATA SNAPSHOT BOT:\n\n' + konteks },
    { role: 'user', content: instruksi },
  ], {
    provider: String(body?.provider || '').trim() || undefined,
    model: String(body?.model || '').trim() || undefined,
    maxTokens: 1500,
    kecerdasan: 5,
  });

  if (!hasil.ok) return json({ ok: false, error: hasil.error, providerLabel: hasil.providerLabel }, 502);

  const { bersih, usulan } = uraikanUsulan(hasil.teks);

  // Pisahkan ringkasan & temuan (baris "Ringkasan:" dan "Temuan:").
  let ringkasan = bersih;
  let temuan = '';
  const mTemuan = bersih.match(/temuan\s*:\s*([\s\S]*)/i);
  if (mTemuan) {
    temuan = mTemuan[1].trim();
    ringkasan = bersih.slice(0, mTemuan.index).replace(/ringkasan\s*:\s*/i, '').trim();
  } else {
    ringkasan = bersih.replace(/ringkasan\s*:\s*/i, '').trim();
  }

  await schemaReady();
  const db = getDb();
  const tgl = hariIniWib();
  const ins = await db.execute({
    sql: 'INSERT INTO ai_agen (tanggal, ringkasan, temuan, model, provider, dibuat_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [tgl, ringkasan || '(kosong)', temuan, hasil.model || null, hasil.provider || null, Date.now()],
  });
  const agenId = Number(ins.lastInsertRowid ?? 0);

  // Simpan usulan yang LOLOS validasi saja (aman).
  let tersimpan = 0;
  for (const u of usulan) {
    const v = validasiUsulan(u);
    if (!v.ok) continue; // usulan tidak aman -> dibuang (jangan tampil ke pemilik)
    await db.execute({
      sql: 'INSERT INTO ai_agen_usulan (agen_id, judul, aksi, payload, alasan, risiko, dibuat_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [agenId, u.judul, u.aksi, JSON.stringify(u.payload || {}), u.alasan || '', u.risiko || '', Date.now()],
    });
    tersimpan++;
  }

  return json({ ok: true, agenId, tanggal: tgl, usulanTersimpan: tersimpan, ringkasan, temuan, model: hasil.model, provider: hasil.provider });
}
