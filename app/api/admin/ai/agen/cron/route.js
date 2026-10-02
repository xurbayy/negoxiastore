import { getDb, schemaReady } from '../../../../../lib/db';
import { getLatestSnapshot } from '../../../../../lib/snapshot';
import { susunKonteks } from '../../../../../lib/aiKonteks';
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
      db.execute('SELECT plan, amount, gateway, status, created_at FROM orders ORDER BY created_at DESC LIMIT 40'),
      db.execute('SELECT action, status, result, created_at FROM bot_commands ORDER BY created_at DESC LIMIT 100'),
      db.execute('SELECT kind, message, page, created_at FROM web_feedback ORDER BY created_at DESC LIMIT 40'),
    ]);
    panel = {
      orders: orders.rows.map((r) => ({ plan: r.plan, amount: Number(r.amount), gateway: r.gateway, status: r.status, createdAt: Number(r.created_at) })),
      log: log.rows.map((r) => ({ action: r.action, status: r.status, result: r.result, createdAt: Number(r.created_at) })),
      feedback: feedback.rows.map((r) => ({ kind: r.kind, message: r.message, page: r.page, createdAt: Number(r.created_at) })),
    };
  } catch { /* lanjut tanpa panel */ }

  const konteks = await susunKonteks(snap, panel);
  const hasil = await tanyaGroq([
    { role: 'system', content: 'Kamu agen pemantau NEXO. Jawab bahasa Indonesia santai.' },
    { role: 'user', content: 'DATA SNAPSHOT BOT:\n\n' + konteks },
    { role: 'user', content: PROMPT_AGEN + '\n\nBuat laporan harian + usulan aksi.' },
  ], { maxTokens: 1500, kecerdasan: 5 });

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
    sql: 'INSERT INTO ai_agen (tanggal, ringkasan, temuan, model, provider, dibuat_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [tgl, ringkasan || '(kosong)', temuan, hasil.model || null, hasil.provider || null, Date.now()],
  });
  const agenId = Number(ins.lastInsertRowid ?? 0);

  let tersimpan = 0;
  for (const u of usulan) {
    const v = validasiUsulan(u);
    if (!v.ok) continue;
    await db.execute({
      sql: 'INSERT INTO ai_agen_usulan (agen_id, judul, aksi, payload, alasan, risiko, dibuat_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [agenId, u.judul, u.aksi, JSON.stringify(u.payload || {}), u.alasan || '', u.risiko || '', Date.now()],
    });
    tersimpan++;
  }

  return json({ ok: true, agenId, tanggal: tgl, usulanTersimpan: tersimpan });
}
