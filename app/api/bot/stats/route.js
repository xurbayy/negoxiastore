import { verifyBearer, json, ready } from '../../../lib/api-helpers';
import { getDb } from '../../../lib/db';
import { syncPromoCache, sweepStaleClaims } from '../../../lib/promo-cache';
import { reconcilePremium } from '../../../lib/premium-reconcile';
import { pruneOldData } from '../../../lib/prune';

export const dynamic = 'force-dynamic';

// POST /api/bot/stats - bot push snapshot tiap 60 detik.
export async function POST(request) {
  const denied = verifyBearer(request);
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

  await db.execute({
    sql: 'INSERT INTO monitor_snapshots (ts, data) VALUES (?, ?)',
    args: [ts, JSON.stringify(body)],
  });

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
