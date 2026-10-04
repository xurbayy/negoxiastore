import { verifyBearer, json, ready } from '../../../lib/api-helpers';
import { getDb } from '../../../lib/db';
import { syncPromoCache, sweepStaleClaims } from '../../../lib/promo-cache';
import { reconcilePremium } from '../../../lib/premium-reconcile';
import { pruneOldData } from '../../../lib/prune';

export const dynamic = 'force-dynamic';

// POST /api/bot/stats - bot push snapshot tiap 60 detik.
export async function POST(request) {
  const denied = verifyBearer(request, 'write');
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid json' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'invalid body' }, 400);
  }

  await ready();
  const db = getDb();
  const ts = Number(body.ts) || Date.now();

  // ==========================================
  // SIMPAN SNAPSHOT - DIBATASI 1x / 10 MENIT (fix 2026-10-04)
  // ==========================================
  // MASALAH: bot push tiap 60 detik, dan SETIAP push disimpan sebagai baris
  // baru. Payload rata-rata 66 KB -> 1.188 baris/hari -> dengan retensi 30
  // hari = 35.640 baris = ~2,3 GB. DB sudah 109 MB dan 79% di antaranya
  // tabel ini (86 MB), membuat query makin lambat.
  //
  // Snapshot dipakai HANYA untuk GRAFIK TREN (delta 24 jam) - tidak perlu
  // resolusi per menit. 1 titik / 10 menit sudah cukup halus untuk grafik
  // 24 jam (144 titik) dan 7 hari (1.008 titik).
  //
  // Efek: 1.188 baris/hari -> 144 baris/hari (-88%). DB tidak membengkak.
  const JARAK_SNAPSHOT_MS = 10 * 60_000;
  try {
    const terakhir = await db.execute('SELECT ts FROM monitor_snapshots ORDER BY ts DESC LIMIT 1');
    const tsTerakhir = terakhir.rows.length ? Number(terakhir.rows[0].ts) : 0;
    if (!tsTerakhir || ts - tsTerakhir >= JARAK_SNAPSHOT_MS) {
      await db.execute({
        sql: 'INSERT INTO monitor_snapshots (ts, data) VALUES (?, ?)',
        args: [ts, JSON.stringify(body)],
      });
    }
    // else: lewati penyimpanan (push tetap diproses untuk data live di bawah).
  } catch {
    // Kalau cek gagal (tabel belum ada), coba simpan langsung supaya tidak
    // kehilangan snapshot pertama.
    await db.execute({
      sql: 'INSERT INTO monitor_snapshots (ts, data) VALUES (?, ?)',
      args: [ts, JSON.stringify(body)],
    }).catch(() => {});
  }

  // Stok cerdas: sinkronkan web_promo_cache + lepas slot klaim mati (>5 mnt)
  await syncPromoCache(db, body.promoCodes || []).catch(() => {});
  await sweepStaleClaims(db).catch(() => {});

  // Rekonsiliasi premium: order paid / grant done yang hilang di bot
  // (DB reset / restore backup lama) -> grant ulang otomatis, secukupnya.
  await reconcilePremium(db, body).catch(() => {});

  // Prune (audit E2): data_requests/command/klaim/notif lama tidak boleh
  // menumpuk selamanya. Di-throttle 1x per 10 menit di dalam lib/prune.
  await pruneOldData(db).catch(() => {});

  return json({ ok: true });
}
