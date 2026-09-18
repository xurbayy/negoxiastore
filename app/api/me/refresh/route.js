import { getSession } from '../../../lib/session';
import { getDb } from '../../../lib/db';
import { json, ready } from '../../../lib/api-helpers';
import { rateLimit } from '../../../lib/rate-limit';

export const dynamic = 'force-dynamic';

// Cooldown antar-refresh per user (detik). 30 dtk = cukup untuk update admin
// terasa instan, tapi tidak bisa dipakai spam antrean bot.
const COOLDOWN_MS = 30_000;

// POST /api/me/refresh - minta bot kirim ulang profil (data_requests).
//
// ANTI-SPAM (fix 2026-09-14):
//  1. Rate limit in-memory (8x / 5 menit) - lapis pertama, murah.
//  2. Cooldown + dedup di DB - kalau sudah ada permintaan < 30 dtk (pending
//     ATAU baru selesai), JANGAN insert baru: balas ok + retryAfterMs.
//     Ini yang benar-benar melindungi bot dari banjir antrean, karena
//     bertahan lintas instance serverless (Vercel tidak berbagi memori).
export async function POST() {
  const session = await getSession();
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  // Lapis 1: rate limit per user (in-memory, per instance).
  if (!rateLimit('refresh:' + session.discordId, 8, 5 * 60_000)) {
    return json({ ok: false, error: 'Terlalu sering refresh. Tunggu beberapa menit ya.', retryAfterMs: 60_000 }, 429);
  }

  // DB bisa gagal sesaat (blip Turso). Balas error yang rapi + pesan ramah,
  // bukan 500 mentah yang bikin UI menampilkan "Something went wrong".
  try {
    await ready();
    const db = getDb();
    const now = Date.now();

    // Lapis 2: dedup DB. Cek permintaan pending terbaru + yang baru selesai.
    const recent = await db.execute({
      sql: `SELECT id, status, created_at, filled_at FROM data_requests
            WHERE discord_id = ? AND (status = 'pending' OR filled_at > ?)
            ORDER BY id DESC LIMIT 1`,
      args: [session.discordId, now - COOLDOWN_MS],
    });

    if (recent.rows.length) {
      const r = recent.rows[0];
      const base = r.status === 'pending' ? Number(r.created_at) : Number(r.filled_at);
      const age = now - base;
      if (age < COOLDOWN_MS) {
        return json({
          ok: true,
          reused: true,
          retryAfterMs: Math.max(0, COOLDOWN_MS - age),
          message: 'Data baru saja disegarkan. Tunggu sebentar sebelum refresh lagi.',
        });
      }
    }

    await db.execute({
      sql: 'INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, ?, ?)',
      args: [session.discordId, 'pending', now],
    });

    return json({ ok: true });
  } catch (e) {
    console.error('[me/refresh] gagal:', (e && e.message) || e);
    return json({ ok: false, error: 'Gagal meminta refresh. Coba lagi sebentar lagi.' }, 503);
  }
}
