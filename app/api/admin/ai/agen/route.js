import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { getLatestSnapshot } from '../../../../lib/snapshot';
import { susunKonteks } from '../../../../lib/aiKonteks';
import { susunKonteksKode } from '../../../../lib/kodeBase';
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
  const [laporan, usulan, pengingat] = await Promise.all([
    db.execute('SELECT id, tanggal, ringkasan, temuan, model, provider, dibuat_at FROM ai_agen ORDER BY dibuat_at DESC LIMIT 14'),
    db.execute("SELECT id, agen_id, judul, aksi, payload, alasan, risiko, status, hasil, dibuat_at FROM ai_agen_usulan ORDER BY dibuat_at DESC LIMIT 50"),
    db.execute('SELECT id, teks, waktu_ingat, selesai FROM ai_reminders WHERE selesai = 0 ORDER BY waktu_ingat ASC LIMIT 20'),
  ]);
  return json({
    ok: true,
    // PENGINGAT aktif (dibuat dari usulan agen yang disetujui).
    pengingat: (pengingat.rows || []).map((r) => ({
      id: Number(r.id), teks: r.teks, waktuIngat: Number(r.waktu_ingat),
      jatuhTempo: Number(r.waktu_ingat) <= Date.now(),
    })),
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

  // Konteks data LENGKAP: snapshot + panel (pendapatan, log perintah, feedback).
  // Agen butuh data panel supaya laporannya menyeluruh (permintaan pemilik).
  let panel = {};
  try {
    const { getDb } = await import('../../../../lib/db');
    const db = getDb();
    const [orders, log, feedback] = await Promise.all([
      db.execute('SELECT plan, amount, gateway, status, created_at FROM orders ORDER BY created_at DESC LIMIT 40'),
      db.execute('SELECT action, status, result, created_at FROM bot_commands ORDER BY created_at DESC LIMIT 50'),
      db.execute('SELECT kind, message, page, created_at, username, discord_id FROM web_feedback ORDER BY created_at DESC LIMIT 60'),
    ]);
    panel = {
      orders: orders.rows.map((r) => ({ plan: r.plan, amount: Number(r.amount), gateway: r.gateway, status: r.status, createdAt: Number(r.created_at) })),
      log: log.rows.map((r) => ({ action: r.action, status: r.status, result: r.result, createdAt: Number(r.created_at) })),
      feedback: feedback.rows.map((r) => ({ kind: r.kind, message: r.message, page: r.page, createdAt: Number(r.created_at), username: r.username || null, discordId: r.discord_id || null })),
    };
  } catch { /* panel gagal - agen tetap jalan dari snapshot */ }

  const konteks = await susunKonteks(snap, panel, { ringkas: true });
  // KODE BASE (kalau bot mengirim): agen bisa mendeteksi celah eksploit di KODE,
  // bukan cuma pola curang di data (permintaan pemilik 2026-10-02).
  const konteksKode = susunKonteksKode(snap?.kodeBase);
  // AGEN MENYELURUH: periksa SEMUA bidang sekaligus (permintaan pemilik
  // 2026-10-02: "karena ga gw instruksi jadi menyeluruh ya semuanya").
  const instruksi = [
    PROMPT_AGEN,
    '',
    'INSTRUKSI TAMBAHAN: Periksa SEMUA bidang di atas secara MENYELURUH.',
    'Jangan hanya fokus satu topik - laporkan temuan dari SEMUA bagian.',
    'Urutkan berdasarkan PRIORITAS: feedback pemain dulu, lalu exploit,',
    'lalu error, lalu ekonomi, lalu sisanya.',
    'Buat laporan lengkap + usulan aksi berdasarkan DATA di atas.',
  ].join('\n');

  const hasil = await tanyaGroq([
    { role: 'system', content: 'Kamu agen pemantau NEXO. Jawab dalam bahasa Indonesia santai.' },
    { role: 'user', content: 'DATA SNAPSHOT BOT:\n\n' + konteks + konteksKode },
    { role: 'user', content: instruksi },
  ], {
    provider: String(body?.provider || '').trim() || undefined,
    model: String(body?.model || '').trim() || undefined,
    // TOKEN & THINKING AGEN DIPATOK SERVER (permintaan pemilik 2026-10-02, revisi
    // 2026-10-04): agen jalan 24/7, jadi efisiensi diatur di sini - bukan dari UI.
    // 3000 token cukup untuk laporan MENYELURUH (semua bidang).
    // Thinking SELALU 'auto' (permintaan pemilik: "agent default thinking dan
    // ga bisa diubah lagi") - web biarkan provider memutuskan sendiri.
    maxTokens: 3000,
    thinking: 'auto',
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
  // hariIniWib() return object { tahun, bulan, tanggal } -> format ke string.
  const tglObj = hariIniWib();
  const tgl = `${tglObj.tahun}-${String(tglObj.bulan + 1).padStart(2, '0')}-${String(tglObj.tanggal).padStart(2, '0')}`;
  const ins = await db.execute({
    sql: 'INSERT INTO ai_agen (tanggal, ringkasan, temuan, model, provider, dibuat_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    args: [tgl, ringkasan || '(kosong)', temuan, hasil.model || null, hasil.provider || null, Date.now()],
  });
  const agenId = Number(ins.rows?.[0]?.id ?? ins.lastInsertRowid ?? 0);

  // CATATAN (permintaan pemilik 2026-10-02): agen TIDAK lagi menyimpan saran
  // per peran. Saran cepat sekarang dari "Cari topik AI" (Analisis/Diskusi).
  // Agen cukup fokus: laporan + usulan aksi. Ini meringankan tugas agen.
  // Kartu saran tetap bisa dari ai_agen_saran LAMA (kalau masih ada).

  // Simpan usulan yang LOLOS validasi saja (aman).
  let tersimpan = 0;
  for (const u of usulan) {
    const v = validasiUsulan(u);
    if (!v.ok) continue; // usulan tidak aman -> dibuang (jangan tampil ke pemilik)
    await db.execute({
      sql: 'INSERT INTO ai_agen_usulan (agen_id, judul, aksi, payload, alasan, risiko, dibuat_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      args: [agenId, u.judul, u.aksi, JSON.stringify(u.payload || {}), u.alasan || '', u.risiko || '', Date.now()],
    });
    tersimpan++;
  }

  return json({ ok: true, agenId, tanggal: tgl, usulanTersimpan: tersimpan, ringkasan, temuan, model: hasil.model, provider: hasil.provider });
}
