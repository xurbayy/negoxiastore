import { NextResponse } from 'next/server';
import { getDb, schemaReady } from '../../lib/db';
import { getBotHeartbeat } from '../../lib/snapshot';

export const dynamic = 'force-dynamic';

// ==========================================
// GET /api/health - status ringkas seluruh sistem
// ==========================================
// Permintaan pemilik 2026-10-04: cara cepat tahu "web sehat atau tidak" tanpa
// membuka panel admin. Mengecek:
//   1. Database      - bisa query + latensi
//   2. Bot           - heartbeat terakhir (bridge_meta.last_seen)
//   3. AI            - ada provider + kunci terkonfigurasi
//   4. Data katalog  - jumlah item/user (sanity check: 0 = ada yang salah)
//
// TIDAK menampilkan rahasia (kunci hanya "ada/tidak"). Bisa dipakai monitoring
// eksternal (uptime checker) karena ringan - tanpa query berat.
export async function GET() {
  const mulai = Date.now();
  const hasil = {
    ok: true,
    waktu: new Date().toISOString(),
    layanan: {},
  };

  // ---------- 1. Database ----------
  const tDb = Date.now();
  try {
    await schemaReady();
    const db = getDb();
    await db.execute('SELECT 1 AS ok');
    const latensi = Date.now() - tDb;
    // Sanity: hitung item & user (murah, indexed). 0 = curiga.
    const [items, users] = await Promise.all([
      db.execute('SELECT COUNT(*) AS n FROM public.shop_items').catch(() => ({ rows: [{ n: null }] })),
      db.execute('SELECT COUNT(*) AS n FROM public.users').catch(() => ({ rows: [{ n: null }] })),
    ]);
    const nItems = items.rows?.[0]?.n === null ? null : Number(items.rows[0].n);
    const nUsers = users.rows?.[0]?.n === null ? null : Number(users.rows[0].n);
    hasil.layanan.database = {
      status: 'operational',
      latensiMs: latensi,
      itemToko: nItems,
      totalUser: nUsers,
      catatan: (nItems === 0 || nUsers === 0) ? 'PERINGATAN: data 0 - cek koneksi/skema' : null,
    };
    if (nItems === 0 || nUsers === 0) hasil.ok = false;
  } catch (e) {
    hasil.ok = false;
    hasil.layanan.database = { status: 'down', error: e?.message || 'Gagal query.' };
  }

  // ---------- 2. Bot (heartbeat) ----------
  try {
    const lastSeen = await getBotHeartbeat();
    if (!lastSeen) {
      hasil.layanan.bot = { status: 'unknown', catatan: 'Belum ada heartbeat dari bot.' };
      hasil.ok = false;
    } else {
      const umurMs = Date.now() - lastSeen;
      const umurMenit = Math.floor(umurMs / 60000);
      // Bot push tiap 30-60 dtk; >5 menit = kemungkinan mati.
      const hidup = umurMs < 5 * 60_000;
      hasil.layanan.bot = {
        status: hidup ? 'operational' : 'degraded',
        terakhirDilihat: new Date(lastSeen).toISOString(),
        umurMenit,
        catatan: hidup ? null : 'Bot belum mengirim data >5 menit - kemungkinan mati/restart.',
      };
      if (!hidup) hasil.ok = false;
    }
  } catch (e) {
    hasil.layanan.bot = { status: 'unknown', error: e?.message || 'Gagal cek heartbeat.' };
  }

  // ---------- 3. AI provider ----------
  try {
    const db = getDb();
    const r = await db.execute('SELECT COUNT(*) AS n FROM web.ai_providers').catch(() => ({ rows: [{ n: 0 }] }));
    const kustom = Number(r.rows?.[0]?.n || 0);
    const adaEnvKey = Boolean(process.env.GROQ_API_KEY || process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY);
    const siap = kustom > 0 || adaEnvKey;
    hasil.layanan.ai = {
      status: siap ? 'operational' : 'not_configured',
      providerKustom: kustom,
      kunciEnv: adaEnvKey,
      catatan: siap ? null : 'Belum ada kunci AI (env atau provider kustom).',
    };
  } catch (e) {
    hasil.layanan.ai = { status: 'unknown', error: e?.message || 'Gagal cek provider.' };
  }

  // ---------- 4. Pembayaran (QRIS manual - cek tabel orders) ----------
  try {
    const db = getDb();
    const r = await db.execute('SELECT COUNT(*) AS n FROM web.orders WHERE status = ?', ['pending']).catch(() => ({ rows: [{ n: null }] }));
    const pending = r.rows?.[0]?.n === null ? null : Number(r.rows[0].n);
    hasil.layanan.pembayaran = {
      status: 'operational',
      orderPending: pending,
      catatan: pending === null ? 'Tabel orders belum bisa dibaca.' : null,
    };
  } catch (e) {
    hasil.layanan.pembayaran = { status: 'unknown', error: e?.message || 'Gagal cek orders.' };
  }

  hasil.totalMs = Date.now() - mulai;
  // Status HTTP: 200 kalau sehat, 503 kalau ada yang down (agar uptime checker
  // otomatis menandai merah).
  return NextResponse.json(hasil, { status: hasil.ok ? 200 : 503 });
}
