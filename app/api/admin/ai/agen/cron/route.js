import { getDb, schemaReady } from '../../../../../lib/db';
import { getLatestSnapshot } from '../../../../../lib/snapshot';
import { susunKonteks } from '../../../../../lib/aiKonteks';
import { susunKonteksKode } from '../../../../../lib/kodeBase';
import { tanyaGroq } from '../../../../../lib/groq';
import { PROMPT_AGEN, uraikanUsulan, validasiUsulan } from '../../../../../lib/aiAgen';
import { json } from '../../../../../lib/api-helpers';
import { hariIniWib } from '../../../../../lib/waktuWib';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ==========================================
// /api/admin/ai/agen/cron - jalankan agen harian (jam 12 WIB)
// ==========================================
//
// Dipanggil otomatis oleh Vercel Cron (vercel.json: "0 5 * * *" = 12:00 WIB).
// Dilindungi CRON_SECRET: Vercel mengirim header Authorization: Bearer <secret>.
// Kalau CRON_SECRET tidak diset, endpoint ini menolak (mencegah orang luar
// memicu agen = boros token).
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ ok: false, error: 'CRON_SECRET belum diset.' }, 500);
  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) return json({ ok: false, error: 'unauthorized' }, 401);

  const snap = await getLatestSnapshot();
  if (!snap) return json({ ok: false, error: 'Belum ada snapshot.' }, 400);

  // Data panel (pendapatan/log/feedback) supaya laporan menyeluruh.
  let panel = {};
  try {
    const { getDb } = await import('../../../../../lib/db');
    const db = getDb();
    const [orders, log, feedback] = await Promise.all([
      db.execute('SELECT plan, amount, gateway, status, created_at FROM orders ORDER BY created_at DESC LIMIT 50'),
      db.execute('SELECT action, status, result, created_at FROM bot_commands ORDER BY created_at DESC LIMIT 50'),
      db.execute('SELECT kind, message, page, created_at, username, discord_id FROM web_feedback ORDER BY created_at DESC LIMIT 50'),
    ]);
    panel = {
      orders: orders.rows.map((r) => ({ plan: r.plan, amount: Number(r.amount), gateway: r.gateway, status: r.status, createdAt: Number(r.created_at) })),
      log: log.rows.map((r) => ({ action: r.action, status: r.status, result: r.result, createdAt: Number(r.created_at) })),
      feedback: feedback.rows.map((r) => ({ kind: r.kind, message: r.message, page: r.page, createdAt: Number(r.created_at), username: r.username || null, discordId: r.discord_id || null })),
    };
  } catch { /* lanjut tanpa panel */ }

  const konteks = await susunKonteks(snap, panel, { ringkas: true });
  // Kode base juga (agen bisa deteksi celah eksploit di kode).
  const konteksKode = susunKonteksKode(snap?.kodeBase);

  // ==========================================
  // MODEL AGEN DARI PREFS (fix 2026-10-04)
  // ==========================================
  // MASALAH: cron ini memakai model DEFAULT provider. Kalau default itu rusak
  // / salah (mis. key tidak valid), agen GAGAL terus dan tidak pernah ada
  // laporan - padahal jadwal cron jalan tiap hari. Pemilik melaporkan "agen
  // ga keluar hasil laporan walau udah ada jadwalnya".
  //
  // Sekarang cron MEMBACA model agen yang dipilih pemilik di panel
  // (admin_ai_prefs: agentProvider + agentModel) dan memakainya. Kalau belum
  // ada, fallback ke default provider (perilaku lama).
  let providerAgen, modelAgen;
  try {
    await schemaReady();
    const dbP = getDb();
    const prefsRows = await dbP.execute(
      'SELECT prefs FROM admin_ai_prefs ORDER BY updated_at DESC'
    );
    for (const row of (prefsRows.rows || [])) {
      try {
        const p = JSON.parse(row.prefs || '{}');
        if (p.agentProvider && p.agentModel) { providerAgen = String(p.agentProvider); modelAgen = String(p.agentModel); break; }
      } catch { /* prefs rusak - coba baris berikutnya */ }
    }
  } catch { /* gagal baca prefs -> pakai default */ }

  const hasil = await tanyaGroq([
    { role: 'system', content: 'Kamu agen pemantau NEXO. Jawab bahasa Indonesia santai.' },
    { role: 'user', content: 'DATA SNAPSHOT BOT:\n\n' + konteks + konteksKode },
    { role: 'user', content: PROMPT_AGEN + '\n\nBuat laporan harian + usulan aksi.' },
    // FIX 2026-10-07: maxTokens 8000 (bukan 3000) - model reasoning butuh ruang
    // berpikir; 3000 habis di reasoning -> content kosong -> laporan tak pernah ada.
  ], { provider: providerAgen, model: modelAgen, maxTokens: 8000, thinking: 'auto' });

  if (!hasil.ok) return json({ ok: false, error: hasil.error }, 502);

  const { bersih, usulan } = uraikanUsulan(hasil.teks);
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
    sql: 'INSERT INTO ai_agen (tanggal, ringkasan, temuan, model, provider, dibuat_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    args: [tgl, ringkasan || '(kosong)', temuan, hasil.model || null, hasil.provider || null, Date.now()],
  });
  const agenId = Number(ins.rows?.[0]?.id ?? ins.lastInsertRowid ?? 0);

  // Agen tidak lagi menyimpan saran per peran (permintaan pemilik 2026-10-02:
  // saran cepat dari "Cari topik AI"). Agen fokus laporan + usulan aksi.

  let tersimpan = 0;
  for (const u of usulan) {
    const v = validasiUsulan(u);
    if (!v.ok) continue;
    await db.execute({
      sql: 'INSERT INTO ai_agen_usulan (agen_id, judul, aksi, payload, alasan, risiko, dibuat_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      args: [agenId, u.judul, u.aksi, JSON.stringify(u.payload || {}), u.alasan || '', u.risiko || '', Date.now()],
    });
    tersimpan++;
  }

  return json({ ok: true, agenId, tanggal: tgl, usulanTersimpan: tersimpan });
}
